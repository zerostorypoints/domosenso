from pathlib import Path
import json
import shutil
import yaml
from domosenso_render import _make_env, render_component

ROOT = Path(__file__).resolve().parents[1]


def component_bindings(component, inputs, _defaults=None):
    env = _make_env(ROOT / 'components' / component, inputs, 'en', {}, {})
    return yaml.safe_load(env.get_template('assistant-bindings.yaml.j2').render())


def plant_bindings(inputs):
    return component_bindings('plants', inputs)


def plant_rows(inputs):
    env = _make_env(ROOT / 'components/plants', inputs, 'en', {}, {})
    return env.get_template('_plant-rows.jinja').module.rows


def ramka_bindings(inputs, _limits):
    return component_bindings('ramka', inputs)


def air_policies(inputs, _limits):
    return component_bindings('ramka', inputs)['policies']


def air_limits():
    env = _make_env(ROOT / 'components' / 'ramka', {}, 'en', {}, {})
    return env.get_template('_air-policy.jinja').module.air_limits


CAPABILITIES = {
    'plants': {'watering_need', 'status', 'last_watered', 'water_in'},
    'climate-air': {'temperature', 'humidity', 'status', 'air_readings', 'air_assessment'},
    'media': {'now_playing', 'status', 'mains'}, 'lights': {'status'}, 'calendar': {'agenda'},
    'weather': {'current', 'forecast'}, 'bermuda-presence': {'observations'},
    'awnings': {'status', 'wind'}, 'audio-sensor': {'level'}, 'backup': {'status'}, 'ramka': {'status', 'current_time'}, 'timers': {'status'},
    'remote-access': set(), 'floorplan': set(),
}


def test_ramka_air_defaults_are_pinned_to_component_revision(tmp_path):
    source = ROOT / 'components' / 'ramka'
    component = tmp_path / 'ramka'
    shutil.copytree(source, component)
    inputs = yaml.safe_load((ROOT / 'examples/demo-home/inputs/ramka.yaml').read_text())
    render_component(component, inputs, tmp_path / 'before')
    partial = component / 'templates' / '_air-policy.jinja'
    original = partial.read_text()
    assert '800, 1200' in original
    partial.write_text(original.replace('800, 1200', '850, 1250'))
    render_component(component, inputs, tmp_path / 'after')
    before = tmp_path / 'before'
    after = tmp_path / 'after'
    policy = yaml.safe_load((after / 'assistant-bindings.yaml').read_text())['policies']
    co2 = next(p for p in policy if p['metric'] == 'co2')
    assert co2['levels'] == [850, 1250]
    package = (after / 'package.yaml').read_text()
    assert 'entity_id: input_number.ramka_air_co2_raised\n            data:\n              value: 850' in package
    assert 'entity_id: input_number.ramka_air_co2_high\n            data:\n              value: 1250' in package
    for lang in ('en', 'de', 'pl'):
        dashboard = (after / f'dashboard.{lang}.yaml').read_text()
        assert 'input_number.ramka_air_co2_raised, default: 850' in dashboard
        assert 'input_number.ramka_air_co2_high, default: 1250' in dashboard
        assert (after / f'ramka-settings.{lang}.yaml').read_bytes() == (before / f'ramka-settings.{lang}.yaml').read_bytes()
    assert not (after / '_air-policy.jinja').exists()


def test_audio_and_somfy_bind_only_guaranteed_ids():
    audio = component_bindings('audio-sensor', {'sensors': [{'room': 'living-room', 'area': 'Living room',
        'entities': {'level': 'sensor.explicit'}, 'id_prefix': 'custom_room'}]},
        {'audio_prefixes': {'living-room': 'custom_room'}})['subjects'][0]
    assert audio['fields']['offset']['entity'] == 'sensor.custom_room_spl_offset'
    assert audio['fields']['calibrated']['entity'] == 'input_boolean.custom_room_spl_calibrated'
    awning = component_bindings('awnings', {'covers': [{'name': 'Awning', 'shade_id': 1}],
        'wind_sensor': 'binary_sensor.wind', 'wind_last_heard': {'id': 'custom_heard', 'name': 'Wind'}})
    assert len(awning['subjects']) == 1
    assert awning['subjects'][0]['fields']['last_heard']['entity'] == 'input_datetime.custom_heard'


