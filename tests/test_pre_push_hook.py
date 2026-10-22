"""The pre-push guard in .githooks: no push to main, no tag moved or deleted (AGENTS.md)."""
import os
import subprocess
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / ".githooks" / "pre-push"
ZERO = "0" * 40
A, B = "a" * 40, "b" * 40


def push(*lines: str, allow: bool = False) -> subprocess.CompletedProcess:
    env = {**os.environ, "DOMOSENSO_ALLOW_MAIN_PUSH": "1" if allow else ""}
    return subprocess.run([str(HOOK), "origin", "git@example:repo.git"], input="".join(l + "\n" for l in lines),
                          text=True, capture_output=True, env=env)


def test_feature_branch_push_allowed():
    assert push(f"refs/heads/claude/x {A} refs/heads/claude/x {ZERO}").returncode == 0


def test_push_to_main_refused():
    r = push(f"refs/heads/main {A} refs/heads/main {B}")
    assert r.returncode == 1 and "push to main" in r.stderr


def test_new_tag_allowed():
    assert push(f"refs/tags/ramka/0.1.3 {A} refs/tags/ramka/0.1.3 {ZERO}").returncode == 0


def test_moved_tag_refused():
    r = push(f"refs/tags/ramka/0.1.2 {A} refs/tags/ramka/0.1.2 {B}")
    assert r.returncode == 1 and "moving tag ramka/0.1.2" in r.stderr


def test_deleted_tag_refused():
    r = push(f"(delete) {ZERO} refs/tags/ramka/0.1.2 {B}")
    assert r.returncode == 1 and "deleting tag" in r.stderr


def test_human_override_for_one_push():
    assert push(f"refs/heads/main {A} refs/heads/main {B}", allow=True).returncode == 0
