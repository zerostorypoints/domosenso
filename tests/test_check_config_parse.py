"""Counting check_config's errors: the JSON document's `total_errors` plus the blueprint log lines that
check_config prints without counting them (it exits 0 on a broken automation-blueprint instance)."""
import json
import subprocess
import sys
from pathlib import Path

from check_config_parse import NO_JSON, count_errors, summarize

TOOL = Path(__file__).resolve().parent.parent / "tools" / "check_config_parse.py"
BLUEPRINT_LINE = (
    "ERROR:homeassistant.components.automation:Blueprint 'Wake up' generated invalid automation "
    "with inputs {'light': 'light.bedroom'}: Entity ID light.bedroom is an invalid entity ID"
)


def document(errors: dict | None = None, warnings: dict | None = None) -> str:
    errors, warnings = errors or {}, warnings or {}
    return json.dumps({
        "config_dir": "/config",
        "total_errors": sum(len(v) for v in errors.values()),
        "total_warnings": sum(len(v) for v in warnings.values()),
        "errors": errors,
        "warnings": warnings,
    }, indent=2) + "\n"


def test_clean():
    assert count_errors(document()) == (0, [])
    assert summarize("fresh", document()) == (0, ["fresh: 0 errors (0 from blueprint log lines), 0 warnings"])


def test_json_errors():
    out = document({"automation": ["bad trigger", "bad action"]}, {"frontend": ["old theme key"]})
    assert count_errors(out) == (2, [])
    assert summarize("fresh", out) == (2, [
        "fresh: 2 errors (0 from blueprint log lines), 1 warnings",
        "  error [automation] bad trigger",
        "  error [automation] bad action",
        "  warning [frontend] old theme key",
    ])


def test_blueprint_log_line_counts_as_an_error():
    out = f"INFO:homeassistant.setup:starting\n{BLUEPRINT_LINE}\n" + document()
    assert count_errors(out) == (1, [BLUEPRINT_LINE])
    n, lines = summarize("fresh", out)
    assert n == 1
    assert lines == ["fresh: 1 errors (1 from blueprint log lines), 0 warnings", f"  error [log] {BLUEPRINT_LINE}"]


def test_log_lines_after_the_document_are_tolerated():
    # `exec` merges stderr into stdout, so log lines can land after the JSON document too.
    out = document({"template": ["x"]}) + f"{BLUEPRINT_LINE}\nWARNING:something\n"
    assert count_errors(out) == (2, [BLUEPRINT_LINE])


def test_no_json_document_is_a_large_count_with_a_reason():
    n, lines = count_errors("Traceback (most recent call last):\n  boom\n")
    assert n == NO_JSON and n > 100
    assert len(lines) == 1 and lines[0].startswith("no JSON output")
    assert summarize("fresh", "garbage")[1][0].startswith("fresh: no JSON output (")


def test_long_messages_are_cut_at_300_characters():
    out = document({"automation": ["x" * 400]})
    assert summarize("fresh", out)[1][1] == "  error [automation] " + "x" * 300


def test_cli_prints_the_lines_and_writes_the_count(tmp_path):
    out = tmp_path / "fresh.json"
    out.write_text(f"{BLUEPRINT_LINE}\n" + document({"automation": ["bad"]}))
    err = tmp_path / "fresh.err"
    err.write_text("")
    done = subprocess.run([sys.executable, str(TOOL), "fresh", str(out), str(err)], capture_output=True, text=True)
    assert done.returncode == 0
    assert done.stdout.splitlines() == [
        "fresh: 2 errors (1 from blueprint log lines), 0 warnings",
        "  error [automation] bad",
        f"  error [log] {BLUEPRINT_LINE}",
    ]
    assert (tmp_path / "fresh.json.count").read_text() == "2"


def test_cli_without_json_writes_999(tmp_path):
    out = tmp_path / "fresh.json"
    out.write_text("")
    done = subprocess.run([sys.executable, str(TOOL), "fresh", str(out), str(tmp_path / "e")], capture_output=True, text=True)
    assert done.returncode == 0
    assert done.stdout.startswith("fresh: no JSON output (")
    assert (tmp_path / "fresh.json.count").read_text() == "999"
