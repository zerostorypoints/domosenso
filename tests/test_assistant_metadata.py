"""Canonical authoring produces separate v1/v2 artifacts without widening access."""
import copy
import json
import shutil
from pathlib import Path

import pytest
import yaml

from assistant_contract import compile_profile, validate
from domosenso_render import render_component
from test_assistant_contract import component

ROOT = Path(__file__).resolve().parents[1]
SHA = 'a' * 40


def metadata(component):
    from assistant_metadata import compile_metadata
    root, manifest, _, bindings = component
    return compile_metadata(root, manifest, bindings, manifest['version'], SHA, False)


def save(component):
    (component[0] / 'assistant.yaml').write_text(yaml.safe_dump(component[2]))


def opt_in(component):
    cap = component[2]['capabilities'][0]
    cap['client'] = {'version': 2, 'anchors_key': 'meta.assistant.current.anchors',
                     'selectors': ['area', 'subject'],
                     'presentation': {'summary': ['weather'], 'details': []}}
    for lang in ('en', 'de', 'pl'):
        path = component[0] / f'translations/{lang}.json'
        data = json.loads(path.read_text())
        data['meta']['assistant']['current']['anchors'] = ['weather', 'conditions']
        path.write_text(json.dumps(data))
    save(component)


def legacy(component):
    return compile_profile(component[0], component[1], component[3], component[1]['version'], SHA, False)


def test_opt_in_preserves_exact_legacy_projection_and_has_one_semantic_source(component):
    original = yaml.safe_dump(legacy(component), sort_keys=False)
    opt_in(component)
    artifact = metadata(component)
    assert yaml.safe_dump(legacy(component), sort_keys=False) == original
    assert artifact['schema'] == 2 and artifact['component']['commit'] == SHA
    assert artifact['definitions'] == component[2]
    assert artifact['bindings'] == component[3]
    assert artifact['translations']['en']['meta']['assistant']['current']['anchors'] == ['weather', 'conditions']
    assert artifact == metadata(component)
    validate('frame-assistant-metadata', artifact)
    # A policy edit propagates from the single canonical declaration.
    component[2]['capabilities'][0]['freshness']['max_age_seconds'] = 1200
    save(component)
    assert metadata(component)['definitions']['capabilities'][0]['freshness']['max_age_seconds'] == 1200
    assert legacy(component)['definitions']['capabilities'][0]['freshness']['max_age_seconds'] == 1200


def test_no_client_means_no_sidecar(component):
    assert metadata(component) is None


def test_alias_only_changes_are_private_v2_data(component):
    opt_in(component)
    original = yaml.safe_dump(legacy(component), sort_keys=False)
    before = metadata(component)
    subject = component[3]['subjects'][0]
    subject.update(roomKey='living-room', roomLabel='Living room')
    # Compare at the same canonical room/provenance.
    baseline = yaml.safe_dump(legacy(component), sort_keys=False)
    subject['aliases'] = {'en': ['station'], 'pl': ['stacja']}
    subject['roomAliases'] = {'en': ['lounge']}
    assert yaml.safe_dump(legacy(component), sort_keys=False) == baseline
    assert 'aliases' not in legacy(component)['bindings']['subjects'][0]
    assert metadata(component) != before
    assert metadata(component)['bindings']['subjects'][0]['aliases'] == subject['aliases']
    assert original != baseline  # adding a real room identity is not an alias-only edit
    strict = copy.deepcopy(legacy(component))
    strict['bindings']['subjects'][0]['aliases'] = subject['aliases']
    with pytest.raises(ValueError):
        validate('assistant-profile', strict)


@pytest.mark.parametrize('mutate', [
    lambda c: c['client'].update(version=3),
    lambda c: c['client'].update(script='run'),
    lambda c: c['client'].update(selectors=['subject', 'subject']),
    lambda c: c['client']['presentation'].update(summary=['undeclared']),
    lambda c: c['client']['presentation'].update(details=[{'layout': 'html', 'roles': ['weather'], 'label_key': 'meta.assistant.current.title'}]),
    lambda c: c['client'].update(anchors_key='ui.secret_test'),
])
def test_rejects_unsafe_or_unbound_client_fields(component, mutate):
    opt_in(component)
    mutate(component[2]['capabilities'][0]); save(component)
    with pytest.raises(ValueError):
        metadata(component)


@pytest.mark.parametrize('annotations', [
    {'aliases': {'en': ['']}}, {'aliases': {'en': ['x'] * 17}},
    {'aliases': {'fr': ['station']}}, {'aliases': {'en': ['x' * 121]}},
    {'aliases': {'en': ['bad\u202etext']}}, {'roomAliases': {'en': ['lounge']}},
    {'prompt': 'run'},
])
def test_rejects_invalid_annotations_in_both_projections(component, annotations):
    opt_in(component)
    component[3]['subjects'][0].update(annotations)
    for compile_ in (metadata, legacy):
        with pytest.raises(ValueError):
            compile_(component)


