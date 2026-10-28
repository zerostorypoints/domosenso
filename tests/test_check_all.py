"""Run the real check dispatcher with fake external commands, without recursive pytest."""
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def checks(tmp_path):
    tools = tmp_path / 'tools'
    tools.mkdir()
    shutil.copyfile(ROOT / 'tools/check-all.sh', tools / 'check-all.sh')
    (tools / 'catalog_check.py').touch()
    component = tmp_path / 'components/radio'
    (component / 'templates').mkdir(parents=True)
    (component / 'esphome').mkdir()
    (component / 'component.yaml').write_text('id: radio\n')
    commands = tmp_path / 'bin'
    commands.mkdir()
    trace = tmp_path / 'calls'
    for name in ('uv', 'npm'):
        script = commands / name
        script.write_text('#!/bin/sh\necho "$*" >> "$CHECK_TRACE"\n'
                          'case "$*" in *"$CHECK_FAIL"*) [ -z "$CHECK_FAIL" ] || exit 1;; esac\nexit 0\n')
        script.chmod(0o755)
    for name in ('ha-check.sh', 'esphome-check.sh'):
        script = tools / name
        script.write_text(f'#!/bin/sh\necho "{name} $*" >> "$CHECK_TRACE"\n')
        script.chmod(0o755)
    env = {**os.environ, 'PATH': f'{commands}:{os.environ["PATH"]}', 'CHECK_TRACE': str(trace), 'CHECK_FAIL': ''}
    def run(*args, fail=''):
        result = subprocess.run(['bash', 'tools/check-all.sh', *args], cwd=tmp_path,
                                env={**env, 'CHECK_FAIL': fail}, capture_output=True, text=True)
        calls = trace.read_text() if trace.exists() else ''
        return result, calls
    return run


def test_local_runs_fast_checks_and_explicitly_reports_partial(checks):
    result, calls = checks('--local')
    assert result.returncode == 0
    assert 'pytest -q' in calls and 'catalog_check.py --strict' in calls
    assert 'ha-check.sh' not in calls and 'esphome-check.sh' not in calls
    assert result.stdout.rstrip().endswith('partial checks passed (HA/ESPHome not run)')
    assert 'all checks passed' not in result.stdout


def test_default_keeps_complete_gate(checks):
    result, calls = checks()
    assert result.returncode == 0
    assert 'ha-check.sh radio' in calls and 'esphome-check.sh radio' in calls
    assert result.stdout.rstrip().endswith('all checks passed')


def test_local_failure_never_reports_pass(checks):
    result, _ = checks('--local', fail='pytest')
    assert result.returncode == 1
    assert 'failed: pytest' in result.stdout
    assert 'checks passed' not in result.stdout


def test_unknown_flag_is_not_silently_ignored(checks):
    result, calls = checks('--skip-everything')
    assert result.returncode == 2
    assert calls == ''
