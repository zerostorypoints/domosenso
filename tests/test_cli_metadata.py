"""Client projection uses ordinary private managed render ownership."""
import hashlib
import json
import shutil
from pathlib import Path

import yaml

from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.main import main
from test_cli_actions import git

ROOT = Path(__file__).resolve().parents[1]


def test_native_sidecar_add_render_update_and_removal_in_fresh_home(tmp_path, capsys):
    catalog = tmp_path / 'catalog'; catalog.mkdir()
    component = catalog / 'components/weather'
    shutil.copytree(ROOT / 'components/weather', component)
    p = component / 'assistant.yaml'; definition = yaml.safe_load(p.read_text())
    cap = definition['capabilities'][0]
    cap['client'] = {'version': 2, 'anchors_key': 'meta.assistant.current.anchors', 'selectors': ['subject'],
                     'presentation': {'summary': ['weather'], 'details': []}}
    p.write_text(yaml.safe_dump(definition))
    for lang in ('en', 'de', 'pl'):
        p = component / f'translations/{lang}.json'; data = json.loads(p.read_text())
        data['meta']['assistant']['current']['anchors'] = ['weather']
        p.write_text(json.dumps(data))
    git(catalog, 'init', '-q', '-b', 'main'); git(catalog, 'add', '.'); git(catalog, 'commit', '-qm', 'Synthetic client catalog')
    git(catalog, 'tag', 'weather/0.2.0'); revision = git(catalog, 'rev-parse', 'HEAD')
    root = tmp_path / 'home'

    def cli(*args):
        capsys.readouterr(); result = main(['--home', str(root), *args])
        return result, capsys.readouterr().out

    assert cli('init', '--catalog', str(catalog))[0] == 0
    (root / 'domosenso').mkdir()
    (root / 'domosenso/weather.inputs.yaml').write_text('weather: weather.forecast_home\n')
    code, output = cli('add', 'weather@0.2.0'); assert code == 0, output
    relative = 'home-assistant/domosenso/assistant-metadata/weather.yaml'
    artifact = root / relative
    assert artifact.is_file()
    original = artifact.read_bytes(); payload = yaml.safe_load(original)
    assert payload['schema'] == 2 and payload['component']['commit'] == revision
    record = Lock.load(root).components['weather'].files[relative]
    assert record.layer == 'managed' and record.from_ == 'assistant.yaml'
    assert record.sha256 == hashlib.sha256(original).hexdigest()
    config = HomeConfig.load(root).config_dir
    assert not list((config / 'packages').glob('*assistant*'))
    assert not list((config / 'www').rglob('*assistant-metadata*'))
    legacy = (config / 'domosenso/assistant/weather.yaml').read_bytes()
    assert b'client:' not in legacy and b'anchors:' not in legacy
    artifact.write_bytes(original + b'# edit\n')
    code, output = cli('render', 'weather'); assert code == 1 and 'hand-edited' in output
    artifact.write_bytes(original)
    code, output = cli('render', 'weather', '--catalog-dev', str(catalog)); assert code == 0, output
    assert yaml.safe_load(artifact.read_bytes())['component']['dev'] is True
    dev = json.loads((root / '.domosenso/dev-render.json').read_text())
    assert dev['weather']['files'][relative]['sha256'] == hashlib.sha256(artifact.read_bytes()).hexdigest()
    code, output = cli('render', 'weather'); assert code == 0, output
    assert artifact.read_bytes() == original
    assert (config / 'domosenso/assistant/weather.yaml').read_bytes() == legacy

    definition['capabilities'][0].pop('client')
    (component / 'assistant.yaml').write_text(yaml.safe_dump(definition))
    p = component / 'component.yaml'; manifest = yaml.safe_load(p.read_text()); manifest['version'] = '0.2.1'; p.write_text(yaml.safe_dump(manifest))
    git(catalog, 'add', '.'); git(catalog, 'commit', '-qm', 'Remove optional client projection'); git(catalog, 'tag', 'weather/0.2.1')
    code, output = cli('update', 'weather', '--to', '0.2.1'); assert code == 0, output
    assert not artifact.exists() and relative not in Lock.load(root).components['weather'].files
    assert f'remove {relative}' in output
    assert (config / 'domosenso/assistant/weather.yaml').exists()


def test_v2_only_component_renders_no_legacy_bundle_or_ha_package(tmp_path):
    from domosenso_cli.build import plan_outputs
    from domosenso_cli.home import ComponentEntry
    from test_assistant_metadata import fixture_component
    component, manifest, _, _ = fixture_component(tmp_path)
    (component / 'component.yaml').write_text(yaml.safe_dump(manifest))
    inputs = tmp_path / 'inputs.yaml'; inputs.write_text('{}')
    home = HomeConfig(root=tmp_path, catalog='catalog', config_dir=tmp_path / 'home-assistant',
                      esphome_dir=tmp_path / 'esphome', targets={}, components={})
    outputs = plan_outputs(home, ComponentEntry('workbench', inputs), component, '0.1.0', 'a' * 40)
    assert [x.dest for x in outputs] == ['home-assistant/domosenso/assistant-metadata/workbench.yaml']
    assert outputs[0].layer == 'managed' and outputs[0].from_ == 'assistant.yaml'
    assert yaml.safe_load(outputs[0].content)['schema'] == 2