def test_audio_and_wind_defaults_follow_component_templates(tmp_path):
    audio_dir = tmp_path / 'audio-sensor'
    awning_dir = tmp_path / 'awnings'
    shutil.copytree(ROOT / 'components/audio-sensor', audio_dir)
    shutil.copytree(ROOT / 'components/awnings', awning_dir)
    audio_inputs = {'sensors': [{'room': 'living-room', 'area': 'Living room',
                                'entities': {'level': 'sensor.explicit'}}]}
    wind_inputs = {'covers': [], 'node_id': 'somfy', 'wind_sensor': 'binary_sensor.wind',
                   'notify': 'notify.example'}
    render_component(audio_dir, audio_inputs, tmp_path / 'audio')
    render_component(awning_dir, wind_inputs, tmp_path / 'wind')
    audio = yaml.safe_load((tmp_path / 'audio/assistant-bindings.yaml').read_text())['subjects'][0]
    wind = yaml.safe_load((tmp_path / 'wind/assistant-bindings.yaml').read_text())['subjects'][0]
    audio_package = (tmp_path / 'audio/package.yaml').read_text()
    wind_package = (tmp_path / 'wind/package.yaml').read_text()
    assert audio['fields']['offset']['entity'] == 'sensor.living_room_spl_offset'
    assert 'default_entity_id: ' + audio['fields']['offset']['entity'] in audio_package
    assert wind['fields']['last_heard']['entity'] == 'input_datetime.awnings_wind_last_heard'
    assert 'entity_id: ' + wind['fields']['last_heard']['entity'] in wind_package
    # Change only each pinned component's default and re-render through the same tools.
    audio_partial = audio_dir / 'templates/_audio-ids.jinja'
    audio_partial.write_text(audio_partial.read_text().replace('replace("-", "_")', 'replace("-", "__")'))
    wind_partial = awning_dir / 'templates/_wind-defaults.jinja'
    wind_partial.write_text(wind_partial.read_text().replace('awnings_wind_last_heard', 'custom_wind_heard'))
    render_component(audio_dir, audio_inputs, tmp_path / 'audio-new')
    render_component(awning_dir, wind_inputs, tmp_path / 'wind-new')
    audio = yaml.safe_load((tmp_path / 'audio-new/assistant-bindings.yaml').read_text())['subjects'][0]
    wind = yaml.safe_load((tmp_path / 'wind-new/assistant-bindings.yaml').read_text())['subjects'][0]
    assert audio['fields']['offset']['entity'] == 'sensor.living__room_spl_offset'
    assert 'default_entity_id: sensor.living__room_spl_offset' in (tmp_path / 'audio-new/package.yaml').read_text()
    assert wind['fields']['last_heard']['entity'] == 'input_datetime.custom_wind_heard'
    assert 'entity_id: input_datetime.custom_wind_heard' in (tmp_path / 'wind-new/package.yaml').read_text()


def test_all_components_declare_translated_capabilities_and_render_bindings(tmp_path):
    examples = {'calendar': {'calendar': 'calendar.family'}, 'weather': {'weather': 'weather.forecast_home'},
                'media': {'media_player': 'media_player.living_room_speaker'},
                'floorplan': {}, 'remote-access': {'hostname': 'ha.example.org', 'token_file': '/secret/token'}}
    assert set(CAPABILITIES) == {p.parent.name for p in (ROOT / 'components').glob('*/component.yaml')}
    for cid, suffixes in CAPABILITIES.items():
        root = ROOT / 'components' / cid
        manifest = yaml.safe_load((root / 'component.yaml').read_text())
        declaration = manifest['assistant']
        assert declaration['bindings'] in manifest['artifacts']['templates']
        definitions = yaml.safe_load((root / declaration['definition']).read_text())['capabilities']
        assert {x['id'] for x in definitions} == {f'{cid}.{s}' for s in suffixes | {'explain'}}
        assert all(x['policy']['evaluator'] == x['id'] for x in definitions)
        provides = manifest.get('provides', {})
        surfaces = {
            'provides': {x['id'] for x in provides.get('entities', [])},
            'upstream': {x['id'] for x in provides.get('upstream', []) if 'id' in x},
            'consumes': {x['id'] for x in manifest.get('consumes', []) if 'id' in x},
        }
        for feature in provides.get('features', {}).values():
            surfaces['provides'].update(x['id'] for x in feature.get('entities', []))
        for cap in definitions:
            for fact in cap['required_facts'] + cap['optional_facts']:
                assert fact['source']['id'] in surfaces[fact['source']['relation']]
        for lang in ('en', 'de', 'pl'):
            data = json.loads((root / 'translations' / f'{lang}.json').read_text())
            for suffix in suffixes | {'explain'}:
                text = data['meta']['assistant'][suffix]
                assert text['title'] and text['description'] and 1 <= len(text['examples']) <= 3
        source = ROOT / 'examples' / 'demo-home' / 'inputs' / f'{cid}.yaml'
        inputs = yaml.safe_load(source.read_text()) if source.exists() else examples[cid]
        render_component(root, inputs, tmp_path / cid)
        bindings = yaml.safe_load((tmp_path / cid / 'assistant-bindings.yaml').read_text())
        from assistant_contract import compile_profile
        compiled = compile_profile(root, manifest, bindings, manifest['version'], 'a' * 40, False)
        assert compiled['bindings'] == bindings
        if (ROOT / 'tools/assistant_contract.py').exists():
            from assistant_contract import compile_profile
            compiled = compile_profile(root, manifest, bindings, manifest['version'], 'a' * 40, False)
            assert compiled['bindings'] == bindings
            assert set(compiled['translations']['en']) == {'meta'}
        assert set(bindings) == {'subjects', 'policies'}
        roles = {f['role'] for c in definitions for f in c['required_facts'] + c['optional_facts']}
        assert all(set(subject['fields']) <= roles for subject in bindings['subjects'])
        assert bindings['subjects'] or cid in {'audio-sensor', 'remote-access', 'floorplan'}
        if cid == 'remote-access':
            assert bindings == {'subjects': [], 'policies': []}


