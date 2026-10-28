#!/usr/bin/env python3
"""Shared workspace preflight for Git, Codex and Claude Code; not a shell sandbox."""
from __future__ import annotations

import json
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


def hook(payload):
    event = payload.get('hook_event_name', 'PreToolUse')
    # Only workspace-management tools may recover a session started in the primary checkout.
    native_setup = {'mcp__codex_app__create_worktree', 'mcp__codex_app__attach_worktree'}
    try:
        if event == 'PreToolUse' and payload.get('tool_name') in native_setup:
            return {}
        root, branch = tool_workspace(payload) if event == 'PreToolUse' else workspace(payload['cwd'])
        context = f'DomoSenso workspace verified: {root}; branch {branch}. Read AGENTS.md. Agents implement, test and review; A core maintainer supplies human approval. Never approve a PR on their behalf.'
    except (WorkspaceError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        reason = f'DomoSenso workspace guard: {exc}'
        if event == 'PreToolUse':
            return {'hookSpecificOutput': {'hookEventName': event, 'permissionDecision': 'deny', 'permissionDecisionReason': reason}}
        context = reason + ' Use a native worktree and named branch, or tools/agent-session.py. No task work until preflight passes.'
    if event == 'SessionStart':
        return {'hookSpecificOutput': {'hookEventName': event, 'additionalContext': context}}
    return {}  # Do not grant permissions; the agent runtime still applies its normal rules.


def main():
    if sys.argv[1:] == ['hook']:
        try:
            payload = json.load(sys.stdin)
            if not isinstance(payload, dict):
                raise ValueError('expected a JSON object')
        except (ValueError, OSError) as exc:
            print(f'DomoSenso workspace guard: invalid hook input: {exc}', file=sys.stderr)
            return 2
        print(json.dumps(hook(payload)))
        return 0
    if sys.argv[1:] != ['check']:
        print('usage: agent_workspace.py check|hook', file=sys.stderr)
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
