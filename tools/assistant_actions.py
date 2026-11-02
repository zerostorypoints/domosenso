"""Compile closed command metadata separately from read capabilities and access grants."""
from pathlib import Path
from jsonschema import Draft202012Validator
import json
from assistant_contract import SCHEMAS, safe_path, _read, _flatten, _put, validate


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
        cid = action['id']; effect = cid.removeprefix('timers.')
        if manifest['id'] != 'timers' or cid in seen or action['effect'] != effect:
            raise ValueError('assistant actions: owner, effect or duplicate id')
        seen.add(cid)
        expected = {'durationSeconds': {'type':'integer','minimum':1,'maximum':86400},
                    'confirmReplace': {'type':'boolean'}} if effect == 'start' else {}
        if action['parameters'] != expected or action['confirmation'] != ('replace_active' if effect == 'start' else 'none'):
            raise ValueError('assistant actions: unsupported parameters or confirmation')
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
    keys = [s['key'] for s in rendered_bindings['subjects']]
    entities = [s['fields']['timer']['entity'] for s in rendered_bindings['subjects']]
    if len(set(keys)) != len(keys) or len(set(entities)) != len(entities):
        raise ValueError('assistant actions: duplicate timer binding')
    if not any(x.get('id') == 'timer.<prefix>_<id>' for x in manifest.get('provides', {}).get('entities', [])):
        raise ValueError('assistant actions: timer surface not declared')
    return result
