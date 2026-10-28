"""Reusable staging owns private home resources, never the catalog or another session."""
import json
from pathlib import Path
import subprocess

import pytest
import yaml

from dev_home import DemoError
from home_staging import HomeStaging

FRAMEWORK = Path(__file__).resolve().parents[1]


def git(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def home(tmp_path):
    primary = tmp_path / 'primary'; primary.mkdir()
    git(primary, 'init', '-b', 'main')
    git(primary, 'config', 'user.name', 'Example')
    git(primary, 'config', 'user.email', 'example@example.test')
    (primary / '.gitignore').write_text('.domosenso/\n')
    (primary / 'domosenso.yaml').write_text(yaml.safe_dump({
        'catalog': str(FRAMEWORK), 'config_dir': 'home-assistant', 'esphome_dir': 'esphome',
        'targets': {}, 'components': {},
    }))
    git(primary, 'add', '.'); git(primary, 'commit', '-m', 'Example home')
    work = tmp_path / 'work'
    git(primary, 'worktree', 'add', '-b', 'codex/stage', str(work))
    return work


def test_requires_home_linked_worktree(home):
    with pytest.raises(DemoError, match='worktree'):
        HomeStaging(home.parent / 'primary', 'review', FRAMEWORK)


def test_home_identity_is_separate_from_demo_and_other_worktree(home):
    from dev_home import Demo
    other = home.parent / 'other'
    git(home, 'worktree', 'add', '-b', 'codex/other', str(other))
    a, b = HomeStaging(home, 'review', FRAMEWORK), HomeStaging(other, 'review', FRAMEWORK)
    assert a.resource != b.resource
    assert a.resource != Demo(home, 'review').resource
    assert a.path.is_relative_to(home / '.domosenso/staging')
    assert not a.path.is_relative_to(FRAMEWORK)


def test_refuses_catalog_tree_before_private_state(home):
    with pytest.raises(DemoError, match='catalog'):
        HomeStaging(FRAMEWORK, 'review', FRAMEWORK)


def test_runtime_must_be_ignored(home):
    (home / '.gitignore').write_text('')
    with pytest.raises(DemoError, match='ignored'):
        HomeStaging(home, 'review', FRAMEWORK)
    assert not (home / '.domosenso').exists()


def test_refuses_symlinked_state(home):
    elsewhere = home.parent / 'elsewhere'; elsewhere.mkdir()
    (home / '.domosenso').symlink_to(elsewhere)
    with pytest.raises(DemoError, match='symlink'):
        HomeStaging(home, 'review', FRAMEWORK)


def test_bootstrap_does_not_copy_home_config_or_credentials(home):
    private = home / 'home-assistant'; private.mkdir()
    (private / 'configuration.yaml').write_text('unexpected_private_payload: true\n')
    s = HomeStaging(home, 'review', FRAMEWORK); s.ensure(); s.generate()
    config = (s.config / 'configuration.yaml').read_text()
    assert 'unexpected_private_payload' not in config
    assert 'default_config' not in config
    assert 'onboarding:' in config and 'frontend:' in config
    assert not (s.config / '.storage').exists()
    assert s.proxy_source == FRAMEWORK / 'tools/dev_home/proxy.py'
    assert s.path.stat().st_mode & 0o077 == 0


def test_resume_preserves_deployed_config(home):
    s = HomeStaging(home, 'review', FRAMEWORK); s.ensure(); s.generate()
    (s.config / 'configuration.yaml').write_text('homeassistant:\n  name: My staging\n')
    s.generate()
    assert (s.config / 'configuration.yaml').read_text() == 'homeassistant:\n  name: My staging\n'


def test_target_is_private_local_and_schema_compatible(home):
    from domosenso_cli.home import HomeConfig
    s = HomeStaging(home, 'review', FRAMEWORK); s.ensure(); s.generate()
    (s.path / 'runtime.json').write_text(json.dumps({'port': 38123}))
    fragment = s.target()
    raw = yaml.safe_load((home / 'domosenso.yaml').read_text())
    raw['targets'].update(fragment['targets'])
    (home / 'domosenso.yaml').write_text(yaml.safe_dump(raw))
    target = HomeConfig.load(home).targets['staging-review']
    assert target.kind == 'local-docker'
    assert target.container == s.resource
    assert target.config == s.config
    assert target.url == 'http://127.0.0.1:38123'
    assert target.token_file == s.path / 'token'
    assert len(raw['targets']) == 1


def test_reset_wrong_confirmation_does_not_touch_data(home):
    s = HomeStaging(home, 'review', FRAMEWORK); s.ensure()
    (s.path / 'keep').write_text('keep')
    with pytest.raises(DemoError, match='confirmation'):
        s.reset('other')
    assert (s.path / 'keep').read_text() == 'keep'


@pytest.mark.parametrize('rules', [
    '.domosenso/staging/probe\n',
    '.domosenso/*\n!.domosenso/staging/\n.domosenso/staging/probe\n',
])
def test_probe_only_ignore_cannot_expose_generated_credentials(home, rules):
    (home / '.gitignore').write_text(rules)
    with pytest.raises(DemoError, match='ignored'):
        HomeStaging(home, 'review', FRAMEWORK)
    assert not (home / '.domosenso').exists()
