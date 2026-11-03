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


# SPEC-033: a control declaration compiles through the timer sidecar API, never reads.
CONTROL_INPUTS = {
    'lights': {'rooms': [{'id': 'office', 'group': 'light.office_group',
                         'name': {'en': 'Office', 'de': 'Büro', 'pl': 'Gabinet'}}],
               'lights': [{'entity': 'light.desk', 'label': {'en': 'Desk', 'pl': 'Biurko'}, 'room': 'office'}]},
    'awnings': {'node_id': 'demo', 'covers': [
        {'entity_id': 'cover.terrace', 'name': 'Terrace', 'shade_id': 1, 'room': 'terrace'}],
        'wind_sensor': 'binary_sensor.awnings_wind', 'notify': 'notify.demo',
        'wind_last_heard': {'id': 'wind_heard', 'name': 'Wind heard'}, 'wind_silent_hours': 4},
}
FIXTURES = ROOT / 'tests/fixtures/assistant-actions'


def control_bundle(cid, root=None, inputs=None, bindings=None, sha='b'*40, dirty=True):
    from assistant_actions import compile_actions as compile_artifact
    from domosenso_render import _make_env
    root = root or ROOT / 'components' / cid
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    assert 'assistant_actions' in manifest, f'{cid} has no action declaration'
    if bindings is None:
        env = _make_env(root, inputs if inputs is not None else CONTROL_INPUTS[cid], 'en', {}, {})
        bindings = yaml.safe_load(env.get_template('assistant-actions-bindings.yaml.j2').render())
    return compile_artifact(root, manifest, bindings, manifest['version'], sha, dirty)


@pytest.mark.parametrize('cid,ids', [
    ('lights', ['lights.turn_on', 'lights.turn_off']),
    ('awnings', ['awnings.extend', 'awnings.retract', 'awnings.stop']),
])
def test_control_compilation_preserves_provenance_and_read_identity(cid, ids):
    from domosenso_render import _make_env
    root = ROOT / 'components' / cid
    bundle = control_bundle(cid)
    version = yaml.safe_load((root / 'component.yaml').read_text())['version']
    assert bundle['schema'] == 1
    assert bundle['component'] == {'id': cid, 'version': version, 'commit': 'b'*40, 'dev': True}
    assert [a['id'] for a in bundle['definitions']['actions']] == ids
    for action in bundle['definitions']['actions']:
        assert action['revision'] == 1 and action['operation'] == 'write'
        assert action['parameters'] == {} and action['confirmation'] == 'none'
        assert action['action_type'] == 'control-action.v1'
        assert action['result_type'] == 'control-result.v1'
    env = _make_env(root, CONTROL_INPUTS[cid], 'en', {}, {})
    reads = yaml.safe_load(env.get_template('assistant-bindings.yaml.j2').render())
    for subject in bundle['bindings']['subjects']:
        original = next(s for s in reads['subjects'] if s['key'] == subject['key'])
        assert {k: v for k, v in subject.items() if k not in ('guard', 'group')} == original
    assert 'grant' not in bundle and 'enabled' not in bundle
    assert set(bundle['translations']) == {'en', 'de', 'pl'}
    if cid == 'lights':
        assert bundle['bindings']['subjects'][0]['label']['pl'] == 'Gabinet'
        assert bundle['translations']['pl']['meta']['assistant']['turn_on']['title'] == 'Włącz światło'
    else:
        assert bundle['bindings']['subjects'][0]['guard'] == {
            'wind': {'entity': 'binary_sensor.awnings_wind'},
            'last_heard': {'entity': 'input_datetime.wind_heard'}, 'max_age_seconds': 14400}


