"""The generated demo must never adopt another home or Docker resource."""
import json
import socket
from pathlib import Path

import pytest

from dev_home import Demo, DemoError, identity, validate_name, choose_port, run


@pytest.mark.parametrize('name', ['', '../home', '-x', 'UPPER', 'a/b', 'a' * 33])
def test_invalid_names(name):
    with pytest.raises(DemoError, match='name'):
        validate_name(name)


def test_identity_separates_worktrees(tmp_path):
    a, b = tmp_path / 'a', tmp_path / 'b'
    a.mkdir(); b.mkdir()
    assert identity(a, 'test') != identity(b, 'test')
    assert identity(a, 'test') == identity(a / '.', 'test')


def test_refuses_existing_unowned_directory(tmp_path):
    d = Demo(tmp_path, 'test')
    d.path.mkdir(parents=True)
    with pytest.raises(DemoError, match='ownership'):
        d.ensure()


def test_marker_is_private_and_rechecked(tmp_path):
    d = Demo(tmp_path, 'test'); d.ensure()
    assert d.marker.stat().st_mode & 0o077 == 0
    value = json.loads(d.marker.read_text()); value['root'] = '/somewhere/else'
    d.marker.write_text(json.dumps(value))
    with pytest.raises(DemoError, match='ownership'):
        d.ensure()


@pytest.mark.parametrize('part', ['.domosenso', '.domosenso/dev'])
def test_rejects_symlink_ancestors(tmp_path, part):
    elsewhere = tmp_path / 'elsewhere'; elsewhere.mkdir()
    link = tmp_path / part; link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(elsewhere, target_is_directory=True)
    with pytest.raises(DemoError, match='symlink'):
        Demo(tmp_path, 'test').ensure()


def test_rejects_nested_symlinks_before_cleanup(tmp_path):
    d = Demo(tmp_path, 'test'); d.ensure()
    (d.path / 'escape').symlink_to(tmp_path)
    with pytest.raises(DemoError, match='symlink'):
        d.reset('test')


def test_reset_confirmation_precedes_docker(tmp_path):
    d = Demo(tmp_path, 'test'); d.ensure()
    with pytest.raises(DemoError, match='confirmation'):
        d.reset('other')
    assert d.path.exists()


def test_explicit_occupied_port():
    with socket.socket() as occupied:
        occupied.bind(('127.0.0.1', 0)); occupied.listen()
        with pytest.raises(DemoError, match='occupied'):
            choose_port(occupied.getsockname()[1])


def test_default_port_available():
    assert 1024 <= choose_port(None) <= 65535


def test_missing_executable_reports_failure():
    with pytest.raises(DemoError, match='prerequisite'):
        run(['domosenso-command-that-does-not-exist'])


def test_command_timeout_is_bounded():
    import sys
    with pytest.raises(DemoError, match='timeout'):
        run([sys.executable, '-c', 'import time; time.sleep(5)'], timeout=.05)


def test_render_uses_real_components_and_only_demo_inputs(tmp_path):
    root = Path(__file__).resolve().parents[1]
    d = Demo(root, 'unit-render', state_base=tmp_path)
    d.ensure(); d.generate()
    config = (d.config / 'configuration.yaml').read_text()
    assert 'default_config' not in config
    assert 'domosenso_demo:' in config
    assert 'dashboard-ramka-pl:' in config
    assert (d.config / 'packages/ramka.yaml').read_text().startswith('# Rendered by Domosenso')
    assert (d.config / 'custom_components/domosenso_demo/weather.py').exists()
    assert not (d.config / '.storage').exists()
    assert 'shell_command:' in (d.config / 'packages/ramka.yaml').read_text()
    # The settings dashboard (SPEC-021) is a dashboard, not a second package over packages/ramka.yaml.
    assert sorted(p.name for p in (d.config / 'packages').glob('*.yaml')) == ['ramka.yaml']
    assert (d.config / 'dashboards/ramka-settings.pl.yaml').read_text().startswith('# Rendered by Domosenso')
    assert 'filename: dashboards/ramka-settings.pl.yaml' in config


def test_docker_plan_has_isolation(tmp_path):
    d = Demo(tmp_path, 'test'); d.ensure()
    argv = d.container_command(12345)
    assert '-p' not in argv
    proxy = d.proxy_command(12345, '172.30.0.2')
    assert '127.0.0.1:12345:8123' in proxy
    assert '--read-only' in proxy
    assert '--sysctl=net.ipv4.ip_forward=0' in proxy
    assert '--cap-drop=ALL' in argv
    assert '--security-opt=no-new-privileges' in argv
    assert '--pull=never' in argv
    assert '--network' in argv and d.resource in argv
    assert sum(x == '-v' for x in argv) == 1
    assert not any('host' == x or 'privileged' in x or 'device=' in x for x in argv)


