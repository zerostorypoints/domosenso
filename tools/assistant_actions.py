"""Compile closed command metadata separately from read capabilities and access grants."""
from pathlib import Path
from jsonschema import Draft202012Validator
import json
import re
from assistant_contract import SCHEMAS, safe_path, _read, _flatten, _put, _surface, validate


CONTROL_ROLES = {
    'lights.turn_on': ({'light'}, {'light'}),
    'lights.turn_off': ({'light'}, {'light'}),
    'awnings.extend': ({'cover', 'wind', 'last_heard'}, set()),
    'awnings.retract': ({'cover'}, set()),
    'awnings.stop': ({'cover'}, set()),
}


def _control_definition(action, manifest):
    cid = action['id']
    if type(action['revision']) is not int:
        raise ValueError('assistant actions: control revision must be an integer')
    if cid not in CONTROL_ROLES or cid.split('.')[0] != manifest['id'] or action['effect'] != cid.split('.')[1]:
        raise ValueError('assistant actions: unsupported control owner or effect')
    required, optional = CONTROL_ROLES[cid]
    for name, roles in (('required_facts', required), ('optional_facts', optional)):
        if {fact['role'] for fact in action[name]} != roles:
            raise ValueError('assistant actions: unsupported source roles')
        for fact in action[name]:
            role, source = fact['role'], fact['source']
            expected_type = 'event' if role == 'last_heard' else 'state'
            if fact['type'] != expected_type or fact['units']:
                raise ValueError('assistant actions: unsupported source type')
            if (source.get('component'), source['id']) not in _surface(manifest, source['relation']):
                raise ValueError(f'assistant actions: undeclared fact source {source["id"]}')


def _matches_source(entity, source):
    # Control surfaces use the same declared placeholders as the read metadata.
    pattern = re.escape(source['id'])
    pattern = re.sub(r'<[^>]+>', '[a-z0-9_]+', pattern)
    return re.fullmatch(pattern, entity) is not None


def _control_bindings(bindings, definitions, owner):
    facts = [f for action in definitions['actions'] for f in action['required_facts'] + action['optional_facts']]
    target_role, kind = ('light', 'light') if owner == 'lights' else ('cover', 'awning')
    seen = set()
    for subject in bindings['subjects']:
        if subject['kind'] != kind or set(subject['fields']) != {target_role}:
            raise ValueError('assistant actions: control subject kind or fields mismatch')
        entity = subject['fields'][target_role]['entity']
        if subject['key'] != entity or entity in seen:
            raise ValueError('assistant actions: duplicate or mismatched control identity')
        seen.add(entity)
        if 'group' in subject:
            group = subject['group']['entity']
            if not any(f['role'] == 'light' and f['source']['relation'] == 'upstream' and
                       _matches_source(group, f['source']) for f in facts):
                raise ValueError('assistant actions: group requires a declared upstream light source')
        fields = dict(subject['fields'])
        if 'guard' in subject:
            fields.update({role: subject['guard'][role] for role in ('wind', 'last_heard')})
        for role, field in fields.items():
            if not any(f['role'] == role and _matches_source(field['entity'], f['source']) for f in facts):
                raise ValueError('assistant actions: undeclared binding source')
    if bindings['policies']:
        raise ValueError('assistant actions: controls have no evaluation policies')


def load_actions(component_dir: Path, manifest: dict, *, strict_translations=False):
    config = manifest.get('assistant_actions')
    schema = json.loads((SCHEMAS / 'component.schema.json').read_text())['properties']['assistant_actions']
    if next(Draft202012Validator(schema).iter_errors(config), None):
        raise ValueError('assistant actions: invalid manifest declaration')
    path = safe_path(component_dir, config['definition'])
    safe_path(component_dir, config['bindings'])
    binding = config['bindings']
    if (not binding.startswith('templates/') or not binding.endswith('.yaml.j2') or
            binding.startswith('templates/instance/') or binding.endswith('.lang.yaml.j2') or
            binding not in manifest.get('artifacts', {}).get('templates', []) or
            binding == manifest.get('assistant', {}).get('bindings')):
        raise ValueError('assistant actions: expected separate managed YAML bindings')
    definitions = _read(path)
    validate('assistant-actions', definitions)
    seen, keys = set(), set()
    for action in definitions['actions']:
        cid = action['id']
        if cid in seen:
            raise ValueError('assistant actions: duplicate id')
        seen.add(cid)
        if cid.startswith('timers.'):
            effect = cid.removeprefix('timers.')
            if manifest['id'] != 'timers' or action['effect'] != effect:
                raise ValueError('assistant actions: owner or effect')
            expected = {'durationSeconds': {'type':'integer','minimum':1,'maximum':86400},
                        'confirmReplace': {'type':'boolean'}} if effect == 'start' else {}
            if action['parameters'] != expected or action['confirmation'] != ('replace_active' if effect == 'start' else 'none'):
                raise ValueError('assistant actions: unsupported parameters or confirmation')
        else:
            _control_definition(action, manifest)
        keys.update(action[k] for k in ('title_key','description_key','examples_key'))
    english = _flatten(_read(safe_path(component_dir, 'translations/en.json'), True))
    translations = {}
    for lang in ('en','de','pl'):
        candidate = component_dir / 'translations' / f'{lang}.json'
        values = {} if not strict_translations and not candidate.exists() and not candidate.is_symlink() else _flatten(_read(safe_path(component_dir, f'translations/{lang}.json'), True))
        output = {}
        for key in sorted(keys):
            if key not in english or (strict_translations and key not in values):
                raise ValueError(f'assistant actions: missing translation {lang}:{key}')
            _put(output, key, values.get(key, english[key]))
        translations[lang] = output
    return definitions, translations


def compile_actions(component_dir, manifest, rendered_bindings, version, sha, dirty):
    if version != manifest['version']:
        raise ValueError('assistant actions: component version mismatch')
    definitions, translations = load_actions(Path(component_dir), manifest)
    result = {'schema':1,'component':{'id':manifest['id'],'version':version,'commit':sha,'dev':dirty},
              'definitions':definitions,'translations':translations,'bindings':rendered_bindings}
    validate('assistant-actions-profile', result)
    if manifest['id'] in ('lights', 'awnings'):
        _control_bindings(rendered_bindings, definitions, manifest['id'])
        return result
    if any(s['kind'] != 'timer' or set(s['fields']) != {'timer'} for s in rendered_bindings['subjects']):
        raise ValueError('assistant actions: expected timer bindings')
    keys = [s['key'] for s in rendered_bindings['subjects']]
    entities = [s['fields']['timer']['entity'] for s in rendered_bindings['subjects']]
    if len(set(keys)) != len(keys) or len(set(entities)) != len(entities):
        raise ValueError('assistant actions: duplicate timer binding')
    if not any(x.get('id') == 'timer.<prefix>_<id>' for x in manifest.get('provides', {}).get('entities', [])):
        raise ValueError('assistant actions: timer surface not declared')
    return result
