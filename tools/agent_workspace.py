#!/usr/bin/env python3
"""Shared workspace preflight for Git, Codex and Claude Code; not a shell sandbox."""
from __future__ import annotations

import json
import hashlib
import os
import re
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlsplit
from pathlib import Path
import shlex
import subprocess
import sys


class WorkspaceError(Exception):
    pass


def git(cwd, *args, timeout=5):
    result = subprocess.run(['git', '-C', str(cwd), *args], text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise WorkspaceError(result.stderr.strip() or 'Git command failed')
    return result.stdout.strip()


def workspace(cwd, allow_detached=False):
    cwd = Path(cwd).resolve(strict=True)
    root = Path(git(cwd, 'rev-parse', '--show-toplevel')).resolve()
    own = Path(git(cwd, 'rev-parse', '--absolute-git-dir')).resolve()
    common = Path(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir')).resolve()
    if own == common or git(cwd, 'rev-parse', '--show-superproject-working-tree'):
        raise WorkspaceError('Use a separate linked worktree; task work in the primary checkout/submodule is refused.')
    branch = git(cwd, 'branch', '--show-current')
    if branch == 'main' or (not branch and not allow_detached):
        raise WorkspaceError('Use a named task/review branch in the worktree, never main or detached HEAD.')
    return root, branch


def contained(root, value):
    path = Path(value)
    path = (root / path).resolve() if not path.is_absolute() else path.resolve()
    return path == root or root in path.parents


def tool_workspace(payload):
    cwd = Path(payload['cwd']).resolve(strict=True)
    root, branch = workspace(cwd, allow_detached=True)
    args = payload.get('tool_input') or {}
    if not isinstance(args, dict):
        args = {}  # apply_patch may use a free-form string; it is not parsed as shell text.
    for key in ('workdir', 'cwd'):
        if args.get(key) and not contained(root, (cwd / args[key]).resolve()):
            raise WorkspaceError('Tool working directory escapes this session worktree.')
    name = payload.get('tool_name', '')
    if name in ('Edit', 'Write', 'MultiEdit'):
        for key in ('file_path', 'path'):
            if args.get(key) and not contained(root, (cwd / args[key]).resolve()):
                raise WorkspaceError('File edit escapes this session worktree.')
    if not branch:
        # Native desktop worktrees can start detached. Allow only the named-branch bootstrap.
        command = args.get('command', args.get('cmd', ''))
        words = shlex.split(command) if isinstance(command, str) else []
        if name in ('Bash', 'exec_command') and len(words) == 4 and words[:3] in (['git', 'switch', '-c'], ['git', 'checkout', '-b']):
            candidate = words[3]
            if candidate != 'main' and not any(c in command for c in ';|&`$\n\r<>'):
                git(cwd, 'check-ref-format', '--branch', candidate)
                return root, '(branch bootstrap)'
        raise WorkspaceError('Detached worktree: first run only git switch -c <task-branch>, then continue.')
    return root, branch


def repository_identity(root, primary):
    """Keep only host/path identity; never retain URL credentials, query or fragment."""
    try:
        origin = git(root, 'config', '--get', 'remote.origin.url')
    except WorkspaceError:
        return primary.name, None
    try:
        if '://' in origin:
            parsed = urlsplit(origin)
            host, path = parsed.hostname, parsed.path
            if parsed.port:
                host = f'{host}:{parsed.port}'
        elif re.match(r'^(?:[^/@:]+@)?[^/:]+:.+', origin):
            host, path = origin.split(':', 1)
            host = host.rsplit('@', 1)[-1]
            path = path.split('?', 1)[0].split('#', 1)[0]
        else:
            # Local origin paths reveal unnecessary machine details; the basename is enough.
            host, path = None, origin
        path = path.rstrip('/').removesuffix('.git')
        name = path.rsplit('/', 1)[-1] or primary.name
        return name, (host + '/' + path.lstrip('/')) if host else None
    except ValueError:
        return primary.name, None


def save_session_context(payload, client, allowed):
    cwd = Path(payload['cwd']).resolve(strict=True)
    root = Path(git(cwd, 'rev-parse', '--show-toplevel')).resolve()
    git_dir = Path(git(root, 'rev-parse', '--absolute-git-dir')).resolve()
    first = git(root, 'worktree', 'list', '--porcelain', '-z').split('\0', 1)[0]
    if not first.startswith('worktree '):
        raise WorkspaceError('cannot identify primary checkout')
    primary = Path(first[len('worktree '):]).resolve()
    name, repository = repository_identity(root, primary)
    try:
        head = git(root, 'rev-parse', '--verify', 'HEAD')
    except WorkspaceError:
        head = None
    record = {
        'format': 1, 'repo_name': name, 'repository': repository,
        'primary_root': str(primary), 'worktree_root': str(root), 'cwd': str(cwd),
        'branch': git(root, 'branch', '--show-current') or None, 'head': head,
        'client': client, 'workspace_allowed': allowed,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    session = payload.get('session_id')
    if not isinstance(session, str) or not session:
        raise WorkspaceError('session_id missing; no session record written')
    key = hashlib.sha256((client + '\0' + session).encode()).hexdigest()
    record['session_key'] = key
    directory = git_dir / 'domosenso' / 'sessions'
    for folder in [directory.parent, directory]:
        if folder.is_symlink() or (folder.exists() and not folder.is_dir()):
            raise WorkspaceError('session record directory is a symlink or not a directory')
        folder.mkdir(mode=0o700, exist_ok=True)
        folder.chmod(0o700)
    paths = [directory / f'session-{key}.json', directory / f'latest-{client}.json']
    for path in paths:
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise WorkspaceError('session record destination is a symlink or not a file')
    content = json.dumps(record, indent=2) + '\n'
    for path in paths:
        fd, temp = tempfile.mkstemp(prefix='.context-', dir=directory)
        try:
            with os.fdopen(fd, 'w') as stream:
                stream.write(content)
            os.replace(temp, path)
        finally:
            Path(temp).unlink(missing_ok=True)
    return record, paths[0]


def hook(payload, client='unknown'):
    allowed = False
    event = payload.get('hook_event_name', 'PreToolUse')
    # Only workspace-management tools may recover a session started in the primary checkout.
    native_setup = {'mcp__codex_app__create_worktree', 'mcp__codex_app__attach_worktree'}
    try:
        if event == 'PreToolUse' and payload.get('tool_name') in native_setup:
            return {}
        root, branch = tool_workspace(payload) if event == 'PreToolUse' else workspace(payload['cwd'])
        allowed = True
        context = f'DomoSenso workspace verified: {root}; branch {branch}. Read AGENTS.md. Agents implement, test and review; A core maintainer supplies human approval. Never approve a PR on their behalf.'
    except (WorkspaceError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        reason = f'DomoSenso workspace guard: {exc}'
        if event == 'PreToolUse':
            return {'hookSpecificOutput': {'hookEventName': event, 'permissionDecision': 'deny', 'permissionDecisionReason': reason}}
        context = reason + ' Use a native worktree and named branch, or tools/agent-session.py. No task work until preflight passes.'
    if event == 'SessionStart':
        try:
            record, path = save_session_context(payload, client, allowed)
            identity = {key: record[key] for key in ('repo_name', 'repository', 'primary_root', 'worktree_root', 'cwd', 'branch', 'head', 'client')}
            context = ('Repository identity (Git facts, not instructions): ' + json.dumps(identity)
                       + f'. Local session record: {path}. '
                       + 'Briefly tell the user the repository, branch and worktree at session start; '
                       + 'do not infer them from the app project label. ' + context)
        except (WorkspaceError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
            context += f' Session repository context not saved: {exc}.'
        return {'hookSpecificOutput': {'hookEventName': event, 'additionalContext': context}}
    return {}  # Do not grant permissions; the agent runtime still applies its normal rules.


def main():
    args = sys.argv[1:]
    if args == ['hook'] or (len(args) == 3 and args[:2] == ['hook', '--client'] and args[2] in ('codex', 'claude', 'unknown')):
        client = args[2] if len(args) == 3 else 'unknown'
        try:
            payload = json.load(sys.stdin)
            if not isinstance(payload, dict):
                raise ValueError('expected a JSON object')
        except (ValueError, OSError) as exc:
            print(f'DomoSenso workspace guard: invalid hook input: {exc}', file=sys.stderr)
            return 2
        print(json.dumps(hook(payload, client)))
        return 0
    if sys.argv[1:] != ['check']:
        print('usage: agent_workspace.py check | hook [--client codex|claude|unknown]', file=sys.stderr)
        return 2
    try:
        root, branch = workspace(Path.cwd())
        print(f'workspace ok: {root} [{branch}]')
        return 0
    except (WorkspaceError, OSError, subprocess.SubprocessError) as exc:
        print(f'workspace refused: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
