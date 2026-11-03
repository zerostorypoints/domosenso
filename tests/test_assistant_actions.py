"""SPEC-031 command metadata is typed, private, and never an access grant."""
import copy
import importlib
import json
from pathlib import Path

import pytest
import yaml
from domosenso_render import render_component, RenderError

ROOT = Path(__file__).resolve().parents[1]


def compile_actions(root=None, bindings=None):
    root = root or ROOT / 'components/timers'
    module = importlib.import_module('assistant_actions')
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    return module.compile_actions(root, manifest, bindings or {'subjects': [
        {'key':'general','kind':'timer','label':'General','fields':{'timer':{'entity':'timer.domosenso_general'}}}
    ], 'policies':[]}, manifest['version'], 'a'*40, False)


def test_typed_actions_are_separate_from_reads_and_grants():
    artifact = compile_actions()
    assert artifact['schema'] == 1
    assert {x['id'] for x in artifact['definitions']['actions']} == {
        'timers.start', 'timers.pause', 'timers.resume', 'timers.cancel'}
    assert 'grant' not in json.dumps(artifact)
    assert all(x['operation'] == 'timer' for x in artifact['definitions']['actions'])
    assert set(artifact['translations']) == {'en','de','pl'}


@pytest.mark.parametrize('mutate', [
    lambda d: d['actions'][0].update(id='lights.start'),
    lambda d: d['actions'][0].update(service='shell_command.run'),
    lambda d: d['actions'][0].update(revision=2),
    lambda d: d['actions'][0].update(effect='eval'),
    lambda d: d['actions'].append(copy.deepcopy(d['actions'][0])),
    lambda d: d['actions'][0]['parameters']['durationSeconds'].update(maximum=100000),
])
def test_command_definition_rejects_unsafe_or_unknown_shapes(tmp_path, mutate):
    import shutil
    root=tmp_path/'timers'; shutil.copytree(ROOT/'components/timers', root)
    path=root/'assistant-actions.yaml'; definition=yaml.safe_load(path.read_text())
    mutate(definition); path.write_text(yaml.safe_dump(definition))
    with pytest.raises(ValueError): compile_actions(root)


@pytest.mark.parametrize('entity', ['script.start','timer.bad;service','timer.general/extra'])
def test_action_bindings_only_core_timer_entities(entity):
    with pytest.raises(ValueError):
        compile_actions(bindings={'subjects':[{'key':'x','kind':'timer','label':'X','fields':{'timer':{'entity':entity}}}], 'policies':[]})


def test_timer_render_restore_and_escaped_labels(tmp_path):
    render_component(ROOT/'components/timers', {'prefix':'demo','timers':[
        {'id':'cooking','label':'Cooking: lunch','duration_seconds':65}]}, tmp_path, ['en'])
    data=yaml.safe_load((tmp_path/'package.yaml').read_text())
    assert data['timer']['demo_cooking'] == {'name':'Cooking: lunch','duration':65,'restore':True}
    assert 'assistant' not in data


@pytest.mark.parametrize('rows', [
    [{'id':'x','label':'X','duration_seconds':0}],
    [{'id':'x','label':'X','duration_seconds':86401}],
    [{'id':'x','label':'X','duration_seconds':True}],
    [{'id':'x','label':'X','duration_seconds':5},{'id':'x','label':'Y','duration_seconds':6}],
    [{'id':'x/evil','label':'X','duration_seconds':5}],
])
def test_timer_render_rejects_invalid_inputs(tmp_path, rows):
    with pytest.raises(RenderError):
        render_component(ROOT/'components/timers', {'prefix':'demo','timers':rows}, tmp_path, ['en'])


def test_ha_clock_is_explicit_and_restricted():
    from assistant_contract import load_definition
    root=ROOT/'components/ramka'; manifest=yaml.safe_load((root/'component.yaml').read_text())
    definitions,_=load_definition(root,manifest)
    clock=next(x for x in definitions['capabilities'] if x['id']=='ramka.current_time')
    assert clock['runtime_source']=='ha_clock'
    assert clock['required_facts']==[]


