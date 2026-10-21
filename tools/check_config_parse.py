"""Count the errors in the output of Home Assistant's `check_config --json`.

check_config counts an invalid template-blueprint instance as an error, but an invalid
automation-blueprint instance only as a log line ("Blueprint ... generated invalid automation"),
with exit code 0 even under --fail-on-warnings (HA 2026.9.2). The count here is the JSON document's
`total_errors` plus those lines. Log lines may come before and after the document (the deploy's
`exec` merges stderr into stdout); output with no document counts as NO_JSON errors.

    uv run tools/check_config_parse.py <label> <stdout file> <stderr file>

prints the lines tools/ha-check.sh shows and writes the count to `<stdout file>.count`.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

NO_JSON = 999
CUT = 300
_LOGGED = re.compile(r"^ERROR:.*generated invalid .*$", re.M)
_START = re.compile(r"^\{$", re.M)  # the document is indented: its opening brace is alone on a line


def _document(stdout: str) -> dict:
    match = _START.search(stdout)
    if match is None:
        raise ValueError("no line holding only '{'")
    document, _end = json.JSONDecoder().raw_decode(stdout, match.start())
    if not isinstance(document, dict):
        raise ValueError(f"the document is a {type(document).__name__}, not an object")
    return document


def _parse(stdout: str) -> tuple[dict | None, list[str], str | None]:
    """(document or None, blueprint log lines, the reason there is no document)."""
    logged = _LOGGED.findall(stdout)
    try:
        return _document(stdout), logged, None
    except ValueError as e:
        return None, logged, f"no JSON output ({e})"


def count_errors(stdout: str) -> tuple[int, list[str]]:
    """(errors, the blueprint log lines counted); (NO_JSON, [reason]) when there is no document."""
    document, logged, reason = _parse(stdout)
    if document is None:
        return NO_JSON, [reason]
    return document.get("total_errors", 0) + len(logged), logged


def summarize(label: str, stdout: str) -> tuple[int, list[str]]:
    """The count and the lines to show: a summary, then each error and warning."""
    document, logged, reason = _parse(stdout)
    if document is None:
        return NO_JSON, [f"{label}: {reason}"]
    n = document.get("total_errors", 0) + len(logged)
    lines = [f"{label}: {n} errors ({len(logged)} from blueprint log lines), "
             f"{document.get('total_warnings', 0)} warnings"]
    for kind in ("errors", "warnings"):
        for domain, messages in (document.get(kind) or {}).items():
            for message in messages:
                lines.append(f"  {kind[:-1]} [{domain}] {str(message)[:CUT]}")
    lines.extend(f"  error [log] {line[:CUT]}" for line in logged)
    return n, lines


def main(argv: list[str]) -> int:
    label, stdout_file, _stderr_file = argv
    n, lines = summarize(label, Path(stdout_file).read_text(errors="replace"))
    for line in lines:
        print(line)
    Path(f"{stdout_file}.count").write_text(str(n))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
