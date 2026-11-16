#!/usr/bin/env python3
"""Package selected enclosure files and shared .org instructions at an immutable Git revision."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/zerostorypoints/domosenso'


def section(text, heading):
    match = re.search(rf'^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
    if not match:
        raise ValueError(f'Missing section: {heading}')
    return match[1].strip()


def safe_path(path):
    if not path or PurePosixPath(path).is_absolute() or '..' in PurePosixPath(path).parts or '\\' in path:
        raise ValueError(f'Unsafe package path: {path}')
    return path


def links(text, source, revision):
    """Keep shared Markdown intact; resolve its relative links against the same revision."""
    import posixpath
    def replace(match):
        target = match[2]
        if re.match(r'^(https?://|mailto:)', target):
            return match[0]
        path, sep, anchor = target.partition('#')
        path = posixpath.normpath(posixpath.join(posixpath.dirname(source), path)) if path else source
        safe_path(path)
        base = f'https://raw.githubusercontent.com/zerostorypoints/domosenso/{revision}' if match[1].startswith('!') else f'{REPO}/blob/{revision}'
        return f'{match[1]}{base}/{path}{sep}{anchor})'
    return re.sub(r'(!?\[[^\]]*\]\()([^\s)]+)\)', replace, text)


def package_model(item, revision, read, output):
    model_id = item['id']
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', model_id):
        raise ValueError('Unsafe model id')
    folder = f'devices/enclosures/{model_id}'
    paths = [f'{folder}/{safe_path(p)}' for p in item['files']]
    device = safe_path(item['device'])
    readme = f'{folder}/README.md'
    paths += [device, readme, 'LICENSE', 'NOTICE']
    paths += [safe_path(p) for p in item.get('extraFiles', [])]
    # Read everything before creating output: a missing part must never yield a partial package.
    data = {p: read(p) for p in sorted(set(paths))}
    body = [f"# {item['title']}", links(section(data[device].decode(), item['heading']), device, revision)]
    for heading in item['sections']:
        body += [f'## {heading}', links(section(data[readme].decode(), heading), readme, revision)]
    body += ['## Source and license', f'Original DomoSenso design. Apache-2.0; LICENSE and NOTICE are included.\n\nSource revision: `{revision}`. CAD illustrations show assembly; they are not photographs of printed parts.']
    description = '\n\n'.join(body) + '\n'
    dest = output / model_id
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'description.md').write_text(description)
    with zipfile.ZipFile(dest / f'{model_id}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, content in data.items():
            info = zipfile.ZipInfo(path, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
        archive.writestr(zipfile.ZipInfo('START-HERE.md', date_time=(2026, 1, 1, 0, 0, 0)), f"# {item['title']}\n\n[Parts, printing and assembly]({readme}).\n\nSource revision: {revision}.\n")
    manifest = {'id': model_id, 'title': item['title'], 'sourceRevision': revision,
                'website': f"https://domosenso.org/devices/{Path(device).stem}/",
                'makerworldUrl': item.get('makerworldUrl'),
                'sha256': {p: hashlib.sha256(v).hexdigest() for p, v in data.items()}}
    (dest / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for path, content in data.items():
        if '/preview/' in path:
            (dest / Path(path).name).write_bytes(content)
    return dest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True, help='Full source commit SHA; all inputs are read from Git')
    parser.add_argument('--out', type=Path, required=True, help='Dedicated delivery directory')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.revision):
        parser.error('--revision must be a full commit SHA')
    def read(path):
        return subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{args.revision}:{path}'])
    catalog = json.loads(read('devices/enclosures/makerworld.json'))
    for item in catalog['models']:
        print(package_model(item, args.revision, read, args.out))


if __name__ == '__main__':
    main()
