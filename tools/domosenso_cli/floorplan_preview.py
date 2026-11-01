"""`domosenso floorplan preview <target>` (SPEC-028 Amendment 6): the floor plan editor against a real
home, read-only towards Home Assistant.

Staging mirrors production's states but not its device registry, which the card's categories,
joined devices and links need. The preview reads a target's registries and states once, follows
its state changes, and serves the home's rendered card on 127.0.0.1 with that data as `hass`. Saves
go to `domosenso/floorplan.json`, never to Home Assistant; the token stays in this process.
"""
from __future__ import annotations

import json
import mimetypes
import secrets
import threading
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlsplit

from domosenso_cli import floorplan_doc as doc
from domosenso_cli.errors import DomosensoError

# Everything the preview asks Home Assistant: reads only.
READS = ("get_config", "config/area_registry/list", "config/floor_registry/list", "config/device_registry/list",
         "config/entity_registry/list", "config_entries/get", "get_states")
COOKIE = "floorplan_preview"
DEVICE_FIELDS = ("id", "name", "name_by_user", "manufacturer", "model", "model_id", "area_id", "via_device_id",
                 "config_entries", "entry_type", "connections")
ENTITY_FIELDS = ("entity_id", "device_id", "platform", "area_id", "entity_category", "original_name", "name")


async def read_home(ha) -> dict[str, Any]:
    return {kind: await ha.call(kind) for kind in READS}


def build_hass(raw: dict[str, Any]) -> dict[str, Any]:
    """The parts of the frontend's `hass` the card reads, from the websocket's registry lists. Disabled
    devices and entities are not in the frontend's registries either."""
    language = (raw.get("get_config") or {}).get("language") or "en"
    devices = {d["id"]: {k: d.get(k) for k in DEVICE_FIELDS}
               for d in raw["config/device_registry/list"] if not d.get("disabled_by")}
    entities = {e["entity_id"]: {**{k: e.get(k) for k in ENTITY_FIELDS}, "hidden": bool(e.get("hidden_by"))}
                for e in raw["config/entity_registry/list"] if not e.get("disabled_by")}
    return {
        "language": language,
        "locale": {"language": language},
        "user": {"is_admin": True, "name": "preview"},
        "areas": {a["area_id"]: {"area_id": a["area_id"], "name": a.get("name"), "floor_id": a.get("floor_id")}
                  for a in raw["config/area_registry/list"]},
        "floors": {f["floor_id"]: {"floor_id": f["floor_id"], "name": f.get("name")} for f in raw["config/floor_registry/list"]},
        "devices": devices,
        "entities": entities,
        "states": {s["entity_id"]: s for s in raw["get_states"]},
    }


def entries(raw: dict[str, Any]) -> list[dict[str, str]]:
    """`config_entries/get` as the card uses it: each entry's domain (no titles: they may name accounts)."""
    return [{"entry_id": e["entry_id"], "domain": e["domain"]} for e in raw["config_entries/get"]]


def card_dir(config_dir: Path, locked: str | None) -> Path:
    """The rendered floorplan component: its locked version, else the one version rendered."""
    base = Path(config_dir) / "www" / "domosenso" / "floorplan"
    rendered = sorted(p for p in base.glob("*") if (p / "cards" / "floorplan-card.js").is_file()) if base.is_dir() else []
    pick = [p for p in rendered if p.name == locked] if locked else rendered
    if len(pick) != 1:
        raise DomosensoError(f"no floorplan card rendered: {base}/<version>/cards/floorplan-card.js (render first)")
    return pick[0]


class Preview:
    """What the page reads and writes; `say(line)` gets `("wrote", path)` and `("refused", type)`."""

    def __init__(self, hass: dict, entry_list: list, plan_file: Path, card: Path, say: Callable[[tuple], None],
                 shown: str = "domosenso/floorplan.json"):
        self.hass, self.entries, self.plan_file, self.card = hass, entry_list, Path(plan_file), Path(card)
        self.say, self.shown = say, shown
        self.key = secrets.token_urlsafe(24)
        self._lock = threading.Lock()
        self._changes: list[dict] = []

    def add_state(self, state: dict) -> None:
        with self._lock:
            self._changes.append(state)
            self.hass["states"][state["entity_id"]] = state

    def changes(self, since: int) -> dict:
        with self._lock:
            return {"seq": len(self._changes), "states": self._changes[since:]}

    def data(self) -> dict:
        with self._lock:
            return {"hass": self.hass, "entries": self.entries, "seq": len(self._changes)}

    def _file(self) -> dict:
        value = json.loads(self.plan_file.read_text(encoding="utf-8"))
        doc.validate(value)
        return value

    def plan(self) -> dict:
        return doc.dashboard_config(self._file())

    def save(self, config: dict) -> None:
        plan = doc.extract(config)
        if plan is None:
            raise DomosensoError("no plan in the saved config")
        doc.validate(plan)
        kept = self._file().get("source")  # the traced image lives only in the repository's file
        out = {**doc.without_source(plan), **({"source": kept} if kept else {})}
        self.plan_file.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        self.say(("wrote", self.shown))


