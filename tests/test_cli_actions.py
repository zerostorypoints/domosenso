"""Action metadata follows normal ownership in a fresh independent catalog/home."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.main import main

ROOT = Path(__file__).resolve().parents[1]


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), '-c', 'user.name=Test',
        '-c', 'user.email=test@example.org', *args], text=True).strip()


@pytest.mark.parametrize('cid', ['lights', 'awnings'])
def test_sidecar_add_render_dev_update_and_removal_in_independent_home(tmp_path, capsys, cid):
    catalog = tmp_path / 'catalog'; catalog.mkdir()
    component = catalog / 'components' / cid
    shutil.copytree(ROOT / 'components' / cid, component)
    git(catalog, 'init', '-q', '-b', 'main')
    git(catalog, 'add', '.'); git(catalog, 'commit', '-qm', 'Test catalog')
    # Throwaway tags in this test catalog, never release tags in the project.
    git(catalog, 'tag', f'{cid}/0.4.0')
    revision = git(catalog, 'rev-parse', 'HEAD')
    root = tmp_path / 'home'

    def cli(*args):
        capsys.readouterr()
        result = main(['--home', str(root), *args])
        output = capsys.readouterr().out
        return result, output

    assert cli('init', '--catalog', str(catalog))[0] == 0
    inputs = json.loads((ROOT / 'tests/fixtures/assistant-actions/inputs.json').read_text())[cid]
    (root / 'domosenso').mkdir()
    (root / f'domosenso/{cid}.inputs.yaml').write_text(yaml.safe_dump(inputs))
    code, output = cli('add', f'{cid}@0.4.0'); assert code == 0, output
    home = HomeConfig.load(root)
    relative = f'home-assistant/domosenso/assistant-actions/{cid}.yaml'
    artifact = root / relative
    original = artifact.read_bytes()
    payload = yaml.safe_load(original)
    assert payload['component'] == {'id': cid, 'version': '0.4.0', 'commit': revision, 'dev': False}
    record = Lock.load(root).components[cid].files[relative]
    assert record.layer == 'managed' and record.from_ == 'assistant-actions.yaml'
    assert record.sha256 == hashlib.sha256(original).hexdigest()
    assert not list((home.config_dir / 'packages').glob('*assistant*'))
    artifact.write_bytes(original + b'# manual edit\n')
    code, output = cli('render', cid)
    assert code == 1 and 'hand-edited' in output
    artifact.write_bytes(original)
    code, output = cli('render', cid, '--catalog-dev', str(catalog)); assert code == 0, output
    assert yaml.safe_load(artifact.read_bytes())['component']['dev'] is True
    dev = json.loads((root / '.domosenso/dev-render.json').read_text())
    assert dev[cid]['files'][relative]['layer'] == 'managed'
    assert dev[cid]['files'][relative]['sha256'] == hashlib.sha256(artifact.read_bytes()).hexdigest()
    code, output = cli('render', cid); assert code == 0, output
    assert artifact.read_bytes() == original

    manifest_path = component / 'component.yaml'
    manifest = yaml.safe_load(manifest_path.read_text()); manifest.pop('assistant_actions')
    manifest['version'] = '0.4.1'; manifest_path.write_text(yaml.safe_dump(manifest))
    git(catalog, 'add', '.'); git(catalog, 'commit', '-qm', 'Omit optional actions')
    git(catalog, 'tag', f'{cid}/0.4.1')
    code, output = cli('update', cid, '--to', '0.4.1'); assert code == 0, output
    assert not artifact.exists()
    assert relative not in Lock.load(root).components[cid].files
    assert f'remove {relative}' in output
    assert (home.config_dir / f'domosenso/assistant/{cid}.yaml').is_file()
    assert not list((home.config_dir / 'packages').glob('*assistant*'))
