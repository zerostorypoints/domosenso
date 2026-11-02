"""Emit fictional compiler artifacts for the separate Frame bridge HA smoke test.

Usage: uv run python tests/generate_assistant_profiles.py <empty HA config directory>
This writes only domosenso/assistant/*.yaml and never contacts Home Assistant.
"""
from pathlib import Path
import subprocess
import sys

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from assistant_contract import compile_profile
from domosenso_render import _make_env


def generate(config: Path) -> None:
    destination = config / 'domosenso' / 'assistant'
    if destination.exists():
        raise ValueError('Use a fresh test config directory; existing assistant artifacts are preserved')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    destination.mkdir(parents=True)
    examples = {
        'climate-air': {'climate': [{'label': {'en': 'Office', 'pl': 'Pokój'},
                                   'temperature': 'sensor.demo_temperature'}]},
        'floorplan': {},
    }
    for component_id, inputs in examples.items():
        component = ROOT / 'components' / component_id
        manifest = yaml.safe_load((component / 'component.yaml').read_text())
        env = _make_env(component, inputs, 'en', {}, {})
        bindings = yaml.safe_load(env.get_template('assistant-bindings.yaml.j2').render())
        artifact = compile_profile(component, manifest, bindings, manifest['version'], revision, True)
        (destination / f'{component_id}.yaml').write_text(yaml.safe_dump(artifact, allow_unicode=True, sort_keys=False))
    print('ok fictional assistant profiles: climate-air, floorplan')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: generate_assistant_profiles.py <empty HA config directory>')
    generate(Path(sys.argv[1]))