@pytest.mark.parametrize('cid', ['lights', 'awnings'])
def test_no_action_declaration_emits_no_sidecar_or_extra_package(tmp_path, cid):
    import shutil
    from domosenso_cli.build import plan_outputs
    from domosenso_cli.home import HomeConfig, ComponentEntry
    root = tmp_path / cid; shutil.copytree(ROOT / 'components' / cid, root)
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    assert 'assistant_actions' in manifest
    declaration = manifest.pop('assistant_actions')
    manifest['artifacts']['templates'].remove(declaration['bindings'])
    (root / declaration['bindings']).unlink()
    (root / 'component.yaml').write_text(yaml.safe_dump(manifest))
    source = tmp_path / 'inputs.yaml'; source.write_text(yaml.safe_dump(CONTROL_INPUTS[cid]))
    entry = ComponentEntry(cid, source, ['en'], {})
    home = HomeConfig(tmp_path, str(ROOT), tmp_path / 'ha', tmp_path / 'esphome', {}, {cid: entry})
    outputs = plan_outputs(home, entry, root, manifest['version'], 'a'*40)
    assert not any('assistant-actions' in o.dest for o in outputs)
    assert {o.dest for o in outputs if '/packages/' in o.dest} == {f'ha/packages/{cid}.yaml'}


@pytest.mark.parametrize('cid', ['lights', 'awnings'])
def test_control_sidecar_is_private_managed_and_read_bytes_unchanged(tmp_path, cid):
    import shutil
    from domosenso_cli.build import plan_outputs, write_outputs
    from domosenso_cli.home import HomeConfig, ComponentEntry
    from domosenso_cli.lock import Lock
    root = tmp_path / cid; shutil.copytree(ROOT / 'components' / cid, root)
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    assert 'assistant_actions' in manifest
    # Compare at the preceding provenance; a version bump intentionally changes provenance only.
    manifest['version'] = '0.3.0'
    (root / 'component.yaml').write_text(yaml.safe_dump(manifest))
    source = tmp_path / 'inputs.yaml'; source.write_text(yaml.safe_dump(CONTROL_INPUTS[cid]))
    entry = ComponentEntry(cid, source, ['en'], {})
    home = HomeConfig(tmp_path, str(ROOT), tmp_path / 'ha', tmp_path / 'esphome', {}, {cid: entry})
    outputs = plan_outputs(home, entry, root, '0.3.0', 'a'*40)
    by_path = {o.dest: o for o in outputs}
    sidecar = by_path[f'ha/domosenso/assistant-actions/{cid}.yaml']
    assert sidecar.layer == 'managed' and sidecar.from_ == 'assistant-actions.yaml'
    assert by_path[f'ha/domosenso/assistant/{cid}.yaml'].content == (FIXTURES / f'{cid}-read.yaml').read_bytes()
    assert {o.dest for o in outputs if '/packages/' in o.dest} == {f'ha/packages/{cid}.yaml'}
    write_outputs(home, Lock(), cid, outputs)
    assert (home.config_dir / f'domosenso/assistant-actions/{cid}.yaml').read_bytes() == sidecar.content


@pytest.mark.parametrize('value', [0, -1, float('nan'), float('inf'), -float('inf'), True, '3600', None])
def test_wind_guard_rejects_nonpositive_nonfinite_or_untyped_age(value):
    bindings = {'subjects': [{'key': 'cover.terrace', 'kind': 'awning', 'label': 'Terrace',
        'fields': {'cover': {'entity': 'cover.terrace'}}, 'guard': {
            'wind': {'entity': 'binary_sensor.awnings_wind'},
            'last_heard': {'entity': 'input_datetime.wind_heard'}, 'max_age_seconds': value}}], 'policies': []}
    with pytest.raises(ValueError): control_bundle('awnings', bindings=bindings)


def test_no_wind_or_implicit_cover_identity_never_invents_safety_mapping():
    inputs = {'covers': [{'name': 'Unmapped', 'shade_id': 1},
        {'name': 'Mapped', 'entity_id': 'cover.terrace', 'shade_id': 2}]}
    bundle = control_bundle('awnings', inputs=inputs)
    assert bundle['bindings'] == {'subjects': [
        {'key': 'cover.terrace', 'kind': 'awning', 'label': 'Mapped',
         'fields': {'cover': {'entity': 'cover.terrace'}}}], 'policies': []}


