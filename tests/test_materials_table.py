"""The Wi-Fi materials table (SPEC-044): its rows, bands and the P.2040 slab values behind it."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

from materials_table import slab_loss  # noqa: E402

MATERIALS = ROOT / 'components/floorplan/cards/lib/materials.json'
BAND_GHZ = {'2.4': 2.437, '5': 5.5, '6': 6.5}


def test_p2040_slab_values_match_the_spec_basis():
    assert round(slab_loss('concrete', 2.437, 0.20), 1) == 14.7
    assert round(slab_loss('concrete', 5.5, 0.20), 1) == 26.5
    assert round(slab_loss('brick', 2.437, 0.12), 1) == 3.8
    assert round(slab_loss('glass', 6.5, 0.004), 1) == 3.2


def test_table_has_the_spec_rows_and_bands():
    t = json.loads(MATERIALS.read_text())
    assert set(t['materials']) == {'drywall', 'wood', 'aerated_block', 'brick', 'concrete', 'reinforced_concrete',
        'concrete_thin', 'concrete_thick', 'glass', 'double', 'low_e', 'triple_low_e', 'metal', 'railing', 'interior',
        'exterior', 'slab'}
    assert t['materials']['low_e']['loss'] == {'2.4': 20, '5': 27, '6': 30} and t['materials']['low_e']['sd'] == 8
    assert t['bands']['5'] == {'mhz': 5500, 'l0': 47.3, 'tx': 23}
    assert t['bands']['2.4'] == {'mhz': 2437, 'l0': 40.2, 'tx': 20}
    assert t['bands']['6'] == {'mhz': 6500, 'l0': 48.7, 'tx': 23}
    # Amendment 2: an unset home assumes thin concrete inside and thick concrete outside.
    assert t['defaults'] == {'interior': 'concrete_thin', 'exterior': 'concrete_thick', 'slab': 'slab', 'window': 'double',
                             'door': 'wood'}
    for m in t['materials'].values():
        assert set(m) == {'loss', 'sd', 'for', 'basis'} and set(m['loss']) == {'2.4', '5', '6'}
        assert set(m['for']) <= {'wall', 'window', 'door', 'slab'} and m['basis']


def test_every_homogeneous_prior_is_at_least_its_slab_value():
    # Ruling R1: 0.5 dB tolerance (the spec keeps glass 6 GHz = 3 although P.2040 gives 3.2).
    t = json.loads(MATERIALS.read_text())['materials']
    thin = {'drywall': ('plasterboard', 0.0125), 'wood': ('wood', 0.04), 'brick': ('brick', 0.12),
            'concrete': ('concrete', 0.10), 'reinforced_concrete': ('concrete', 0.20), 'glass': ('glass', 0.004),
            'concrete_thin': ('concrete', 0.10), 'concrete_thick': ('concrete', 0.25)}
    for mid, (ref, d) in thin.items():
        for band, f in BAND_GHZ.items():
            assert t[mid]['loss'][band] >= slab_loss(ref, f, d) - 0.5, (mid, band)


def test_door_and_window_material_sets_match_the_plan_document():
    t = json.loads(MATERIALS.read_text())['materials']
    glazing = {'glass', 'double', 'low_e', 'triple_low_e'}
    assert {k for k, m in t.items() if 'door' in m['for']} == {'wood', 'metal'} | glazing
    assert {k for k, m in t.items() if 'window' in m['for']} == glazing
    walls = {k for k, m in t.items() if 'wall' in m['for']}
    assert glazing | {'concrete_thin', 'concrete_thick'} <= walls
    assert {k for k, m in t.items() if 'slab' in m['for']} == {'reinforced_concrete', 'concrete_thick', 'slab'}


def test_thin_and_thick_concrete_rows_are_the_spec_priors():
    t = json.loads(MATERIALS.read_text())['materials']
    assert t['concrete_thin']['loss'] == {'2.4': 9, '5': 14, '6': 16} and t['concrete_thin']['sd'] == 4
    assert t['concrete_thin']['for'] == ['wall']
    assert t['concrete_thick']['loss'] == {'2.4': 20, '5': 33, '6': 37} and t['concrete_thick']['sd'] == 6
    assert t['concrete_thick']['for'] == ['wall', 'slab']


def test_railing_row_is_the_spec_prior():
    # Amendment 3: open bars or a mesh, for a balcony's railing or a staircase's balustrade.
    t = json.loads(MATERIALS.read_text())['materials']
    assert t['railing']['loss'] == {'2.4': 2, '5': 3, '6': 3} and t['railing']['sd'] == 2
    assert t['railing']['for'] == ['wall']
