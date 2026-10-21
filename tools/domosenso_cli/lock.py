"""`domosenso.lock`: what the tool wrote into the home, per component. Only `domosenso` writes it."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import yaml

from domosenso_cli.schema import load_validated

LOCK_FILE = "domosenso.lock"
HEADER = "# Written by domosenso — do not edit\n"


@dataclass
class FileRecord:
    sha256: str
    from_: str  # the file's source inside the component (the `from` key in the lock)
    layer: Literal["managed", "instance"] = "managed"


@dataclass
class LockEntry:
    version: str
    tag: str
    commit: str
    files: dict[str, FileRecord] = field(default_factory=dict)
    resources: list[str] = field(default_factory=list)


@dataclass
class Lock:
    components: dict[str, LockEntry] = field(default_factory=dict)

    @classmethod
    def load(cls, root: Path) -> Lock:
        data = load_validated(root / LOCK_FILE, "lock", missing_ok=True)
        if data is None:
            return cls()
        return cls(
            {
                cid: LockEntry(
                    version=raw["version"],
                    tag=raw["tag"],
                    commit=raw["commit"],
                    files={
                        path: FileRecord(rec["sha256"], rec["from"], rec.get("layer", "managed"))
                        for path, rec in raw["files"].items()
                    },
                    resources=list(raw.get("resources", [])),
                )
                for cid, raw in data["components"].items()
            }
        )

    def save(self, root: Path) -> None:
        document = {"components": {cid: _entry_data(entry) for cid, entry in self.components.items()}}
        text = HEADER + yaml.safe_dump(document, sort_keys=True, allow_unicode=True)
        target = root / LOCK_FILE
        temporary = target.with_name(LOCK_FILE + ".tmp")
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, target)

    def owner(self, path: str) -> str | None:
        """The component whose files include `path` (relative to the home root, POSIX form)."""
        for cid, entry in self.components.items():
            if path in entry.files:
                return cid
        return None


def _entry_data(entry: LockEntry) -> dict:
    files = {}
    for path, record in entry.files.items():
        item = {"sha256": record.sha256, "from": record.from_}
        if record.layer != "managed":
            item["layer"] = record.layer
        files[path] = item
    return {
        "version": entry.version,
        "tag": entry.tag,
        "commit": entry.commit,
        "files": files,
        "resources": list(entry.resources),
    }
