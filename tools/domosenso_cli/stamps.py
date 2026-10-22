"""The first line of a rendered file, and reading it back.

Two forms exist and `parse` reads both:
  new  `# Rendered by Domosenso from <id>/<version> (<sha>[-dirty]) — do not edit`
  old  `# Rendered by Domosenso from <id>@<sha>[-dirty] — do not edit`   (tools/domosenso_render.py --stamp)
The old form carries no version; it is read until the next minor version (docs/COMPATIBILITY.md).
"""

import re
from dataclasses import dataclass

_HEAD = "# Rendered by Domosenso from "
_TAIL = " — do not edit"
_SHA = r"(?P<sha>[0-9a-f]{7,40})(?P<dirty>-dirty)?"
_ID = r"(?P<cid>[a-z0-9][a-z0-9-]*)"
_NEW = re.compile(rf"{re.escape(_HEAD)}{_ID}/(?P<version>[^\s/()]+) \({_SHA}\){re.escape(_TAIL)}")
_OLD = re.compile(rf"{re.escape(_HEAD)}{_ID}@{_SHA}{re.escape(_TAIL)}")


@dataclass(frozen=True)
class Stamp:
    cid: str
    version: str | None  # None for the old form
    sha: str
    dirty: bool


def stamp(cid: str, version: str, sha: str, dirty: bool = False) -> str:
    """The first line, with its newline."""
    return f"{_HEAD}{cid}/{version} ({sha}{'-dirty' if dirty else ''}){_TAIL}\n"


def parse(first_line: str) -> Stamp | None:
    line = first_line.rstrip("\r\n")
    for pattern in (_NEW, _OLD):
        match = pattern.fullmatch(line)
        if match:
            return Stamp(match["cid"], match.groupdict().get("version"), match["sha"], bool(match["dirty"]))
    return None


def body(text: str) -> str:
    """The text without its stamp line; unchanged when the first line is not one."""
    first, _, rest = text.partition("\n")
    return rest if parse(first) else text
