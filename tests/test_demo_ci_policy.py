"""Exercise the real Actions selector without Docker or GitHub credentials."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent


def select(tmp_path, event, event_name='pull_request'):
    payload = tmp_path / 'event.json'
    output = tmp_path / 'output'
    summary = tmp_path / 'summary'
    payload.write_text(json.dumps(event))
    result = subprocess.run(
        [sys.executable, str(ROOT / 'tools/demo_ci_policy.py')],
        env={**os.environ, 'GITHUB_EVENT_NAME': event_name,
             'GITHUB_EVENT_PATH': str(payload), 'GITHUB_OUTPUT': str(output),
             'GITHUB_STEP_SUMMARY': str(summary)}, capture_output=True, text=True,
    )
    return result, output.read_text() if output.exists() else '', summary.read_text() if summary.exists() else ''


@pytest.mark.parametrize('action', ['opened', 'reopened', 'synchronize', 'labeled', 'unlabeled'])
@pytest.mark.parametrize('labels,expected', [
    ([], False), (['documentation'], False), (['run-demo'], True),
    (['run-demo', 'in-review'], True), (['do-not-run-demo'], False),
])
def test_pr_uses_current_exact_label_for_every_event(tmp_path, action, labels, expected):
    result, output, summary = select(tmp_path, {
        'action': action, 'label': {'name': 'in-review'},
        'pull_request': {'labels': [{'name': name} for name in labels]},
    })
    assert result.returncode == 0, result.stderr
    assert output == f'run={str(expected).lower()}\n'
    assert ('requested' if expected else 'skipped') in summary
    if not expected:
        assert 'not tested' in summary


def test_manual_dispatch_explicitly_requests_demo(tmp_path):
    result, output, summary = select(tmp_path, {}, 'workflow_dispatch')
    assert result.returncode == 0, result.stderr
    assert output == 'run=true\n'
    assert 'manual' in summary


@pytest.mark.parametrize('event,event_name', [
    ({}, 'pull_request'), ({'pull_request': {}}, 'pull_request'),
    ({'pull_request': {'labels': None}}, 'pull_request'),
    ({'pull_request': {'labels': [{}]}}, 'pull_request'),
    ({'pull_request': {'labels': [{'name': 123}]}}, 'pull_request'),
    ({}, 'push'), ({}, 'pull_request_target'),
])
def test_malformed_or_unsupported_event_fails_without_skip_pass(tmp_path, event, event_name):
    result, output, _ = select(tmp_path, event, event_name)
    assert result.returncode != 0
    assert output == ''
    assert 'FAIL' in result.stderr


def test_workflow_gates_expensive_steps_and_keeps_failures_visible():
    workflow = yaml.load((ROOT / '.github/workflows/demo.yml').read_text(), Loader=yaml.BaseLoader)
    assert set(workflow['on']) == {'pull_request', 'workflow_dispatch'}
    assert set(workflow['on']['pull_request']['types']) >= {
        'opened', 'reopened', 'synchronize', 'labeled', 'unlabeled',
    }
    assert workflow['permissions'] == {'contents': 'read'}
    assert workflow['concurrency']['cancel-in-progress'] == 'true'
    steps = workflow['jobs']['demo']['steps']
    policy = next(i for i, step in enumerate(steps) if step.get('id') == 'policy')
    assert 'python3 tools/demo_ci_policy.py' == steps[policy]['run']
    assert policy == 1 and steps[0]['uses'].startswith('actions/checkout@')
    heavy = steps[policy + 1:]
    assert any(step.get('run') == 'uv run tools/dev_home/ci.py' for step in heavy)
    for step in heavy:
        assert "steps.policy.outputs.run == 'true'" in step.get('if', ''), step
        assert step.get('continue-on-error', 'false') == 'false'
        if step.get('uses', '').startswith('actions/upload-artifact@'):
            assert 'always()' in step['if']
        else:
            assert 'always()' not in step['if'], step