@pytest.mark.parametrize('mutate', [
    lambda d: d['actions'][0].update(service='light.turn_on'),
    lambda d: d['actions'][0].update(prompt='execute any request'),
    lambda d: d['actions'][0].update(revision=2),
    lambda d: d['actions'][0].update(id='covers.open'),
    lambda d: d['actions'][0].update(operation='timer'),
    lambda d: d['actions'][0].update(effect='toggle'),
    lambda d: d['actions'][0].update(parameters={'entity_id': {'type': 'string'}}),
    lambda d: d['actions'][0]['required_facts'][0]['source'].update(id='light.<undeclared>'),
    lambda d: d['actions'].append(copy.deepcopy(d['actions'][0])),
])
def test_controls_reject_executable_unknown_or_undeclared_definitions(tmp_path, mutate):
    import shutil
    root = tmp_path / 'lights'; shutil.copytree(ROOT / 'components/lights', root)
    path = root / 'assistant-actions.yaml'
    assert path.exists(), 'lights has no actions definition'
    data = yaml.safe_load(path.read_text()); mutate(data); path.write_text(yaml.safe_dump(data))
    with pytest.raises(ValueError): control_bundle('lights', root=root)


@pytest.mark.parametrize('path', ['../assistant-actions.yaml', '/tmp/actions.yaml', 'templates/../assistant-actions.yaml'])
def test_actions_reject_unsafe_definition_paths(tmp_path, path):
    from assistant_actions import load_actions
    root = ROOT / 'components/lights'
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    assert 'assistant_actions' in manifest
    manifest['assistant_actions']['definition'] = path
    with pytest.raises(ValueError, match='path'): load_actions(root, manifest)


def test_action_translation_fallback_and_strict_catalog_validation(tmp_path):
    import shutil
    from assistant_actions import load_actions
    from catalog_check import check_component
    root = tmp_path / 'lights'; shutil.copytree(ROOT / 'components/lights', root)
    assert (root / 'assistant-actions.yaml').exists()
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    path = root / 'translations/pl.json'; data = json.loads(path.read_text())
    del data['meta']['assistant']['turn_on']; path.write_text(json.dumps(data))
    _, translations = load_actions(root, manifest)
    assert translations['pl']['meta']['assistant']['turn_on'] == translations['en']['meta']['assistant']['turn_on']
    with pytest.raises(ValueError, match='translation'): load_actions(root, manifest, strict_translations=True)
    assert any('translation' in e for e in check_component(root / 'component.yaml'))


def test_recommendations_treat_action_bindings_as_metadata():
    from domosenso_cli.recommend import describes_only
    manifest = {'assistant_actions': {'bindings': 'templates/assistant-actions-bindings.yaml.j2'},
                'artifacts': {'templates': ['templates/assistant-actions-bindings.yaml.j2']}}
    assert describes_only(manifest)


def test_timer_sidecar_bytes_remain_compatible():
    assert compile_actions() == json.loads((FIXTURES / 'timers.json').read_text())


@pytest.mark.parametrize('mutate', [
    lambda b: b['subjects'][0].update(key='cover.different'),
    lambda b: b['subjects'].append(copy.deepcopy(b['subjects'][0])),
    lambda b: b['subjects'][0]['guard']['wind'].update(entity='sensor.wind'),
    lambda b: b['subjects'][0]['guard']['last_heard'].update(entity='sensor.heard'),
    lambda b: b['subjects'][0]['guard'].update(service='cover.open_cover'),
    lambda b: b['subjects'][0]['fields']['cover'].update(service='cover.open_cover'),
    lambda b: b['subjects'][0]['guard'].pop('last_heard'),
    lambda b: b['subjects'][0].update(enabled=True),
])
def test_controls_reject_invalid_or_executable_binding_fields(mutate):
    bindings = copy.deepcopy(control_bundle('awnings')['bindings']); mutate(bindings)
    with pytest.raises(ValueError): control_bundle('awnings', bindings=bindings)


@pytest.mark.parametrize('value', [True, False, 0, -2, float('nan'), float('inf'), '4'])
def test_wind_age_validation_survives_input_conversion(value):
    inputs = copy.deepcopy(CONTROL_INPUTS['awnings']); inputs['wind_silent_hours'] = value
    with pytest.raises(ValueError): control_bundle('awnings', inputs=inputs)


