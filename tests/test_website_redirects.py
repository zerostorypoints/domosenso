"""The site serves repository assets at shorter paths (SPEC-014, SPEC-036, SPEC-040); the paths that
mirror the repository redirect there, so a link copied from GitHub with domosenso.org as host works."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REDIRECTS = ROOT / 'website/public/_redirects'


def rules():
    """Cloudflare Pages `_redirects`: `<from> <to> [status]`, `#` comments."""
    out = []
    for line in REDIRECTS.read_text().splitlines():
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        assert len(parts) in (2, 3), line
        out.append((parts[0], parts[1], int(parts[2]) if len(parts) == 3 else 302))
    return out


def resolve(path):
    """Apply the first matching rule as Cloudflare does: `:name` matches one segment, `*` the rest."""
    for source, target, status in rules():
        names = []

        def group(m):
            if m[0] == '*':
                names.append('splat'); return '(.+)'
            names.append(m[0][1:]); return '([^/]+)'
        pattern = re.sub(r'\*|:[A-Za-z]\w*', group, re.escape(source).replace(r'\*', '*'))
        match = re.fullmatch(pattern, path)
        if match:
            values = dict(zip(names, match.groups()))
            return re.sub(r':(\w+)', lambda m: values[m[1]], target), status
    return None, None


def served_sources():
    assets = json.loads((ROOT / 'website/content/assets.json').read_text())
    return [(a['sourcePath'], a['path']) for a in assets if a.get('sourcePath', '').startswith('devices/')]


def test_every_published_device_asset_has_a_repository_shaped_redirect():
    sources = served_sources()
    kinds = {source.split('/')[1] for source, _ in sources}
    assert {'wiring', 'enclosures', 'dimensions'} <= kinds
    for source, served in sources:
        assert resolve('/' + source) == (served, 301), source


def test_redirect_targets_exist_and_pages_are_untouched():
    for source, served in served_sources():
        assert (ROOT / 'website/public' / served.lstrip('/')).is_file(), served
    # Device pages and their markdown stay where they are.
    for path in ('/devices/cc1101/', '/devices/cc1101/index.md', '/wiring/cc1101-atom-lite.svg'):
        assert resolve(path) == (None, None), path