def test_media_and_audio_do_not_guess_optional_sources():
    media = component_bindings('media', {'media_player': 'media_player.player'})['subjects'][0]
    assert set(media['fields']) == {'player'}
    audio = component_bindings('audio-sensor', {'sensors': [{'room': 'office', 'area': 'Office'}]})
    assert audio['subjects'] == []
    media = component_bindings('media', {'media_player': 'media_player.player',
                               'mains': {'power': 'sensor.meter_power'}, 'quality': 'sensor.quality'})
    assert media['subjects'][0]['fields']['power']['entity'] == 'sensor.meter_power'
    assert media['subjects'][0]['fields']['quality']['entity'] == 'sensor.quality'
    audio = component_bindings('audio-sensor', {'sensors': [{'room': 'office', 'area': 'Office',
                              'entities': {'level': 'sensor.sound_level'}, 'online': 'binary_sensor.sound_online'}]},
                              {'audio_prefixes': {'office': 'office'}})
    assert audio['subjects'][0]['fields']['online']['entity'] == 'binary_sensor.sound_online'


def test_capability_descriptions_explain_the_actual_information():
    assert set(CAPABILITIES) == {p.parent.name for p in (ROOT / 'components').glob('*/component.yaml')}
    for cid, suffixes in CAPABILITIES.items():
        for lang in ('en', 'de', 'pl'):
            data = json.loads((ROOT / 'components' / cid / 'translations' / f'{lang}.json').read_text())
            descriptions = [data['meta']['assistant'][s]['description'] for s in suffixes | {'explain'}]
            assert len(descriptions) == len(set(descriptions)), (cid, lang)


def test_media_sources_are_declared_as_upstream():
    data = yaml.safe_load((ROOT / 'components/media/component.yaml').read_text())
    assert {'quality', 'service', 'mains'} <= set(data['inputs'])
    assert {'sensor.<quality>', 'sensor.<service>', 'sensor.<meter>_power', 'sensor.<meter>_voltage'} <= {
        row.get('id') for row in data['provides']['upstream']}


def test_plant_brightness_keeps_current_and_historical_evidence():
    bindings = plant_bindings({'plants': [{'entity': 'plant.fern', 'label': 'Office'}]})
    fields = bindings['subjects'][0]['fields']
    assert fields['brightness']['entity'] == 'sensor.fern_illuminance'
    assert fields['brightness_peak']['entity'] == 'sensor.fern_illuminance_max_24h'


def test_presence_radar_requires_explicit_entities():
    inputs = {'proxies': [{'room': 'office', 'area': 'Office', 'radar': True}],
              'radar_sources': [{'entity': 'binary_sensor.office_radar', 'label': 'Office radar',
                                 'distance': 'sensor.office_distance', 'room': 'office'}]}
    source = component_bindings('bermuda-presence', inputs)['subjects'][0]
    assert source['fields']['presence']['entity'] == 'binary_sensor.office_radar'
    assert source['fields']['distance']['entity'] == 'sensor.office_distance'
    assert source['roomKey'] == 'office'
    inputs.pop('radar_sources')
    assert component_bindings('bermuda-presence', inputs)['subjects'] == []