def test_conflicting_room_aliases_fail_and_cross_subject_ambiguity_is_retained(component):
    opt_in(component)
    one = component[3]['subjects'][0]
    one.update(roomKey='living-room', roomAliases={'en': ['lounge']}, aliases={'en': ['station']})
    two = copy.deepcopy(one); two['key'] = 'second'; two['roomAliases'] = {'en': ['hall']}
    component[3]['subjects'].append(two)
    with pytest.raises(ValueError, match='room.*alias'):
        metadata(component)
    two['roomAliases'] = copy.deepcopy(one['roomAliases'])
    assert len(metadata(component)['bindings']['subjects']) == 2


def test_client_translations_fall_back_but_missing_english_or_bad_phrases_fail(component):
    opt_in(component)
    path = component[0] / 'translations/pl.json'; path.write_text('{}')
    assert metadata(component)['translations']['pl'] == metadata(component)['translations']['en']
    data = json.loads((component[0] / 'translations/en.json').read_text())
    for value in ([], ['x'] * 17, ['bad\nphrase'], ['x' * 121], 'not a list'):
        data['meta']['assistant']['current']['anchors'] = value
        (component[0] / 'translations/en.json').write_text(json.dumps(data))
        with pytest.raises(ValueError):
            metadata(component)


@pytest.mark.parametrize('metric,unit', [('temperature', '°C'), ('humidity', '%')])
def test_new_capability_uses_reviewed_generic_primitive_without_id_registration(component, metric, unit):
    opt_in(component)
    root, manifest, definitions, bindings = component
    manifest['id'] = 'workbench'
    source = f'sensor.workbench_{metric}'
    manifest.setdefault('upstream', []).append({'id': source})
    cap = definitions['capabilities'][0]
    cap.update(id=f'workbench.station_{metric}', query_type='measurement-query.v1', answer_type='measurement.v1',
               required_facts=[{'role': metric, 'type': 'number', 'units': [unit],
                                'source': {'relation': 'upstream', 'id': source}}],
               policy={'evaluator': 'measurement.v1'})
    cap['client']['presentation']['summary'] = [metric]
    bindings['subjects'][0]['fields'] = {metric: {'entity': source}}
    save(component)
    artifact = metadata(component)
    assert artifact['definitions']['capabilities'][0]['id'] == f'workbench.station_{metric}'
    assert artifact['bindings']['subjects'][0]['fields'][metric]['entity'] == source
    assert legacy(component) is None  # never ship a new query type to a strict old Bridge
    cap['policy']['evaluator'] = 'execute.v1'; save(component)
    with pytest.raises(ValueError):
        metadata(component)


def test_every_existing_catalog_capability_has_a_canonical_projection_without_opt_in_release(tmp_path):
    total = 0
    for source in sorted((ROOT / 'components').iterdir()):
        if not (source / 'component.yaml').is_file():
            continue
        root = tmp_path / source.name; shutil.copytree(source, root)
        manifest = yaml.safe_load((root / 'component.yaml').read_text())
        definitions = yaml.safe_load((root / 'assistant.yaml').read_text())
        for cap in definitions['capabilities']:
            roles = list(dict.fromkeys(x['role'] for x in cap['required_facts'] + cap['optional_facts']))
            cap['client'] = {'version': 2, 'anchors_key': cap['title_key'] + '_anchors',
                             'selectors': ['subject'], 'presentation': {'summary': roles[:3], 'details': []}}
            for lang in ('en', 'de', 'pl'):
                p = root / f'translations/{lang}.json'; data = json.loads(p.read_text())
                values = data
                parts = cap['client']['anchors_key'].split('.')
                for key in parts[:-1]:
                    values = values[key]
                values[parts[-1]] = ['read']
                p.write_text(json.dumps(data))
        (root / 'assistant.yaml').write_text(yaml.safe_dump(definitions))
        path = ROOT / f'examples/demo-home/inputs/{source.name}.yaml'
        inputs = yaml.safe_load(path.read_text()) if path.exists() else {
            'remote-access': {'hostname': 'ha.example.org', 'token_file': '/secret/token'},
            'floorplan': {}, 'calendar': {'calendar': 'calendar.family'},
            'weather': {'weather': 'weather.forecast_home'}, 'media': {'media_player': 'media_player.player'},
        }[source.name]
        # A component that uses the shared home inputs (uses_home) renders with the demo home's.
        home = ({'home': yaml.safe_load((ROOT / 'examples/demo-home/home.inputs.yaml').read_text())}
                if manifest.get('uses_home') else {})
        out = tmp_path / ('out-' + source.name); render_component(root, inputs, out, **home)
        bindings = yaml.safe_load((out / 'assistant-bindings.yaml').read_text())
        artifact = metadata((root, manifest, definitions, bindings))
        assert {x['id'] for x in artifact['definitions']['capabilities']} == {x['id'] for x in definitions['capabilities']}
        total += len(definitions['capabilities'])
    assert total == 40  # main's 39 and pocket.explain (feature/pocket)