def start_server(preview: Preview, port: int) -> ThreadingHTTPServer:
    """Serve the page on 127.0.0.1 in a thread; `shutdown()` stops it."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args: Any) -> None:  # the command prints its own lines
            return

        def _allowed(self, query: dict) -> bool:
            given = (query.get("key") or [None])[0]
            cookie = SimpleCookie(self.headers.get("Cookie") or "").get(COOKIE)
            return secrets.compare_digest(given or (cookie.value if cookie else ""), preview.key)

        def _send(self, status: int, body: bytes, kind: str, extra: dict | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")  # a re-rendered card must never come from cache
            for name, value in (extra or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, value: Any, status: int = 200) -> None:
            self._send(status, json.dumps(value).encode(), "application/json")

        def do_GET(self) -> None:
            url = urlsplit(self.path)
            query = parse_qs(url.query)
            if not self._allowed(query):
                return self._send(403, b"forbidden", "text/plain")
            if url.path == "/":
                cookie = f"{COOKIE}={preview.key}; Path=/; HttpOnly; SameSite=Strict"
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8", {"Set-Cookie": cookie})
            if url.path == "/data":
                return self._json(preview.data())
            if url.path == "/plan":
                return self._json(preview.plan())
            if url.path == "/changes":
                return self._json(preview.changes(int((query.get("since") or ["0"])[0])))
            # The card's own files, never outside its directory.
            target = (preview.card / url.path.lstrip("/")).resolve()
            if preview.card.resolve() not in target.parents or not target.is_file():
                return self._send(404, b"not found", "text/plain")
            kind = "text/javascript" if target.suffix == ".js" else mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self._send(200, target.read_bytes(), kind)

        def do_POST(self) -> None:
            url = urlsplit(self.path)
            query = parse_qs(url.query)
            if not self._allowed(query):
                return self._send(403, b"forbidden", "text/plain")
            if url.path == "/save":
                length = int(self.headers.get("Content-Length") or 0)
                try:
                    preview.save(json.loads(self.rfile.read(length) or b"null"))
                except (DomosensoError, ValueError, TypeError) as exc:
                    return self._send(400, str(exc).encode(), "text/plain")
                return self._json(None)
            if url.path == "/refused":
                preview.say(("refused", (query.get("type") or ["?"])[0]))
                return self._json(None)
            self._send(404, b"not found", "text/plain")

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


async def follow(ha, preview: Preview) -> None:
    """Pass the target's state changes to the page until the command is stopped."""
    subscription = await ha.subscribe("state_changed")
    while True:
        event = await ha.next_event(subscription, 30)
        state = ((event or {}).get("data") or {}).get("new_state")
        if state:
            preview.add_state(state)


# The page: the card with the target's data as `hass`. Its callWS answers what the card asks; any
# other call (creating an area) is refused, since the preview never writes to Home Assistant.
PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Floor plan preview</title>
<style>
  :root { color-scheme: dark; --primary-color: #03a9f4; --accent-color: #ff9800; --primary-text-color: #e1e1e1;
          --secondary-text-color: #9b9b9b; --card-background-color: #1c1c1c; --divider-color: rgba(225,225,225,.12); }
  body { margin: 0; background: #111; color: var(--primary-text-color); font-family: system-ui, sans-serif; }
  header { padding: 8px 16px; color: var(--secondary-text-color); font-size: 13px; }
  main { padding: 0 16px 16px; }
  floorplan-card { display: block; min-height: 80vh; }
</style></head>
<body><header>Preview: real data, read-only. Saves go to domosenso/floorplan.json.</header><main></main>
<script type="module">
const get = async (path, options) => {
  const r = await fetch(path, options);
  if (!r.ok) throw { code: "preview", message: await r.text() };
  return r.json();
};
const data = await get("data");
let seq = data.seq;
const callWS = async (msg) => {
  if (msg.type === "config_entries/get") return data.entries;
  if (msg.type === "lovelace/config" && msg.url_path === "floorplan") return get("plan");
  if (msg.type === "lovelace/config/save" && msg.url_path === "floorplan") {
    return get("save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg.config) });
  }
  await fetch("refused?type=" + encodeURIComponent(msg.type), { method: "POST" });
  throw { code: "read_only", message: "The preview does not write to Home Assistant." };
};
let hass = { ...data.hass, callWS };
await import("./cards/floorplan-card.js");
const card = document.createElement("floorplan-card");
card.setConfig({});
card.hass = hass;
document.querySelector("main").append(card);
setInterval(async () => {
  const changed = await get("changes?since=" + seq);
  if (!changed.states.length) return;
  seq = changed.seq;
  hass = { ...hass, states: { ...hass.states, ...Object.fromEntries(changed.states.map((s) => [s.entity_id, s])) } };
  card.hass = hass;
}, 2000);
</script></body></html>
"""
