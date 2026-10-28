#!/usr/bin/env python3
"""Run a fictional catalog demo; see docs/LOCAL_DEVELOPMENT.md."""
import argparse
import json
from pathlib import Path
import sys

from dev_home import Demo, DemoError


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ['up', 'status', 'scenario', 'check', 'down', 'reset']:
        command = commands.add_parser(name)
        command.add_argument('--name', required=True)
        if name == 'up':
            command.add_argument('--port', type=int)
        if name == 'scenario':
            command.add_argument('scene')
        if name == 'check':
            command.add_argument('--runtime-only', action='store_true', help='run runtime checks only; browser acceptance is not run')
        if name == 'reset':
            command.add_argument('--confirm', required=True)
    args = parser.parse_args(argv)
    try:
        demo = Demo(Path(__file__).resolve().parents[1], args.name)
        with demo.locked():
            if args.command == 'up':
                result = demo.up(args.port)
            elif args.command == 'scenario':
                result = demo.scenario(args.scene)
            elif args.command == 'reset':
                result = demo.reset(args.confirm)
            elif args.command == 'check':
                from dev_home.checks import check
                result = check(demo, runtime_only=args.runtime_only)
            else:
                result = getattr(demo, args.command)()
        print(json.dumps(result, indent=2))
        return 0
    except (DemoError, OSError, ValueError, KeyError) as exc:
        print(f'FAIL {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
