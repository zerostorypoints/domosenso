"""Pocket's Wi-Fi Shortcuts (SPEC-045): what tools/pocket_shortcuts.py writes, before signing."""
import plistlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

from pocket_shortcuts import FIELDS, NAMES, build, file_name  # noqa: E402

SHIPPED = ROOT / 'components/pocket/cards/shortcuts'


def ids(workflow: dict) -> list[str]:
    return [a['WFWorkflowActionIdentifier'] for a in workflow['WFWorkflowActions']]


def params(workflow: dict, ident: str) -> list[dict]:
    return [a['WFWorkflowActionParameters'] for a in workflow['WFWorkflowActions'] if a['WFWorkflowActionIdentifier'] == ident]


def test_event_shortcut_reads_every_field_and_fires_the_event_through_the_companion_app():
    w = build('event')
    assert w['WFWorkflowName'] == NAMES['event'] == 'Domosenso Wi-Fi'
    assert w['WFWorkflowHasShortcutInputVariables'] is True
    details = [p['WFWiFiDetail'] for p in params(w, 'is.workflow.actions.getwifi')]
    assert details == [detail for _, detail in FIELDS]
    assert set(details) == {'Network Name', 'BSSID', 'RSSI', 'Noise', 'Channel Number', 'Wi-Fi Standard', 'RX Rate',
                            'TX Rate', 'Hardware MAC Address'}
    (fire,) = params(w, 'io.robbie.HomeAssistant.FireEventIntent')
    assert fire['eventName'] == 'domosenso_wifi_reading'
    assert fire['AppIntentDescriptor']['AppIntentIdentifier'] == 'FireEventIntent'
    assert 'server' not in fire, 'the phone chooses its own server once (Amendment 1)'
    assert 'is.workflow.actions.openurl' not in ids(w), 'opening the app restarts it: the person goes back (Amendment 2)'
    assert ids(w)[-1] == 'is.workflow.actions.notification'
    (note,) = params(w, 'is.workflow.actions.notification')
    assert 'Home Assistant' in note['WFNotificationActionBody']
    assert 'is.workflow.actions.output' not in ids(w)


def test_safari_shortcut_outputs_the_reading_and_needs_no_companion_app():
    w = build('callback')
    assert w['WFWorkflowName'] == NAMES['callback'] == 'Domosenso Wi-Fi Safari'
    assert not any('HomeAssistant' in i for i in ids(w))
    assert ids(w)[-1] == 'is.workflow.actions.output'


def test_the_reading_is_json_text_with_the_code_from_the_input():
    w = build('event')
    texts = [p['WFTextActionText']['Value']['string'] for p in params(w, 'is.workflow.actions.gettext')
             if isinstance(p.get('WFTextActionText'), dict)]
    assert any(t.startswith('{"code":"') and t.endswith(']}') for t in texts), texts
    scan = next(t for t in texts if t.startswith('{"t":"'))
    for key, _ in FIELDS:
        assert f'"{key}":"' in scan


def test_the_repeat_count_comes_from_the_input():
    (start, _) = params(build('event'), 'is.workflow.actions.repeat.count')
    assert start['WFRepeatCount']['WFSerializationType'] == 'WFTextTokenString'


def test_the_shipped_files_are_signed_shortcuts():
    for kind in NAMES:
        data = (SHIPPED / file_name(kind)).read_bytes()
        assert data[:4] == b'AEA1', f'{kind}: not signed'


def test_build_is_a_valid_plist():
    for kind in NAMES:
        assert plistlib.loads(plistlib.dumps(build(kind), fmt=plistlib.FMT_BINARY))['WFWorkflowActions']


def test_the_shortcuts_are_installed_with_the_cards():
    import yaml
    from catalog_check import install_files
    component = ROOT / 'components/pocket'
    manifest = yaml.safe_load((component / 'component.yaml').read_text(encoding='utf-8'))
    files = install_files(component, manifest)
    for kind in NAMES:
        assert f'cards/shortcuts/{file_name(kind)}' in files
