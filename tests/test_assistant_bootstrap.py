"""The shared bootstrap includes real compiled plant metadata, not a handwritten adapter."""
import importlib.util
from pathlib import Path
import yaml


def test_bootstrap_compiles_plant_names_sources_and_nondefault_policy(tmp_path):
    path=Path(__file__).with_name('generate_assistant_profiles.py')
    spec=importlib.util.spec_from_file_location('bootstrap_profiles',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.generate(tmp_path)
    bundle_path=tmp_path/'domosenso/assistant/plants.yaml'
    assert bundle_path.exists(), 'Fresh bootstrap must exercise plant activation as well as temperature'
    bundle=yaml.safe_load(bundle_path.read_text());row=bundle['bindings']['subjects'][0]
    assert row['label']['en']=='Fern' and row['label']['pl']=='Paproć'
    assert row['limits']['min_moisture']==30
    assert row['fields']['moisture']['entity']=='sensor.demo_fern_moisture'
    assert {'plants.status','plants.watering_need'} <= {cap['id'] for cap in bundle['definitions']['capabilities']}
