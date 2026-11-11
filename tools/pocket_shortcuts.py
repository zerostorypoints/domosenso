#!/usr/bin/env python3
"""Pocket's iPhone Shortcuts for the Wi-Fi survey (SPEC-045, Amendment 1), written as code so they are
reproducible and reviewed: binary plists, then signed for anyone with macOS's `shortcuts sign`.

    uv run tools/pocket_shortcuts.py [--out components/pocket/cards/shortcuts] [--no-sign]

- "Domosenso Wi-Fi" (event): its input is Pocket's JSON {code, n, mode, return}. It reads Get Network
  Details n times, 1 s apart, every field as text, builds the reading as JSON text {code, scans}, fires
  `domosenso_wifi_reading` with the Companion app's Fire event action and shows a notification to go back
  to Home Assistant; it does not open the app, which would restart it (Amendment 2).
  The action's Server is left empty: it is an entry each phone generates, so the person chooses it
  once after installing (verified in S0: `io.robbie.HomeAssistant.FireEventIntent`).
- "Domosenso Wi-Fi Safari" (callback): the same reading as the Shortcut's output, for Pocket opened in
  Safari without the Companion app; Shortcuts hands it back to Pocket through x-callback-url.

Every value goes into the JSON as a string; Pocket's lib/wifi-capture.js parseScans reads them.
"""
from __future__ import annotations

import argparse
import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'components/pocket/cards/shortcuts'
NAMES = {'event': 'Domosenso Wi-Fi', 'callback': 'Domosenso Wi-Fi Safari'}
EVENT = 'domosenso_wifi_reading'
HA_BUNDLE, HA_TEAM = 'io.robbie.HomeAssistant', 'QMQYCKL255'
# The reading's keys and the Get Network Details detail each comes from.
FIELDS = [('ssid', 'Network Name'), ('bssid', 'BSSID'), ('rssi', 'RSSI'), ('noise', 'Noise'),
          ('channel', 'Channel Number'), ('standard', 'Wi-Fi Standard'), ('rx', 'RX Rate'), ('tx', 'TX Rate'),
          ('mac', 'Hardware MAC Address')]
OBJ = '￼'

# Deterministic identifiers: the same source writes the same plist.
_ids = iter(())


def _uuid() -> str:
    return next(_ids)


def _action(ident: str, **params) -> dict:
    return {'WFWorkflowActionIdentifier': ident, 'WFWorkflowActionParameters': params}


def _out(action: dict, name: str) -> dict:
    return {'Type': 'ActionOutput', 'OutputUUID': action['WFWorkflowActionParameters']['UUID'], 'OutputName': name}


def _tokens(*parts) -> dict:
    """A text with variables: str parts and attachment dicts."""
    text, att = '', {}
    for part in parts:
        if isinstance(part, str):
            text += part
        else:
            att[f'{{{len(text)}, 1}}'] = part
            text += OBJ
    return {'Value': {'string': text, 'attachmentsByRange': att}, 'WFSerializationType': 'WFTextTokenString'}


def _attachment(ref: dict) -> dict:
    return {'Value': ref, 'WFSerializationType': 'WFTextTokenAttachment'}


def _with_uuid(action: dict) -> dict:
    action['WFWorkflowActionParameters']['UUID'] = _uuid()
    return action


def _value(dictionary: dict, key: str) -> dict:
    return _with_uuid(_action('is.workflow.actions.getvalueforkey', WFDictionaryKey=key,
                              WFInput=_attachment(_out(dictionary, 'Dictionary'))))


