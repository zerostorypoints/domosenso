"""`.domosenso/dev-render.json`: what a `--catalog-dev` render wrote, per component (SPEC-019 B).

The lock describes only renders from a tag (SPEC-002), so without this file a deploy would not know
a dev render's new files: a component the lock does not have, a new card version directory, its
resource URLs. `render --catalog-dev` and `add --catalog-dev` write an entry; a render, `add` or
`update` of the component from a tag removes it. The file lives under the git-ignored `.domosenso/`:
it describes this working copy, not the home's history.

    {"<id>": {"version": "1.1.0", "commit": "<short head>-dirty",
              "files": {"<dest from the home root>": {"sha256": "...", "layer": "managed"}},
              "resources": ["/local/domosenso/<id>/1.1.0/cards/<card>.js"]}}
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from domosenso_cli.errors import DomosensoError

INVENTORY = Path(".domosenso") / "dev-render.json"


def load(root: Path) -> dict[str, dict]:
    path = root / INVENTORY
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        raise DomosensoError(f"{INVENTORY}: {exc}; render again with --catalog-dev or delete it") from exc
    if not isinstance(data, dict) or not all(
        isinstance(e, dict) and isinstance(e.get("files"), dict) and isinstance(e.get("resources", []), list)
        for e in data.values()
    ):
        raise DomosensoError(f"{INVENTORY}: not an inventory of dev renders; render again with --catalog-dev")
    return data


def _save(root: Path, data: dict[str, dict]) -> None:
    path = root / INVENTORY
    if not data:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    try:
        temporary.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def record(root: Path, cid: str, version: str, commit: str, files: dict[str, dict], resources: list[str]) -> None:
    """Replace `cid`'s entry. Instance files an earlier entry holds (from `add --catalog-dev`) are kept:
    a later dev render does not render them again, and the deploy still needs them."""
    data = load(root)
    kept = {p: f for p, f in (data.get(cid) or {}).get("files", {}).items()
            if f.get("layer") == "instance" and p not in files}
    data[cid] = {"version": version, "commit": commit, "files": {**kept, **files}, "resources": list(resources)}
    _save(root, data)


def add_files(root: Path, cid: str, files: dict[str, dict]) -> None:
    data = load(root)
    data[cid]["files"].update(files)
    _save(root, data)


def drop(root: Path, cid: str) -> None:
    """A render from a tag supersedes the dev render of `cid`."""
    data = load(root)
    if data.pop(cid, None) is not None:
        _save(root, data)
