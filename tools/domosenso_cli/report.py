"""Output of a command: one line per action, then `ok` or `FAIL <reason>`; or one JSON document."""
from __future__ import annotations

import json


class Reporter:
    """Text mode prints each line as it happens; JSON mode keeps them and prints one document at
    the end, so a consumer never has to parse a stream."""

    def __init__(self, json_mode: bool = False) -> None:
        self.json_mode = json_mode
        self.lines: list[list[str]] = []
        self.data: list[dict] = []  # structured results, part of the JSON document only
        self.extra: dict = {}  # further top-level keys of the JSON document (`recommend`'s `scan`)

    def line(self, kind: str, *fields: str) -> None:
        self.lines.append([kind, *fields])
        if not self.json_mode:
            print(" ".join([kind, *fields]), flush=True)

    def ok(self) -> int:
        self._finish({"result": "ok"}, "ok")
        return 0

    def fail(self, reason: str) -> int:
        self._finish({"result": "FAIL", "reason": reason}, f"FAIL {reason}")
        return 1

    def _finish(self, result: dict, text: str) -> None:
        if not self.json_mode:
            print(text, flush=True)
            return
        document: dict = {"lines": self.lines}
        if self.data:
            document["data"] = self.data
        document.update(self.extra)
        document.update(result)
        print(json.dumps(document), flush=True)
