"""Read a component's `UPGRADE.md`: the entries between two versions."""
from __future__ import annotations

import re

_HEADING = re.compile(r"^## (\d+)\.(\d+)\.(\d+)\b")
_FENCE = re.compile(r"^\s*(```|~~~)")


def sections_between(upgrade_md: str, old: str, new: str) -> list[str]:
    """The `## <version> ...` sections of `upgrade_md` with `old < version <= new`, newest first.

    A section runs from its heading to the next `## ` heading, so its `###` subsections belong to it;
    a `## ` line inside a code fence does not start one, and a `## ` heading that is not a version
    (`## Unreleased`) ends the section before it and is not returned."""
    low, high = version_key(old), version_key(new)
    found: list[tuple[tuple[int, int, int], str]] = []
    key: tuple[int, int, int] | None = None
    block: list[str] = []
    fenced = False

    def close() -> None:
        if key is not None and low < key <= high:
            found.append((key, "\n".join(block).rstrip()))

    for line in upgrade_md.splitlines():
        if _FENCE.match(line):
            fenced = not fenced
        if not fenced and line.startswith("## "):
            close()
            match = _HEADING.match(line)
            key = tuple(map(int, match.groups())) if match else None
            block = [line]
        elif key is not None:
            block.append(line)
    close()
    return [text for _, text in sorted(found, key=lambda item: item[0], reverse=True)]


def version_key(version: str) -> tuple[int, int, int]:
    return tuple(map(int, version.split(".")))  # type: ignore[return-value]
