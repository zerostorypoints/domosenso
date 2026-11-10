"""`domosenso floorplan survey <target>` (SPEC-044 S3): the preview's page with the card's Survey panel,
and the laptop's Wi-Fi link recorded where the owner taps.

A thread reads the link every `INTERVAL_S`. A tap posts `POST /survey/sample {floor_id, x, y}`; the
request blocks until the next `READINGS` readings are in (about 10 s, the page shows the wait) and
answers `{"sample": {...}}`, or `{"sample": null, "skipped": "<reason>"}`; a body or floor the plan
refuses answers 400 with the reason. `GET /survey/link` answers `{"link": <the last reading or null>}`.
Both sit behind the preview's key.

The serving access point: the reading's BSSID matched to a marked access point's BSSID sensor (the
rules of the rendered card's `lib/wifi-rules.json`, as the card matches them); without a BSSID (macOS
never gives one), the router's client tracker for the laptop's MAC, read from the target once per
sample, whose node is a marked access point; else the sample has no `ap`. Samples go to
`domosenso/floorplan.json` only; nothing is written to Home Assistant.
"""
from __future__ import annotations

import json
import math
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from domosenso_cli import floorplan_doc as doc
from domosenso_cli.errors import DomosensoError
from domosenso_cli.floorplan_preview import PAGE, Preview
from domosenso_cli.wifi_link import Link

INTERVAL_S = 2.0
READINGS = 5
MIN_READINGS = 3  # of the majority band
LINK_EVERY_S = 30.0
MAX_SAMPLES = 2000
# The router's tracker of a client (as opposed to one of its nodes) says so; the rules name the nodes.
CLIENT_ATTR = {"device_type": "client"}


def norm_mac(value: Any) -> str | None:
    return None if value in (None, "") else str(value).replace("-", ":").lower()


def average(readings: list[Link | None]) -> Link | None:
    """The mean of the readings on the band most of them are on; None with fewer than three of it.
    A reading of None (the link was down) does not count."""
    links = [r for r in readings if r is not None]
    if not links:
        return None
    band, count = Counter(r.band for r in links).most_common(1)[0]
    if count < MIN_READINGS:
        return None
    on = [r for r in links if r.band == band]
    noises = [r.noise for r in on if r.noise is not None]
    bssids = [norm_mac(r.bssid) for r in on if r.bssid]
    return Link(band, Counter(r.channel for r in on).most_common(1)[0][0],
                round(sum(r.dbm for r in on) / len(on), 1) + 0.0,
                round(sum(noises) / len(noises), 1) + 0.0 if noises else None,
                Counter(bssids).most_common(1)[0][0] if bssids else None)


def _num(value: float, decimals: int) -> str:
    text = f"{value:.{decimals}f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _link_json(link: Link | None) -> dict | None:
    if link is None:
        return None
    return {"band": link.band, "channel": link.channel, "dbm": link.dbm, "noise": link.noise, "bssid": link.bssid}


