"""Published website data must describe immutable releases, not the working tree."""
import importlib.util
import json
from pathlib import Path
import subprocess

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def exporter():
    path = ROOT / 'tools/export_website.py'
    assert path.exists(), 'public website exporter has not been implemented'
    spec = importlib.util.spec_from_file_location('export_website', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def catalog(tmp_path):
    def git(*args):
        return subprocess.check_output(['git','-C',str(tmp_path),*args],text=True).strip()
    git('init','-q'); git('config','user.name','test'); git('config','user.email','test@example.invalid')
    p=tmp_path/'components/sample'; p.mkdir(parents=True)
    manifest={'id':'sample','version':'0.1.0','summary':'Released description','artifacts':{},'tested':{'ha':['2026.9.2']},'inputs':{}}
    (p/'component.yaml').write_text(yaml.safe_dump(manifest))
    (tmp_path/'docs').mkdir(); (tmp_path/'docs/start.md').write_text('# Start\n\n[Other](private.md)')
    (tmp_path/'docs/private.md').write_text('Unlisted research')
    (tmp_path/'README.md').write_text('# Sample\n\n## Prerequisites\n\nHAOS is not covered. [Start](docs/start.md)\n\n## Start\n\nclone\n')
    git('add','.'); git('commit','-qm','fixture'); sha=git('rev-parse','HEAD'); git('tag','sample/0.1.0')
    publication={'frameworkCommit':sha,'components':[{'id':'sample','version':'0.1.0','tag':'sample/0.1.0','commit':sha}], 'documents':[{'path':'docs/start.md','slug':'start','title':'Start'}]}
    return tmp_path, publication, git


def test_export_reads_tag_not_working_tree_and_preserves_unknown(catalog):
    root,pub,_=catalog
    (root/'components/sample/component.yaml').write_text('summary: Unreleased\n')
    data,docs=exporter().build(root,pub)
    entry=data['components'][0]
    assert entry['summary']=='Released description'
    assert entry['testedHomes'] is None
    assert entry['installationRole']=='describes'
    assert len(docs)==1 and docs[0]['slug']=='start'
    assert '/blob/' in docs[0]['body']


def test_zero_evidence_and_installed_artifacts(catalog):
    root,pub,git=catalog
    p=root/'components/sample/component.yaml'; m=yaml.safe_load(p.read_text()); m['tested']['homes']=0; m['artifacts']={'templates':['templates/main.j2']}; p.write_text(yaml.safe_dump(m))
    git('add','.');git('commit','-qm','second');sha=git('rev-parse','HEAD');git('tag','-f','sample/0.1.0'); pub['components'][0]['commit']=sha
    entry=exporter().build(root,pub)[0]['components'][0]
    assert entry['testedHomes']==0 and entry['installationRole']=='installs'


def test_assistant_bindings_alone_keep_an_integration_guide(catalog):
    """The optional assistant bindings template (SPEC-029) is metadata, not what a home installs."""
    root,pub,git=catalog
    p=root/'components/sample/component.yaml'; m=yaml.safe_load(p.read_text())
    m['assistant']={'version':1,'definition':'assistant.yaml','bindings':'templates/assistant-bindings.yaml.j2'}
    m['artifacts']={'templates':['templates/assistant-bindings.yaml.j2'],'ha_packages':[],'services':[]}
    p.write_text(yaml.safe_dump(m))
    git('add','.');git('commit','-qm','assistant');sha=git('rev-parse','HEAD');git('tag','-f','sample/0.1.0'); pub['components'][0]['commit']=sha
    assert exporter().build(root,pub)[0]['components'][0]['installationRole']=='describes'
    m['artifacts']['templates'].append('templates/main.j2'); p.write_text(yaml.safe_dump(m))
    git('add','.');git('commit','-qm','main');sha=git('rev-parse','HEAD');git('tag','-f','sample/0.1.0'); pub['components'][0]['commit']=sha
    assert exporter().build(root,pub)[0]['components'][0]['installationRole']=='installs'


def test_moved_or_missing_tag_fails(catalog):
    root,pub,git=catalog
    pub['components'][0]['commit']='0'*40
    with pytest.raises(ValueError,match='commit'): exporter().build(root,pub)
    pub['components'][0]['tag']='sample/9.0.0';pub['components'][0]['version']='9.0.0'
    with pytest.raises(ValueError,match='tag'): exporter().build(root,pub)


@pytest.mark.parametrize('path',['../secrets.yaml','.ai/specs/internal.md','docs/../../secrets.yaml'])
def test_document_escape_is_rejected(catalog,path):
    root,pub,_=catalog;pub['documents'][0]['path']=path
    with pytest.raises(ValueError,match='document'): exporter().build(root,pub)


def test_export_is_deterministic_and_checks_stale_output(catalog,tmp_path):
    root,pub,_=catalog; mod=exporter()
    assert mod.build(root,pub)==mod.build(root,pub)
    p=root/'out.json';mod.write_json(p,{'a':1},check=False)
    mod.write_json(p,{'a':1},check=True)
    with pytest.raises(ValueError,match='stale'): mod.write_json(p,{'a':2},check=True)


def test_unsafe_or_duplicate_identifiers_fail(catalog):
    root,pub,_=catalog; pub['components'].append(pub['components'][0])
    with pytest.raises(ValueError,match='duplicate'): exporter().build(root,pub)


def test_howtos_get_their_own_generated_file():
    # Client components import content.json; draft how-tos must never be bundled with it.
    out = exporter().outputs({'components': [], 'howTos': [{'slug': 'x', 'status': 'draft'}]}, {'c': 1}, {'d': 1},
                             {'prerequisites': 'p'})
    assert out['website/src/generated/howtos.json'] == [{'slug': 'x', 'status': 'draft'}]
    assert 'howTos' not in out['website/src/generated/content.json']
    assert set(out) == {'website/src/generated/content.json', 'website/src/generated/howtos.json',
                        'website/src/generated/catalog.json', 'website/content/docs.generated.json',
                        'website/src/generated/agent.json'}
    assert out['website/src/generated/agent.json'] == {'prerequisites': 'p'}


def test_prerequisites_come_from_the_framework_commit(catalog):
    # The agent files publish the reviewed README at frameworkCommit, never the working tree.
    root,pub,_=catalog
    (root/'README.md').write_text('## Prerequisites\n\nUnreviewed\n')
    text=exporter().agent_content(root,pub)['prerequisites']
    assert 'HAOS is not covered.' in text and '/docs/start/' in text
    assert 'Unreviewed' not in text and 'clone' not in text


def test_missing_prerequisites_section_fails(catalog):
    root,pub,git=catalog
    (root/'README.md').write_text('# Sample\n')
    git('commit','-qam','no prerequisites'); pub['frameworkCommit']=git('rev-parse','HEAD')
    with pytest.raises(ValueError,match='Prerequisites'): exporter().agent_content(root,pub)


# SPEC-036: source assets are wiring SVGs and enclosure PNG previews, read from the pinned commit.
PNG = b'\x89PNG\r\n\x1a\n' + bytes(range(256))  # not valid UTF-8, so a text path would fail


def source_asset(sha, **override):
    return dict({'path': '/enclosures/box/closed.png', 'sourcePath': 'devices/enclosures/box/preview/closed.png',
                 'sourceCommit': sha, 'alt': 'Closed box', 'kind': 'enclosure-preview', 'credit': 'DomoSenso',
                 'license': 'Apache-2.0', 'scope': 'public-device-guide'}, **override)


@pytest.fixture
def enclosure(catalog):
    root, publication, git = catalog
    preview = root / 'devices/enclosures/box/preview'; preview.mkdir(parents=True)
    (preview / 'closed.png').write_bytes(PNG)
    (preview / 'text.png').write_text('not a picture')
    (root / 'devices/wiring').mkdir(parents=True)
    (root / 'devices/wiring/box-board.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    git('add', '.'); git('commit', '-qm', 'enclosure'); sha = git('rev-parse', 'HEAD')
    publication['documentationCommit'] = sha
    (preview / 'closed.png').write_bytes(PNG + b'uncommitted')  # the working tree must not be read
    (root / 'website/content').mkdir(parents=True)
    return root, publication, sha


def export_assets(root, publication, assets, check=False):
    from website_content import export_source_assets
    (root / 'website/content/assets.json').write_text(json.dumps(assets))
    export_source_assets(root, publication, check)


def test_enclosure_preview_is_exported_byte_identical_from_the_commit(enclosure):
    root, publication, sha = enclosure
    wiring = source_asset(sha, path='/wiring/box-board.svg', sourcePath='devices/wiring/box-board.svg', kind='wiring')
    export_assets(root, publication, [source_asset(sha), wiring])
    assert (root / 'website/public/enclosures/box/closed.png').read_bytes() == PNG
    assert (root / 'website/public/wiring/box-board.svg').read_text() == '<svg xmlns="http://www.w3.org/2000/svg"/>\n'
    export_assets(root, publication, [source_asset(sha), wiring], check=True)
    (root / 'website/public/enclosures/box/closed.png').write_bytes(PNG + b'stale')
    with pytest.raises(ValueError, match='stale source asset'):
        export_assets(root, publication, [source_asset(sha)], check=True)


@pytest.mark.parametrize('override,message', [
    ({'sourcePath': 'devices/enclosures/box/stl/base.stl'}, 'invalid source asset'),
    ({'sourcePath': 'devices/enclosures/box/closed.png'}, 'invalid source asset'),
    ({'sourcePath': 'devices/enclosures/../wiring/preview/closed.png'}, 'invalid source asset'),
    ({'path': '/hardware/closed.png'}, 'invalid enclosure preview path'),
    ({'path': '/enclosures/other/closed.png'}, 'invalid enclosure preview path'),
    ({'path': '/enclosures/box/text.png', 'sourcePath': 'devices/enclosures/box/preview/text.png'}, 'not a PNG'),
])
def test_enclosure_preview_paths_and_bytes_are_checked(enclosure, override, message):
    root, publication, sha = enclosure
    with pytest.raises(ValueError, match=message):
        export_assets(root, publication, [source_asset(sha, **override)])


def test_enclosure_preview_from_another_commit_fails(enclosure):
    root, publication, sha = enclosure
    with pytest.raises(ValueError, match='asset source commit mismatch'):
        export_assets(root, publication, [source_asset(publication['frameworkCommit'])])