def test_catalog_accepts_only_declared_anchor_phrase_lists(component):
    from catalog_check import check_translations
    opt_in(component)
    assert check_translations(component[0]) == ([], [])
    p = component[0] / 'translations/en.json'; data = json.loads(p.read_text())
    data['meta']['assistant']['undeclared'] = ['not declared as anchors']
    p.write_text(json.dumps(data))
    assert any('undeclared' in x for x in check_translations(component[0])[0])


def test_unselected_capability_sources_do_not_enter_v2_projection(component):
    opt_in(component)
    other = copy.deepcopy(component[2]['capabilities'][0]); other.pop('client')
    other.update(id='weather.forecast', policy={'evaluator': 'weather.forecast'})
    other['required_facts'][0]['role'] = 'other'
    component[2]['capabilities'].append(other); save(component)
    component[3]['subjects'][0]['fields']['other'] = {'entity': 'weather.second'}
    assert 'other' not in metadata(component)['bindings']['subjects'][0]['fields']
    assert 'other' in legacy(component)['bindings']['subjects'][0]['fields']


@pytest.mark.parametrize('annotation', [
    {'aliases': {'en': ['   ']}}, {'aliases': {'en': ['\t']}},
])
def test_blank_alias_is_rejected(component, annotation):
    opt_in(component); component[3]['subjects'][0].update(annotation)
    with pytest.raises(ValueError):
        metadata(component)


def test_duplicate_yaml_keys_are_rejected(component):
    opt_in(component)
    text = (component[0] / 'assistant.yaml').read_text()
    (component[0] / 'assistant.yaml').write_text(text + '\n' + text)
    with pytest.raises(ValueError, match='duplicate'):
        metadata(component)


def test_yaml_aliases_are_rejected(component):
    opt_in(component)
    other = copy.deepcopy(component[2]['capabilities'][0])
    other.update(id='weather.forecast', policy={'evaluator': 'weather.forecast'})
    other['client'] = component[2]['capabilities'][0]['client']  # PyYAML writes a real alias.
    component[2]['capabilities'].append(other); save(component)
    assert '*id' in (component[0] / 'assistant.yaml').read_text()
    with pytest.raises(ValueError, match='alias'):
        metadata(component)


def test_native_schema_embeds_the_current_canonical_authoring_schema():
    author = json.loads((ROOT / 'schemas/assistant.schema.json').read_text())
    native = json.loads((ROOT / 'schemas/frame-assistant-metadata.schema.json').read_text())
    assert native['properties']['definitions'] == author


def fixture_component(tmp_path, *, both=True):
    source = yaml.safe_load((ROOT / 'tests/fixtures/assistant-metadata-canonical/source.yaml').read_text())
    root = tmp_path / 'workbench'; (root / 'templates').mkdir(parents=True); (root / 'translations').mkdir()
    if not both:
        source['definitions']['capabilities'] = source['definitions']['capabilities'][:1]
        source['bindings']['subjects'][0]['fields'].pop('humidity')
    (root / 'assistant.yaml').write_text(yaml.safe_dump(source['definitions']))
    (root / 'templates/assistant-bindings.yaml.j2').write_text(yaml.safe_dump(source['bindings']))
    for lang, values in source['translations'].items():
        (root / f'translations/{lang}.json').write_text(json.dumps(values))
    return root, source['manifest'], source['definitions'], source['bindings']


@pytest.mark.parametrize('both,name', [(False, 'temperature-only.json'), (True, 'temperature-humidity.json')])
def test_shared_native_fixtures_are_reproducible_and_checksum_pinned(tmp_path, both, name):
    import hashlib
    directory = ROOT / 'tests/fixtures/assistant-metadata-canonical'
    artifact = metadata(fixture_component(tmp_path, both=both))
    data = (json.dumps(artifact, indent=2, sort_keys=True, ensure_ascii=False) + '\n').encode()
    assert (directory / name).read_bytes() == data
    digests = {path: digest for digest, path in (line.split() for line in (directory / 'SHA256SUMS').read_text().splitlines())}
    for filename in [name, 'source.yaml']:
        assert hashlib.sha256((directory / filename).read_bytes()).hexdigest() == digests[filename]
    assert hashlib.sha256((ROOT / 'schemas/frame-assistant-metadata.schema.json').read_bytes()).hexdigest() == digests['../../../schemas/frame-assistant-metadata.schema.json']


@pytest.mark.parametrize('field,value', [
    ('title', ['wrong type']), ('description', {'text': 'wrong type'}),
    ('title', 'bad\nlabel'), ('examples', ['x' * 241]), ('examples', ['x'] * 9),
])
def test_native_localized_text_is_typed_and_bounded(component, field, value):
    opt_in(component)
    p = component[0] / 'translations/en.json'; values = json.loads(p.read_text())
    values['meta']['assistant']['current'][field] = value
    p.write_text(json.dumps(values))
    with pytest.raises(ValueError):
        metadata(component)
