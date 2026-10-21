#!/usr/bin/env python3
"""Check the files coding agents read: AGENTS.md, CLAUDE.md and the skills.

Usage: uv run tools/agents_check.py

- AGENTS.md exists and is at most 32,768 bytes (Codex's default project_doc_max_bytes; Codex stops
  reading at the limit, so anything past it is silently lost);
- CLAUDE.md is only the import line `@AGENTS.md`: AGENTS.md is the single instruction source;
- every .ai/skills/<name>/SKILL.md has front matter with only `name` and `description`; `name` is
  the directory name (lower case, digits, single hyphens, at most 64 characters) and
  `description` is 1 to 1,024 characters without < or >;
- the per-agent skill links are what tools/install_skills.py would write.

Exits 1 on any error.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

import install_skills

REPO = Path(__file__).resolve().parent.parent
BUDGET = 32_768
CLAUDE_IMPORT = "@AGENTS.md"
NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SKILL_KEYS = {"name", "description"}


def check_agents_md(root: Path) -> list[str]:
    path = root / "AGENTS.md"
    if not path.is_file():
        return ["AGENTS.md: missing"]
    size = path.stat().st_size
    if size > BUDGET:
        return [f"AGENTS.md: {size} bytes, over the budget of {BUDGET} by {size - BUDGET}"]
    return []


def check_claude_md(root: Path) -> list[str]:
    path = root / "CLAUDE.md"
    if not path.is_file():
        return ["CLAUDE.md: missing (it holds one line, @AGENTS.md)"]
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if lines != [CLAUDE_IMPORT]:
        return [f"CLAUDE.md: must be the single line {CLAUDE_IMPORT}; instructions go in AGENTS.md"]
    return []


def front_matter(text: str):
    """The YAML between a leading '---' line and the next one, or None."""
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    return yaml.safe_load(m[1]) if m else None


def check_skill(path: Path) -> list[str]:
    label = path.relative_to(path.parents[3]).as_posix()  # .ai/skills/<name>/SKILL.md from root
    try:
        meta = front_matter(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [f"{label}: front matter is not valid YAML: {exc}"]
    if not isinstance(meta, dict):
        return [f"{label}: no front matter (--- name, description ---)"]
    errors = []
    extra = sorted(set(meta) - SKILL_KEYS)
    if extra:
        errors.append(f"{label}: front matter keys other than name and description: {', '.join(extra)}")
    name, description = meta.get("name"), meta.get("description")
    directory = path.parent.name
    if not isinstance(name, str) or not NAME.match(name) or len(name) > 64:
        errors.append(f"{label}: name {name!r} must be lower case, digits and single hyphens, at most 64 characters")
    elif name != directory:
        errors.append(f"{label}: name '{name}' must equal the directory name '{directory}'")
    if not isinstance(description, str) or not description.strip():
        errors.append(f"{label}: description missing")
    elif len(description) > 1024:
        errors.append(f"{label}: description is {len(description)} characters, at most 1024")
    elif "<" in description or ">" in description:
        errors.append(f"{label}: description must not contain < or >")
    return errors


def check_skills(root: Path) -> list[str]:
    errors = []
    source = root / install_skills.SOURCE
    for directory in sorted(source.iterdir()) if source.is_dir() else []:
        if directory.is_dir() and not (directory / "SKILL.md").is_file():
            errors.append(f"{install_skills.SOURCE / directory.name}: no SKILL.md")
    for path in sorted(source.glob("*/SKILL.md")):
        errors += check_skill(path)
    return errors + install_skills.check(root)


def check_all(root: Path) -> list[str]:
    return check_agents_md(root) + check_claude_md(root) + check_skills(root)


def main(argv: list[str] | None = None) -> int:
    errors = check_all(REPO)
    for message in errors:
        print(f"ERROR   {message}")
    agents_md = REPO / "AGENTS.md"
    if agents_md.is_file():
        print(f"AGENTS.md: {agents_md.stat().st_size} of {BUDGET} bytes")
    print(f"{len(install_skills.skill_names(REPO))} skill(s), {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