def test_awning_and_room_bindings_use_only_explicit_identity():
    awnings = component_bindings('awnings', {'covers': [
        {'name': 'Unmapped', 'shade_id': 1},
        {'name': 'Mapped', 'shade_id': 2, 'entity_id': 'cover.mapped', 'room': 'office'}]})
    assert [s['key'] for s in awnings['subjects']] == ['cover.mapped']
    assert awnings['subjects'][0]['roomKey'] == 'office'
    climate = component_bindings('climate-air', {'climate': [
        {'label': 'Office', 'temperature': 'sensor.office_temp'},
        {'label': 'Kitchen', 'temperature': 'sensor.kitchen_temp', 'room': 'kitchen'}]})
    assert 'roomKey' not in climate['subjects'][0]
    assert climate['subjects'][1]['roomKey'] == 'kitchen'


def test_air_policy_units_and_bounds_match_rendered_dashboard():
    limits = air_limits()
    policies = air_policies({'prefix': 'frame', 'air': {m: 'sensor.' + m for m in limits}}, limits)
    assert {p['metric']: p['unit'] for p in policies} == {
        'score': '/100', 'co2': 'ppm', 'pm2_5': 'µg/m³', 'voc': 'index', 'nox': 'index'}
    assert all(p['levels'] == list(limits[p['metric']][2:4]) for p in policies)


def test_climate_status_exposes_only_provided_derived_entities():
    source = {'climate': [{'label': 'Office', 'temperature': 'sensor.office', 'humidity': 'sensor.humidity',
                           'bathroom': True}], 'outside': {'temperature': 'sensor.outside'}}
    bindings = component_bindings('climate-air', source)
    fields = {key: value for subject in bindings['subjects'] for key, value in subject['fields'].items()}
    assert fields['difference']['entity'] == 'sensor.indoor_outdoor_difference'
    assert fields['humidity_alert']['entity'] == 'binary_sensor.bathroom_humidity_high'


def test_plant_rows_share_defaults_and_respect_overrides():
    rows = plant_rows({"plants": [
        {"entity": "plant.fern", "label": {"en": "Kitchen", "de": "Küche", "pl": "Kuchnia"},
         "name": "Fern", "sensors": {"moisture": "sensor.custom"}, "min_moisture": 22},
    ]})
    assert rows[0]["sensors"] == {
        "moisture": "sensor.custom", "conductivity": "sensor.fern_conductivity",
        "brightness": "sensor.fern_illuminance", "temperature": "sensor.fern_temperature",
    }
    assert rows[0]["limits"]["min_moisture"] == 22
    assert rows[0]["limits"]["max_moisture"] == 60
    assert rows[0]["check_days"] == 3
    assert rows[0]["rooms"]["pl"] == "Kuchnia"


def test_plant_bindings_use_the_same_sources_without_exporting_private_inputs():
    data = {"plants": [{"entity": "plant.fern", "label": "Office", "name": "Fern",
                       "sensors": {"moisture": "sensor.explicit"}, "photo": "/private/photo.jpg"}],
            "notify": "notify.private"}
    subject = plant_bindings(data)["subjects"][0]
    assert subject["key"] == "plant.fern"
    assert subject["fields"]["moisture"]["entity"] == plant_rows(data)[0]["sensors"]["moisture"]
    assert subject["fields"]["brightness"]["entity"] == "sensor.fern_illuminance"
    assert subject["limits"]["check_days"] == 3
    assert "roomKey" not in subject
    assert "private" not in repr(subject)


def test_air_policies_use_only_explicit_sources_and_shared_thresholds():
    limits = air_limits()
    policies = air_policies({"prefix": "frame", "air": {"co2": "sensor.air_co2"}}, limits)
    assert len(policies) == 1
    policy = policies[0]
    assert policy["entity"] == "sensor.air_co2"
    assert policy["levels"] == list(limits["co2"][2:4])
    assert policy["higher_is_better"] is False
    assert policy["helpers"]["raised"] == "input_number.frame_air_co2_raised"
    assert air_policies({"prefix": "frame"}, limits) == []