def test_awning_guard_shares_existing_package_silence_policy(tmp_path):
    import shutil
    root = tmp_path / 'awnings'; shutil.copytree(ROOT / 'components/awnings', root)
    partial = root / 'templates/_wind-defaults.jinja'
    partial.write_text(partial.read_text().replace('wind_silent_hours = 72', 'wind_silent_hours = 36'))
    inputs = copy.deepcopy(CONTROL_INPUTS['awnings']); inputs.pop('wind_silent_hours')
    inputs.pop('wind_last_heard')
    bundle = control_bundle('awnings', root=root, inputs=inputs)
    guard = bundle['bindings']['subjects'][0]['guard']
    assert guard['max_age_seconds'] == 129600
    assert guard['last_heard']['entity'] == 'input_datetime.awnings_wind_last_heard'
    render_component(root, inputs, tmp_path / 'out')
    package = (tmp_path / 'out/package.yaml').read_text()
    assert '> 36 * 3600' in package


@pytest.mark.parametrize('field,value', [('version','9.9.9'), ('sha','not-a-sha'), ('dirty','true')])
def test_control_provenance_must_be_exact_and_typed(field, value):
    from assistant_actions import compile_actions as compile_artifact
    root = ROOT / 'components/lights'; manifest = yaml.safe_load((root / 'component.yaml').read_text())
    params = {'version': manifest['version'], 'sha': 'a'*40, 'dirty': False}; params[field] = value
    with pytest.raises(ValueError):
        compile_artifact(root, manifest, control_bundle('lights')['bindings'], **params)


def test_actions_reject_symlink_and_oversize_definition(tmp_path):
    import shutil
    from assistant_actions import load_actions
    root = tmp_path / 'lights'; shutil.copytree(ROOT / 'components/lights', root)
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    (root / 'link.yaml').symlink_to(root / 'assistant-actions.yaml')
    manifest['assistant_actions']['definition'] = 'link.yaml'
    with pytest.raises(ValueError, match='symlink'): load_actions(root, manifest)
    manifest['assistant_actions']['definition'] = 'assistant-actions.yaml'
    (root / 'assistant-actions.yaml').write_bytes(b' '* (1024*1024+1))
    with pytest.raises(ValueError, match='size'): load_actions(root, manifest)


@pytest.mark.parametrize('cid', ['lights','awnings'])
def test_protocol_fixtures_match_real_compiler_output(cid):
    assert control_bundle(cid, dirty=False) == json.loads((FIXTURES / f'{cid}.json').read_text())


def test_metadata_template_without_declaration_never_becomes_package(tmp_path):
    import shutil
    from domosenso_cli.build import plan_outputs
    from domosenso_cli.home import HomeConfig, ComponentEntry
    root = tmp_path / 'lights'; shutil.copytree(ROOT / 'components/lights', root)
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    manifest.pop('assistant_actions')
    # The optional metadata template may still be present in a source checkout.
    (root / 'component.yaml').write_text(yaml.safe_dump(manifest))
    source = tmp_path / 'inputs.yaml'; source.write_text(yaml.safe_dump(CONTROL_INPUTS['lights']))
    entry = ComponentEntry('lights', source, ['en'], {})
    home = HomeConfig(tmp_path, str(ROOT), tmp_path / 'ha', tmp_path / 'esphome', {}, {'lights': entry})
    outputs = plan_outputs(home, entry, root, manifest['version'], 'a'*40)
    assert not any('assistant-actions' in o.dest for o in outputs)


def test_recommendations_ignore_reserved_optional_metadata_without_declaration():
    from domosenso_cli.recommend import describes_only
    assert describes_only({'artifacts': {'templates': ['templates/assistant-actions-bindings.yaml.j2']}})


def test_timer_compiler_still_rejects_control_binding_family():
    # A widened profile schema must not turn a wrong-family artifact into a KeyError.
    with pytest.raises(ValueError):
        compile_actions(bindings={'subjects': [{'key': 'light.desk', 'kind': 'light',
            'label': 'Desk', 'fields': {'light': {'entity': 'light.desk'}}}], 'policies': []})


