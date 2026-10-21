#!/usr/bin/env python3
"""Install the repository's agent skills for each coding agent, from one source.

Usage: uv run tools/install_skills.py [--agents claude-code,codex,cursor] [--check]

The source is .ai/skills/<name>/SKILL.md. Each agent gets relative directory symlinks to it:
- codex and cursor read .agents/skills/ themselves: .agents/skills/<name> -> ../../.ai/skills/<name>;
- claude-code reads only .claude/skills/: .claude/skills/<name> -> ../../.ai/skills/<name>.
A link in those directories whose skill no longer exists is removed. --check writes nothing and
exits 1 when a link is missing, points elsewhere or is stale. The links are committed, so a fresh
clone or worktree needs no install; run this after adding, renaming or removing a skill.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SOURCE = Path(".ai/skills")
# agent -> the directory it discovers project skills in
AGENT_DIRS = {
    "claude-code": Path(".claude/skills"),
    "codex": Path(".agents/skills"),
    "cursor": Path(".agents/skills"),
}


def skill_names(root: Path) -> list[str]:
    source = root / SOURCE
    return sorted(p.parent.name for p in source.glob("*/SKILL.md")) if source.is_dir() else []


def link_dirs(agents: list[str]) -> list[Path]:
    unknown = [a for a in agents if a not in AGENT_DIRS]
    if unknown:
        raise ValueError(f"unknown agent(s): {', '.join(unknown)} (known: {', '.join(AGENT_DIRS)})")
    return sorted({AGENT_DIRS[a] for a in agents})


def plan(root: Path, agents: list[str]) -> dict[Path, str]:
    """Link path (from root) -> the relative target it must have."""
    out = {}
    for directory in link_dirs(agents):
        up = os.path.relpath(".", directory)  # ../..
        for name in skill_names(root):
            out[directory / name] = str(Path(up) / SOURCE / name)
    return out


def check(root: Path, agents: list[str] = list(AGENT_DIRS)) -> list[str]:
    problems = []
    wanted = plan(root, agents)
    for link, target in wanted.items():
        path = root / link
        if not path.is_symlink():
            problems.append(f"{link}: missing (want a symlink to {target})")
        elif os.readlink(path) != target:
            problems.append(f"{link}: points to {os.readlink(path)}, want {target}")
    for directory in link_dirs(agents):
        if (root / directory).is_dir():
            for entry in sorted((root / directory).iterdir()):
                if directory / entry.name not in wanted and entry.is_symlink():
                    problems.append(f"{directory / entry.name}: stale, no {SOURCE / entry.name}/SKILL.md")
    return problems


def install(root: Path, agents: list[str] = list(AGENT_DIRS)) -> list[str]:
    """Creates, repoints and removes links; returns what it did."""
    done = []
    wanted = plan(root, agents)
    for directory in link_dirs(agents):
        if (root / directory).is_dir():
            for entry in sorted((root / directory).iterdir()):
                if directory / entry.name not in wanted and entry.is_symlink():
                    entry.unlink()
                    done.append(f"removed {directory / entry.name}")
    for link, target in wanted.items():
        path = root / link
        if path.is_symlink() and os.readlink(path) == target:
            continue
        if path.is_symlink():
            path.unlink()
        elif path.exists():
            raise FileExistsError(f"{link} exists and is not a symlink; move it into {SOURCE} first")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.symlink_to(target, target_is_directory=True)
        done.append(f"linked  {link} -> {target}")
    return done


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--agents", default=",".join(AGENT_DIRS), help="comma-separated: " + ", ".join(AGENT_DIRS))
    parser.add_argument("--check", action="store_true", help="report drift, write nothing")
    parser.add_argument("--root", type=Path, default=REPO, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    agents = [a.strip() for a in args.agents.split(",") if a.strip()]
    try:
        if args.check:
            problems = check(args.root, agents)
            for p in problems:
                print(f"ERROR   {p}")
            print(f"{len(skill_names(args.root))} skill(s), {len(problems)} problem(s)")
            return 1 if problems else 0
        for line in install(args.root, agents):
            print(line)
    except (ValueError, FileExistsError) as exc:
        print(f"install_skills: {exc}", file=sys.stderr)
        return 2
    print(f"{len(skill_names(args.root))} skill(s) installed for {', '.join(agents)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