@pytest.mark.parametrize('kind', ['container', 'network'])
@pytest.mark.parametrize('labels', [{}, None])
def test_foreign_docker_resource_is_never_adopted(tmp_path, monkeypatch, kind, labels):
    from types import SimpleNamespace
    import dev_home.runtime as runtime
    d = Demo(tmp_path, 'test'); d.ensure()
    obj = {'Config': {'Labels': labels}} if kind == 'container' else {'Labels': labels}
    monkeypatch.setattr(runtime, 'run', lambda *a, **kw: SimpleNamespace(returncode=0, stdout=json.dumps([obj]), stderr=''))
    with pytest.raises(DemoError, match='ownership'):
        d.inspect(kind)


def test_daemon_failure_does_not_mean_resource_absent(tmp_path, monkeypatch):
    from types import SimpleNamespace
    import dev_home.runtime as runtime
    d = Demo(tmp_path, 'test')
    monkeypatch.setattr(runtime, 'run', lambda *a, **kw: SimpleNamespace(returncode=1, stdout='', stderr='Cannot connect to Docker daemon'))
    with pytest.raises(DemoError, match='inspect failed'):
        d.inspect()


def test_check_failure_is_saved_and_not_reported_as_pass(tmp_path):
    from dev_home.checks import Results
    result = Results(tmp_path)
    result.case('broken prerequisite', lambda: (_ for _ in ()).throw(DemoError('missing browser')))
    with pytest.raises(DemoError, match='broken prerequisite'):
        result.finish()
    report = json.loads((tmp_path / 'check.json').read_text())
    assert report['cases'][0]['status'] == 'fail'
    assert 'missing browser' in report['cases'][0]['detail']


def test_check_never_cleans_an_existing_acceptance_peer(tmp_path, monkeypatch):
    import hashlib
    from types import SimpleNamespace
    import dev_home.checks as checks
    d = Demo(tmp_path, 'test'); d.ensure()
    peer = Demo(tmp_path, 'check-' + hashlib.sha256(b'test').hexdigest()[:12]); peer.ensure()
    sentinel = peer.path / 'keep'; sentinel.write_text('existing work')
    monkeypatch.setattr(checks, 'run', lambda *a, **kw: SimpleNamespace(returncode=1, stdout='', stderr='browser unavailable'))
    monkeypatch.setattr(Demo, 'inspect', lambda *a, **kw: {})
    monkeypatch.setattr(Demo, 'audit', lambda *a, **kw: None)
    monkeypatch.setattr(Demo, 'ready', lambda *a, **kw: None)
    monkeypatch.setattr(checks, 'config_check', lambda *a: 'not needed')
    monkeypatch.setattr(checks, 'network_check', lambda *a: 'not needed')
    monkeypatch.setattr(checks, 'services', lambda *a: 'not needed')
    with pytest.raises(DemoError, match='demo checks failed'):
        checks.check(d)
    assert sentinel.read_text() == 'existing work'


def test_runtime_only_report_never_claims_browser_pass(tmp_path):
    from dev_home.checks import Results
    result = Results(tmp_path, runtime_only=True)
    result.case('runtime', lambda: 'checked')
    report = result.finish()
    assert report['scope'] == 'runtime-only (browser not run)'
    assert not any('browser' in item['case'] for item in report['cases'])


def test_ci_evidence_excludes_auth_and_generated_configuration(tmp_path):
    from dev_home.ci import collect_evidence
    d = Demo(tmp_path, 'test'); d.ensure()
    (d.path / 'auth.json').write_text('secret token')
    d.config.mkdir(); (d.config / 'configuration.yaml').write_text('private configuration')
    (d.path / 'browser.json').write_text('{"cases": []}')
    (d.path / 'screenshots').mkdir()
    (d.path / 'screenshots/tablet.png').write_bytes(b'png')
    evidence = collect_evidence(d)
    assert set(evidence) == {'browser.json', 'screenshots/tablet.png'}
    assert all(b'secret token' not in content for content in evidence.values())


def test_expired_local_token_is_refreshed_before_request(tmp_path):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import threading
    import time

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            assert self.path == '/auth/token'
            body = self.rfile.read(int(self.headers['Content-Length']))
            assert b'grant_type=refresh_token' in body
            assert b'refresh_token=fictional-refresh' in body
            self.send_response(200); self.end_headers()
            self.wfile.write(b'{"access_token":"fictional-new","expires_in":1800}')

        def do_GET(self):
            if self.headers.get('Authorization') != 'Bearer fictional-new':
                self.send_response(401); self.end_headers(); return
            self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try:
        d = Demo(tmp_path, 'test'); d.ensure()
        (d.path / 'runtime.json').write_text(json.dumps({'port': server.server_port}))
        (d.path / 'auth.json').write_text(json.dumps({'access_token': 'fictional-expired', 'refresh_token': 'fictional-refresh', 'expires': 0, 'clientId': d.url + '/'}))
        assert d.api('/api/ping') == {'ok': True}
        token = json.loads((d.path / 'auth.json').read_text())
        assert token['access_token'] == 'fictional-new'
        assert token['expires'] > time.time() * 1000
        assert (d.path / 'auth.json').stat().st_mode & 0o077 == 0
    finally:
        server.shutdown(); server.server_close(); thread.join()