def test_control_revision_is_an_integer_not_a_yaml_float(tmp_path):
    import shutil
    root = tmp_path / 'lights'; shutil.copytree(ROOT / 'components/lights', root)
    path = root / 'assistant-actions.yaml'; definition = yaml.safe_load(path.read_text())
    definition['actions'][0]['revision'] = 1.0
    path.write_text(yaml.safe_dump(definition))
    with pytest.raises(ValueError, match='revision'): control_bundle('lights', root=root)


def test_room_action_names_actual_upstream_group_without_changing_target():
    bundle = control_bundle('lights')
    proxy, member = bundle['bindings']['subjects']
    assert proxy['key'] == 'light.room_office'
    assert proxy['fields'] == {'light': {'entity': 'light.room_office'}}
    assert proxy['group'] == {'entity': 'light.office_group'}
    assert 'group' not in member
    inputs = {'rooms': [{'id': 'office', 'group': 'light.actual_hue_group', 'name': 'Office'}]}
    renamed = control_bundle('lights', inputs=inputs)['bindings']['subjects'][0]
    assert renamed['fields'] == proxy['fields']
    assert renamed['group'] == {'entity': 'light.actual_hue_group'}


@pytest.mark.parametrize('group', [
    {'entity': 'cover.office'}, {'entity': 'switch.office'}, {'entity': 'light.office;run'},
    {'entity': 'light.office_group', 'service': 'light.turn_on'},
    {'entity': 'light.office_group', 'prompt': 'execute'},
    'light.office_group', {},
])
def test_group_relation_rejects_wrong_sources_or_executable_fields(group):
    bindings = copy.deepcopy(control_bundle('lights')['bindings'])
    bindings['subjects'][0]['group'] = group
    with pytest.raises(ValueError): control_bundle('lights', bindings=bindings)


def test_group_relation_is_only_for_light_subjects():
    bindings = copy.deepcopy(control_bundle('awnings')['bindings'])
    bindings['subjects'][0]['group'] = {'entity': 'light.office_group'}
    with pytest.raises(ValueError): control_bundle('awnings', bindings=bindings)


def test_proxy_without_explicit_room_group_does_not_infer_relation():
    inputs = {'rooms': [{'id': 'office', 'name': 'Office'}],
              'lights': [{'entity': 'light.room_office', 'label': 'Office'}]}
    subject = control_bundle('lights', inputs=inputs)['bindings']['subjects'][0]
    assert subject == {'key': 'light.room_office', 'kind': 'light', 'label': 'Office',
                       'fields': {'light': {'entity': 'light.room_office'}}}


def test_group_relation_requires_an_upstream_declared_source(tmp_path):
    import shutil
    root = tmp_path / 'lights'; shutil.copytree(ROOT / 'components/lights', root)
    path = root / 'assistant-actions.yaml'; definitions = yaml.safe_load(path.read_text())
    # A provided proxy remains a valid target, but cannot authorize a group relation.
    for action in definitions['actions']:
        action['optional_facts'] = [copy.deepcopy(action['required_facts'][0])]
    path.write_text(yaml.safe_dump(definitions))
    bindings = {'subjects': [{'key': 'light.room_office', 'kind': 'light', 'label': 'Office',
        'fields': {'light': {'entity': 'light.room_office'}},
        'group': {'entity': 'light.room_office'}}], 'policies': []}
    with pytest.raises(ValueError, match='group'): control_bundle('lights', root=root, bindings=bindings)


def test_fictional_group_membership_fixture_exercises_overlap_and_growth():
    states = json.loads((FIXTURES / 'lights-membership.json').read_text())
    proxy = control_bundle('lights')['bindings']['subjects'][0]
    group = proxy['group']['entity']
    assert states['initial'][group]['attributes']['entity_id'] == ['light.desk']
    assert 'light.desk' in {s['fields']['light']['entity'] for s in control_bundle('lights')['bindings']['subjects']}
    assert states['expanded'][group]['attributes']['entity_id'] == ['light.desk', 'light.ceiling']
    assert states['initial'][proxy['fields']['light']['entity']]['attributes'] == {'component': 'lights'}
