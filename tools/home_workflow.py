"""Install versioned staging guidance without overwriting a home's customization."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from agent_workspace import workspace, WorkspaceError
from domosenso_cli.home import HomeConfig

FILES = ('.ai/skills/stage-home-update/SKILL.md', 'docs/HOME_STAGING.md')
LINKS = {f'{client}/skills/stage-home-update': '../../.ai/skills/stage-home-update'
         for client in ('.agents', '.claude')}
MANIFEST = '.ai/home-workflow.json'


class WorkflowError(ValueError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_parent(root, path):
    for parent in path.parents:
        if parent == root:
            break
        if parent.is_symlink():
            raise WorkflowError(f'symlink parent refused: {parent}')
        if parent.exists() and not parent.is_dir():
            raise WorkflowError(f'non-directory parent: {parent}')


def current(path):
    if path.is_symlink():
        return {'link': str(path.readlink())}
    if path.is_file():
        return {'sha256': digest(path.read_bytes())}
    if path.exists():
        raise WorkflowError(f'conflict: {path} is not a file/link')
    return None


def install_workflow(home, source):
    home, source = Path(home).resolve(), Path(source).resolve()
    if home == source or home.is_relative_to(source):
        raise WorkflowError('home must be outside the catalog')
    try:
        root, _ = workspace(home)
    except WorkspaceError as exc:
        raise WorkflowError(str(exc)) from exc
    if root != home:
        raise WorkflowError('--home must name the worktree root')
    HomeConfig.load(home)
    # Preflight every destination before any write, including the ownership manifest.
    for rel in (*FILES, *LINKS, MANIFEST):
        safe_parent(home, home / rel)
    manifest = home / MANIFEST
    if manifest.is_symlink():
        raise WorkflowError('symlink manifest refused')
    old = {}
    if manifest.exists():
        try:
            previous = json.loads(manifest.read_text())
            if previous['format'] != 1 or not isinstance(previous['files'], dict):
                raise ValueError('unknown format')
            old = previous['files']
        except (ValueError, KeyError, TypeError) as exc:
            raise WorkflowError('invalid workflow ownership manifest') from exc
    data = {name: (source / name).read_bytes() for name in FILES}
    wanted = {name: {'sha256': digest(contents)} for name, contents in data.items()}
    wanted.update({name: {'link': target} for name, target in LINKS.items()})
    changed = []
    for name, desired in wanted.items():
        have = current(home / name)
        if have == desired:
            continue
        if have is not None and have != old.get(name):
            raise WorkflowError(f'conflict: modified or unmanaged {name}; review and preserve it first')
        changed.append(name)
    for name in changed:
        path = home / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() or path.is_symlink():
            path.unlink()
        if name in LINKS:
            path.symlink_to(LINKS[name])
        else:
            path.write_bytes(data[name])
    record = json.dumps({'format': 1, 'files': wanted}, indent=2) + '\n'
    manifest.parent.mkdir(parents=True, exist_ok=True)
    if not manifest.exists() or manifest.read_text() != record:
        manifest.write_text(record)
        changed.append(MANIFEST)
    return {'home': str(home), 'changed': changed,
            'next': 'Review/commit these files; read docs/HOME_STAGING.md. Hooks and client trust are unchanged.'}
