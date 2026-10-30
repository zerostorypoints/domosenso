"""`<config_dir>/packages/domosenso.yaml`: `sensor.domosenso_components`, what the home runs (SPEC-022).

The file is a pure function of `domosenso.lock` and `.domosenso/dev-render.json`, so `status` and
`deploy` check it without the catalog: every command that changes either writes it again (`add`,
`adopt`, `render`, `update`). It belongs to the command, not to a component; its first line is not a
component stamp, so nothing that reads stamps takes it for one.
"""
from __future__ import annotations

import json
from pathlib import Path

from domosenso_cli import dev_render
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock

PACKAGE = "packages/domosenso.yaml"  # under config_dir
STAMP = "# Rendered by Domosenso from domosenso.lock — do not edit\n"
SHORT_SHA = 12  # as in the stamps (build.SHORT_SHA)

_TEMPLATE = """\
# sensor.domosenso_components: every component this home runs, its version, tag, commit and the
# catalog's release date of that version. Written by `domosenso` from the lock (SPEC-022); `render`
# writes it again.
template:
  - sensor:
      - default_entity_id: sensor.domosenso_components
        unique_id: domosenso_components
        name: Domosenso components
        icon: mdi:package-variant-closed
        state: "{count}"
        attributes:
          component: domosenso
          components: {components}
"""


def items(lock: Lock, dev: dict[str, dict]) -> list[dict]:
    """One item per component, sorted by id; a dev render stands in for the lock's entry."""
    found = {}
    for cid, entry in lock.components.items():
        found[cid] = {"id": cid, "version": entry.version, "tag": entry.tag, "commit": entry.commit[:SHORT_SHA],
                      "released": entry.released or "", "dev": False}
    for cid, entry in dev.items():
        found[cid] = {"id": cid, "version": str(entry.get("version", "")), "tag": "",
                      "commit": str(entry.get("commit", "")), "released": str(entry.get("released", "")), "dev": True}
    return [found[cid] for cid in sorted(found)]


def _literal(value) -> str:
    """A Jinja literal (not JSON: Jinja has no `null`). Only the item's own types occur."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ", ".join(_literal(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ", ".join(f"{_literal(k)}: {_literal(v)}" for k, v in value.items()) + "}"
    raise TypeError(f"no literal for {value!r}")


def content(lock: Lock, dev: dict[str, dict]) -> bytes | None:
    """The file's bytes; None for a home without components (then there is no file)."""
    listed = items(lock, dev)
    if not listed:
        return None
    # The attribute is a template whose result Home Assistant parses into a list; the whole template
    # goes out as a JSON string, which is a valid YAML double-quoted scalar.
    components = json.dumps("{{ " + _literal(listed) + " }}", ensure_ascii=False)
    return (STAMP + _TEMPLATE.format(count=len(listed), components=components)).encode("utf-8")


def path(home: HomeConfig) -> Path:
    return home.config_dir / PACKAGE


def expected(home: HomeConfig, lock: Lock) -> bytes | None:
    return content(lock, dev_render.load(home.root))


def is_dev(home: HomeConfig) -> bool:
    """The file lists a dev render: production takes it only with --allow-dirty."""
    return bool(dev_render.load(home.root))


def write(home: HomeConfig, lock: Lock) -> tuple[str, str] | None:
    """Write the file as the lock gives it: `("write"|"same"|"remove", dest)`, None when nothing is there
    to write or remove. Derived, so it is replaced whatever it holds."""
    target = path(home)
    dest = target.relative_to(home.root).as_posix()
    wanted = expected(home, lock)
    try:
        if wanted is None:
            if target.is_file():
                target.unlink()
                return "remove", dest
            return None
        if target.is_file() and target.read_bytes() == wanted:
            return "same", dest
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(wanted)
    except OSError as exc:
        raise DomosensoError(f"cannot write {dest}: {exc.strerror or exc}") from exc
    return "write", dest