def test_actions_render_to_private_artifact_not_ha_package(tmp_path):
    from domosenso_cli.build import plan_outputs
    from domosenso_cli.home import HomeConfig, ComponentEntry
    path=tmp_path/'inputs.yaml';path.write_text('prefix: demo\n')
    entry=ComponentEntry('timers',path,['en'],{})
    home=HomeConfig(tmp_path,str(ROOT),tmp_path/'ha',tmp_path/'esphome',{}, {'timers':entry})
    outputs=plan_outputs(home,entry,ROOT/'components/timers','0.1.0','a'*40)
    dests={x.dest:x for x in outputs}
    assert set(dests)=={'ha/packages/timers.yaml','ha/domosenso/assistant/timers.yaml','ha/domosenso/assistant-actions/timers.yaml'}
    assert yaml.safe_load(dests['ha/domosenso/assistant-actions/timers.yaml'].content)['definitions']['actions'][0]['id']=='timers.start'


def test_ha_clock_cannot_be_declared_on_other_capabilities(tmp_path):
    import shutil
    from assistant_contract import load_definition
    root=tmp_path/'ramka';shutil.copytree(ROOT/'components/ramka',root)
    p=root/'assistant.yaml';definition=yaml.safe_load(p.read_text())
    definition['capabilities'][0]['runtime_source']='ha_clock';p.write_text(yaml.safe_dump(definition))
    with pytest.raises(ValueError):load_definition(root,yaml.safe_load((root/'component.yaml').read_text()))


def test_runtime_extension_does_not_change_legacy_read_artifact(tmp_path):
    from assistant_contract import compile_profile, split_runtime_profile
    root=ROOT/'components/ramka'; manifest=yaml.safe_load((root/'component.yaml').read_text())
    render_component(root, yaml.safe_load((ROOT/'examples/demo-home/inputs/ramka.yaml').read_text()), tmp_path, ['en'])
    bindings=yaml.safe_load((tmp_path/'assistant-bindings.yaml').read_text())
    full=compile_profile(root, manifest, bindings, manifest['version'], 'a'*40, False)
    legacy,runtime=split_runtime_profile(full)
    assert [c['id'] for c in legacy['definitions']['capabilities']]==['ramka.status','ramka.explain']
    assert [c['id'] for c in runtime['definitions']['capabilities']]==['ramka.current_time']
    assert 'current_time' not in json.dumps(legacy)
    assert runtime['definitions']['capabilities'][0]['runtime_source']=='ha_clock'
    # The original strict schema rejects unknown fields; use an independent baseline schema.
    from jsonschema import Draft202012Validator
    schema=json.loads((ROOT/'tests/fixtures/assistant-v1-profile.schema.json').read_text())
    Draft202012Validator(schema).validate(legacy)
    assert full['definitions']['capabilities'][-1]['id']=='ramka.current_time'


def test_runtime_read_artifact_has_separate_managed_destination(tmp_path):
    from domosenso_cli.build import plan_outputs
    from domosenso_cli.home import HomeConfig, ComponentEntry
    path=ROOT/'examples/demo-home/inputs/ramka.yaml'
    entry=ComponentEntry('ramka',path,['en'],{})
    home=HomeConfig(tmp_path,str(ROOT),tmp_path/'ha',tmp_path/'esphome',{}, {'ramka':entry})
    manifest=yaml.safe_load((ROOT/'components/ramka/component.yaml').read_text())
    outputs=plan_outputs(home,entry,ROOT/'components/ramka',manifest['version'],'a'*40)
    dests={x.dest:x for x in outputs}
    assert 'ha/domosenso/assistant-runtime/ramka.yaml' in dests
    old=yaml.safe_load(dests['ha/domosenso/assistant/ramka.yaml'].content)
    assert 'runtime_source' not in json.dumps(old)


def test_all_cli_compiler_dependencies_are_packaged():
    import tomllib
    config=tomllib.loads((ROOT/'pyproject.toml').read_text())
    assert 'assistant_actions' in config['tool']['setuptools']['py-modules']
