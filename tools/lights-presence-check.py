#!/usr/bin/env python3
"""Run the lights component's presence room (SPEC-053) on a throwaway Home Assistant and check it.

Renders the package with a test room whose off delay is 10 s, adds stand-ins for the radar and the
Hue group (tests/fixtures/lights-presence-standins.yaml), starts the pinned HA image in docker on a
free local port, and drives the room through the cases one after another. Prints `ok <case>` per
case and ends with `ok`, or `FAIL <case>: <reason>` (exit 1). Talks to no other Home Assistant.

    uv run tools/lights-presence-check.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import yaml

from domosenso_render import render_component

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'homeassistant/home-assistant:2026.9.2'
OFF_AFTER = 10  # seconds
ROOM = {'group': 'light.office', 'name': 'Office', 'presence': 'binary_sensor.office_presence',
        'illuminance': 'sensor.office_illuminance', 'dark_below': 15, 'off_after': '00:00:10',
        'distance': 'sensor.office_presence_distance'}
CONFIG = """homeassistant:
  name: Presence check
  time_zone: UTC
  latitude: 0
  longitude: 0
  elevation: 0
  unit_system: metric
  packages: !include_dir_named packages
http:
api:
onboarding:
recorder:
  commit_interval: 1
logbook:
automation:
"""


class Failure(Exception):
    pass


class HA:
    def __init__(self, url):
        self.url, self.token = url, None

    def call(self, path, data=None, method=None, auth=True, timeout=30):
        headers = {'Content-Type': 'application/json'}
        if auth:
            headers['Authorization'] = f'Bearer {self.token}'
        body = json.dumps(data).encode() if data is not None else None
        with urlopen(Request(self.url + path, data=body, headers=headers, method=method), timeout=timeout) as r:
            return json.load(r)

    def wait_ready(self, timeout=180):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                return self.call('/api/onboarding', auth=False)
            except (URLError, OSError, ValueError):
                time.sleep(1)
        raise Failure('Home Assistant did not start')

    def onboard(self):
        client = self.url + '/'
        result = self.call('/api/onboarding/users', {
            'client_id': client, 'name': 'Check', 'username': 'check',
            'password': secrets.token_urlsafe(24), 'language': 'en'}, auth=False)
        req = Request(self.url + '/auth/token', data=urlencode({
            'grant_type': 'authorization_code', 'code': result['auth_code'], 'client_id': client}).encode())
        with urlopen(req, timeout=10) as r:
            self.token = json.load(r)['access_token']

    def state(self, entity):
        try:
            return self.call(f'/api/states/{entity}')['state']
        except HTTPError:
            return None

    def service(self, domain, service, **data):
        self.call(f'/api/services/{domain}/{service}', data)

    def logbook(self, since, entity='light.office'):
        stamp = since.strftime('%Y-%m-%dT%H:%M:%S+00:00')
        return [e.get('message', '') for e in self.call(f'/api/logbook/{stamp}?entity={entity}')
                if e.get('name') == 'Office']


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def wait_for(ha, entity, value, timeout, case):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if ha.state(entity) == value:
            return
        time.sleep(0.5)
    raise Failure(f'{case}: {entity} is {ha.state(entity)!r}, expected {value!r} within {timeout}s')


def stays(ha, entity, value, seconds, case):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if ha.state(entity) != value:
            raise Failure(f'{case}: {entity} became {ha.state(entity)!r}, expected it to stay {value!r}')
        time.sleep(0.5)


def trigger_start(ha):
    # automation.trigger answers only when the run ends, and this run waits off_after for presence:
    # send it from a thread so the check can bring presence in meanwhile.
    thread = threading.Thread(target=ha.service, args=('automation', 'trigger'), daemon=True,
                              kwargs={'entity_id': 'automation.lights_presence_office_start', 'skip_condition': False})
    thread.start()
    return thread


def presence(ha, on):
    ha.service('input_boolean', 'turn_on' if on else 'turn_off', entity_id='input_boolean.office_presence_raw')


def lux(ha, value):
    ha.service('input_number', 'set_value', entity_id='input_number.office_lux', value=value)


def now():
    return datetime.now(timezone.utc)


def cases(ha):
    hold = 'input_boolean.lights_presence_office_hold'
    bulb = 'light.office_bulb_1'

    # Daylight, and a reading that does not change for longer than the 2-minute median window.
    lux(ha, 100)
    time.sleep(125)
    presence(ha, True)
    stays(ha, bulb, 'off', 5, 'steady daylight')
    print('ok steady daylight: no switch-on at entry, the median kept its last sample')
    presence(ha, False)
    time.sleep(2)

    # An unavailable illuminance counts as dark.
    ha.service('input_boolean', 'turn_on', entity_id='input_boolean.office_lux_unavailable')
    presence(ha, True)
    wait_for(ha, bulb, 'on', 10, 'illuminance unavailable')
    print('ok illuminance unavailable: switched on')

    # Leaving: off after off_after, with the last distance in the logbook.
    ha.service('input_number', 'set_value', entity_id='input_number.office_distance', value=77)
    time.sleep(2)
    since = now()
    presence(ha, False)
    ha.service('input_number', 'set_value', entity_id='input_number.office_distance', value=0)
    stays(ha, bulb, 'on', OFF_AFTER - 3, 'leaving')
    wait_for(ha, bulb, 'off', 10, 'leaving')
    time.sleep(2)
    lines = [m for m in ha.logbook(since) if 'switched off' in m]
    if not lines or '77' not in lines[-1]:
        raise Failure(f'leaving: logbook {ha.logbook(since)!r} has no switch-off line with 77')
    print(f'ok leaving: off after {OFF_AFTER}s, logbook: {lines[-1]}')

    # Entry in the dark.
    ha.service('input_boolean', 'turn_off', entity_id='input_boolean.office_lux_unavailable')
    lux(ha, 2)
    # The daylight samples leave the 2-minute median window; a real radar reports every second, so
    # there the median turns within the window without a two-sample average in between.
    time.sleep(125)
    since = now()
    presence(ha, True)
    wait_for(ha, bulb, 'on', 10, 'entry in the dark')
    time.sleep(2)
    if not any('switched on' in m for m in ha.logbook(since)):
        raise Failure('entry in the dark: no switch-on line in the logbook')
    print('ok entry in the dark: switched on, logbook line written')

    # The room's own light does not reach the ambient reading.
    ambient = 'sensor.lights_presence_office_ambient'
    before = ha.state(ambient)
    lux(ha, 40)
    stays(ha, ambient, before, 4, 'own light held')
    lux(ha, 2)
    print(f'ok own light held: ambient stayed {before} while the lit room read 40')

    # A flapping sensor with the light on: nothing switches, no new switch-on line.
    since = now()
    for _ in range(8):
        presence(ha, False); time.sleep(1.5)
        presence(ha, True); time.sleep(1.5)
    stays(ha, bulb, 'on', 2, 'flapping presence')
    if any('switched on' in m for m in ha.logbook(since)):
        raise Failure('flapping presence: a new switch-on line was written')
    print('ok flapping presence: light stayed on, nothing logged')

    # Switched off by hand while present: held through a short drop-out, released after off_after.
    ha.service('light', 'turn_off', entity_id='light.office')
    wait_for(ha, hold, 'on', 5, 'switch-off by hand')
    presence(ha, False); time.sleep(4); presence(ha, True)
    stays(ha, bulb, 'off', 4, 'switch-off by hand, short drop-out')
    presence(ha, False)
    wait_for(ha, hold, 'off', OFF_AFTER + 5, 'switch-off by hand, room empty')
    presence(ha, True)
    wait_for(ha, bulb, 'on', 10, 'switch-off by hand, next entry')
    print('ok switch-off by hand: held while present, released after the room was empty')

    # A light switched on in an empty room goes off after off_after.
    presence(ha, False)
    wait_for(ha, bulb, 'off', OFF_AFTER + 5, 'empty room')
    ha.service('light', 'turn_on', entity_id='light.office')
    wait_for(ha, bulb, 'on', 5, 'switched on in an empty room')
    stays(ha, bulb, 'on', OFF_AFTER - 3, 'switched on in an empty room')
    wait_for(ha, bulb, 'off', 10, 'switched on in an empty room')
    print('ok switched on in an empty room: off after off_after')

    # After a restart (the start automation, run by hand with the main one paused).
    ha.service('automation', 'turn_off', entity_id='automation.lights_presence_office')
    ha.service('light', 'turn_on', entity_id='light.office')
    wait_for(ha, bulb, 'on', 5, 'restart')
    trigger_start(ha)
    time.sleep(2); presence(ha, True)
    stays(ha, bulb, 'on', OFF_AFTER + 3, 'restart, room occupied')
    presence(ha, False); time.sleep(1)
    trigger_start(ha)
    wait_for(ha, bulb, 'off', OFF_AFTER + 5, 'restart, room empty')
    ha.service('automation', 'turn_on', entity_id='automation.lights_presence_office')
    print('ok restart: kept on when someone came in, off when nobody did')

    # Bulbs gone (a wall switch cut them): entry still runs, nothing errors.
    ha.service('input_boolean', 'turn_on', entity_id='input_boolean.office_bulbs_unavailable')
    wait_for(ha, bulb, 'unavailable', 5, 'bulbs unavailable')
    since = now()
    presence(ha, True)
    time.sleep(4)
    if not any('switched on' in m for m in ha.logbook(since)):
        raise Failure('bulbs unavailable: entry did not run to its logbook line')
    print('ok bulbs unavailable: entry ran, no turn-off')


def main():
    if subprocess.run(['docker', 'image', 'inspect', IMAGE], capture_output=True).returncode:
        print(f'FAIL image {IMAGE} is not present (docker pull it first)')
        return 1
    work = Path(tempfile.mkdtemp(prefix='lights-presence-'))
    config = work / 'config'
    (config / 'packages').mkdir(parents=True)
    (config / 'configuration.yaml').write_text(CONFIG)
    inputs = yaml.safe_load((ROOT / 'examples/demo-home/inputs/lights.yaml').read_text())
    inputs['presence_rooms'] = [ROOM]
    render_component(ROOT / 'components/lights', inputs, work / 'render', ['en'])
    shutil.copy(work / 'render/package.yaml', config / 'packages/lights.yaml')
    shutil.copy(ROOT / 'tests/fixtures/lights-presence-standins.yaml', config / 'packages/standins.yaml')
    port, name = free_port(), f'lights-presence-check-{os.getpid()}'
    subprocess.run(['docker', 'run', '-d', '--pull=never', '--name', name,
                    '--user', f'{os.getuid()}:{os.getgid()}', '-p', f'127.0.0.1:{port}:8123',
                    '-v', f'{config}:/config', '--entrypoint', 'python', IMAGE,
                    '-m', 'homeassistant', '-c', '/config', '--skip-pip'], check=True, capture_output=True)
    try:
        ha = HA(f'http://127.0.0.1:{port}')
        ha.wait_ready()
        ha.onboard()
        wait_for(ha, 'automation.lights_presence_office', 'on', 60, 'setup')
        cases(ha)
        errors = [line for line in (config / 'home-assistant.log').read_text().splitlines() if ' ERROR ' in line]
        if errors:
            raise Failure('Home Assistant logged errors:\n  ' + '\n  '.join(errors[:10]))
        print('ok no errors in the Home Assistant log')
    except (Failure, OSError) as exc:
        print(f'FAIL {exc}')
        for entity in ('sensor.office_illuminance', 'sensor.lights_presence_office_ambient',
                       'sensor.lights_presence_office_illuminance', 'input_boolean.lights_presence_office_hold'):
            try:
                print(f'  {entity}: {ha.call(f"/api/states/{entity}")}')
            except Exception as err:  # the report must not hide the failure above
                print(f'  {entity}: {err}')
        log = subprocess.run(['docker', 'logs', name], capture_output=True, text=True)
        (work / 'ha.log').write_text(log.stdout + log.stderr)
        print(f'log: {work / "ha.log"}')
        return 1
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
    shutil.rmtree(work, ignore_errors=True)
    print('ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