def test_ramka_bindings_expose_helpers_and_air_policy_only():
    bindings = ramka_bindings({"prefix": "frame", "name": "Frame", "photo_dir": "/secret",
                               "air": {"score": "sensor.score"}}, air_limits())
    frame = bindings["subjects"][0]
    assert frame["fields"]["mode"] == {"entity": "input_select.frame_mode"}
    assert frame["fields"]["rotation"] == {"entity": "sensor.frame_ambient_pages", "attribute": "pages"}
    assert bindings["policies"][0]["entity"] == "sensor.score"
    assert "/secret" not in repr(bindings)


def test_single_language_names_keep_existing_friendly_name_fallback():
    bindings = plant_bindings({'plants': [{'entity': 'plant.fern', 'label': 'Office', 'name': {'pl': 'Paproć'}}]})
    assert bindings['subjects'][0]['label'] == {'en': 'Paproć', 'pl': 'Paproć'}


def test_integration_sources_are_upstream_and_wind_is_reported_state():
    expected = {
        'climate-air': {'sensor.<room>_temperature', 'sensor.<room>_humidity', 'sensor.<air>_{carbon_dioxide,pm2_5,voc_index,nox_index,pressure,indoor_air_quality_score}'},
        'plants': {'sensor.<plant>_{moisture,conductivity,illuminance,temperature,battery}'},
        'weather': {'weather.<home>'}, 'calendar': {'calendar.<calendar>'},
        'media': {'media_player.<player>'}, 'lights': {'light.<room>', 'light.<bulb>'},
    }
    for cid, ids in expected.items():
        root = ROOT / 'components' / cid
        manifest = yaml.safe_load((root / 'component.yaml').read_text())
        assert ids <= {s['id'] for s in manifest['provides']['upstream']}
        caps = yaml.safe_load((root / 'assistant.yaml').read_text())['capabilities']
        facts = [f for c in caps for f in c['required_facts'] + c['optional_facts']]
        assert all(f['source']['relation'] == 'upstream' for f in facts if f['source']['id'] in ids)
    wind = next(c for c in yaml.safe_load((ROOT / 'components/awnings/assistant.yaml').read_text())['capabilities'] if c['id'] == 'awnings.wind')
    assert wind['freshness'] == {'max_age_seconds': None, 'basis': 'reported_state'}
    assert any(f['role'] == 'last_heard' and f['type'] == 'event' for f in wind['optional_facts'])


def test_plant_room_label_is_preserved_separately_from_identity():
    room = {'en': 'Kitchen', 'de': 'Küche', 'pl': 'Kuchnia'}
    subject = plant_bindings({'plants': [{'entity': 'plant.fern', 'name': 'Fern', 'label': room}]})['subjects'][0]
    assert subject['label'] == 'Fern'
    assert subject['roomLabel'] == room
    assert 'roomKey' not in subject


def test_plant_defaults_live_in_pinned_component(tmp_path):
    source = ROOT / 'components/plants'
    component = tmp_path / 'plants'
    shutil.copytree(source, component)
    partial = component / 'templates/_plant-rows.jinja'
    assert partial.is_file()
    partial.write_text(partial.read_text().replace("'min_moisture': 15", "'min_moisture': 18"))
    render_component(component, {'notify': 'notify.example', 'plants': [{'entity': 'plant.fern', 'label': 'Office'}]}, tmp_path / 'out')
    binding = yaml.safe_load((tmp_path / 'out/assistant-bindings.yaml').read_text())
    package = yaml.safe_load((tmp_path / 'out/package.yaml').read_text())
    assert binding['subjects'][0]['limits']['min_moisture'] == 18
    assert package['plant']['fern']['min_moisture'] == 18
    assert not (tmp_path / 'out/_plant-rows.jinja').exists()


def test_lights_room_and_explicit_source_compile_as_one_subject():
    from assistant_contract import compile_profile
    root = ROOT / 'components' / 'lights'
    inputs = {
        'rooms': [{'id': 'office', 'name': 'Office', 'group': 'light.office_group'}],
        'lights': [{'entity': 'light.room_office', 'label': 'Office alias'},
                   {'entity': 'light.desk', 'label': 'Desk'},
                   {'entity': 'light.desk', 'label': 'Desk alias'}],
    }
    env = _make_env(root, inputs, 'en', {}, {})
    bindings = yaml.safe_load(env.get_template('assistant-bindings.yaml.j2').render())
    manifest = yaml.safe_load((root / 'component.yaml').read_text())
    profile = compile_profile(root, manifest, bindings, manifest['version'], 'a' * 40, True)
    subjects = profile['bindings']['subjects']
    assert [s['key'] for s in subjects] == ['light.room_office', 'light.desk']
    assert subjects[0]['label'] == 'Office'
