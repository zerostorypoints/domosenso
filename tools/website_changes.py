#!/usr/bin/env python3
"""Map a git diff to the domosenso.org routes it changes ("Changed pages" of a PR).

  uv run tools/website_changes.py --base origin/main [--head HEAD] [--preview-url URL]
                                  [--format markdown|urls]

`urls` prints absolute production URLs and leaves out drafts (they 404 on production).
"""
import argparse
import json
import re
from pathlib import Path
import subprocess
import sys

import yaml

SITE = 'https://domosenso.org'
DRAFT = ' (draft, preview only)'
CONTENT = 'website/content/'
SITE_CODE = ('website/src/', 'website/public/')
SITE_CODE_REASON = 'site code changed — check all pages'
GENERATED = 'website/src/generated/'


def show(root, ref, path):
    """File content at `ref`, or None when the file does not exist there."""
    r = subprocess.run(['git', '-C', str(root), 'show', f'{ref}:{path}'], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def status_of(text):
    if text is None or not text.startswith('---'):
        return 'published'
    try:
        front = yaml.safe_load(text.split('---', 2)[1]) or {}
    except yaml.YAMLError:
        return 'published'
    return front.get('status', 'published')


def verb(old, new, noun):
    if new is None:
        return 'removed'
    return f'new {noun}' if old is None else f'updated {noun}'


def routes_for(path, root, base, head):
    old, new = show(root, base, path), show(root, head, path)
    if old == new:
        return []
    for folder, noun, index in (('how-to', 'how-to', 'how-to index'), ('journal', 'article', 'journal index')):
        if path.startswith(f'{CONTENT}{folder}/') and path.endswith('.md'):
            was, now = status_of(old) if old is not None else None, status_of(new) if new is not None else None
            if now is None:  # removed: a draft never reached production
                reason, tag = 'removed', DRAFT if was == 'draft' else ''
            elif now == 'draft' and was == 'published':  # the page leaves production
                reason, tag = 'unpublished', ''
            else:
                reason, tag = verb(old, new, noun), DRAFT if now == 'draft' else ''
            return [(f'/{folder}/', index + tag), (f'/{folder}/{Path(path).stem}/', reason + tag)]
    for folder, noun in (('components', 'component page'), ('devices', 'device page')):
        if path.startswith(f'{CONTENT}{folder}/') and path.endswith('.json'):
            return [(f'/{folder}/{Path(path).stem}/', verb(old, new, noun))]
    if path == CONTENT + 'publication.json':
        before = {c['id']: c['version'] for c in (json.loads(old) if old else {}).get('components', [])}
        after = {c['id']: c['version'] for c in (json.loads(new) if new else {}).get('components', [])}
        out = [(f'/components/{i}/', 'version changed') for i in sorted(set(before) | set(after))
               if before.get(i) != after.get(i)]
        return out + [('/releases/', 'release ledger changed')]
    if path == CONTENT + 'docs.generated.json':
        before = {d['slug']: d['body'] for d in json.loads(old)} if old else {}
        after = {d['slug']: d['body'] for d in json.loads(new)} if new else {}
        return [(f'/docs/{s}/', verb(before.get(s), after.get(s), 'document'))
                for s in sorted(set(before) | set(after)) if before.get(s) != after.get(s)]
    if path.startswith(GENERATED):
        return []
    if path.startswith(SITE_CODE):
        return [('/', SITE_CODE_REASON)]
    return []


def merge_base(root, base, head):
    r = subprocess.run(['git', '-C', str(root), 'merge-base', base, head], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip() or f'no merge base for {base} and {head}')
    return r.stdout.strip()


def changed_routes(paths, root, base, head='HEAD'):
    """Sorted, unique (route, reason) pairs for the changed repository paths."""
    base = merge_base(root, base, head)
    found = {}
    for path in paths:
        for route, reason in routes_for(path, root, base, head):
            # a published change to a route outranks a draft one
            if route not in found or (found[route].endswith(DRAFT) and not reason.endswith(DRAFT)):
                found[route] = reason
    return sorted(found.items())


# Code that writes every index.md: a change here regenerates pages no content diff names.
MARKDOWN_CODE = re.compile(r'^website/src/(lib/(markdown|install)\.ts|app/.+/index\.md/route\.ts)$')


def published_pages(root, head):
    """Every page with an index.md at `head`, from the committed generated data; drafts left out."""
    def data(path, default):
        text = show(root, head, path)
        return json.loads(text) if text else default
    content = data(GENERATED + 'content.json', {})
    return (['/get-started/']
            + [f'/how-to/{h["slug"]}/' for h in data(GENERATED + 'howtos.json', []) if h.get('status') == 'published']
            + [f'/components/{c["id"]}/' for c in data(GENERATED + 'catalog.json', {}).get('components', [])]
            + [f'/devices/{d["id"]}/' for d in content.get('devices', [])]
            + [f'/journal/{a["slug"]}/' for a in content.get('articles', [])]
            + [f'/docs/{d["slug"]}/' for d in data(CONTENT + 'docs.generated.json', [])])


def agent_urls(urls, pages=()):
    """The changed pages plus their markdown copies and the llms files built from them (SPEC-020).
    `pages` are routes whose index.md changed although the page itself did not."""
    if not urls:
        return []
    extra = [SITE + p + 'index.md' for p in pages]
    for url in urls:
        path = url[len(SITE):]
        if path.count('/') > 2 or path == '/get-started/':  # a page, not a section index
            extra.append(url + 'index.md')
    extra += [SITE + '/llms.txt', SITE + '/llms-full.txt']
    return list(dict.fromkeys(urls + extra))


def render(routes, fmt, preview, markdown_pages=()):
    if fmt == 'urls':
        return agent_urls([SITE + r for r, why in routes if not why.endswith(DRAFT)], markdown_pages)
    if not routes:
        return ['no website changes']
    return [f'- [{r}]({preview.rstrip("/")}{r}) — {why}' if preview else f'- `{r}` — {why}' for r, why in routes]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--base', required=True)
    ap.add_argument('--head', default='HEAD')
    ap.add_argument('--preview-url')
    ap.add_argument('--format', choices=['markdown', 'urls'], default='markdown')
    ap.add_argument('--root', default='.')
    a = ap.parse_args(argv)
    base = merge_base(a.root, a.base, a.head)
    diff = subprocess.run(['git', '-C', a.root, 'diff', '--name-only', '--no-renames', base, a.head],
                          capture_output=True, text=True)
    if diff.returncode:
        sys.exit(diff.stderr.strip())
    paths = diff.stdout.split('\n')[:-1] if diff.stdout else []
    routes = changed_routes(paths, Path(a.root), base, a.head)
    pages = published_pages(Path(a.root), a.head) if any(MARKDOWN_CODE.match(p) for p in paths) else ()
    for line in render(routes, a.format, a.preview_url, pages):
        print(line)


if __name__ == '__main__':
    main()
