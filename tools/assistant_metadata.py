"""Derive inert native client metadata from canonical component definitions."""
import json
from pathlib import Path

from assistant_contract import (load_definition, normalize_bindings, selected_translations,
                                validate)


def compile_metadata(component_dir, manifest, rendered_bindings, version, sha, dirty):
    if version != manifest['version']:
        raise ValueError('assistant: component version mismatch')
    definitions, translations = load_definition(Path(component_dir), manifest)
    bindings = normalize_bindings(rendered_bindings, definitions, manifest['id'])
    capabilities = [cap for cap in definitions['capabilities'] if 'client' in cap]
    if not capabilities:
        return None
    roles = {fact['role'] for cap in capabilities for fact in cap['required_facts'] + cap['optional_facts']}
    subjects = []
    for subject in bindings['subjects']:
        fields = {key: value for key, value in subject['fields'].items() if key in roles}
        if subject['fields'] and not fields:
            continue
        subject['fields'] = fields
        subjects.append(subject)
    bindings['subjects'] = subjects
    entities = {field['entity'] for subject in subjects for field in subject['fields'].values()}
    bindings['policies'] = [p for p in bindings['policies'] if p['entity'] in entities]
    artifact = {'schema': 2,
                'component': {'id': manifest['id'], 'version': version, 'commit': sha, 'dev': dirty},
                'definitions': {'capabilities': capabilities},
                'translations': selected_translations(translations, capabilities, client=True),
                'bindings': bindings}
    validate('frame-assistant-metadata', artifact)
    if len(json.dumps(artifact, ensure_ascii=False, allow_nan=False).encode('utf-8')) > 256 * 1024:
        raise ValueError('assistant metadata: artifact exceeds size limit')
    return artifact
