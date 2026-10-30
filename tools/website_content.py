"""Curated public editorial content bound to immutable component and document revisions."""
from datetime import date
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import urlparse

import yaml

from export_website import COMMIT, IDENTIFIER, REPOSITORY, git, read, rewrite_links


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_public_path(path):
    return isinstance(path, str) and path.startswith('/') and not path.startswith('//') and '..' not in PurePosixPath(path).parts and ':' not in path


def source_path(path):
    return isinstance(path, str) and '..' not in PurePosixPath(path).parts and not path.startswith('/') and bool(re.fullmatch(r'(?:devices/[a-z0-9-]+\.(?:md|yaml)|components/[a-z0-9-]+/(?:README|PHOTOS)\.md|docs/tablet-setup\.md)', path))


def verify_release(root, item):
    cid, version, tag, sha = (item[k] for k in ('id', 'version', 'tag', 'commit'))
    require(IDENTIFIER.fullmatch(cid) and re.fullmatch(r'\d+\.\d+\.\d+', version) and tag == f'{cid}/{version}', 'invalid article release')
    require(COMMIT.fullmatch(sha) and git(root, 'rev-parse', f'refs/tags/{tag}^{{commit}}') == sha, 'article release commit mismatch')
    manifest = yaml.safe_load(read(root, sha, f'components/{cid}/component.yaml'))
    require(manifest['id'] == cid and str(manifest['version']) == version, 'article release manifest mismatch')


