#!/usr/bin/env python3
"""Install the shared home-staging skill and guide into a home worktree."""
import argparse
import json
from pathlib import Path
import sys

from domosenso_cli.errors import DomosensoError
from home_workflow import WorkflowError, install_workflow


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(install_workflow(args.home, Path(__file__).resolve().parents[1]), indent=2))
        return 0
    except (WorkflowError, DomosensoError, OSError) as exc:
        print(f'FAIL {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
