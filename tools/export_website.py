#!/usr/bin/env python3
"""Export explicitly selected releases and public guides for the static website (SPEC-014)."""
import argparse
import json
import posixpath
import re
import subprocess
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import yaml

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'https://github.com/zerostorypoints/domosenso'
IDENTIFIER = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
VERSION = re.compile(r'\d+\.\d+\.\d+')
COMMIT = re.compile(r'[0-9a-f]{40}')


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], text=True, capture_output=True)
    if result.returncode:
        raise ValueError(f'cannot read tag/document from git: {args[0]}')
    return result.stdout.strip()


def read(root, commit, path):
    return git(root, 'show', f'{commit}:{path}')


def valid_document(path):
    parts = PurePosixPath(path).parts
    return '..' not in parts and not path.startswith('/') and (
        path in ('README.md', 'CONTRIBUTING.md') or path.startswith('docs/') or bool(re.fullmatch(r'components/[a-z0-9-]+/(README|PHOTOS)\.md', path))) and path.endswith('.md')


def rewrite_links(body, path, routes, commit):
    def replace(match):
        target = match.group(2)
        if re.match(r'^(https?://|mailto:|#)', target):
            return match.group(0)
        if ':' in target or target.startswith('/'):
            raise ValueError(f'unsafe document link in {path}')
        file, sep, fragment = target.partition('#')
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(path), file))
        if resolved.startswith('../'):
            raise ValueError(f'escaping document link in {path}')
        url = routes.get(resolved, f'{REPOSITORY}/blob/{commit}/{quote(resolved)}')
        return f'{match.group(1)}{url}{sep}{fragment})'
    return re.sub(r'(\[[^\]]*\]\()([^\s)]+)\)', replace, body)


def build(root, publication):
    commit = publication['frameworkCommit']
    if not COMMIT.fullmatch(commit):
        raise ValueError('framework commit must be a full SHA')
    git(root, 'rev-parse', '--verify', f'{commit}^{{commit}}')
    entries = []
    seen = set()
    for item in publication['components']:
        cid, version, tag, sha = (item[k] for k in ('id', 'version', 'tag', 'commit'))
        if not IDENTIFIER.fullmatch(cid) or not VERSION.fullmatch(version) or tag != f'{cid}/{version}':
            raise ValueError('invalid component identifier/version/tag')
        if cid in seen:
            raise ValueError(f'duplicate component {cid}')
        seen.add(cid)
        actual = git(root, 'rev-parse', '--verify', f'refs/tags/{tag}^{{commit}}')
        if not COMMIT.fullmatch(sha) or actual != sha:
            raise ValueError(f'tag commit mismatch: {tag}')
        folder = f'components/{cid}'
        manifest = yaml.safe_load(read(root, sha, f'{folder}/component.yaml'))
        if manifest['id'] != cid or str(manifest['version']) != version:
            raise ValueError(f'manifest disagrees with tag: {tag}')
        tested = manifest.get('tested', {})
        homes = tested.get('homes')
        if homes is not None and (type(homes) is not int or homes < 0):
            raise ValueError(f'invalid field evidence for {cid}')
        artifacts = manifest.get('artifacts') or {}
        tree = git(root, 'ls-tree', '-r', '--name-only', sha, '--', folder).splitlines()
        entries.append({
            'id': cid, 'version': version, 'sourceTag': tag, 'sourceCommit': sha,
            'summary': manifest['summary'], 'requirements': manifest.get('devices', {}).get('requires', []),
            'integrations': manifest.get('integrations', []),
            'optionalRequirements': manifest.get('devices', {}).get('optional', []),
            'installationRole': 'installs' if any(artifacts.values()) else 'describes',
            'testedHa': tested.get('ha', []), 'testedEspHome': tested.get('esphome', []),
            'testedHomes': homes, 'host': manifest.get('host', {}),
            'localOnly': manifest.get('local_only'),
            'limitations': item.get('limitations', []),
            'inputs': [{'name': name, 'type': data.get('type', 'value'), 'required': 'default' not in data}
                       for name, data in (manifest.get('inputs') or {}).items()],
            'sourceUrl': f'{REPOSITORY}/tree/{sha}/{folder}',
            'upgradeUrl': f'{REPOSITORY}/blob/{sha}/{folder}/UPGRADE.md' if f'{folder}/UPGRADE.md' in tree else None,
        })
    documents = publication['documents']
    routes = {}; slugs = set()
    for doc in documents:
        path, slug = doc['path'], doc['slug']
        if not valid_document(path) or not IDENTIFIER.fullmatch(slug):
            raise ValueError('invalid public document path/slug')
        if path in routes or slug in slugs:
            raise ValueError('duplicate public document')
        routes[path] = f'/docs/{slug}/'; slugs.add(slug)
    docs = [{'slug': d['slug'], 'title': d['title'],
             'body': rewrite_links(read(root, commit, d['path']), d['path'], routes, commit),
             'sourceUrl': f'{REPOSITORY}/blob/{commit}/{d["path"]}'} for d in documents]
    return {'frameworkCommit': commit, 'components': sorted(entries, key=lambda e: e['id'])}, docs


def write_json(path, data, check):
    expected = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if check:
        if not path.exists() or path.read_text() != expected:
            raise ValueError(f'stale website snapshot: {path.name}; run tools/export_website.py')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(expected)


def verify_remote(root, publication):
    refs = {}
    for line in git(root, 'ls-remote', '--tags', 'origin').splitlines():
        sha, ref = line.split(); refs[ref] = sha
    remote_main = git(root, 'ls-remote', 'origin', 'refs/heads/main').split()[0]
    for sha in {publication['frameworkCommit'], publication.get('documentationCommit', publication['frameworkCommit']), *(c['commit'] for c in publication['components'])}:
        git(root, 'merge-base', '--is-ancestor', sha, remote_main)
    for item in publication['components']:
        ref = 'refs/tags/' + item['tag']
        if refs.get(ref + '^{}', refs.get(ref)) != item['commit']:
            raise ValueError(f'remote tag missing or changed: {item["tag"]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--verify-remote', action='store_true')
    args = parser.parse_args()
    try:
        publication = json.loads((ROOT / 'website/content/publication.json').read_text())
        if args.verify_remote:
            verify_remote(ROOT, publication)
        from website_content import build_content, export_source_assets, verify_content_refs
        export_source_assets(ROOT, publication, args.check)
        content = build_content(ROOT, publication)
        if args.verify_remote:
            verify_content_refs(ROOT, publication, content)
        catalog, docs = build(ROOT, publication)
        write_json(ROOT / 'website/src/generated/content.json', content, args.check)
        write_json(ROOT / 'website/src/generated/catalog.json', catalog, args.check)
        write_json(ROOT / 'website/content/docs.generated.json', docs, args.check)
    except (ValueError, KeyError, OSError, yaml.YAMLError) as error:
        parser.exit(1, f'FAIL {error}\n')
    print('ok website content')


if __name__ == '__main__':
    main()
