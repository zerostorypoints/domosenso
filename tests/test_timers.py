"""Classic Ramka composes HA timer controls without changing settings defaults."""
from pathlib import Path
import yaml
from domosenso_render import render_component
ROOT=Path(__file__).resolve().parents[1]

def render(tmp_path, timers):
    inputs=yaml.safe_load((ROOT/'examples/demo-home/inputs/ramka.yaml').read_text())
    inputs['timers']=timers
    render_component(ROOT/'components/ramka',inputs,tmp_path,['en'])
    return yaml.safe_load((tmp_path/'dashboard.en.yaml').read_text())

def walk(x):
    if isinstance(x,dict):
        yield x
        for v in x.values():yield from walk(v)
    elif isinstance(x,list):
        for v in x:yield from walk(v)

def test_timer_mapping_composes_ha_tile_and_badge(tmp_path):
    data=render(tmp_path,[{'entity':'timer.demo_cooking','label':'Cooking'}])
    tiles=[x for x in walk(data) if x.get('type')=='tile' and x.get('entity')=='timer.demo_cooking']
    assert len(tiles)==1
    assert 'features' not in tiles[0]  # timer-actions is absent in pinned frontend 20260826.7
    assert tiles[0]['icon']=='mdi:timer-outline'
    assert tiles[0]['tap_action']=={'action':'more-info'}
    badges=[x for x in walk(data) if x.get('type')=='custom:timer-status-card']
    assert len(badges)==1 and badges[0]['timers'][0]['entity']=='timer.demo_cooking'
    inputs=yaml.safe_load((ROOT/'examples/demo-home/inputs/ramka.yaml').read_text());inputs['timers']=[{'entity':'timer.demo','label':'Demo'}]
    render_component(ROOT/'components/ramka',inputs,tmp_path,['pl','de'])
    assert 'Minutniki' in (tmp_path/'dashboard.pl.yaml').read_text()
    assert 'Timer' in (tmp_path/'dashboard.de.yaml').read_text()

def test_no_timer_mapping_leaves_existing_controls(tmp_path):
    data=render(tmp_path,[])
    assert not [x for x in walk(data) if x.get('type')=='custom:timer-status-card']
