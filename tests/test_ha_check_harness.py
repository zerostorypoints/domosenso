"""The shell checker must fail before validating an incomplete installation."""
import os
from pathlib import Path
import subprocess

SCRIPT = Path(__file__).resolve().parents[1] / 'tools' / 'ha-check.sh'


def run_check(tmp_path, instance='', rendered=()):
    component = tmp_path / 'components' / 'sample'
    (component / 'templates').mkdir(parents=True)
    (component / 'component.yaml').write_text('id: sample\n' + instance)
    inputs = tmp_path / 'examples' / 'demo-home' / 'inputs'
    inputs.mkdir(parents=True)
    (inputs / 'sample.yaml').write_text('{}')
    (tmp_path / 'tools').mkdir()
    bins = tmp_path / 'bin'
    bins.mkdir()
    uv = bins / 'uv'
    uv.write_text('''#!/usr/bin/env python3
import pathlib, sys
args=sys.argv
if any('domosenso_render.py' in x for x in args):
    out=pathlib.Path(args[args.index('--out')+1]); out.mkdir(parents=True)
    for name in filter(None, __import__('os').environ.get('CHECK_RENDERED', '').split(',')):
        (out/name).write_text('x: 1')
if any('check_config_parse.py' in x for x in args):
    pathlib.Path(args[-2]+'.count').write_text('0')
''')
    uv.chmod(0o755)
    docker = bins / 'docker'
    docker.write_text('#!/bin/sh\ntouch "$CHECK_DOCKER_CALLED"\necho "{}"\n')
    docker.chmod(0o755)
    env = {**os.environ, 'PATH': str(bins)+os.pathsep+os.environ['PATH'],
           'TMPDIR': str(tmp_path/'scratch'), 'CHECK_DOCKER_CALLED': str(tmp_path/'called'),
           'CHECK_RENDERED': ','.join(rendered)}
    return subprocess.run(['bash',str(SCRIPT),'sample'],cwd=tmp_path,env=env,capture_output=True,text=True)


def test_optional_empty_render_has_no_copy_error(tmp_path):
    result = run_check(tmp_path)
    assert result.returncode == 0, result.stderr
    assert 'cannot stat' not in result.stderr and 'No such file' not in result.stderr


def test_missing_declared_instance_stops_before_docker(tmp_path):
    result = run_check(tmp_path, '  ha_instance: missing.yaml\n')
    assert result.returncode != 0
    assert not (tmp_path/'called').exists()


def test_every_language_template_becomes_a_dashboard(tmp_path):
    # A second dashboard rendered per language (ramka's settings, SPEC-020) is no package.
    result = run_check(tmp_path, rendered=('package.yaml', 'dashboard.en.yaml', 'sample-settings.en.yaml'))
    assert result.returncode == 0, result.stderr
    [fresh] = (tmp_path/'scratch'/'domosenso-ha-check').glob('*/sample/fresh')
    assert sorted(p.name for p in (fresh/'packages').iterdir()) == ['sample.yaml']
    assert sorted(p.name for p in (fresh/'dashboards').iterdir()) == ['sample-settings.en.yaml', 'sample.en.yaml']
    assert 'filename: dashboards/sample-settings.en.yaml' in (fresh/'configuration.yaml').read_text()
