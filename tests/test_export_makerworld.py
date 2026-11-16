import hashlib
import zipfile

import pytest

from export_makerworld import package_model, section


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
