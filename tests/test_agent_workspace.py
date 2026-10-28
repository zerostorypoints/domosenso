"""Real Git repos and hook JSON: guard enforcement, bootstrap and CLI launch boundary."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / 'tools/agent_workspace.py'
LAUNCHER = ROOT / 'tools/agent-session.py'


def git(cwd, *args):
    return subprocess.run(['git', '-C', str(cwd), *args], check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / 'primary'
    root.mkdir()
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.email', 'test@example.invalid')
    git(root, 'config', 'user.name', 'Test')
    shutil.copytree(ROOT / 'tools', root / 'tools', ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copytree(ROOT / '.githooks', root / '.githooks')
    shutil.copytree(ROOT / '.codex', root / '.codex')
    (root / '.claude').mkdir()
    shutil.copyfile(ROOT / '.claude/settings.json', root / '.claude/settings.json')
    shutil.copyfile(ROOT / 'AGENTS.md', root / 'AGENTS.md')
    (root / '.gitignore').write_text('.worktrees/\n')
    git(root, 'add', '.')
    git(root, 'commit', '-m', 'fixture')
    work = tmp_path / 'session'
    git(root, 'worktree', 'add', '-b', 'codex/test', str(work))
    return root, work


def check(path):
    return subprocess.run([sys.executable, str(GUARD), 'check'], cwd=path, capture_output=True, text=True)


def hook(path, event='PreToolUse', name='Bash', arguments=None):
    payload = {'cwd': str(path), 'session_id': 'test-session', 'hook_event_name': event,
               'tool_name': name, 'tool_input': arguments or {'command': 'true'}}
    result = subprocess.run([sys.executable, str(GUARD), 'hook'], cwd=path,
                            input=json.dumps(payload), capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_check_rejects_primary_and_detached_and_main_but_accepts_named_worktree(repo):
    root, work = repo
    assert check(root).returncode == 1
    assert check(work).returncode == 0
    git(work, 'checkout', '--detach')
    assert check(work).returncode == 1
    git(root, 'checkout', '-b', 'parking')
    git(work, 'checkout', 'main')
    assert check(work).returncode == 1


def test_hook_denies_normal_tools_in_primary(repo):
    root, _ = repo
    output = hook(root)
    assert output['hookSpecificOutput']['permissionDecision'] == 'deny'
    assert 'worktree' in output['hookSpecificOutput']['permissionDecisionReason']


def test_hook_accepts_worktree_but_denies_explicit_escape(repo):
    root, work = repo
    assert 'permissionDecision' not in hook(work).get('hookSpecificOutput', {})
    assert hook(work, arguments={'command': 'true', 'workdir': str(root)})['hookSpecificOutput']['permissionDecision'] == 'deny'
    assert hook(work, name='Write', arguments={'file_path': str(root / 'bad')})['hookSpecificOutput']['permissionDecision'] == 'deny'


def test_detached_bootstrap_only_accepts_plain_branch_creation(repo):
    _, work = repo
    git(work, 'checkout', '--detach')
    assert 'permissionDecision' not in hook(work, arguments={'command': 'git switch -c codex/review'}).get('hookSpecificOutput', {})
    for cmd in ['git switch -c main', 'git switch -c codex/review; touch bad', 'git switch -C codex/review', 'git switch -c codex/review && true']:
        assert hook(work, arguments={'command': cmd})['hookSpecificOutput']['permissionDecision'] == 'deny'


def test_start_context_reports_real_workspace_and_manual_approval(repo):
    _, work = repo
    context = hook(work, event='SessionStart')['hookSpecificOutput']['additionalContext']
    assert 'codex/test' in context and str(work) in context and 'human' in context


def test_launcher_creates_branch_and_starts_cli_in_worktree(repo, tmp_path):
    root, _ = repo
    binary = tmp_path / 'bin'
    binary.mkdir()
    fake = binary / 'codex'
    fake.write_text('#!/bin/sh\npwd\ngit branch --show-current\nprintf "%s\\n" "$@"\n')
    fake.chmod(0o755)
    result = subprocess.run([sys.executable, str(LAUNCHER), 'codex', '53-weather-reconnect', '--base', 'main', '--', 'Implement issue 53'], cwd=root,
                            env={**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH']}, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert 'codex/53-weather-reconnect' in result.stdout and 'Implement issue 53' in result.stdout
    work = root / '.worktrees/codex-53-weather-reconnect'
    assert check(work).returncode == 0
    assert git(root, 'config', 'core.hooksPath') == '.githooks'
    again = subprocess.run([sys.executable, str(LAUNCHER), 'codex', '53-weather-reconnect', '--base', 'main', '--prepare-only'], cwd=root, capture_output=True, text=True)
    assert again.returncode != 0 and 'exists' in again.stderr


def test_launcher_refuses_unignored_directory_and_existing_custom_hooks(repo):
    root, _ = repo
    (root / '.gitignore').write_text('')
    args = [sys.executable, str(LAUNCHER), 'claude', 'task', '--base', 'main', '--prepare-only']
    result = subprocess.run(args, cwd=root, capture_output=True, text=True)
    assert result.returncode != 0 and 'ignored' in result.stderr
    (root / '.gitignore').write_text('.worktrees/\n')
    git(root, 'config', 'core.hooksPath', 'custom-hooks')
    result = subprocess.run(args, cwd=root, capture_output=True, text=True)
    assert result.returncode != 0 and 'custom-hooks' in result.stderr


def test_git_precommit_rejects_primary_checkout(repo):
    root, work = repo
    git(root, 'config', 'core.hooksPath', '.githooks')
    (root / 'attempt').write_text('no')
    git(root, 'add', 'attempt')
    result = subprocess.run(['git', 'commit', '-m', 'forbidden'], cwd=root, capture_output=True, text=True)
    assert result.returncode != 0 and 'worktree' in result.stderr
    (work / 'allowed').write_text('yes')
    git(work, 'add', 'allowed')
    git(work, 'commit', '-m', 'allowed')


def test_pre_push_rejects_primary(repo):
    root, _ = repo
    result = subprocess.run([str(root / '.githooks/pre-push')], cwd=root, input='', text=True, capture_output=True)
    assert result.returncode != 0 and 'worktree' in result.stderr


@pytest.mark.parametrize('arg', ['--cd=/tmp', '-C', '--worktree', '-wOTHER', '--resume=old', '-rOLD', '--from-pr=68', '--teleport=old', 'attach', '--remote=ws://example.invalid', '--bare', '--safe-mode'])
def test_launcher_refuses_workspace_or_hook_bypass_flags(repo, arg):
    root, _ = repo
    result = subprocess.run([sys.executable, str(LAUNCHER), 'codex', 'bad-args', '--base', 'main', '--prepare-only', '--', arg], cwd=root, capture_output=True, text=True)
    assert result.returncode != 0 and 'startup override' in result.stderr
    assert not (root / '.worktrees/codex-bad-args').exists()


def test_missing_guard_in_base_fails_before_creating_worktree(repo):
    root, _ = repo
    git(root, 'rm', '.codex/hooks.json')
    git(root, 'commit', '-m', 'old base')
    result = subprocess.run([sys.executable, str(LAUNCHER), 'claude', 'old-base', '--base', 'main', '--prepare-only'], cwd=root, capture_output=True, text=True)
    assert result.returncode != 0 and 'predates' in result.stderr
    assert not (root / '.worktrees/claude-old-base').exists()
