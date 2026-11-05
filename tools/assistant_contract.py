"""Compile pinned read-only assistant metadata into a private managed home artifact.

This compiler validates declarations and ownership. Runtime permission, provenance and
measurement checks remain the bridge's responsibility; a bundle never grants access.
"""
from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path, PurePosixPath

import yaml
from jsonschema import Draft202012Validator

SCHEMAS = Path(__file__).resolve().parents[1] / 'schemas'
MAX_BYTES = 1024 * 1024
# New semantics need a reviewed adapter, not a new prompt in a component file.
ROUTES = {
    'climate-air.temperature': ('temperature-query.v1', 'temperature.v1'),
    'climate-air.air_readings': ('air-query.v1', 'air.v1'),
    'climate-air.air_assessment': ('air-query.v1', 'air.v1'),
    'climate-air.humidity': ('environment-query.v1', 'environment.v1'),
    'climate-air.status': ('environment-query.v1', 'environment.v1'),
    'plants.watering_need': ('plant-query.v1', 'plant-watering.v1'),
    'plants.status': ('plant-query.v1', 'plant-status.v1'),
    'plants.last_watered': ('plant-query.v1', 'plant-event.v1'),
    'plants.water_in': ('plant-query.v1', 'plant-estimate.v1'),
    'media.now_playing': ('media-query.v1', 'media.v1'),
    'media.status': ('media-query.v1', 'media.v1'),
    'media.mains': ('reading-query.v1', 'reading.v1'),
    'lights.status': ('light-query.v1', 'lights.v1'),
    'calendar.agenda': ('calendar-query.v1', 'calendar.v1'),
    'weather.current': ('weather-query.v1', 'weather.v1'),
    'weather.forecast': ('weather-query.v1', 'weather.v1'),
    'bermuda-presence.observations': ('presence-query.v1', 'presence.v1'),
    'awnings.status': ('awning-query.v1', 'awnings.v1'),
    'awnings.wind': ('awning-query.v1', 'awnings.v1'),
    'audio-sensor.level': ('audio-query.v1', 'audio-level.v1'),
    'backup.status': ('status-query.v1', 'backup.v1'),
    'ramka.current_time': ('time-query.v1', 'time.v1'),
    'timers.status': ('timer-query.v1', 'timer-status.v1'),
    'ramka.status': ('status-query.v1', 'frame.v1'),
}


@lru_cache(maxsize=8)
def _validator(name: str):
    return Draft202012Validator(json.loads((SCHEMAS / f'{name}.schema.json').read_text()))


def validate(name: str, value) -> None:
    # Reject NaN/Infinity, non-JSON YAML values, aliases with excessive expansion and recursion.
    try:
        encoded = json.dumps(value, allow_nan=False, ensure_ascii=False)
    except (TypeError, ValueError, RecursionError) as exc:
        raise ValueError('assistant: expected finite JSON-compatible data') from exc
    if len(encoded.encode('utf-8')) > MAX_BYTES:
        raise ValueError('assistant: artifact exceeds size limit')
    error = next(_validator(name).iter_errors(value), None)
    if error:
        path = '.'.join(str(x) for x in error.absolute_path)
        raise ValueError(f'assistant {path}: {error.message}')