class Survey(Preview):
    """The preview plus the link reader and the samples. `reader()` reads the link (a `Link` or None),
    `fetch_states()` the target's states (a read-only REST GET), `mac` the laptop's Wi-Fi MAC."""

    def __init__(self, hass: dict, entry_list: list, plan_file: Path, card: Path, say: Callable[[tuple], None],
                 shown: str = "domosenso/floorplan.json", target_url: str | None = None, *,
                 reader: Callable[[], Link | None], mac: str | None, fetch_states: Callable[[], list],
                 clock: Callable[[], datetime] | None = None):
        super().__init__(hass, entry_list, plan_file, card, say, shown, target_url)
        self.reader, self.mac, self.fetch_states = reader, norm_mac(mac), fetch_states
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.rules = load_rules(self.card)
        self._cond = threading.Condition()
        self._ticks: list[Link | None] = []  # every reading since start, at most the last few kept
        self._tick = 0
        self._last: Link | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._taking = threading.Lock()  # one sample at a time: their readings would overlap
        self._why = threading.local()  # the skip reason of this thread's last sample, for its answer

    # ---- the reader ----

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=INTERVAL_S + 1)  # a daemon: a read still running ends with the process

    def _read_loop(self) -> None:
        said = None
        while not self._stop.is_set():
            began = time.monotonic()
            try:
                link = self.reader()
            except Exception:  # noqa: BLE001 - one failed read is a link down, not the end of the survey
                link = None
            with self._cond:
                self._last = link
                self._tick += 1
                self._ticks = (self._ticks + [link])[-READINGS * 2:]
                self._cond.notify_all()
            if link is not None and (said is None or time.monotonic() - said >= LINK_EVERY_S):
                said = time.monotonic()
                self.say(("link", link.band, str(link.channel), _num(link.dbm, 1), "dBm"))
            self._stop.wait(max(0.0, INTERVAL_S - (time.monotonic() - began)))

    def reading(self) -> dict | None:
        with self._cond:
            return _link_json(self._last)

    def take(self, floor_id: str | None, x: float, y: float) -> dict | None:
        """The next READINGS readings averaged into a sample at (x, y)."""
        with self._taking:
            with self.file_lock:
                full = self._skip_if_full(self._read_plan())
            if full:
                return None
            with self._cond:
                start = self._tick
                # A reader stuck past its own timeouts ends the wait; what came in then decides.
                self._cond.wait_for(lambda: self._tick >= start + READINGS, timeout=READINGS * INTERVAL_S + 70)
                since = self._ticks[len(self._ticks) - min(self._tick - start, len(self._ticks)):]
                readings = since[:READINGS]
            mean = average(readings)
            tracker = None
            if mean is not None and mean.bssid is None:
                try:
                    tracker = self.laptop_tracker(self.fetch_states())
                except (DomosensoError, TimeoutError):
                    tracker = None  # the reading still counts; its access point is then unknown
            return self.sample(floor_id, x, y, readings, tracker)

    # ---- one sample ----

    def _read_plan(self) -> dict:
        plan = doc.read_json(self.plan_file)
        if plan is None:
            raise DomosensoError(f"no plan in {self.shown}")
        return plan

    def _skipped(self, reason: str) -> None:
        self._why.reason = reason
        self.say(("sample", "skipped", reason))

    def _skip_if_full(self, plan: dict) -> bool:
        if len((plan.get("wifi") or {}).get("samples") or []) >= MAX_SAMPLES:
            self._skipped(f"plan has {MAX_SAMPLES} samples")
            return True
        return False

    def sample(self, floor_id: str | None, x: float, y: float, readings: list[Link | None],
               tracker: dict | None) -> dict | None:
        """Average `readings` into one sample, append it to the plan file's `wifi.samples` and write the
        file; None (and a `sample skipped` line) when it is not taken. `tracker` is the laptop's client
        tracker state, read at this sample's time."""
        with self.file_lock:
            return self._sample(floor_id, x, y, readings, tracker)

    def _sample(self, floor_id, x, y, readings, tracker) -> dict | None:
        plan = self._read_plan()
        if self._skip_if_full(plan):
            return None
        mean = average(readings)
        if mean is None:
            self._skipped("too few readings")
            return None
        aps = [ap.get("device_id") or ap.get("entity_id") for f in plan.get("floors", []) for ap in f.get("access_points", [])]
        ap = (self._ap_by_bssid(mean.bssid, aps) if mean.bssid else None) or self._ap_by_tracker(tracker, aps)
        got = {"floor_id": floor_id, "x": round(float(x), 3) + 0.0, "y": round(float(y), 3) + 0.0,
               "t": self.clock().astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "band": mean.band, "channel": mean.channel, "dbm": mean.dbm}
        if mean.noise is not None:
            got["noise"] = mean.noise
        if ap:
            got["ap"] = ap
        if mean.bssid:
            got["bssid"] = mean.bssid
        got["source"] = "survey"
        wifi = dict(plan.get("wifi") or {})
        wifi["samples"] = [*(wifi.get("samples") or []), got]
        new = {**plan, "wifi": wifi}
        doc.validate(new)  # before the write: the file never holds a plan the card would refuse
        doc.write_plan_file(self.plan_file, new)
        self.say(("sample", "-" if floor_id is None else floor_id, _num(got["x"], 3), _num(got["y"], 3),
                  mean.band, _num(mean.dbm, 1), "dBm", ap or "-"))
        self.say(("wrote", self.shown))
        return got

    def _registry(self) -> tuple[dict, dict]:
        with self._lock:
            return dict(self.hass["entities"]), dict(self.hass["states"])

    def _device_of(self, key: str, entities: dict) -> str | None:
        return entities[key].get("device_id") if key in entities else key

    def _ap_by_bssid(self, bssid: str, aps: list[str]) -> str | None:
        """The marked access point one of whose BSSID sensors reports `bssid`."""
        entities, states = self._registry()
        for key in aps:
            device = self._device_of(key, entities)
            for rule in self.rules.get("access_points", []):
                for suffix in (rule.get("bssid") or {}).values():
                    for eid, reg in entities.items():
                        if (device and reg.get("device_id") == device and reg.get("platform") == rule["integration"]
                                and eid.endswith(f"_{suffix}")
                                and norm_mac((states.get(eid) or {}).get("state")) == bssid):
                            return key
        return None

    def laptop_tracker(self, states: list[dict]) -> dict | None:
        """The router's client tracker whose MAC is the laptop's, among `states`."""
        if not self.mac:
            return None
        entities, _ = self._registry()
        platforms = {rule["integration"] for rule in self.rules.get("access_points", [])}
        for state in states:
            eid = state.get("entity_id") or ""
            attrs = state.get("attributes") or {}
            if (eid.startswith("device_tracker.") and (entities.get(eid) or {}).get("platform") in platforms
                    and all(attrs.get(k) == v for k, v in CLIENT_ATTR.items()) and norm_mac(attrs.get("mac")) == self.mac):
                return state
        return None

    def _ap_by_tracker(self, tracker: dict | None, aps: list[str]) -> str | None:
        """The marked access point whose node tracker's MAC is the client tracker's `deco_mac`."""
        node = norm_mac(((tracker or {}).get("attributes") or {}).get("deco_mac"))
        if not node:
            return None
        entities, states = self._registry()
        for key in aps:
            for rule in self.rules.get("access_points", []):
                device = self._device_of(key, entities)
                ids = [key] if key in entities else [e for e, r in entities.items() if device and r.get("device_id") == device]
                for eid in ids:
                    if (eid.startswith("device_tracker.") and (entities.get(eid) or {}).get("platform") == rule["integration"]
                            and norm_mac(((states.get(eid) or {}).get("attributes") or {}).get("mac")) == node):
                        return key
        return None

    def save(self, config: dict) -> None:
        """The editor's save keeps the file's samples (R17): a page loaded before a sample would drop it.
        Of the page's samples only manual readings it added (Add reading) are appended, once each; a survey
        sample comes from `sample` alone."""
        plan = doc.extract(config)
        if plan is None:
            raise DomosensoError("no plan in the saved config")
        with self.file_lock:
            current = list((self._read_plan().get("wifi") or {}).get("samples") or [])
            known = {_sample_key(x) for x in current if isinstance(x, dict)}
            for got in (plan.get("wifi") or {}).get("samples") or []:
                if isinstance(got, dict) and got.get("source") == "manual" and _sample_key(got) not in known:
                    current.append(got)
                    known.add(_sample_key(got))
            wifi = {k: v for k, v in (plan.get("wifi") or {}).items() if k != "samples"}
            if current:
                wifi["samples"] = current
            plan = {k: v for k, v in plan.items() if k != "wifi"}
            if wifi:
                plan["wifi"] = wifi
            doc.validate(plan)
            doc.write_plan_file(self.plan_file, plan)
        self.say(("wrote", self.shown))

    # ---- the page ----

    def page(self) -> str:
        return (PAGE.replace("card.setConfig({});", "card.setConfig({ survey: true });")
                .replace("<title>Floor plan preview</title>", "<title>Floor plan survey</title>")
                .replace("<header>Preview: real data, read-only.", "<header>Survey: real data, read-only."))

    def route(self, method: str, path: str, body: bytes) -> tuple[int, Any] | None:
        if method == "GET" and path == "/survey/link":
            return 200, {"link": self.reading()}
        if method == "POST" and path == "/survey/sample":
            try:
                asked = json.loads(body or b"null")
            except ValueError:
                asked = None
            if not _valid_tap(asked):
                return 400, "floor_id, x and y needed"
            self._why.reason = None
            try:
                got = self.take(asked["floor_id"], asked["x"], asked["y"])
            except DomosensoError as exc:
                return 400, str(exc)
            return 200, {"sample": got} if got is not None else {"sample": None, "skipped": self._why.reason}
        return None


def _sample_key(sample: dict) -> str:
    """What makes two samples the same reading."""
    return json.dumps([sample.get(k) for k in ("floor_id", "x", "y", "t", "band", "dbm")])


def _valid_tap(value: Any) -> bool:
    def number(v: Any) -> bool:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    return (isinstance(value, dict) and "floor_id" in value and (value["floor_id"] is None or isinstance(value["floor_id"], str))
            and number(value.get("x")) and number(value.get("y")))


def load_rules(card: Path) -> dict:
    """The rendered card's Wi-Fi rules: the same file the card reads (R4)."""
    path = Path(card) / "cards" / "lib" / "wifi-rules.json"
    rules = doc.read_json(path)
    if rules is None:
        raise DomosensoError(f"no floorplan card rendered: {path} (render first)")
    return rules
