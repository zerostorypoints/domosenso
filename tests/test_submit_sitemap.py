"""Sitemap resubmission to Search Console and Bing after a website merge (SPEC-039); no network."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def tool():
    spec = importlib.util.spec_from_file_location('submit_sitemap', ROOT / 'tools/submit_sitemap.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Recorder:
    def __init__(self, status=200, text='{"d":null}'):
        self.status, self.text, self.calls = status, text, []

    def __call__(self, method, url, body=None, headers=None):
        self.calls.append((method, url, body, headers))
        return self.status, self.text


def test_bing_posts_submit_feed_with_the_key_in_the_query():
    request = Recorder()
    assert tool().submit_bing('k/y', 'https://domosenso.org/', 'https://domosenso.org/sitemap.xml', request=request) is None
    method, url, body, headers = request.calls[0]
    assert method == 'POST'
    assert url == 'https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed?apikey=k/y'
    assert body == {'siteUrl': 'https://domosenso.org/', 'feedUrl': 'https://domosenso.org/sitemap.xml'}
    assert headers == {'Content-Type': 'application/json; charset=utf-8'}


def test_bing_error_reports_status_and_message_not_the_key():
    request = Recorder(400, json.dumps({'ErrorCode': 14, 'Message': 'ERROR!!! NotAuthorized'}))
    error = tool().submit_bing('secret-key', 'https://domosenso.org/', 'https://domosenso.org/sitemap.xml', request=request)
    assert error == '400 ERROR!!! NotAuthorized' and 'secret-key' not in error


SERVICE_ACCOUNT = json.dumps({'type': 'service_account', 'client_email': 'ci@example.iam.gserviceaccount.com'})


def test_google_puts_the_sitemap_with_a_bearer_token():
    request, seen = Recorder(204, ''), []
    error = tool().submit_google(SERVICE_ACCOUNT, 'sc-domain:domosenso.org', 'https://domosenso.org/sitemap.xml',
                                 token=lambda info: seen.append(info) or 'tok', request=request)
    assert error is None and seen == [json.loads(SERVICE_ACCOUNT)]
    method, url, body, headers = request.calls[0]
    assert method == 'PUT' and body is None and headers == {'Authorization': 'Bearer tok'}
    assert url == ('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Adomosenso.org'
                   '/sitemaps/https%3A%2F%2Fdomosenso.org%2Fsitemap.xml')


def test_google_without_permission_reports_403():
    request = Recorder(403, json.dumps({'error': {'message': 'User does not have sufficient permission'}}))
    error = tool().submit_google(SERVICE_ACCOUNT, 'sc-domain:domosenso.org', 'https://domosenso.org/sitemap.xml',
                                 token=lambda info: 'tok', request=request)
    assert error == '403 User does not have sufficient permission'


def test_google_bad_json_and_token_failure_are_reported_without_payload():
    mod = tool()
    assert mod.submit_google('{not json', 'p', 's', token=lambda i: 'tok', request=Recorder()) == 'credentials are not JSON'

    def refused(info):
        raise RuntimeError('invalid_grant: private key payload')
    assert mod.submit_google(SERVICE_ACCOUNT, 'p', 's', token=refused, request=Recorder()) == 'token: RuntimeError'


def run(monkeypatch, capsys, env, bing=None, google=None):
    mod = tool()
    calls = []
    monkeypatch.setattr(mod, 'submit_bing', lambda key, site, sitemap: calls.append(('bing', site, sitemap)) or bing)
    monkeypatch.setattr(mod, 'submit_google', lambda creds, prop, sitemap: calls.append(('google', prop, sitemap)) or google)
    code = mod.main([], env=env)
    return code, calls, capsys.readouterr().out


def test_without_credentials_both_engines_skip_and_pass(monkeypatch, capsys):
    code, calls, out = run(monkeypatch, capsys, {})
    assert code == 0 and calls == []
    assert out.splitlines() == ['skip google: no credentials', 'skip bing: no credentials']


def test_both_engines_submit_the_default_sitemap(monkeypatch, capsys):
    code, calls, out = run(monkeypatch, capsys, {'BING_WEBMASTER_API_KEY': 'k', 'GOOGLE_SEARCH_CONSOLE_CREDENTIALS': '{}'})
    assert code == 0
    assert calls == [('google', 'sc-domain:domosenso.org', 'https://domosenso.org/sitemap.xml'),
                     ('bing', 'https://domosenso.org/', 'https://domosenso.org/sitemap.xml')]
    assert out.splitlines() == ['ok google: https://domosenso.org/sitemap.xml', 'ok bing: https://domosenso.org/sitemap.xml']


@pytest.mark.parametrize('env, line', [
    ({'BING_WEBMASTER_API_KEY': 'k'}, 'FAIL bing: 400 bad'),
    ({'GOOGLE_SEARCH_CONSOLE_CREDENTIALS': '{}'}, 'FAIL google: 403 no'),
])
def test_one_failure_exits_1_and_the_other_engine_still_runs(monkeypatch, capsys, env, line):
    code, _, out = run(monkeypatch, capsys, env, bing='400 bad', google='403 no')
    assert code == 1 and line in out.splitlines()


def test_script_declares_its_own_dependencies():
    # google-auth stays out of the domosenso package: uv installs it for this script only.
    head = (ROOT / 'tools/submit_sitemap.py').read_text().split('# ///')[1]
    assert 'google-auth' in head and 'requests' in head
    assert 'google-auth' not in (ROOT / 'pyproject.toml').read_text()
