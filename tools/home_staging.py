"""Isolated, private local HA staging for any Domosenso home worktree.

The lifecycle is shared with the fictional demo; generated home content is not.
No home configuration or production authentication is imported during bootstrap.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from agent_workspace import WorkspaceError, workspace
from dev_home.runtime import Demo, DemoError, no_symlinks, run
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig


class HomeStaging(Demo):
    def __init__(self, home, name, framework):
        home, framework = Path(home).resolve(), Path(framework).resolve()
        if home == framework or home.is_relative_to(framework):
            raise DemoError('private home must be outside the catalog checkout')
        try:
            root, _ = workspace(home)
        except WorkspaceError as exc:
            raise DemoError(str(exc)) from exc
        if root != home:
            raise DemoError('--home must name the linked worktree root')
        HomeConfig.load(home)  # Validate the declaration without reading tokens or HA data.
        no_symlinks(home / '.domosenso/staging')
        # Ignoring the parent directory excludes all descendants; a probe could be the only
        # ignored file and leave tokens visible to Git. Child negations cannot reopen it.
        ignored = run(['git', '-C', home, 'check-ignore', '-v', '.domosenso/'], check=False)
        parent_rule = ignored.stdout.split('\t', 1)[0].rsplit(':', 1)[-1]
        tracked = run(['git', '-C', home, 'ls-files', '--', '.domosenso']).stdout
        if ignored.returncode or parent_rule not in {'.domosenso/', '/.domosenso/'} or tracked:
            raise DemoError('private .domosenso/ runtime must be ignored and untracked; add .domosenso/ to .gitignore')
        super().__init__(home, name, state_base=home / '.domosenso/staging')
        self.framework = framework
        self.resource = f'domosenso-staging-{self.identity}'
        self.owner['kind'] = 'home-staging'

    @property
    def proxy_source(self):
        return self.framework / 'tools/dev_home/proxy.py'

    def generate(self):
        self.ensure()
        self.config.mkdir(exist_ok=True)
        config = self.config / 'configuration.yaml'
        if not config.exists():
            config.write_text('''homeassistant:
  name: Local home staging
  latitude: 0
  longitude: 0
  elevation: 0
  unit_system: metric
  time_zone: UTC
http:
frontend:
api:
websocket_api:
auth:
onboarding:
config:
history:
recorder:
logbook:
lovelace:
  mode: storage
''')

    async def create_token(self):
        # A long-lived token is needed by the existing deploy CLI across HA restarts.
        self.api('/api/')  # Refresh the local access token if necessary.
        auth = json.loads((self.path / 'auth.json').read_text())
        async with HA(self.url, auth['access_token']) as ha:
            token = await ha.call('auth/long_lived_access_token',
                                  client_name=f'Domosenso staging {self.identity}', lifespan=365)
        if not isinstance(token, str) or not token:
            raise DemoError('local HA did not return a staging token')
        path = self.path / 'token'
        path.write_text(token + '\n'); path.chmod(0o600)

    def up(self, port=None):
        super().up(port)
        if not (self.path / 'token').exists():
            asyncio.run(self.create_token())
        fragment = self.path / 'target.yaml'
        import yaml
        fragment.write_text(yaml.safe_dump(self.target(), sort_keys=False))
        fragment.chmod(0o600)
        return self.status()

    def target(self):
        self.ensure(False)
        return {'targets': {f'staging-{self.name}': {
            'kind': 'local-docker', 'container': self.resource,
            'config': self.config.relative_to(self.root).as_posix(),
            'url': self.url, 'token_file': (self.path / 'token').relative_to(self.root).as_posix(),
        }}}

    def status(self):
        result = super().status()
        obj = self.inspect()
        if obj and obj['State']['Running']:
            self.audit(obj)
        result['bootstrap_home_sha'] = result.pop('sha', None)
        result['bootstrap_home_dirty'] = result.pop('dirty', None)
        result.update(scope='isolated home staging; component deployment and acceptance are separate',
                      target_name=f'staging-{self.name}', target_file=str(self.path / 'target.yaml'),
                      token_file=str(self.path / 'token'))
        return result
