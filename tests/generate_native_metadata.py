"""Regenerate the fictional canonical projection fixtures for cross-repository tests."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from test_assistant_metadata import ROOT, fixture_component, metadata


def generate():
    destination = ROOT / 'tests/fixtures/assistant-metadata-canonical'
    for both, name in [(False, 'temperature-only.json'), (True, 'temperature-humidity.json')]:
        with TemporaryDirectory() as temporary:
            artifact = metadata(fixture_component(Path(temporary), both=both))
        (destination / name).write_text(json.dumps(artifact, indent=2, sort_keys=True, ensure_ascii=False) + '\n')
    paths = ['source.yaml', 'temperature-only.json', 'temperature-humidity.json',
             '../../../schemas/frame-assistant-metadata.schema.json']
    (destination / 'SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256((destination / name).read_bytes()).hexdigest()}  {name}\n' for name in paths))


if __name__ == '__main__':
    generate()
