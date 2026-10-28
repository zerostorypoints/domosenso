"""Ownership, Docker lifecycle and generated configuration for the catalog demo."""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import time
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

import yaml
from domosenso_install import install
from domosenso_render import render_component

IMAGE = 'homeassistant/home-assistant:2026.9.2'
LABEL = 'org.domosenso.dev.identity'


class DemoError(Exception):
    """A bounded, actionable failure of a demo operation."""


def validate_name(name):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', name):
        raise DemoError('name must be 1–32 lowercase letters, digits or hyphens, starting with a letter')
    return name


def identity(root, name):
    validate_name(name)
    digest = hashlib.sha256(str(Path(root).resolve()).encode()).hexdigest()[:16]
    return f'{digest}-{name}'


def run(argv, timeout=60, check=True):
    try:
        result = subprocess.run([str(x) for x in argv], capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise DemoError(f'missing prerequisite: {argv[0]}') from exc
    except subprocess.TimeoutExpired as exc:
        raise DemoError(f'timeout after {timeout}s: {argv[0]}') from exc
    if check and result.returncode:
        raise DemoError(f'{argv[0]} failed: {result.stderr.strip() or result.stdout.strip()}')
    return result


def choose_port(port):
    if port is not None and not 1024 <= port <= 65535:
        raise DemoError('port must be between 1024 and 65535')
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', port or 0))
        except OSError as exc:
            raise DemoError(f'port {port} occupied') from exc
        return sock.getsockname()[1]


def no_symlinks(path):
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise DemoError(f'symlink refused: {part}')
    if path.exists():
        for part in path.rglob('*'):
            if part.is_symlink():
                raise DemoError(f'symlink refused: {part}')


class Demo:
    def __init__(self, root, name, state_base=None):
        self.root = Path(root).resolve()
        self.name = validate_name(name)
        self.identity = identity(self.root, name)
        self.base = Path(state_base) if state_base else self.root / '.domosenso/dev'
        self.path = self.base / self.identity
        self.marker = self.path / 'owner.json'
        self.config = self.path / 'config'
        self.resource = f'domosenso-dev-{self.identity}'
        self.owner = {'identity': self.identity, 'root': str(self.root), 'name': name, 'format': 1}

    def ensure(self, create=True):
        no_symlinks(self.path)
        if self.path.exists():
            try:
                owner = json.loads(self.marker.read_text())
            except (OSError, ValueError) as exc:
                raise DemoError('ownership marker missing or invalid') from exc
            if owner != self.owner:
                raise DemoError('ownership marker mismatch')
        elif create:
            self.path.mkdir(parents=True, mode=0o700)
            self.path.chmod(0o700)
            self.marker.write_text(json.dumps(self.owner))
            self.marker.chmod(0o600)
        else:
            raise DemoError(f'instance {self.name} does not exist')

    @contextlib.contextmanager
    def locked(self):
        # A worktree-wide lock survives reset and serializes port allocation and lifecycle.
        no_symlinks(self.base)
        self.base.mkdir(parents=True, exist_ok=True)
        lockpath = self.base / 'lifecycle.lock'
        if lockpath.is_symlink():
            raise DemoError('symlink refused: lifecycle.lock')
        with lockpath.open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise DemoError('another demo lifecycle command is running in this worktree') from exc
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def inspect(self, kind='container', resource=None):
        resource = resource or self.resource
        result = run(['docker', kind, 'inspect', resource], check=False)
        if result.returncode:
            # A daemon/permission failure must never look like an absent resource.
            if 'No such' in result.stderr or 'not found' in result.stderr:
                return None
            raise DemoError(f'Docker inspect failed: {result.stderr.strip()}')
        obj = json.loads(result.stdout)[0]
        labels = obj.get('Config', {}).get('Labels', {}) if kind == 'container' else obj.get('Labels', {})
        labels = labels or {}
        if labels.get(LABEL) != self.identity or labels.get('org.domosenso.dev.root') != str(self.root):
            raise DemoError(f'Docker {kind} ownership mismatch: {self.resource}')
        return obj

    def labels(self):
        return ['--label', f'{LABEL}={self.identity}', '--label', f'org.domosenso.dev.root={self.root}']

    def container_command(self, port):
        return ['docker', 'run', '-d', '--pull=never', '--name', self.resource, *self.labels(),
                '--network', self.resource,
                '--cap-drop=ALL', '--security-opt=no-new-privileges',
                '--user', f'{os.getuid()}:{os.getgid()}',
                '-v', f'{self.config}:/config', '--entrypoint', 'python', IMAGE,
                '-m', 'homeassistant', '-c', '/config', '--skip-pip']

    @property
    def ui_resource(self):
        return self.resource + '-ui'

    def proxy_command(self, port, target):
        return ['docker', 'run', '-d', '--pull=never', '--name', self.ui_resource, *self.labels(),
                '--network', self.ui_resource, '-p', f'127.0.0.1:{port}:8123',
                '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only',
                '--sysctl=net.ipv4.ip_forward=0', '--user', f'{os.getuid()}:{os.getgid()}',
                '-v', f'{self.path / "proxy.py"}:/proxy.py:ro', '--entrypoint', 'python', IMAGE,
                '/proxy.py', target]

    def start_proxy(self):
        obj = self.inspect(resource=self.ui_resource)
        if obj:
            if not obj['State']['Running']:
                run(['docker', 'start', self.ui_resource])
            return
        if not self.inspect('network', self.ui_resource):
            run(['docker', 'network', 'create', *self.labels(), self.ui_resource])
        shutil.copyfile(self.root / 'tools/dev_home/proxy.py', self.path / 'proxy.py')
        target = self.inspect()['NetworkSettings']['Networks'][self.resource]['IPAddress']
        run(self.proxy_command(self.metadata()['port'], target))
        run(['docker', 'network', 'connect', self.resource, self.ui_resource])

    def metadata(self):
        try:
            return json.loads((self.path / 'runtime.json').read_text())
        except (OSError, ValueError) as exc:
            raise DemoError('runtime metadata unavailable; run up first') from exc

    @property
    def url(self):
        return f"http://127.0.0.1:{self.metadata()['port']}"

    def generate(self):
        self.ensure()
        self.config.mkdir(exist_ok=True)
        fixture = self.root / 'examples/demo-home'
        for folder in ['packages', 'dashboards', 'www/ramka', 'custom_components']:
            (self.config / folder).mkdir(parents=True, exist_ok=True)
        inputs = yaml.safe_load((fixture / 'inputs/ramka.yaml').read_text())
        # All source and input data is from this worktree's fictional catalog fixture.
        render_component(self.root / 'components/ramka', inputs, self.path / 'rendered', stamp=True)
        _, resource_urls = install(self.root / 'components/ramka', self.config)
        for source in (self.path / 'rendered').glob('*.yaml'):
            target = self.config / ('dashboards' if source.name.startswith('dashboard.') else 'packages')
            target = target / (source.name if source.name.startswith('dashboard.') else 'ramka.yaml')
            shutil.copyfile(source, target)
        shutil.copytree(fixture / 'custom_components/domosenso_demo', self.config / 'custom_components/domosenso_demo', dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(fixture / 'media', self.config / 'www/ramka', dirs_exist_ok=True)
        shutil.copytree(fixture / 'media', self.config / 'www/media', dirs_exist_ok=True)
        (self.config / 'demo.json').write_text(json.dumps({
            'baseline': yaml.safe_load((fixture / 'states.yaml').read_text()),
            'scenes': {p.stem: yaml.safe_load(p.read_text()) for p in (self.root / 'scenes').glob('*.yaml')},
        }))
        resources = [{'url': url, 'type': 'module'} for url in resource_urls]
        config = '''homeassistant:
  name: Domosenso fictional demo
  latitude: 0
  longitude: 0
  elevation: 0
  time_zone: UTC
  unit_system: metric
  packages: !include_dir_named packages
  allowlist_external_dirs: [/config/www]
frontend:
  themes: !include_dir_merge_named themes
http:
api:
config:
history:
recorder:
  purge_keep_days: 2
logbook:
system_log:
my:
onboarding:
domosenso_demo:
light:
  - platform: domosenso_demo
media_player:
  - platform: domosenso_demo
weather:
  - platform: domosenso_demo
calendar:
  - platform: domosenso_demo
lovelace:
  mode: yaml
  resources:
'''
        config += ''.join(f"    - url: {r['url']}\n      type: module\n" for r in resources)
        config += '  dashboards:\n'
        for lang in ['en', 'de', 'pl']:
            config += f'    dashboard-ramka-{lang}:\n      mode: yaml\n      title: Ramka {lang}\n      filename: dashboards/dashboard.{lang}.yaml\n'
        (self.config / 'configuration.yaml').write_text(config)

    def api(self, path, data=None, authenticated=True, method=None):
        headers = {'Content-Type': 'application/json'}
        if authenticated:
            tokens = json.loads((self.path / 'auth.json').read_text())
            if tokens.get('expires', float('inf')) <= time.time() * 1000 + 30000:
                from urllib.parse import urlencode
                request = Request(self.url + '/auth/token', data=urlencode({
                    'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token'],
                    'client_id': tokens['clientId'],
                }).encode())
                try:
                    with urlopen(request, timeout=5) as response:
                        tokens.update(json.load(response))
                except (URLError, OSError, ValueError) as exc:
                    raise DemoError(f'local authentication refresh failed: {exc}') from exc
                tokens['expires'] = int(time.time() * 1000) + tokens['expires_in'] * 1000
                auth = self.path / 'auth.json'
                auth.write_text(json.dumps(tokens)); auth.chmod(0o600)
            headers['Authorization'] = f"Bearer {tokens['access_token']}"
        req = Request(self.url + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
        try:
            with urlopen(req, timeout=5) as response:
                return json.load(response)
        except (URLError, OSError, ValueError) as exc:
            raise DemoError(f'HA request failed: {path}: {exc}') from exc

    def ready(self, timeout=150):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if (self.path / 'auth.json').exists():
                    self.api('/api/')
                else:
                    self.api('/api/onboarding', authenticated=False)
                return
            except DemoError:
                time.sleep(1)
        raise DemoError(f'HA readiness timeout after {timeout}s; inspect {self.path}/ha.log')

    def bootstrap(self):
        if (self.path / 'auth.json').exists():
            self.finish_onboarding()
            return
        login_path = self.path / 'login.json'
        if not login_path.exists():
            login_path.write_text(json.dumps({'username': 'demo', 'password': secrets.token_urlsafe(24)}))
            login_path.chmod(0o600)
        credentials = json.loads(login_path.read_text())
        steps = self.api('/api/onboarding', authenticated=False)
        if not next(step['done'] for step in steps if step['step'] == 'user'):
            result = self.api('/api/onboarding/users', {
                'client_id': self.url + '/', 'name': 'Demo', **credentials, 'language': 'en',
            }, authenticated=False)
        else:
            flow = self.api('/auth/login_flow', {'client_id': self.url + '/', 'handler': ['homeassistant', None],
                             'redirect_uri': self.url + '/?auth_callback=1'}, authenticated=False)
            login = self.api('/auth/login_flow/' + flow['flow_id'], {'client_id': self.url + '/', **credentials}, authenticated=False)
            if login.get('type') != 'create_entry':
                raise DemoError('cannot resume local demo authentication; reset this generated instance')
            result = {'auth_code': login['result']}
        from urllib.parse import urlencode
        req = Request(self.url + '/auth/token', data=urlencode({
            'grant_type': 'authorization_code', 'code': result['auth_code'], 'client_id': self.url + '/',
        }).encode())
        with urlopen(req, timeout=10) as response:
            tokens = json.load(response)
        tokens['hassUrl'] = self.url
        tokens['clientId'] = self.url + '/'
        tokens['expires'] = int(time.time() * 1000) + tokens['expires_in'] * 1000
        auth = self.path / 'auth.json'
        auth.write_text(json.dumps(tokens)); auth.chmod(0o600)
        self.finish_onboarding()

    def finish_onboarding(self):
        try:
            pending = self.api('/api/onboarding', authenticated=False)
        except DemoError as exc:
            if isinstance(exc.__cause__, HTTPError) and exc.__cause__.code == 404:
                return  # HA removes this route after onboarding is complete.
            raise
        for step in pending:
            if not step['done'] and step['step'] != 'user':
                data = {'client_id': self.url + '/', 'redirect_uri': self.url + '/?auth_callback=1'} if step['step'] == 'integration' else {}
                self.api('/api/onboarding/' + step['step'], data)

    def up(self, port=None):
        self.ensure()
        run(['docker', 'info'], timeout=15)
        run(['docker', 'image', 'inspect', IMAGE], timeout=15)
        current = self.inspect()
        if current:
            self.audit(current, proxy=False)
            if port is not None and self.metadata()['port'] != port:
                raise DemoError('port differs from existing instance; reset before changing it')
            if not current['State']['Running']:
                self.generate()
                metadata = self.metadata()
                metadata.update(sha=run(['git', '-C', self.root, 'rev-parse', 'HEAD']).stdout.strip(),
                                dirty=bool(run(['git', '-C', self.root, 'status', '--porcelain']).stdout.strip()))
                (self.path / 'runtime.json').write_text(json.dumps(metadata))
                run(['docker', 'start', self.resource])
        else:
            chosen = choose_port(port if port is not None else ((self.metadata()['port']) if (self.path / 'runtime.json').exists() else None))
            self.generate()
            network = self.inspect('network')
            if not network:
                run(['docker', 'network', 'create', '--internal', *self.labels(), self.resource])
            elif not network['Internal']:
                raise DemoError('demo network is not internal')
            source = run(['git', '-C', self.root, 'rev-parse', 'HEAD']).stdout.strip()
            dirty = bool(run(['git', '-C', self.root, 'status', '--porcelain']).stdout.strip())
            (self.path / 'runtime.json').write_text(json.dumps({'port': chosen, 'image': IMAGE, 'sha': source, 'dirty': dirty}))
            run(self.container_command(chosen))
        self.start_proxy()
        self.audit(self.inspect())
        self.ready(); self.bootstrap()
        self.audit(self.inspect())
        return self.status()

    def audit(self, obj, proxy=True):
        self.ensure(False)
        if not obj:
            raise DemoError('container missing')
        network = self.inspect('network')
        if not network or not network['Internal']:
            raise DemoError('network isolation failed')
        if set(obj['NetworkSettings']['Networks']) != {self.resource}:
            raise DemoError('container has unexpected network attachments')
        hc = obj['HostConfig']
        if obj['Config']['Image'] != IMAGE or 'ALL' not in (hc.get('CapDrop') or []) or not any('no-new-privileges' in opt for opt in hc.get('SecurityOpt') or []):
            raise DemoError('HA image or capability isolation mismatch')
        if hc.get('Privileged') or hc.get('Devices') or hc.get('NetworkMode') != self.resource:
            raise DemoError('container isolation mismatch')
        if hc.get('PortBindings'):
            raise DemoError('HA itself must not publish ports')
        mounts = obj['Mounts']
        if len(mounts) != 1 or Path(mounts[0]['Source']).resolve() != self.config.resolve() or mounts[0]['Destination'] != '/config':
            raise DemoError('container mount ownership mismatch')
        if proxy:
            relay = self.inspect(resource=self.ui_resource)
            if not relay or set(relay['NetworkSettings']['Networks']) != {self.resource, self.ui_resource}:
                raise DemoError('UI relay network isolation mismatch')
            self.inspect('network', self.ui_resource)
            rhc = relay['HostConfig']
            if relay['Config']['Image'] != IMAGE or 'ALL' not in (rhc.get('CapDrop') or []) or not any('no-new-privileges' in opt for opt in rhc.get('SecurityOpt') or []):
                raise DemoError('UI relay image or capability isolation mismatch')
            bindings = rhc.get('PortBindings', {}).get('8123/tcp', [])
            if len(bindings) != 1 or bindings[0]['HostIp'] != '127.0.0.1':
                raise DemoError('UI must bind only to loopback')
            if not rhc['ReadonlyRootfs'] or rhc.get('Privileged') or rhc.get('Sysctls', {}).get('net.ipv4.ip_forward') != '0':
                raise DemoError('UI relay hardening mismatch')
            if len(relay['Mounts']) != 1 or relay['Mounts'][0]['Destination'] != '/proxy.py' or relay['Mounts'][0]['RW'] or Path(relay['Mounts'][0]['Source']).resolve() != (self.path / 'proxy.py').resolve():
                raise DemoError('UI relay mount mismatch')
            if relay['Config']['Cmd'] != ['/proxy.py', obj['NetworkSettings']['Networks'][self.resource]['IPAddress']]:
                raise DemoError('UI relay target mismatch')


    def status(self):
        self.ensure(False)
        obj = self.inspect()
        return {'name': self.name, 'identity': self.identity, 'running': bool(obj and obj['State']['Running']),
                'url': self.url, 'ha_version': IMAGE.rsplit(':', 1)[1], **self.metadata(), 'path': str(self.path),
                'login_file': str(self.path / 'login.json') if (self.path / 'login.json').exists() else None}

    def scenario(self, scene):
        if not re.fullmatch('[a-z0-9-]+', scene) or not (self.root / 'scenes' / (scene + '.yaml')).is_file():
            raise DemoError(f'unknown scene: {scene}')
        self.audit(self.inspect())
        self.api('/api/services/domosenso_demo/scenario', {'scene': scene})
        return {'scenario': scene, 'scope': 'synthetic upstream states and Ramka mode/page'}

    def down(self):
        self.ensure(False)
        obj = self.inspect()
        relay = self.inspect(resource=self.ui_resource)
        if obj:
            self.audit(obj, proxy=False)
        if relay and relay['State']['Running']:
            run(['docker', 'stop', '--time', '5', self.ui_resource], timeout=15)
        if obj:
            if obj['State']['Running']:
                run(['docker', 'stop', '--time', '20', self.resource], timeout=30)
            log = run(['docker', 'logs', self.resource], check=False)
            (self.path / 'ha.log').write_text(log.stdout + log.stderr)
        return {'name': self.name, 'running': False, 'preserved': str(self.path)}

    def reset(self, confirmation):
        if confirmation != self.name:
            raise DemoError('reset confirmation must match instance name')
        self.ensure(False)
        self.down()
        if self.inspect():
            run(['docker', 'rm', self.resource])
        if self.inspect(resource=self.ui_resource):
            run(['docker', 'rm', self.ui_resource])
        for name in [self.resource, self.ui_resource]:
            network = self.inspect('network', name)
            if network:
                if network.get('Containers'):
                    raise DemoError('network contains another container; cleanup refused')
                run(['docker', 'network', 'rm', name])
        self.ensure(False)
        shutil.rmtree(self.path)
        return {'name': self.name, 'reset': True}