def safe_path(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise ValueError('assistant: invalid path')
    rel = PurePosixPath(relative)
    if rel.is_absolute() or rel.as_posix() != relative or '..' in rel.parts:
        raise ValueError('assistant: path must be canonical and component-relative')
    path = root
    for part in rel.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError('assistant: symlink path is not allowed')
    if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('assistant: path must be a file inside its component')
    return path


class _AssistantLoader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise ValueError('assistant: YAML aliases are not supported')
        return super().compose_node(parent, index)

    def construct_mapping(self, node, deep=False):
        keys = [key.value for key, _ in node.value if isinstance(key, yaml.ScalarNode)]
        if len(keys) != len(node.value) or len(keys) != len(set(keys)):
            raise ValueError('assistant: invalid or duplicate YAML key')
        return super().construct_mapping(node, deep)


def parse_bindings(data):
    if len(data) > MAX_BYTES:
        raise ValueError('assistant: input exceeds size limit')
    try:
        return yaml.load(data, Loader=_AssistantLoader)
    except (yaml.YAMLError, UnicodeError, RecursionError) as exc:
        raise ValueError('assistant: invalid YAML') from exc


def _read(path: Path, json_file=False):
    try:
        with path.open('rb') as file:
            data = file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('assistant: input exceeds size limit')
        return json.loads(data) if json_file else parse_bindings(data)
    except (OSError, UnicodeError, yaml.YAMLError, json.JSONDecodeError) as exc:
        raise ValueError(f'assistant: cannot parse {path.name}') from exc


def _flatten(value, prefix=''):
    if not isinstance(value, dict):
        return {prefix: value}
    result = {}
    for key, child in value.items():
        result.update(_flatten(child, f'{prefix}.{key}' if prefix else key))
    return result


def _put(data, key, value):
    parts = key.split('.')
    for part in parts[:-1]:
        data = data.setdefault(part, {})
    data[parts[-1]] = copy.deepcopy(value)


def _surface(manifest, relation):
    if relation == 'provides':
        provides = manifest.get('provides') or {}
        entities = list(provides.get('entities') or [])
        for feature in (provides.get('features') or {}).values():
            if isinstance(feature, dict):
                entities.extend(feature.get('entities') or [])
        return {(None, x.get('id')) for x in entities if isinstance(x, dict)}
    if relation == 'consumes':
        return {(x.get('component'), x.get('id')) for x in manifest.get('consumes') or []}
    entries = [*(manifest.get('upstream') or []), *((manifest.get('provides') or {}).get('upstream') or [])]
    return {(None, x.get('id')) for x in entries}


def load_definition(component_dir: Path, manifest: dict, *, strict_translations=False):
    config = manifest.get('assistant')
    assistant_schema = json.loads((SCHEMAS / 'component.schema.json').read_text())['properties']['assistant']
    errors = list(Draft202012Validator(assistant_schema).iter_errors(config))
    if errors:
        raise ValueError('assistant: invalid manifest declaration')
    path = safe_path(component_dir, config['definition'])
    safe_path(component_dir, config['bindings'])
    if not config['bindings'].startswith('templates/') or not config['bindings'].endswith('.yaml.j2'):
        raise ValueError('assistant: bindings must be a YAML template')
    if config['bindings'].startswith('templates/instance/') or config['bindings'].endswith('.lang.yaml.j2'):
        raise ValueError('assistant: bindings must be one managed, language-independent template')
    if config['bindings'] not in (manifest.get('artifacts') or {}).get('templates', []):
        raise ValueError('assistant: bindings must be listed in artifacts.templates')
    definitions = _read(path)
    validate('assistant', definitions)
    ids = set()
    keys = set()
    for cap in definitions['capabilities']:
        cid = cap['id']
        if not cid.startswith(manifest['id'] + '.') or cid in ids:
            raise ValueError('assistant: capability owner or duplicate id')
        ids.add(cid)
        route = ('component-query.v1', 'component-description.v1') if cid == manifest['id'] + '.explain' else ROUTES.get(cid)
        generic = is_generic(cap)
        if not generic and (route != (cap['query_type'], cap['answer_type']) or cap['policy']['evaluator'] != cid or cap['revision'] != 1):
            raise ValueError('assistant: unsupported capability, evaluator, revision or type pair')
        if cap['freshness']['basis'] == 'measurement' and cap['freshness']['max_age_seconds'] is None:
            raise ValueError('assistant: measurement freshness requires a maximum report age')
        for fact in cap['required_facts'] + cap['optional_facts']:
            source = fact['source']
            pair = (source.get('component'), source['id'])
            if pair not in _surface(manifest, source['relation']):
                raise ValueError(f'assistant: undeclared fact source {source["id"]}')
        roles = {fact['role'] for fact in cap['required_facts'] + cap['optional_facts']}
        if 'client' in cap:
            presentation = cap['client']['presentation']
            used = set(presentation['summary'])
            for section in presentation['details']:
                used.update(section['roles'])
            if used - roles:
                raise ValueError('assistant: undeclared presentation role')
        keys.update(translation_keys(cap))
    english = _flatten(_read(safe_path(component_dir, 'translations/en.json'), True))
    translations = {}
    for lang in ('en', 'de', 'pl'):
        candidate = component_dir / 'translations' / f'{lang}.json'
        if not strict_translations and lang != 'en' and not candidate.exists() and not candidate.is_symlink():
            translated = {}
        else:
            translated = _flatten(_read(safe_path(component_dir, f'translations/{lang}.json'), True))
        output = {}
        for key in sorted(keys):
            if key not in english or (strict_translations and key not in translated):
                raise ValueError(f'assistant: missing translation {lang}:{key}')
            _put(output, key, translated.get(key, english[key]))
        translations[lang] = output
    for cap in definitions['capabilities']:
        if 'client' in cap:
            key = cap['client']['anchors_key']
            for values in translations.values():
                flat = _flatten(values)
                phrases = flat[key]
                validate('frame-assistant-metadata-phrases', phrases)
                text = {'type': 'string', 'minLength': 1, 'maxLength': 120,
                        'pattern': r'^(?=\s*\S)[^\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+$'}
                schemas = {cap['title_key']: text,
                           cap['description_key']: {**text, 'maxLength': 300},
                           cap['examples_key']: {'type': 'array', 'minItems': 1, 'maxItems': 8,
                                                'uniqueItems': True, 'items': {**text, 'maxLength': 240}}}
                schemas.update({section['label_key']: text for section in cap['client']['presentation']['details']})
                for text_key, schema in schemas.items():
                    if not Draft202012Validator(schema).is_valid(flat[text_key]):
                        raise ValueError(f'assistant: invalid client translation {text_key}')
    return definitions, translations


def is_generic(cap):
    """Only this reviewed evaluator can extend reads without a legacy ID registration."""
    if cap['policy']['evaluator'] != 'measurement.v1':
        return False
    facts = cap['required_facts']
    if ('client' not in cap or cap['query_type'] != 'measurement-query.v1' or
            cap['answer_type'] != 'measurement.v1' or cap['revision'] != 1 or
            len(facts) != 1 or facts[0]['type'] != 'number' or cap['optional_facts'] or
            len(facts[0]['units']) != 1 or facts[0]['units'][0] not in
            {'°C', '°F', '%', 'ppm', 'µg/m³', 'dB', 'W', 'V', 'lx', 'index'} or
            cap['freshness']['basis'] not in {'measurement', 'reported_state'} or
            cap['freshness']['max_age_seconds'] is None or 'runtime_source' in cap):
        raise ValueError('assistant: unsupported generic measurement declaration')
    return True


def translation_keys(cap, client=True):
    keys = {cap[k] for k in ('title_key', 'description_key', 'examples_key')}
    if client and 'client' in cap:
        keys.add(cap['client']['anchors_key'])
        keys.update(section['label_key'] for section in cap['client']['presentation']['details'])
    return keys


def selected_translations(translations, capabilities, *, client=False):
    keys = sorted({key for cap in capabilities for key in translation_keys(cap, client)})
    result = {}
    for lang, values in translations.items():
        flat = _flatten(values)
        output = {}
        for key in keys:
            _put(output, key, flat[key])
        result[lang] = output
    return result


def normalize_bindings(bindings, definitions, owner):
    """Validate annotations without weakening the legacy wire schema."""
    try:
        if len(json.dumps(bindings, allow_nan=False).encode()) > MAX_BYTES:
            raise ValueError('too large')
    except (TypeError, ValueError, RecursionError) as exc:
        raise ValueError('assistant: invalid finite bindings') from exc
    schema = _validator('frame-assistant-metadata').schema['properties']['bindings']
    error = next(Draft202012Validator(schema).iter_errors(bindings), None)
    if error:
        raise ValueError(f'assistant: invalid bindings: {error.message}')
    roles = {fact['role'] for cap in definitions['capabilities'] for fact in cap['required_facts'] + cap['optional_facts']}
    seen, rooms = set(), {}
    for subject in bindings['subjects']:
        if subject['key'] in seen:
            raise ValueError('assistant: duplicate subject key')
        seen.add(subject['key'])
        if subject['fields'].keys() - roles:
            raise ValueError('assistant: undeclared binding role')
        if 'roomKey' in subject:
            aliases = subject.get('roomAliases', {})
            if rooms.setdefault(subject['roomKey'], aliases) != aliases:
                raise ValueError('assistant: conflicting room aliases')
    for policy in bindings['policies']:
        if policy['owner'] != owner:
            raise ValueError('assistant: policy owner mismatch')
    return copy.deepcopy(bindings)


def compile_profile(component_dir, manifest, rendered_bindings, version, sha, dirty):
    """Validate and compile only declared bindings, without reading any HA state."""
    if version != manifest['version']:
        raise ValueError('assistant: component version mismatch')
    definitions, translations = load_definition(Path(component_dir), manifest)
    rendered_bindings = normalize_bindings(rendered_bindings, definitions, manifest['id'])
    has_generic = any(is_generic(cap) for cap in definitions['capabilities'])
    legacy_caps = [copy.deepcopy(cap) for cap in definitions['capabilities'] if not is_generic(cap)]
    if not legacy_caps:
        return None
    translations = selected_translations(translations, legacy_caps)
    for cap in legacy_caps:
        cap.pop('client', None)
    definitions = {'capabilities': legacy_caps}
    for subject in rendered_bindings['subjects']:
        subject.pop('aliases', None)
        subject.pop('roomAliases', None)
    legacy_roles = {fact['role'] for cap in legacy_caps for fact in cap['required_facts'] + cap['optional_facts']}
    if has_generic:
        for subject in rendered_bindings['subjects']:
            subject['fields'] = {k: v for k, v in subject['fields'].items() if k in legacy_roles}
    profile = {'schema': 1, 'component': {'id': manifest['id'], 'version': version, 'commit': sha, 'dev': dirty},
               'definitions': definitions, 'translations': translations, 'bindings': rendered_bindings}
    validate('assistant-profile', profile)
    roles = {fact['role'] for cap in definitions['capabilities'] for fact in cap['required_facts'] + cap['optional_facts']}
    seen = set()
    for subject in rendered_bindings['subjects']:
        if subject['key'] in seen:
            raise ValueError('assistant: duplicate subject key')
        seen.add(subject['key'])
        if subject['fields'].keys() - roles:
            raise ValueError('assistant: undeclared binding role')
    for policy in rendered_bindings['policies']:
        if policy['owner'] != manifest['id']:
            raise ValueError('assistant: policy owner mismatch')
    return profile


def split_runtime_profile(profile):
    """Keep new runtime-source capabilities outside the legacy strict v1 directory.

    Old bridges load every profile in assistant/ and reject an entire profile on
    an unknown property. An optional sibling artifact avoids disabling old reads.
    """
    if profile is None:
        return None, None
    caps = profile['definitions']['capabilities']
    runtime_caps = [c for c in caps if 'runtime_source' in c]
    if not runtime_caps:
        return profile, None

    def selected(capabilities, runtime=False):
        result = copy.deepcopy(profile)
        result['definitions']['capabilities'] = copy.deepcopy(capabilities)
        keys = sorted({c[k] for c in capabilities for k in ('title_key', 'description_key', 'examples_key')})
        result['translations'] = {}
        for lang, values in profile['translations'].items():
            output = {}
            for key in keys:
                value = values
                for part in key.split('.'):
                    value = value[part]
                _put(output, key, value)
            result['translations'][lang] = output
        if runtime:
            # A runtime clock has no HA entity facts or evaluation policies.
            for subject in result['bindings']['subjects']:
                subject['fields'] = {}
            result['bindings']['policies'] = []
        validate('assistant-profile', result)
        return result

    return selected([c for c in caps if 'runtime_source' not in c]), selected(runtime_caps, True)
