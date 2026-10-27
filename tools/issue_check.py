#!/usr/bin/env python3
"""Check an issue against the standard in docs/ISSUES.md: the sections its type requires, testable
acceptance criteria, named tests, the privacy box, and nothing from a real home.

Usage: uv run tools/issue_check.py <file.md | -> [--title T] [--forbidden-file F] [--json]
       uv run tools/issue_check.py --issue <number> [--repo owner/name] [--forbidden-file F] [--json]

A file may start with `# <title>`. Sections are `## <name>` (written by hand or by an agent) or
`### <name>` (how GitHub renders an issue form). Type, area and the spec decision come from a line
`**Type:** … · **Area:** … · **Spec needed:** …` or from `### Type`, `### Area`, `### Spec needed`.
`--issue` reads the issue through `gh issue view`. `--forbidden-file` adds a home's own words (one
per line, `#` comments), kept outside the catalog.

Prints `error <rule>: <why>` and `warn <rule>: <why>` lines, then `ok` or `FAIL <n> error(s)`;
exits 0 or 1. The judgment calls (is the problem observed, does each criterion test the solution)
are the `review-issue` skill's, not this script's.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

KINDS = ("bug", "enhancement", "new", "docs")
COMMON = ("Summary", "Problem statement", "Value proposition", "Proposed solution", "Alternatives considered",
          "Acceptance criteria", "Tests required", "Compatibility and upgrade", "Privacy check")
BUG_ONLY = ("Evidence", "Environment")
FIELDS = ("Type", "Area", "Spec needed")
LABEL_KINDS = {"bug": "bug", "enhancement": "enhancement", "documentation": "docs"}
EMPTY = {"", "_no response_", "n/a", "none", "tbd", "todo", "-"}

HEADING = re.compile(r"^#{2,3}\s+(.+?)\s*$")
FIELD_LINE = re.compile(r"\*\*(Type|Area|Spec needed):\*\*\s*([^·\n]+)", re.I)
CHECKBOX = re.compile(r"^\s*[-*] \[( |x|X)\] ", re.M)
TEST_NAMES = re.compile(r"tests/|\.test\.mjs|\btest_\w+|check-all|catalog_check|ha-check|esphome-check|agents_check|"
                        r"\bpytest\b|test_privacy|issue_check", re.I)
FAILS_FIRST = re.compile(r"\bfail", re.I)
USER_STORY = re.compile(r"\bas an? [^,]+, I want .+ so that ", re.I | re.S)
VAGUE = re.compile(r"\b(works? (correctly|properly|fine|well)|as expected|user[- ]friendly|intuitive|"
                   r"seamless(ly)?|etc\.?|and so on|if possible|appropriate(ly)?)\b", re.I)
TITLE = re.compile(r"^[^:\s][^:]{0,48}: \S")

# What may stand in a public issue: loopback and the documentation ranges (RFC 5737), example domains.
ALLOWED_IPS = re.compile(r"^(127\.|0\.0\.0\.0$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)")
LEAKS = (
    ("an IP address", re.compile(r"(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])")),
    ("a MAC address", re.compile(r"\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b", re.I)),
    ("an e-mail address", re.compile(r"\b[\w.+-]+@(?!example\.(?:com|org|net)\b)(?!anthropic\.com\b)[\w-]+(?:\.[\w-]+)+\b")),
    ("a home directory", re.compile(r"(?:/Users|/home)/(?!<)[\w.-]+")),
    ("a token", re.compile(r"\b(?:gh[opsu]_[A-Za-z0-9]{20,}|eyJ[\w-]{20,}\.[\w-]+|sk-[A-Za-z0-9]{20,})")),
)


@dataclass
class Report:
    title: str = ""
    kind: str | None = None
    spec: str | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def required_sections(kind: str) -> set[str]:
    return set(COMMON) | (set(BUG_ONLY) if kind == "bug" else set())


def kind_of(written: str) -> str | None:
    """The type from the words people write: `bug`, `enhancement (…)`, `new device / …`, `process / docs`."""
    w = written.strip().lower()
    for prefix, kind in (("bug", "bug"), ("enhancement", "enhancement"), ("new", "new"), ("docs", "docs"),
                         ("documentation", "docs"), ("process", "docs")):
        if w.startswith(prefix):
            return kind
    return None


def split(text: str) -> tuple[str, dict[str, str]]:
    """The `# title` line (if any) and the sections by name; text before the first section is `_head`."""
    lines = text.splitlines()
    title = ""
    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip()
    sections: dict[str, list[str]] = {"_head": []}
    current = "_head"
    fence = False
    for line in lines[1:] if title else lines:
        if line.lstrip().startswith("```"):
            fence = not fence
        m = None if fence else HEADING.match(line)
        if m:
            current = m[1].strip().rstrip(":")
            sections.setdefault(current, [])
        else:
            sections[current].append(line)
    return title, {k: "\n".join(v).strip() for k, v in sections.items()}


def empty(value: str) -> bool:
    return value.strip().lower() in EMPTY


def read_words(path: Path) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            out.append(line)
    return out


def check(text: str, title: str | None = None, labels: list[str] | None = None,
          forbidden: list[str] | None = None) -> Report:
    head_title, sections = split(text)
    by_name = {k.lower(): v for k, v in sections.items()}
    r = Report(title=title or head_title)
    err, warn = r.errors.append, r.warnings.append

    found = {m[1].lower(): m[2].strip() for m in FIELD_LINE.finditer(sections["_head"])}
    for name in FIELDS:
        value = found.get(name.lower()) or by_name.get(name.lower(), "")
        if empty(value) and name == "Type":
            value = next((n for n in (labels or []) if n in LABEL_KINDS), "")
        if empty(value):
            err(f"{slug(name)}: missing")
            continue
        if name == "Type":
            r.kind = kind_of(LABEL_KINDS.get(value, value))
            if r.kind is None:
                err(f"type: unknown '{value}' ({', '.join(KINDS)})")
        elif name == "Spec needed":
            r.spec = value.split()[0].lower().strip(".,;()")
            if r.spec not in ("yes", "no"):
                err(f"spec-needed: say yes or no, not '{value}'")

    for name in sorted(required_sections(r.kind or "enhancement"), key=lambda n: (COMMON + BUG_ONLY).index(n)):
        value = by_name.get(name.lower())
        if value is None:
            err(f"{slug(name)}: missing")
        elif empty(value):
            err(f"{slug(name)}: empty")

    criteria = by_name.get("acceptance criteria", "")
    if criteria and not empty(criteria):
        items = CHECKBOX.findall(criteria)
        if not items:
            err("acceptance-criteria: no checkbox item (- [ ])")
        elif len(items) == 1:
            warn("acceptance-criteria: only one criterion")
        for line in criteria.splitlines():
            m = VAGUE.search(line)
            if m:
                warn(f"acceptance-criteria: vague '{m[0]}' in: {line.strip()[:80]}")

    tests = by_name.get("tests required", "")
    if tests and not empty(tests):
        if not CHECKBOX.search(tests):
            err("tests-required: no checkbox item (- [ ])")
        if not TEST_NAMES.search(tests):
            err("tests-required: names no test or check (tests/…, *.test.mjs, catalog_check, ha-check, …)")
        if not FAILS_FIRST.search(tests):
            if r.kind == "bug":
                err("tests-required: say that the test fails before the fix")
            elif r.kind in ("enhancement", "new"):
                warn("tests-required: say that the tests fail before the change")

    privacy = by_name.get("privacy check")
    if privacy is not None and not empty(privacy) and not re.search(r"^\s*[-*] \[[xX]\] ", privacy, re.M):
        err("privacy-check: not ticked (- [x])")

    if r.kind in ("enhancement", "new") and "user story" not in by_name and not USER_STORY.search(text):
        warn("user-story: none (As a <who>, I want <what>, so that <why>)")

    t = r.title
    if not t:
        warn("title: none")
    elif not TITLE.match(t) or len(t) > 100 or t.endswith("."):
        warn(f"title: '<area>: <what changes>', at most 100 characters, no full stop: {t[:60]}")

    words = [re.compile(rf"\b{re.escape(w)}\b", re.I) for w in (forbidden or [])]
    for n, line in enumerate(text.splitlines(), 1):
        for what, pattern in LEAKS:
            for m in pattern.finditer(line):
                if what == "an IP address" and ALLOWED_IPS.match(m[0]):
                    continue
                err(f"privacy: {what} on line {n}")
                break
        for word, pattern in zip(forbidden or [], words):
            if pattern.search(line):
                err(f"privacy: a household word ('{word}') on line {n}")
    return r


def render(r: Report) -> list[str]:
    lines = [f"error {e}" for e in r.errors] + [f"warn {w}" for w in r.warnings]
    lines.append(f"FAIL {len(r.errors)} error(s)" if r.errors else "ok")
    return lines


def gh(args: list[str]) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("file", nargs="?", help="an issue as Markdown, or - for stdin")
    p.add_argument("--issue", help="a GitHub issue number, read with gh")
    p.add_argument("--repo", default="zerostorypoints/domosenso")
    p.add_argument("--title", help="the title, when the file has no '# title' line")
    p.add_argument("--forbidden-file", type=Path, help="a home's own words, one per line")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    labels: list[str] = []
    if a.issue:
        doc = json.loads(gh(["issue", "view", a.issue, "--repo", a.repo, "--json", "title,body,labels"]))
        text, title, labels = doc["body"], doc["title"], [lb["name"] for lb in doc.get("labels", [])]
    elif a.file:
        text = sys.stdin.read() if a.file == "-" else Path(a.file).read_text(encoding="utf-8")
        title = a.title
    else:
        p.error("give a file, - or --issue")
    forbidden = read_words(a.forbidden_file) if a.forbidden_file else None
    r = check(text, title=title, labels=labels, forbidden=forbidden)
    if a.json:
        print(json.dumps({"title": r.title, "type": r.kind, "spec_needed": r.spec, "errors": r.errors,
                          "warnings": r.warnings, "result": "FAIL" if r.errors else "ok"}, indent=2))
    else:
        print("\n".join(render(r)))
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main())
