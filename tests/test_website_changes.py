"""Map a git diff to the domosenso.org routes it changes."""
import importlib.util
import json
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ' (draft, preview only)'


def tool():
    path = ROOT / 'tools/website_changes.py'
    assert path.exists(), 'website_changes.py has not been implemented'
    spec = importlib.util.spec_from_file_location('website_changes', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def howto(status='published', body='x'):
    return f'---\nslug: x\nstatus: {status}\n---\n{body}\n'


@pytest.fixture
def repo(tmp_path):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(tmp_path), *args], text=True).strip()
    git('init', '-q'); git('config', 'user.name', 't'); git('config', 'user.email', 't@example.invalid')
    def write(rel, text):
        p = tmp_path / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)
    write('website/content/publication.json', json.dumps({'components': [
        {'id': 'a', 'version': '0.1.0'}, {'id': 'b', 'version': '0.1.0'}]}))
    write('website/content/docs.generated.json', json.dumps([
        {'slug': 's1', 'body': 'one'}, {'slug': 's2', 'body': 'two'}]))
    write('website/content/how-to/old.md', howto(body='old'))
    git('add', '.'); git('commit', '-qm', 'base'); git('tag', 'base')
    def commit():
        git('add', '.'); git('commit', '-qm', 'change')
    return tmp_path, write, commit, git


def routes(repo_, paths):
    root, *_ = repo_
    return tool().changed_routes(paths, root, 'base')


def test_new_howto(repo):
    _, write, commit, _ = repo
    write('website/content/how-to/x.md', howto()); commit()
    assert routes(repo, ['website/content/how-to/x.md']) == [
        ('/how-to/', 'how-to index'), ('/how-to/x/', 'new how-to')]


def test_updated_and_removed_howto(repo):
    _, write, commit, git = repo
    write('website/content/how-to/old.md', howto(body='newer')); commit()
    assert ('/how-to/old/', 'updated how-to') in routes(repo, ['website/content/how-to/old.md'])
    git('rm', '-q', 'website/content/how-to/old.md'); git('commit', '-qm', 'rm')
    assert ('/how-to/old/', 'removed') in routes(repo, ['website/content/how-to/old.md'])


def test_draft_howto_is_tagged(repo):
    _, write, commit, _ = repo
    write('website/content/how-to/x.md', howto('draft')); commit()
    assert routes(repo, ['website/content/how-to/x.md']) == [
        ('/how-to/', 'how-to index' + DRAFT), ('/how-to/x/', 'new how-to' + DRAFT)]


def test_journal(repo):
    _, write, commit, _ = repo
    write('website/content/journal/j.md', howto()); commit()
    assert routes(repo, ['website/content/journal/j.md']) == [
        ('/journal/', 'journal index'), ('/journal/j/', 'new article')]


def test_component_and_device(repo):
    _, write, commit, _ = repo
    write('website/content/components/a.json', '{}'); write('website/content/devices/d.json', '{}'); commit()
    got = routes(repo, ['website/content/components/a.json', 'website/content/devices/d.json'])
    assert got == [('/components/a/', 'new component page'), ('/devices/d/', 'new device page')]


def test_publication_only_changed_versions(repo):
    _, write, commit, _ = repo
    write('website/content/publication.json', json.dumps({'components': [
        {'id': 'a', 'version': '0.2.0'}, {'id': 'b', 'version': '0.1.0'}]})); commit()
    got = routes(repo, ['website/content/publication.json'])
    assert [r for r, _ in got] == ['/components/a/', '/releases/']


def test_docs_generated_changed_slugs(repo):
    _, write, commit, _ = repo
    write('website/content/docs.generated.json', json.dumps([
        {'slug': 's1', 'body': 'one'}, {'slug': 's2', 'body': 'TWO'}, {'slug': 's3', 'body': 'n'}])); commit()
    got = routes(repo, ['website/content/docs.generated.json'])
    assert [r for r, _ in got] == ['/docs/s2/', '/docs/s3/']


@pytest.mark.parametrize('path', ['website/src/app/page.tsx', 'website/public/a.png'])
def test_site_code(repo, path):
    _, write, commit, _ = repo
    write(path, 'changed'); commit()
    assert routes(repo, [path]) == [('/', 'site code changed — check all pages')]


def test_other_files_map_to_nothing(repo):
    assert routes(repo, ['website/src/generated/content.json', 'tools/x.py', 'AGENTS.md',
                         'website/README.md']) == []


def test_cli(repo, capsys):
    root, write, commit, _ = repo
    write('website/content/how-to/x.md', howto()); write('website/content/how-to/y.md', howto('draft'))
    write('website/src/a.ts', ''); commit()
    mod = tool()
    base = ['--root', str(root), '--base', 'base']
    mod.main(base + ['--preview-url', 'https://abc.domosenso-framework.pages.dev'])
    out = capsys.readouterr().out
    assert '- [/how-to/x/](https://abc.domosenso-framework.pages.dev/how-to/x/) — new how-to' in out
    mod.main(base + ['--format', 'urls'])
    urls = capsys.readouterr().out.split()
    assert 'https://domosenso.org/how-to/x/' in urls and 'https://domosenso.org/' in urls
    assert 'https://domosenso.org/how-to/y/' not in urls


def test_cli_empty(repo, capsys):
    root, *_ = repo
    tool().main(['--root', str(root), '--base', 'base'])
    assert capsys.readouterr().out.strip() == 'no website changes'


def test_removed_draft_is_tagged(repo):
    _, write, commit, git = repo
    write('website/content/how-to/d.md', howto('draft')); commit(); git('tag', '-f', 'base')
    git('rm', '-q', 'website/content/how-to/d.md'); git('commit', '-qm', 'rm')
    assert ('/how-to/d/', 'removed' + DRAFT) in routes(repo, ['website/content/how-to/d.md'])


def test_published_to_draft_is_unpublished(repo):
    _, write, commit, _ = repo
    write('website/content/how-to/old.md', howto('draft', 'old')); commit()
    got = routes(repo, ['website/content/how-to/old.md'])
    assert ('/how-to/old/', 'unpublished') in got


def test_rename_reports_old_route_removed(repo, capsys):
    root, _, _, git = repo
    git('mv', 'website/content/how-to/old.md', 'website/content/how-to/new.md'); git('commit', '-qm', 'mv')
    tool().main(['--root', str(root), '--base', 'base'])
    out = capsys.readouterr().out
    assert '/how-to/old/` — removed' in out and '/how-to/new/` — new how-to' in out


def test_head_argument(repo, capsys):
    root, write, commit, git = repo
    write('website/content/how-to/x.md', howto()); commit(); git('tag', 'mid')
    git('rm', '-q', 'website/content/how-to/x.md'); git('commit', '-qm', 'rm')
    tool().main(['--root', str(root), '--base', 'base', '--head', 'mid'])
    assert '/how-to/x/` — new how-to' in capsys.readouterr().out
