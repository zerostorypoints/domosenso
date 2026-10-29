#!/usr/bin/env python3
"""Prepare a named linked worktree, then start Codex or Claude Code there."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

from agent_workspace import WorkspaceError, git, workspace


def main():
    # Arguments after -- belong to the agent (prompt/model/etc.), never to Git.
    raw = sys.argv[1:]
    split = raw.index('--') if '--' in raw else len(raw)
    forwarded = raw[split + 1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('agent', choices=['codex', 'claude'])
    parser.add_argument('name')
    parser.add_argument('--base', default='origin/main')
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args(raw[:split])
    try:
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', args.name):
            raise WorkspaceError('name must be 1–64 lowercase letters/digits/hyphens, starting with a letter or digit')
        forbidden = {'--cd', '-C', '--worktree', '-w', '--bare', '--safe-mode',
                     '--setting-sources', '--settings', '--disable', '--config', '-c',
                     '--dangerously-bypass-hook-trust', '--resume', '-r', '--continue',
                     '--from-pr', '--teleport', '--remote', 'resume', 'fork', 'attach',
                     'respawn', 'app', 'remote-control', 'cloud'}
        if any(arg.split('=', 1)[0] in forbidden or arg.startswith(('-C', '-c', '-r', '-w')) for arg in forwarded):
            raise WorkspaceError('startup override would bypass the prepared workspace or hook setup')
        binary = shutil.which(args.agent)
        if not args.prepare_only and not binary:
            raise WorkspaceError(f'missing prerequisite: {args.agent}')
        current = Path.cwd()
        first = git(current, 'worktree', 'list', '--porcelain').splitlines()[0]
        if not first.startswith('worktree '):
            raise WorkspaceError('cannot locate primary checkout')
        primary = Path(first[len('worktree '):]).resolve()
        directory = primary / '.worktrees'
        if directory.is_symlink():
            raise WorkspaceError('worktree directory must not be a symlink')
        ignored = subprocess.run(['git', '-C', str(primary), 'check-ignore', '-q', str(directory / 'probe')])
        if ignored.returncode:
            raise WorkspaceError('.worktrees/ must be ignored before preparing a session')
        setting = subprocess.run(['git', '-C', str(primary), 'config', '--get', 'core.hooksPath'], text=True, capture_output=True)
        if setting.returncode not in (0, 1):
            raise WorkspaceError('cannot read Git hook configuration')
        if setting.stdout.strip() not in ('', '.githooks'):
            raise WorkspaceError(f'existing core.hooksPath={setting.stdout.strip()}; integrate guards manually, do not overwrite it')
        if args.base == 'origin/main':
            git(primary, 'fetch', 'origin', 'main', timeout=120)
        sha = git(primary, 'rev-parse', '--verify', '--end-of-options', args.base + '^{commit}')
        for required in ('tools/agent_workspace.py', '.codex/hooks.json', '.claude/settings.json', 'AGENTS.md'):
            try:
                git(primary, 'cat-file', '-e', f'{sha}:{required}')
            except WorkspaceError as exc:
                raise WorkspaceError('base predates the agent workflow; merge/pull it first or select an authorised updated --base') from exc
        path = directory / f'{args.agent}-{args.name}'
        branch = f'{args.agent}/{args.name}'
        if path.exists():
            raise WorkspaceError(f'worktree already exists: {path}; resume that session explicitly')
        git(primary, 'worktree', 'add', '-b', branch, str(path), sha)
        git(primary, 'config', '--local', 'core.hooksPath', '.githooks')
        workspace(path)
        print(f'Prepared {path} [{branch}]', flush=True)
        print('Review/trust project hooks in the agent UI before task work; see docs/AGENT_WORKFLOW.md.', flush=True)
        if args.prepare_only:
            return 0
        os.chdir(path)
        os.execv(binary, [binary, *forwarded])
    except (WorkspaceError, OSError, subprocess.SubprocessError) as exc:
        print(f'agent session refused: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
