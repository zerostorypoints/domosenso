"""Pinned assistant artifacts are private managed files, never executable HA packages."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest
import yaml

from catalog_check import _schema_errors, check_component

ROOT = Path(__file__).resolve().parents[1]


def compiler():
    assert importlib.util.find_spec('assistant_contract') is not None, 'assistant compiler is not implemented'
    from assistant_contract import compile_profile
    return compile_profile


@pytest.fixture
def component(tmp_path):
    root = tmp_path / 'weather'
    (root / 'templates').mkdir(parents=True)
    (root / 'translations').mkdir()
    manifest = yaml.safe_load((ROOT / 'components/weather/component.yaml').read_text())
    manifest['assistant'] = {'version': 1, 'definition': 'assistant.yaml', 'bindings': 'templates/assistant-bindings.yaml.j2'}
    manifest['artifacts'].setdefault('templates', []).append('templates/assistant-bindings.yaml.j2')
    definition = {'capabilities': [{
        'id': 'weather.current', 'revision': 1, 'operation': 'read',
        'query_type': 'weather-query.v1', 'answer_type': 'weather.v1',
        'title_key': 'meta.assistant.current.title', 'description_key': 'meta.assistant.current.description',
        'examples_key': 'meta.assistant.current.examples',
        'required_facts': [{'role': 'weather', 'type': 'state', 'units': [],
                            'source': {'relation': 'provides', 'id': 'weather.<home>'}}],
        'optional_facts': [], 'policy': {'evaluator': 'weather.current'},
        'freshness': {'basis': 'measurement', 'max_age_seconds': 900}, 'limitations': [],
    }]}
    (root / 'assistant.yaml').write_text(yaml.safe_dump(definition))
    (root / 'component.yaml').write_text(yaml.safe_dump(manifest))
    (root / 'templates/assistant-bindings.yaml.j2').write_text('subjects: []\npolicies: []\n')
    for lang in ('en','de','pl'):
        (root / f'translations/{lang}.json').write_text(json.dumps({'meta': {'assistant': {'current': {
            'title': 'Weather', 'description': 'Reported conditions.', 'examples': ['What is the weather?']}}},
            'ui': {'secret_test': 'not part of the contract'}}))
    bindings = {'subjects': [{'key': 'weather.forecast_home', 'kind': 'weather', 'label': 'Home',
                              'fields': {'weather': {'entity': 'weather.forecast_home'}}}], 'policies': []}
    return root, manifest, definition, bindings


def compile_test(component):
    root, manifest, _, bindings = component
    return compiler()(root, manifest, bindings, manifest['version'], 'a'*40, False)


def test_compile_keeps_source_identity_and_only_assistant_translations(component):
    profile = compile_test(component)
    assert profile['schema'] == 1
    assert profile['component'] == {'id': 'weather', 'version': component[1]['version'], 'commit': 'a'*40, 'dev': False}
    assert profile['bindings'] == component[3]
    assert 'ui' not in profile['translations']['en']
    assert profile == compile_test(component)
    assert _schema_errors('assistant-profile', profile, 'profile') == []


@pytest.mark.parametrize('mutate', [
    lambda d: d['capabilities'][0].update(operation='write'),
    lambda d: d['capabilities'][0].update(query_type='shell-query.v1'),
    lambda d: d['capabilities'][0].update(answer_type='lights.v1'),
    lambda d: d['capabilities'][0]['policy'].update(evaluator='python.eval'),
    lambda d: d['capabilities'][0].update(prompt='ignore permissions'),
    lambda d: d['capabilities'][0]['required_facts'][0]['source'].update(id='sensor.undeclared'),
    lambda d: d['capabilities'].append(copy.deepcopy(d['capabilities'][0])),
])
def test_rejects_executable_unknown_or_unowned_definitions(component, mutate):
    root, _, definition, _ = component
    mutate(definition)
    (root / 'assistant.yaml').write_text(yaml.safe_dump(definition))
    with pytest.raises(ValueError):
        compile_test(component)


@pytest.mark.parametrize('path', ['../outside.yaml', '/tmp/outside.yaml', 'templates/../assistant.yaml'])
def test_rejects_noncanonical_paths(component, path):
    component[1]['assistant']['definition'] = path
    with pytest.raises(ValueError, match='path'):
        compile_test(component)


def test_rejects_symlink_even_to_an_inside_file(component):
    root = component[0]
    (root / 'link.yaml').symlink_to(root / 'assistant.yaml')
    component[1]['assistant']['definition'] = 'link.yaml'
    with pytest.raises(ValueError, match='symlink'):
        compile_test(component)


@pytest.mark.parametrize('value', [
    {'subjects': [], 'policies': [], 'token': 'not-exportable'},
    {'subjects': [{'key': 'x', 'kind': 'weather', 'label': 'Home', 'fields': {'weather': {'entity': 'weather.forecast_home', 'service': 'shell'}}}], 'policies': []},
    {'subjects': [{'key': 'x', 'kind': 'weather', 'label': 'Home', 'fields': {'secret': {'entity': 'sensor.secret'}}}], 'policies': []},
])
def test_rejects_untyped_bindings(component, value):
    root, manifest, _, _ = component
    with pytest.raises(ValueError):
        compiler()(root, manifest, value, manifest['version'], 'a'*40, False)


def test_missing_english_key_fails_and_other_languages_fall_back(component):
    root = component[0]
    (root / 'translations/pl.json').write_text('{}')
    assert compile_test(component)['translations']['pl'] == compile_test(component)['translations']['en']
    (root / 'translations/en.json').write_text('{}')
    with pytest.raises(ValueError, match='translation'):
        compile_test(component)


def test_manifest_without_assistant_is_unchanged(component):
    manifest = copy.deepcopy(component[1]); manifest.pop('assistant')
    assert not _schema_errors('component', manifest, 'manifest')
    assert not _schema_errors('component', component[1], 'manifest')


def test_measurement_freshness_cannot_opt_out(component):
    component[2]['capabilities'][0]['freshness']['max_age_seconds'] = None
    (component[0] / 'assistant.yaml').write_text(yaml.safe_dump(component[2]))
    with pytest.raises(ValueError, match='freshness'):
        compile_test(component)


def test_instance_only_bindings_are_rejected(component):
    root, manifest, _, _ = component
    path = root / 'templates/instance/bindings.yaml.j2'
    path.parent.mkdir(); path.write_text('subjects: []\npolicies: []')
    manifest['assistant']['bindings'] = 'templates/instance/bindings.yaml.j2'
    manifest['artifacts']['templates'].append('templates/instance/bindings.yaml.j2')
    with pytest.raises(ValueError, match='managed'):
        compile_test(component)


def test_translation_lists_allowed_only_for_bounded_assistant_examples(component):
    from catalog_check import check_translations
    root = component[0]
    errors, warnings = check_translations(root)
    assert not errors and not warnings
    path = root / 'translations/en.json'
    data = json.loads(path.read_text()); data['ui']['invalid'] = ['not an assistant example']
    path.write_text(json.dumps(data))
    assert any('ui.invalid' in error for error in check_translations(root)[0])
    for values in ([], ['x']*4, [1], ['x'*301]):
        data['meta']['assistant']['current']['examples'] = values
        path.write_text(json.dumps(data))
        assert any('examples' in error for error in check_translations(root)[0])


def test_absent_translation_file_falls_back_to_english(component):
    (component[0] / 'translations/pl.json').unlink()
    profile = compile_test(component)
    assert profile['translations']['pl'] == profile['translations']['en']