def build_content(root, publication):
    root = Path(root); base = root/'website/content'
    selected = {c['id']: c for c in publication['components']}
    assets = json.loads((base/'assets.json').read_text())
    asset_paths = set()
    for asset in assets:
        p = asset['path']
        require(safe_public_path(p) and (root/'website/public'/p.lstrip('/')).is_file(), f'missing or unsafe asset: {p}')
        require(p not in asset_paths and all(asset.get(k) for k in ('alt','kind','credit','license','scope')), 'invalid asset metadata')
        asset_paths.add(p)
    components = []
    for path in sorted((base/'components').glob('*.json')):
        item = json.loads(path.read_text()); cid = item['id']; release = selected.get(cid)
        require(release and path.stem == cid and item['version'] == release['version'] and item['sourceCommit'] == release['commit'], f'editorial release mismatch: {cid}')
        require(item['hardware'] in ('required','optional','none') and item['ui'] in ('own','consumer','none'), 'invalid component classification')
        require(item['categories'] and all(c in ('presence','climate','lighting-shading','media-display','utilities') for c in item['categories']), 'invalid categories')
        require(item['outcome'] and item['setup'] and item['evidencePaths'] and item['scenario']['states'], 'incomplete component')
        for state in item['scenario']['states']:
            require(all(state.get(k) for k in ('label','headline','detail')) and isinstance(state['values'], list), 'invalid scenario state')
        for evidence in item['evidencePaths']:
            require(evidence.startswith(f'components/{cid}/') and '..' not in PurePosixPath(evidence).parts, 'invalid component evidence')
            read(root, release['commit'], evidence)
        for view in item['views']:
            require(view['owner'] in selected and all(c in selected for c in view['providers']), 'invalid view owner/provider')
            require(view['availability'] in ('default','conditional','opt-in') and view['condition'], 'invalid view availability')
            require(view['preview'] in asset_paths and view['previewType'] in ('illustration','rendered-demo'), 'missing view preview asset')
            require(COMMIT.fullmatch(view['sourceCommit']) and view['evidencePath'].startswith(f"components/{view['owner']}/") and '..' not in PurePosixPath(view['evidencePath']).parts, 'invalid view evidence')
            require(view['sourceCommit'] == selected[view['owner']]['commit'], 'stale view owner release')
            read(root, view['sourceCommit'], view['evidencePath'])
        components.append(item)
    require({c['id'] for c in components} == set(selected), 'editorial catalog coverage mismatch')
    devices = []
    device_records = [json.loads(p.read_text()) for p in sorted((base/'devices').glob('*.json'))]
    routes = {d['sourcePath']: f"/devices/{d['id']}/" for d in device_records}
    routes.update({d['path']:f"/docs/{d['slug']}/" for d in publication['documents']})
    for item in device_records:
        if item.get('photo'):
            require(item['photo'] in asset_paths, 'missing device photo asset')
        require(IDENTIFIER.fullmatch(item['id']) and source_path(item['sourcePath']), 'invalid device source')
        require(COMMIT.fullmatch(item['sourceCommit']) and item['sourceCommit'] == publication.get('documentationCommit', publication['frameworkCommit']), 'invalid device source commit')
        source = read(root, item['sourceCommit'], item['sourcePath'])
        require(item['components'] and all(c in selected for c in item['components']), 'invalid device component')
        require({c['id'] for c in item['compatibility']} == set(item['components']), 'device compatibility coverage mismatch')
        for compatible in item['compatibility']:
            require(compatible['id'] in selected and compatible['version'] == selected[compatible['id']]['version'], 'stale device compatibility')
        body = source if item['sourcePath'].endswith('.md') else item['body']
        # Only explicitly selected wiring assets may be served; all other relative links stay pinned.
        device_routes = dict(routes)
        for asset in assets:
            if asset.get('sourcePath'):
                device_routes[asset['sourcePath']] = asset['path']
        item['body'] = rewrite_links(body, item['sourcePath'], device_routes, item['sourceCommit']) if item['sourcePath'].endswith('.md') else body
        item['sourceUrl'] = f"{REPOSITORY}/blob/{item['sourceCommit']}/{item['sourcePath']}"
        devices.append(item)
    require(len({d['id'] for d in devices}) == len(devices), 'duplicate device id')
    for component in components:
        require(all(d in {d['id'] for d in devices} for d in component['deviceIds']), 'unknown device reference')
    device_ids = {d['id'] for d in devices}
    howtos = []; howto_slugs = set()
    for path in sorted((base/'how-to').glob('*.md')):
        parts = path.read_text().split('---', 2)
        require(len(parts) == 3 and not parts[0].strip(), 'invalid how-to frontmatter')
        item = yaml.safe_load(parts[1]); body = parts[2].strip()
        require(IDENTIFIER.fullmatch(str(item['slug'])) and item['slug'] == path.stem and item['slug'] not in howto_slugs, 'invalid or duplicate how-to slug')
        howto_slugs.add(item['slug'])
        require(item['status'] in ('draft','published'), 'invalid how-to status')
        require(all(isinstance(item.get(k), str) and item[k].strip() for k in ('title','description')) and body, 'incomplete how-to')
        require(1 <= len(item['description']) <= 160, 'invalid how-to description')
        require(isinstance(item['updated'], str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', item['updated']), 'invalid how-to date')
        date.fromisoformat(item['updated'])
        require(all(c in selected for c in item['components']), 'unknown how-to component')
        require(item['status'] == 'draft' or item['components'], 'published how-to needs a component')
        require(all(d in device_ids for d in item['devices']), 'unknown how-to device')
        require(item['sources'] and all(urlparse(s).scheme == 'https' and urlparse(s).netloc for s in item['sources']), 'unsafe how-to source')
        require(item['branches'], 'how-to needs a branch')
        for branch in item['branches']:
            require(all(isinstance(branch.get(k), str) and branch[k].strip() for k in ('situation','needs','wiring')), 'incomplete how-to branch')
            require(branch.get('supported') in ('yes','coming-soon','no'), 'invalid how-to branch support')
            if branch['supported'] == 'coming-soon':
                require(urlparse(branch.get('issue') or '').scheme == 'https' and urlparse(branch['issue']).netloc, 'coming-soon branch needs an issue')
            if branch['supported'] == 'yes':
                require(isinstance(branch.get('prompt'), str) and branch['prompt'].strip(), 'supported branch needs a prompt')
        item['body'] = body
        howtos.append(item)
    articles = []; slugs = set()
    for path in sorted((base/'journal').glob('*.md')):
        parts = path.read_text().split('---', 2)
        require(len(parts) == 3 and not parts[0].strip(), 'invalid article frontmatter')
        item = yaml.safe_load(parts[1]); body = parts[2].strip()
        require(item['status'] in ('draft','published'), 'invalid article status')
        if item['status'] == 'draft':
            continue
        require(IDENTIFIER.fullmatch(item['slug']) and item['slug'] == path.stem and item['slug'] not in slugs, 'invalid or duplicate article slug')
        slugs.add(item['slug'])
        require(item['category'] in ('releases','updates','installations'), 'invalid article category')
        for key in ('date','updated'):
            if key in item:
                require(isinstance(item[key], str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',item[key]), 'invalid article date')
                date.fromisoformat(item[key])
        require('date' in item and all(item.get(k) for k in ('title','summary','author')) and body, 'incomplete article')
        require(all(c in selected for c in item['components']), 'unknown article component')
        require(item['sources'] and all(urlparse(s).scheme == 'https' and urlparse(s).netloc for s in item['sources']), 'unsafe article source')
        require(all(h in howto_slugs for h in item.get('howto', [])), 'unknown how-to reference')
        for release in item['releases']:
            verify_release(root, release)
        if item['category'] == 'releases':
            require(item['releases'], 'release article needs immutable release reference')
        if item.get('cover'):
            require(item['cover'] in asset_paths, 'missing article cover asset')
        item['body'] = body
        articles.append(item)
    return {'components':components, 'devices':devices, 'articles':sorted(articles,key=lambda a:(a['date'],a['slug']),reverse=True), 'howTos':sorted(howtos,key=lambda h:h['slug']), 'assets':assets}


def export_source_assets(root, publication, check):
    """Copy only explicit, immutable public diagram sources; verify bytes in CI."""
    root = Path(root)
    for asset in json.loads((root/'website/content/assets.json').read_text()):
        if 'sourcePath' not in asset:
            continue
        path = asset['sourcePath']; sha = asset['sourceCommit']
        require(re.fullmatch(r'devices/wiring/[a-z0-9-]+\.svg', path) and safe_public_path(asset['path']), 'invalid source asset')
        require(COMMIT.fullmatch(sha) and sha == publication.get('documentationCommit', publication['frameworkCommit']), 'asset source commit mismatch')
        data = read(root, sha, path) + '\n'
        require('<script' not in data.lower() and 'javascript:' not in data.lower(), 'unsafe SVG asset')
        target = root/'website/public'/asset['path'].lstrip('/')
        if check:
            require(target.is_file() and target.read_text() == data, 'stale source asset')
        else:
            target.parent.mkdir(parents=True,exist_ok=True); target.write_text(data)


def verify_content_refs(root, publication, content):
    """Check every published revision, including historical article releases, against origin."""
    main = git(root, 'ls-remote', 'origin', 'refs/heads/main').split()[0]
    refs = {}
    for line in git(root, 'ls-remote', '--tags', 'origin').splitlines():
        sha, ref = line.split(); refs[ref] = sha
    commits = {publication['frameworkCommit'], publication.get('documentationCommit', publication['frameworkCommit'])}
    releases = list(publication['components']) + [r for a in content['articles'] for r in a['releases']]
    for release in releases:
        ref = 'refs/tags/' + release['tag']
        require(refs.get(ref+'^{}', refs.get(ref)) == release['commit'], 'public release tag missing or changed')
        commits.add(release['commit'])
    for sha in commits:
        git(root, 'merge-base', '--is-ancestor', sha, main)
