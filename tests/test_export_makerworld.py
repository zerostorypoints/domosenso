import hashlib
import zipfile

import pytest

from export_makerworld import package_model, section, links


def test_sections_keep_nested_assembly_steps_and_fail_on_missing_heading():
    text = '# Guide\n\n## Assembly\n1. Insert.\n### Release\nPull.\n## Printing\nPETG.\n'
    assert section(text, 'Assembly') == '1. Insert.\n### Release\nPull.'
    with pytest.raises(ValueError, match='Missing section'):
        section(text, 'Hardware')


def test_export_copies_exact_source_and_fails_for_missing_parts(tmp_path):
    files = {
        'devices/example.md': b'# Device\n\n## Enclosure\nShared site description.\n',
        'devices/enclosures/example/README.md': b'# Model\n\n## Assembly\n1. Insert.\n',
        'devices/enclosures/example/stl/base.stl': b'solid base\nendsolid base\n',
        'LICENSE': b'License', 'NOTICE': b'Notice',
    }
    item = {'id': 'example', 'title': 'Example', 'device': 'devices/example.md',
            'heading': 'Enclosure', 'sections': ['Assembly'], 'files': ['stl/base.stl']}
    result = package_model(item, 'a' * 40, files.__getitem__, tmp_path)
    assert 'Shared site description.' in (result / 'description.md').read_text()
    with zipfile.ZipFile(result / 'example.zip') as z:
        assert z.read('devices/enclosures/example/stl/base.stl') == files['devices/enclosures/example/stl/base.stl']
        assert z.read('LICENSE') == b'License'
    import json
    manifest = json.loads((result / 'manifest.json').read_text())
    assert manifest['sha256']['devices/enclosures/example/stl/base.stl'] == hashlib.sha256(files['devices/enclosures/example/stl/base.stl']).hexdigest()
    del files['devices/enclosures/example/stl/base.stl']
    with pytest.raises(KeyError):
        package_model(item, 'a' * 40, files.__getitem__, tmp_path / 'missing')


def test_rejects_paths_outside_model(tmp_path):
    item = {'id': 'example', 'title': 'Example', 'device': 'devices/example.md',
            'heading': 'Enclosure', 'sections': [], 'files': ['../../private.txt']}
    with pytest.raises(ValueError, match='Unsafe'):
        package_model(item, 'a' * 40, lambda p: b'', tmp_path)


def test_actual_catalog_packages_all_selected_files(tmp_path):
    import json
    import subprocess
    from export_makerworld import ROOT
    for item in json.loads((ROOT / "devices/enclosures/makerworld.json").read_text())["models"]:
        folder = f"devices/enclosures/{item['id']}"
        tracked = set(subprocess.check_output(
            ['git', 'ls-files', folder], cwd=ROOT, text=True).splitlines())
        declared = {f"{folder}/{path}" for path in item['files']} | {f"{folder}/README.md"}
        assert tracked == declared, f"Unpackaged model files: {tracked - declared}"
        result = package_model(item, "b" * 40, lambda p: (ROOT / p).read_bytes(), tmp_path)
        with zipfile.ZipFile(result / (item["id"] + ".zip")) as archive:
            assert archive.testzip() is None
            assert not any("stand_plain" in name for name in archive.namelist())


def test_fragment_links_resolve_against_source_document():
    source = 'devices/enclosures/example/README.md'
    revision = 'a' * 40
    assert links('[Wiring](#wiring)', source, revision) == (
        f'[Wiring](https://github.com/zerostorypoints/domosenso/blob/{revision}/{source}#wiring)')
