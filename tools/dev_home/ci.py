#!/usr/bin/env python3
"""Clean-runner acceptance: own one demo, retain safe evidence, remove Docker resources."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dev_home.checks import check
from dev_home.runtime import Demo, DemoError, IMAGE, run


def collect_evidence(demo):
    """An allowlist, never an upload of the generated home or its credentials."""
    demo.ensure(False)
    paths = [demo.path / name for name in [
        'check.json', 'browser.json', 'browser.stdout', 'browser.stderr',
        'config-check.json', 'config-check.stderr',
    ]]
    paths.extend((demo.path / 'screenshots').glob('*.png'))
    return {str(path.relative_to(demo.path)): path.read_bytes() for path in paths if path.is_file()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-only', action='store_true', help='omit browser acceptance explicitly')
    args = parser.parse_args(argv)
    demo = Demo(Path(__file__).resolve().parents[2], f'gate-{os.getpid()}')
    exit_code = 0
    try:
        with demo.locked():
            if demo.path.exists():
                raise DemoError(f'refusing an existing gate instance: {demo.path}')
            # Preparation is distinct from isolated runtime; CI pulls this image in a prior step.
            run(['docker', 'info'], timeout=15)
            run(['docker', 'image', 'inspect', IMAGE], timeout=15)
            try:
                demo.up()
                result = check(demo, runtime_only=args.runtime_only)
                print(result['scope'], flush=True)
            except (DemoError, OSError, ValueError, KeyError) as exc:
                print(f'FAIL {exc}', file=sys.stderr)
                exit_code = 1
            finally:
                if demo.path.exists():
                    evidence = collect_evidence(demo)
                    try:
                        demo.reset(demo.name)
                    except DemoError as exc:
                        print(f'FAIL cleanup: {exc}', file=sys.stderr)
                        exit_code = 1
                    else:
                        # Retain only a new ownership marker and the allowlisted evidence.
                        demo.ensure()
                        for name, content in evidence.items():
                            target = demo.path / 'evidence' / name
                            target.parent.mkdir(parents=True, exist_ok=True)
                            target.write_bytes(content)
                        print(f'evidence: {demo.path}/evidence', flush=True)
    except (DemoError, OSError, ValueError, KeyError) as exc:
        print(f'FAIL {exc}', file=sys.stderr)
        return 1
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
