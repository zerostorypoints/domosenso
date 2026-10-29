"""Editorial publication boundaries, independent of the browser rendering."""
import copy
import json
from pathlib import Path

import pytest

from test_website_export import catalog
from website_content import build_content


def seed(root, pub):
    base = root / 'website/content'
    for folder in ('components', 'devices', 'journal'):
        (base / folder).mkdir(parents=True)
    (base / 'assets.json').write_text('[]')
    (base / 'components/sample.json').write_text(json.dumps({
        'id': 'sample', 'version': '0.1.0', 'sourceCommit': pub['components'][0]['commit'],
        'outcome': 'A sample', 'categories': ['utilities'], 'hardware': 'none', 'ui': 'none',
        'scenario': {'states': [{'label': 'Ready', 'headline': 'Ready', 'detail': 'Sample only', 'values': []}]},
        'views': [], 'deviceIds': [], 'setup': ['Configure the integration'],
        'evidencePaths': ['components/sample/component.yaml']}))
    return base


def article(base, pub, status='published', **overrides):
    import yaml
    meta = dict(slug='sample-release', title='Sample release', summary='A useful change', category='releases',
                date='2026-10-28', status=status, author='DomoSenso', components=['sample'],
                releases=[pub['components'][0]], sources=['https://example.org/source'])
    meta.update(overrides)
    (base / 'journal/sample-release.md').write_text('---\n'+yaml.safe_dump(meta)+'---\n# A useful change\n\nA sample article.\n')


def test_content_excludes_draft_body_and_preserves_historical_refs(catalog):
    root, pub, _ = catalog
    base = seed(root, pub); article(base, pub, status='draft')
    assert build_content(root, pub)['articles'] == []
    article(base, pub)
    result = build_content(root, pub)
    assert result['articles'][0]['releases'][0]['commit'] == pub['components'][0]['commit']
    assert build_content(root, pub) == result


def test_stale_component_editorial_fails(catalog):
    root, pub, _ = catalog; base = seed(root, pub)
    p = base/'components/sample.json'; d=json.loads(p.read_text()); d['version']='9.0.0'; p.write_text(json.dumps(d))
    with pytest.raises(ValueError, match='editorial release'): build_content(root, pub)


@pytest.mark.parametrize('field,value', [('date','2026-02-30'),('components',['unknown']),('category','random'),('sources',['javascript:alert(1)'])])
def test_invalid_article_metadata_fails(catalog, field, value):
    root,pub,_=catalog; base=seed(root,pub); article(base,pub,**{field:value})
    with pytest.raises(ValueError): build_content(root,pub)


def test_missing_asset_fails(catalog):
    root,pub,_=catalog; base=seed(root,pub)
    (base/'assets.json').write_text(json.dumps([{'path':'/previews/missing.svg','alt':'Example','kind':'illustration','credit':'DomoSenso','license':'Apache-2.0','scope':'fictional'}]))
    with pytest.raises(ValueError,match='asset'): build_content(root,pub)


def test_device_source_must_be_allowlisted_and_cannot_escape(catalog):
    root,pub,_=catalog; base=seed(root,pub)
    device={'id':'sample-device','title':'Sample device','summary':'Setup','sourcePath':'../../private.md','sourceCommit':pub['frameworkCommit'],'components':['sample'],'body':'Setup','compatibility':[{'id':'sample','version':'0.1.0'}]}
    (base/'devices/sample-device.json').write_text(json.dumps(device))
    with pytest.raises(ValueError,match='device source'): build_content(root,pub)


def test_historical_release_sha_cannot_be_forged(catalog):
    root,pub,_=catalog; base=seed(root,pub)
    ref=copy.deepcopy(pub['components'][0]); ref['commit']='0'*40
    article(base,pub,releases=[ref])
    with pytest.raises(ValueError,match='release'): build_content(root,pub)


def test_remote_publication_rejects_historical_tag_moved_on_remote(catalog):
    from website_content import verify_content_refs
    root,pub,git=catalog; base=seed(root,pub); article(base,pub)
    git('branch','-M','main'); git('remote','add','origin',str(root))
    content=build_content(root,pub)
    verify_content_refs(root,pub,content)
    content['articles'][0]['releases'][0]['commit']='0'*40
    with pytest.raises(ValueError, match='public release'): verify_content_refs(root,pub,content)


def test_remote_publication_rejects_feature_branch_documentation(catalog):
    from website_content import verify_content_refs
    root,pub,git=catalog; base=seed(root,pub)
    git('branch','-M','main'); git('remote','add','origin',str(root)); git('checkout','-qb','feature')
    (root/'feature.txt').write_text('unmerged')
    git('add','feature.txt');git('commit','-qm','feature')
    pub['documentationCommit']=git('rev-parse','HEAD')
    with pytest.raises(ValueError): verify_content_refs(root,pub,build_content(root,pub))


def test_article_keeps_original_tag_when_current_catalog_advances(catalog):
    import yaml
    root,pub,git=catalog; base=seed(root,pub); article(base,pub)
    old=copy.deepcopy(pub['components'][0])
    manifest=root/'components/sample/component.yaml'; data=yaml.safe_load(manifest.read_text()); data['version']='0.2.0'; manifest.write_text(yaml.safe_dump(data))
    git('add','components/sample/component.yaml');git('commit','-qm','new release');sha=git('rev-parse','HEAD');git('tag','sample/0.2.0')
    pub['components'][0].update(version='0.2.0',tag='sample/0.2.0',commit=sha)
    path=base/'components/sample.json';entry=json.loads(path.read_text());entry.update(version='0.2.0',sourceCommit=sha);path.write_text(json.dumps(entry))
    result=build_content(root,pub)
    assert result['components'][0]['version']=='0.2.0'
    assert result['articles'][0]['releases']==[old]
