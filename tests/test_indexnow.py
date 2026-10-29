"""IndexNow submission after the live site serves the merge commit (no network: fake fetch, no sleep)."""
import importlib.util
import json
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/indexnow.yml'


def tool():
    path = ROOT / 'tools/indexnow.py'
    assert path.exists(), 'indexnow.py has not been implemented'
    spec = importlib.util.spec_from_file_location('indexnow', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Build:
    """Serves build.json: the old commit until `after` polls have happened."""
    def __init__(self, sha, after):
        self.sha, self.after, self.calls = sha, after, 0

    def __call__(self, url):
        self.calls += 1
        return json.dumps({'commit': self.sha if self.calls >= self.after else 'old'})


def test_waits_until_third_poll_shows_commit():
    fetch, sleeps = Build('abc', 3), []
    tool().wait_for_commit('abc', fetch=fetch, sleep=sleeps.append)
    assert fetch.calls == 3 and sleeps == [30, 30]


def test_never_appearing_commit_times_out():
    fetch, sleeps = Build('abc', 10**9), []
    with pytest.raises(TimeoutError):
        tool().wait_for_commit('abc', timeout=90, interval=30, fetch=fetch, sleep=sleeps.append)
    assert sum(sleeps) <= 90


def test_unreachable_site_keeps_polling():
    answers = iter([OSError('down'), json.dumps({'commit': 'abc'})])

    def fetch(url):
        a = next(answers)
        if isinstance(a, Exception):
            raise a
        return a
    tool().wait_for_commit('abc', fetch=fetch, sleep=lambda s: None)


def test_submit_posts_payload_and_returns_status():
    seen = []

    def post(url, payload):
        seen.append((url, payload))
        return 202
    status = tool().submit(['https://domosenso.org/a/'], 'k' * 32, fetch=post)
    assert status == 202
    assert seen == [('https://api.indexnow.org/indexnow', {
        'host': 'domosenso.org', 'key': 'k' * 32,
        'keyLocation': f"https://domosenso.org/{'k' * 32}.txt", 'urlList': ['https://domosenso.org/a/']})]


def test_submit_empty_list_makes_no_request():
    def post(url, payload):
        raise AssertionError('no request expected')
    assert tool().submit([], 'k' * 32, fetch=post) == 0


def test_key_file_matches_key():
    key = tool().read_key()
    assert len(key) == 32 and (ROOT / f'website/public/{key}.txt').read_text() == key


def run(monkeypatch, capsys, urls, wait=None, status=200):
    mod = tool()
    calls = []
    monkeypatch.setattr(mod, 'wait_for_commit', wait or (lambda sha, **k: calls.append(('wait', sha))))
    monkeypatch.setattr(mod, 'submit', lambda u, key, **k: calls.append(('submit', u)) or status)
    code = mod.main(['--sha', 'abc'], stdin=urls)
    return code, calls, capsys.readouterr().out


def test_main_submits_urls(monkeypatch, capsys):
    code, calls, out = run(monkeypatch, capsys, 'https://domosenso.org/a/\nhttps://domosenso.org/b/\n', status=200)
    assert code == 0 and calls[-1] == ('submit', ['https://domosenso.org/a/', 'https://domosenso.org/b/'])
    assert 'submitted 2 urls (200)' in out


@pytest.mark.parametrize('text', ['', 'no website changes\n'])
def test_main_no_urls(monkeypatch, capsys, text):
    code, calls, out = run(monkeypatch, capsys, text)
    assert code == 0 and calls == [] and 'no urls' in out


def test_main_client_error_exits_1(monkeypatch, capsys):
    code, _, _ = run(monkeypatch, capsys, 'https://domosenso.org/a/\n', status=403)
    assert code == 1


def test_main_timeout_exits_1_without_submit(monkeypatch, capsys):
    def boom(sha, **k):
        raise TimeoutError('never')
    code, calls, _ = run(monkeypatch, capsys, 'https://domosenso.org/a/\n', wait=boom)
    assert code == 1 and calls == []


def test_workflow_shape():
    text = WORKFLOW.read_text()
    wf = yaml.safe_load(text)
    on = wf.get('on', wf.get(True))
    assert on == {'push': {'branches': ['main']}}
    assert wf['permissions'] == {'contents': 'read'}
    steps = wf['jobs']['indexnow']['steps']
    checkout = next(s for s in steps if s.get('uses', '').startswith('actions/checkout@v4'))
    assert checkout['with'] == {'fetch-depth': 0, 'persist-credentials': False}
    assert any(s.get('uses', '').startswith('astral-sh/setup-uv@v6') for s in steps)
    run_step = next(s for s in steps if 'indexnow.py' in s.get('run', ''))
    assert '${{' not in run_step['run'] and 'secrets' not in text
    assert run_step['env'] == {'BEFORE': '${{ github.event.before }}', 'SHA': '${{ github.sha }}'}
    assert run_step['run'].index('set -o pipefail') < run_step['run'].index('website_changes.py')
    assert 'website_changes.py' in run_step['run'] and '--format urls' in run_step['run'] and 'HEAD~1' in run_step['run']


class Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return b'{"commit": "abc"}'


def capture_requests(monkeypatch, module):
    seen = []

    def urlopen(request, timeout=None):
        seen.append(request)
        return Response()
    monkeypatch.setattr(module.urllib.request, 'urlopen', urlopen)
    return seen


def test_requests_send_own_user_agent(monkeypatch):
    # Cloudflare answers the default Python-urllib agent with 403, so polling never saw the commit.
    module = tool()
    seen = capture_requests(monkeypatch, module)
    module.http_get(module.BUILD_URL)
    module.http_post(module.ENDPOINT, {'urlList': []})
    agents = [r.get_header('User-agent') for r in seen]
    assert agents == [module.USER_AGENT] * 2 and not module.USER_AGENT.startswith('Python-urllib')


def test_timeout_names_the_last_error():
    def fetch(url):
        raise OSError('HTTP Error 403: Forbidden')
    with pytest.raises(TimeoutError, match='403'):
        tool().wait_for_commit('abc', timeout=30, interval=30, fetch=fetch, sleep=lambda s: None)
