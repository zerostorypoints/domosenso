"""Delete a branch's Cloudflare Pages preview deployments (no network: fake http)."""
import importlib.util
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/preview-cleanup.yml'


def tool():
    path = ROOT / 'tools/cloudflare_previews.py'
    assert path.exists(), 'cloudflare_previews.py has not been implemented'
    spec = importlib.util.spec_from_file_location('cloudflare_previews', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def deployment(id, branch, environment='preview'):
    return {'id': id, 'environment': environment, 'deployment_trigger': {'metadata': {'branch': branch}}}


class Fake:
    def __init__(self, deployments, per_page=2, error=None):
        self.deployments, self.per_page, self.error = deployments, per_page, error
        self.calls = []

    def __call__(self, method, url, token):
        self.calls.append((method, url, token))
        if self.error:
            return {'success': False, 'errors': self.error, 'result': []}
        if method == 'DELETE':
            return {'success': True, 'errors': [], 'result': None}
        page = int(url.split('page=')[1].split('&')[0])
        chunk = self.deployments[(page - 1) * self.per_page:page * self.per_page]
        pages = max(1, -(-len(self.deployments) // self.per_page))
        return {'success': True, 'errors': [], 'result': chunk, 'result_info': {'page': page, 'total_pages': pages}}


def test_deletes_only_branch_previews_across_pages():
    fake = Fake([deployment('a', 'feat'), deployment('b', 'other'), deployment('c', 'feat'),
                 deployment('d', 'feat', 'production')])
    deleted = tool().delete_branch_previews('feat', 'acc', 'proj', 'tok', http=fake)
    assert deleted == ['a', 'c']
    deletes = [c for c in fake.calls if c[0] == 'DELETE']
    assert [u for _, u, _ in deletes] == [
        'https://api.cloudflare.com/client/v4/accounts/acc/pages/projects/proj/deployments/a?force=true',
        'https://api.cloudflare.com/client/v4/accounts/acc/pages/projects/proj/deployments/c?force=true']
    assert all(t == 'tok' for _, _, t in fake.calls)
    assert 'env=preview' in fake.calls[0][1]


def test_none_returns_empty_and_cli_prints_no_previews(monkeypatch, capsys):
    module = tool()
    assert module.delete_branch_previews('feat', 'a', 'p', 't', http=Fake([deployment('x', 'other')])) == []
    monkeypatch.setenv('CLOUDFLARE_API_TOKEN', 't')
    monkeypatch.setenv('CLOUDFLARE_ACCOUNT_ID', 'a')
    assert module.main(['--branch', 'feat'], http=Fake([])) == 0
    assert capsys.readouterr().out.strip() == 'no previews'


def test_cli_prints_deleted_ids(monkeypatch, capsys):
    monkeypatch.setenv('CLOUDFLARE_API_TOKEN', 't')
    monkeypatch.setenv('CLOUDFLARE_ACCOUNT_ID', 'a')
    assert tool().main(['--branch', 'feat'], http=Fake([deployment('a', 'feat')])) == 0
    assert capsys.readouterr().out.strip() == 'deleted a'


def test_api_error_raises_with_cloudflare_message(monkeypatch, capsys):
    module = tool()
    errors = [{'message': 'Authentication error'}, {'message': 'second'}]
    with pytest.raises(RuntimeError, match='Authentication error; second'):
        module.delete_branch_previews('feat', 'a', 'p', 't', http=Fake([], error=errors))
    monkeypatch.setenv('CLOUDFLARE_API_TOKEN', 't')
    monkeypatch.setenv('CLOUDFLARE_ACCOUNT_ID', 'a')
    assert module.main(['--branch', 'feat'], http=Fake([], error=errors)) == 1
    assert 'Authentication error; second' in capsys.readouterr().err


def test_main_branch_is_refused():
    fake = Fake([deployment('a', 'main')])
    with pytest.raises(ValueError, match='main'):
        tool().delete_branch_previews('main', 'a', 'p', 't', http=fake)
    assert fake.calls == []


def test_workflow_triggers_on_close_guards_forks_and_scopes_secret():
    text = WORKFLOW.read_text()
    workflow = yaml.safe_load(text)
    triggers = workflow.get('on', workflow.get(True))
    assert triggers == {'pull_request': {'types': ['closed']}}
    assert workflow['permissions'] == {'contents': 'read'}
    assert list(workflow['jobs']) == ['cleanup']
    job = workflow['jobs']['cleanup']
    assert job['if'] == 'github.event.pull_request.head.repo.full_name == github.repository'
    assert text.count('secrets.CLOUDFLARE_API_TOKEN') == 1
    assert 'secrets.CLOUDFLARE_API_TOKEN' in yaml.safe_dump(job)
    assert 'cloudflare_previews.py' in yaml.safe_dump(job)