def build(kind: str) -> dict:
    """The workflow of one Shortcut: kind `event` or `callback`."""
    global _ids
    _ids = (str(uuid.uuid5(uuid.NAMESPACE_URL, f'domosenso-pocket-wifi/{kind}/{i}')).upper() for i in range(10_000))
    inp = _with_uuid(_action('is.workflow.actions.detect.dictionary', WFInput=_attachment({'Type': 'ExtensionInput'})))
    code, count, back = _value(inp, 'code'), _value(inp, 'n'), _value(inp, 'return')
    group = _uuid()
    body, parts = [], ['{']
    date = _with_uuid(_action('is.workflow.actions.date', WFDateActionMode='Current Date'))
    iso = _with_uuid(_action('is.workflow.actions.format.date', WFDateFormatStyle='ISO 8601', WFISO8601IncludeTime=True,
                             WFDate=_tokens(_out(date, 'Date'))))
    body += [date, iso]
    parts += ['"t":"', _out(iso, 'Formatted Date'), '"']
    for key, detail in FIELDS:
        get = _with_uuid(_action('is.workflow.actions.getwifi', WFNetworkDetailsNetwork='Wi-Fi', WFWiFiDetail=detail))
        body.append(get)
        parts += [f',"{key}":"', _out(get, 'Network Details'), '"']
    parts.append('}')
    scan = _with_uuid(_action('is.workflow.actions.gettext', WFTextActionText=_tokens(*parts)))
    body += [scan, _action('is.workflow.actions.appendvariable', WFVariableName='scans', WFInput=_attachment(_out(scan, 'Text'))),
             _action('is.workflow.actions.delay', WFDelayTime=1)]
    loop = [_action('is.workflow.actions.repeat.count', GroupingIdentifier=group, WFControlFlowMode=0,
                    WFRepeatCount=_tokens(_out(count, 'Dictionary Value'))),
            *body,
            _with_uuid(_action('is.workflow.actions.repeat.count', GroupingIdentifier=group, WFControlFlowMode=2))]
    joined = _with_uuid(_action('is.workflow.actions.text.combine', WFTextSeparator='Custom', WFTextCustomSeparator=',',
                                text=_attachment({'Type': 'Variable', 'VariableName': 'scans'})))
    reading = _with_uuid(_action('is.workflow.actions.gettext', WFTextActionText=_tokens(
        '{"code":"', _out(code, 'Dictionary Value'), '","scans":[', _out(joined, 'Combined Text'), ']}')))
    actions = [inp, code, count, back, *loop, joined, reading]
    if kind == 'event':
        actions.append(_with_uuid(_action(
            f'{HA_BUNDLE}.FireEventIntent', eventName=EVENT, eventData=_tokens(_out(reading, 'Text')),
            AppIntentDescriptor={'TeamIdentifier': HA_TEAM, 'BundleIdentifier': HA_BUNDLE, 'Name': 'Home Assistant',
                                 'AppIntentIdentifier': 'FireEventIntent'})))
        # No return to the app: opening it from Shortcuts restarts it (Amendment 2). The person goes back.
        actions.append(_action('is.workflow.actions.notification', WFNotificationActionTitle=NAMES['event'],
                               WFNotificationActionBody='Reading sent. Go back to Home Assistant.'))
    else:
        actions.append(_action('is.workflow.actions.output', WFOutput=_tokens(_out(reading, 'Text')),
                               WFNoOutputSurfaceBehavior='Respond'))
    return {'WFWorkflowName': NAMES[kind], 'WFWorkflowActions': actions, 'WFWorkflowClientVersion': '2607.0.3',
            'WFWorkflowMinimumClientVersion': 900, 'WFWorkflowMinimumClientVersionString': '900',
            'WFWorkflowHasShortcutInputVariables': True, 'WFWorkflowInputContentItemClasses': ['WFStringContentItem'],
            'WFWorkflowOutputContentItemClasses': [], 'WFWorkflowTypes': [], 'WFQuickActionSurfaces': [],
            'WFWorkflowImportQuestions': [],
            'WFWorkflowIcon': {'WFWorkflowIconStartColor': 463140863, 'WFWorkflowIconGlyphNumber': 59511}}


# Named as Pocket runs them: Shortcuts names an imported file after the file, not after its WFWorkflowName.
FILES = {kind: f'{name}.shortcut' for kind, name in NAMES.items()}


def file_name(kind: str) -> str:
    return FILES[kind]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--out', type=Path, default=OUT)
    parser.add_argument('--no-sign', action='store_true', help='write the unsigned plists only')
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    for kind in NAMES:
        dest = args.out / file_name(kind)
        data = plistlib.dumps(build(kind), fmt=plistlib.FMT_BINARY)
        if args.no_sign:
            dest.write_bytes(data)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                unsigned = Path(tmp) / 'unsigned.shortcut'
                unsigned.write_bytes(data)
                done = subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(dest)],
                                      capture_output=True, text=True)
                if done.returncode != 0:
                    print(f'FAIL shortcuts sign {dest.name}: {done.stderr.strip()}')
                    return 1
        print(f'wrote {dest.relative_to(ROOT) if dest.is_relative_to(ROOT) else dest}')
    print('ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
