"""tools/agents_check.py and tools/install_skills.py: the files coding agents read."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

import agents_check as ac
import install_skills as inst

REPO = Path(__file__).resolve().parent.parent


def skill(root: Path, name: str, meta: str | None = None):
    d = root / ".ai" / "skills" / name
    d.mkdir(parents=True, exist_ok=True)
    meta = meta if meta is not None else f"name: {name}\ndescription: Does {name}."
    (d / "SKILL.md").write_text(f"---\n{meta}\n---\n\n# {name}\n", encoding="utf-8")


@pytest.fixture
def home(tmp_path):
    (tmp_path / "AGENTS.md").write_text("# Agents\n", encoding="utf-8")
    (tmp_path / "CLAUDE.md").write_text("@AGENTS.md\n", encoding="utf-8")
    skill(tmp_path, "check")
    skill(tmp_path, "new-component")
    inst.install(tmp_path)
    for file in ('.codex/hooks.json', '.codex/config.toml', '.claude/settings.json'):
        target = tmp_path / file
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / file, target)
    return tmp_path


def test_valid_tree_has_no_errors(home):
    assert ac.check_all(home) == []


def test_agents_md_at_the_budget_passes_one_byte_over_fails(home):
    (home / "AGENTS.md").write_bytes(b"x" * ac.BUDGET)
    assert ac.check_agents_md(home) == []
    (home / "AGENTS.md").write_bytes(b"x" * (ac.BUDGET + 1))
    [error] = ac.check_agents_md(home)
    assert "32769 bytes" in error and "32768" in error


def test_budget_counts_bytes_not_characters(home):
    (home / "AGENTS.md").write_text("ł" * (ac.BUDGET // 2 + 1), encoding="utf-8")  # 2 bytes each
    assert ac.check_agents_md(home)


def test_missing_agents_md_fails(home):
    (home / "AGENTS.md").unlink()
    assert ac.check_agents_md(home) == ["AGENTS.md: missing"]


def test_claude_md_with_instructions_of_its_own_fails(home):
    (home / "CLAUDE.md").write_text("@AGENTS.md\n\nAlways use tabs.\n", encoding="utf-8")
    assert ac.check_claude_md(home)
    (home / "CLAUDE.md").write_text("\n@AGENTS.md\n\n", encoding="utf-8")
    assert ac.check_claude_md(home) == []


def test_skill_name_must_equal_its_directory(home):
    skill(home, "check", "name: checks\ndescription: Runs the checks.")
    [error] = ac.check_skills(home)
    assert "'checks'" in error and "'check'" in error


@pytest.mark.parametrize("meta, fragment", [
    ("name: check", "description missing"),
    ("name: check\ndescription: " + "x" * 1025, "1025 characters"),
    ("name: check\ndescription: Use <this>.", "< or >"),
    ("name: Check\ndescription: x", "lower case"),
    ("name: check\ndescription: x\nallowed-tools: Bash", "allowed-tools"),
])
def test_bad_front_matter_is_reported(home, meta, fragment):
    skill(home, "check", meta)
    errors = ac.check_skills(home)
    assert any(fragment in e for e in errors), errors


def test_skill_without_front_matter_fails(home):
    (home / ".ai" / "skills" / "check" / "SKILL.md").write_text("# check\n", encoding="utf-8")
    assert any("no front matter" in e for e in ac.check_skills(home))


def test_install_writes_relative_links_for_every_agent(home):
    for directory in (".agents/skills", ".claude/skills"):
        link = home / directory / "check"
        assert link.is_symlink() and os.readlink(link) == "../../.ai/skills/check"
        assert (link / "SKILL.md").is_file()


def test_missing_wrong_and_stale_links_are_reported(home):
    skill(home, "gone")
    inst.install(home)
    (home / ".claude" / "skills" / "check").unlink()
    (home / ".agents" / "skills" / "new-component").unlink()
    (home / ".agents" / "skills" / "new-component").symlink_to("../../elsewhere")
    (home / ".ai" / "skills" / "gone" / "SKILL.md").unlink()
    (home / ".ai" / "skills" / "gone").rmdir()
    problems = inst.check(home)
    assert any(".claude/skills/check: missing" in p for p in problems)
    assert any(".agents/skills/new-component: points to ../../elsewhere" in p for p in problems)
    assert any(".agents/skills/gone: stale" in p for p in problems)
    inst.install(home)
    assert inst.check(home) == []
    assert not (home / ".agents" / "skills" / "gone").is_symlink()


def test_install_for_codex_only_leaves_claude_alone(tmp_path):
    skill(tmp_path, "check")
    inst.install(tmp_path, ["codex"])
    assert (tmp_path / ".agents" / "skills" / "check").is_symlink()
    assert not (tmp_path / ".claude").exists()
    with pytest.raises(ValueError):
        inst.install(tmp_path, ["vim"])


def test_install_refuses_to_replace_a_real_directory(tmp_path):
    skill(tmp_path, "check")
    (tmp_path / ".claude" / "skills" / "check").mkdir(parents=True)
    with pytest.raises(FileExistsError):
        inst.install(tmp_path)


def test_the_repository_passes():
    assert ac.check_all(REPO) == []


def test_cli_exit_codes(home):
    script = REPO / "tools" / "install_skills.py"
    ok = subprocess.run([sys.executable, script, "--check", "--root", home], capture_output=True, text=True)
    assert ok.returncode == 0, ok.stdout
    (home / ".claude" / "skills" / "check").unlink()
    bad = subprocess.run([sys.executable, script, "--check", "--root", home], capture_output=True, text=True)
    assert bad.returncode == 1 and "missing" in bad.stdout


@pytest.mark.parametrize('file', ['.codex/hooks.json', '.claude/settings.json'])
def test_missing_or_disabled_workspace_hook_fails(home, file):
    (home / file).write_text('{"hooks": {}}')
    assert any(file in error for error in ac.check_all(home))


def test_disabled_codex_hooks_fail(home):
    (home / '.codex/config.toml').write_text('[features]\nhooks = false\n')
    assert any('hooks' in error for error in ac.check_all(home))


def test_claude_disable_all_hooks_fails(home):
    import json
    path = home / '.claude/settings.json'
    data = json.loads(path.read_text())
    data['disableAllHooks'] = True
    path.write_text(json.dumps(data))
    assert any('disableAllHooks' in error for error in ac.check_all(home))
