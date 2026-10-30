#!/usr/bin/env python3
"""Select opt-in demo acceptance from the Actions event, before costly setup."""
import json
import os
from pathlib import Path
import sys


def decision(event_name, event):
    if event_name == 'workflow_dispatch':
        return True, 'manual workflow dispatch'
    if event_name != 'pull_request':
        raise ValueError('unsupported demo event')
    # Use the current label set, not the label which triggered the event. An
    # unrelated label change must not turn an enabled failure into a skipped pass.
    labels = event['pull_request']['labels']
    if not isinstance(labels, list) or any(
        not isinstance(label, dict) or not isinstance(label.get('name'), str)
        for label in labels
    ):
        raise ValueError('invalid PR labels')
    enabled = any(label['name'] == 'run-demo' for label in labels)
    return enabled, '`run-demo` label present' if enabled else '`run-demo` label absent'


def main():
    try:
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        enabled, reason = decision(os.environ['GITHUB_EVENT_NAME'], event)
        summary = f'## Demo {"requested" if enabled else "skipped"}\n\n{reason}.\n'
        if enabled:
            summary += '\nRuntime/browser results follow in the job steps and evidence artifact.\n'
        else:
            summary += '\nDemo runtime and browser behaviour were **not tested**. Add `run-demo` to request acceptance.\n'
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as stream:
            stream.write(summary)
        with Path(os.environ['GITHUB_OUTPUT']).open('a') as stream:
            stream.write(f'run={str(enabled).lower()}\n')
        print(summary)
        return 0
    except (OSError, KeyError, TypeError, ValueError) as exc:
        print(f'FAIL demo selection: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
