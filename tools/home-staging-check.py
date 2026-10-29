#!/usr/bin/env python3
"""Reproduce shared staging on two fresh fictional home worktrees; never use an existing home."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import shutil
import sys
import tempfile
import time

import yaml

from dev_home.checks import network_check, require
from dev_home.runtime import run
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.main import main as cli
from home_staging import HomeStaging
from home_workflow import install_workflow

FRAMEWORK = Path(__file__).resolve().parents[1]


def git(root, *args):
    return run(['git', '-C', root, *args]).stdout.strip()


def make_home(base, name):
    primary = base / name; primary.mkdir()
    git(primary, 'init', '-b', 'main')
    git(primary, 'config', 'user.name', 'Example')
    git(primary, 'config', 'user.email', 'example@example.test')
    (primary / '.gitignore').write_text('.domosenso/\n')
    (primary / 'domosenso.yaml').write_text(yaml.safe_dump({
        'catalog': str(FRAMEWORK), 'config_dir': 'home-assistant', 'esphome_dir': 'esphome',
        'targets': {}, 'components': {},
    }))
    Lock().save(primary)
    git(primary, 'add', '.'); git(primary, 'commit', '-m', 'Fictional home')
    home = base / (name + '-work')
    git(primary, 'worktree', 'add', '-b', 'codex/staging-check', str(home))
    return home


async def authenticate(home, target):
    async with HA.for_target(HomeConfig.load(home).targets[target]) as ha:
        config = await ha.call('get_config')
        require(config['version'] == '2026.9.2', 'unexpected HA version')


def wait_value(stage, value):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            if stage.api('/api/states/sensor.staging_probe')['state'] == value:
                return
        except Exception:
            pass
        time.sleep(.5)
    raise RuntimeError(f'local deployment sensor did not reach {value}')


def deploy_fixture(stage, value):
    config = stage.root / 'home-assistant'; config.mkdir(exist_ok=True)
    # A home-owned local customization, with no hardware/cloud integration or private input.
    (config / 'configuration.yaml').write_text('''homeassistant:
  name: Fictional acceptance home
http:
frontend:
api:
websocket_api:
auth:
onboarding:
config:
recorder:
logbook:
history:
lovelace:
  mode: storage
template:
  - sensor:
      - name: Staging probe
        state: "''' + value + '''"
''')
    target = 'staging-review'
    for mode in ['--plan', '--apply']:
        require(cli(['--home', str(stage.root), 'deploy', target, mode]) == 0,
                'local fixture deploy failed')
    stage.ready()
    wait_value(stage, value)


def main():
    base = Path(tempfile.mkdtemp(prefix='domosenso-home-staging-')).resolve()
    stages = []
    ok = True
    try:
        for name in ['first', 'second']:
            home = make_home(base, name)
            install_workflow(home, FRAMEWORK)
            require(not install_workflow(home, FRAMEWORK)['changed'], 'installer not idempotent')
            stage = HomeStaging(home, 'review', FRAMEWORK); stages.append(stage)
            with stage.locked():
                stage.up()
            declaration = yaml.safe_load((home / 'domosenso.yaml').read_text())
            declaration['targets'].update(stage.target()['targets'])
            (home / 'domosenso.yaml').write_text(yaml.safe_dump(declaration))
            asyncio.run(authenticate(home, 'staging-review'))
            require((stage.path / 'token').stat().st_mode & 0o077 == 0, 'token permissions')
            print(f'ok   fresh {name} home: install, bootstrap and target authentication', flush=True)
        first, second = stages
        require(first.resource != second.resource and first.url != second.url, 'runtime collision')
        require(first.status()['running'] and second.status()['running'], 'concurrent runtimes unavailable')
        network_check(first)
        print('ok   concurrent homes and controlled egress rejection', flush=True)
        deploy_fixture(first, 'baseline')
        deploy_fixture(first, 'candidate')
        token = (first.path / 'token').read_bytes()
        with first.locked():
            first.down(); first.up()
        wait_value(first, 'candidate')
        require((first.path / 'token').read_bytes() == token, 'token changed on resume')
        asyncio.run(authenticate(first.root, 'staging-review'))
        print('ok   real CLI baseline/candidate deploy and resume persistence', flush=True)
        with first.locked():
            first.reset('review')
        require(second.status()['running'], 'cleanup affected the other home')
        second.api('/api/')
        print('ok   independent cleanup; infrastructure acceptance only, not a component simulation', flush=True)
    except Exception as exc:
        print(f'FAIL home staging: {exc}', file=sys.stderr)
        ok = False
    finally:
        clean = True
        for stage in stages:
            if stage.path.exists():
                try:
                    with stage.locked():
                        stage.reset('review')
                except Exception as exc:
                    clean = False
                    print(f'FAIL cleanup: {exc}; preserved {base}', file=sys.stderr)
        if clean:
            shutil.rmtree(base)
        ok = ok and clean
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
