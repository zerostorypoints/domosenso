#!/usr/bin/env python3
"""Bootstrap isolated local staging for a private home; see docs/HOME_STAGING.md."""
import argparse
import json
from pathlib import Path
import sys

from dev_home import DemoError
from domosenso_cli.errors import DomosensoError
from home_staging import HomeStaging


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, required=True)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ['up', 'status', 'target', 'down', 'reset']:
        command = commands.add_parser(name)
        command.add_argument('--name', required=True)
        if name == 'up':
            command.add_argument('--port', type=int)
        if name == 'reset':
            command.add_argument('--confirm', required=True)
    args = parser.parse_args(argv)
    try:
        staging = HomeStaging(args.home, args.name, Path(__file__).resolve().parents[1])
        with staging.locked():
            if args.command == 'up':
                result = staging.up(args.port)
            elif args.command == 'reset':
                result = staging.reset(args.confirm)
            else:
                result = getattr(staging, args.command)()
        print(json.dumps(result, indent=2))
        return 0
    except (DemoError, DomosensoError, OSError, ValueError, KeyError) as exc:
        print(f'FAIL {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
