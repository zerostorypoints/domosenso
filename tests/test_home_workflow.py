"""Installing shared guidance must preserve home-owned agent configuration."""
import json
from pathlib import Path

import pytest

from test_home_staging import home  # noqa: F401 — shared real Git home fixture
from home_workflow import install_workflow, WorkflowError


@pytest.fixture
def source(tmp_path):
    root = tmp_path / 'framework'
    (root / '.ai/skills/stage-home-update').mkdir(parents=True)
    (root / '.ai/skills/stage-home-update/SKILL.md').write_text('---\nname: stage-home-update\ndescription: Use when staging a home.\n---\nOne\n')
    (root / 'docs').mkdir()
    (root / 'docs/HOME_STAGING.md').write_text('Guide one\n')
    return root


def test_fresh_install_and_repeat_preserve_other_agent_files(home, source):
    (home / 'AGENTS.md').write_text('Owner instructions\n')
    (home / '.claude').mkdir()
    (home / '.claude/settings.json').write_text('{"permissions":{}}\n')
    install_workflow(home, source)
    assert (home / '.agents/skills/stage-home-update/SKILL.md').read_text().endswith('One\n')
    assert (home / '.claude/skills/stage-home-update').is_symlink()
    assert install_workflow(home, source)['changed'] == []
    assert (home / 'AGENTS.md').read_text() == 'Owner instructions\n'
    assert (home / '.claude/settings.json').read_text() == '{"permissions":{}}\n'
    assert json.loads((home / '.ai/home-workflow.json').read_text())['format'] == 1


def test_upgrade_replaces_only_unchanged_installed_files(home, source):
    install_workflow(home, source)
    (source / 'docs/HOME_STAGING.md').write_text('Guide two\n')
    install_workflow(home, source)
    assert (home / 'docs/HOME_STAGING.md').read_text() == 'Guide two\n'


def test_customized_file_blocks_entire_upgrade(home, source):
    install_workflow(home, source)
    (home / 'docs/HOME_STAGING.md').write_text('My customization\n')
    (source / '.ai/skills/stage-home-update/SKILL.md').write_text('New version\n')
    before = (home / '.ai/skills/stage-home-update/SKILL.md').read_bytes()
    with pytest.raises(WorkflowError, match='modified|conflict'):
        install_workflow(home, source)
    assert (home / '.ai/skills/stage-home-update/SKILL.md').read_bytes() == before
    assert (home / 'docs/HOME_STAGING.md').read_text() == 'My customization\n'


def test_existing_unmanaged_skill_refused_before_writes(home, source):
    skill = home / '.ai/skills/stage-home-update/SKILL.md'
    skill.parent.mkdir(parents=True); skill.write_text('Private skill\n')
    with pytest.raises(WorkflowError, match='conflict'):
        install_workflow(home, source)
    assert skill.read_text() == 'Private skill\n'
    assert not (home / 'docs/HOME_STAGING.md').exists()


def test_symlink_parent_cannot_write_outside_home(home, source):
    elsewhere = home.parent / 'elsewhere'; elsewhere.mkdir()
    (home / '.ai').symlink_to(elsewhere)
    with pytest.raises(WorkflowError, match='symlink'):
        install_workflow(home, source)
    assert list(elsewhere.iterdir()) == []


def test_foreign_client_link_is_not_repointed(home, source):
    link = home / '.claude/skills/stage-home-update'
    link.parent.mkdir(parents=True); link.symlink_to('/unrelated')
    with pytest.raises(WorkflowError, match='conflict'):
        install_workflow(home, source)
    assert link.readlink() == Path('/unrelated')
    assert not (home / 'docs/HOME_STAGING.md').exists()
