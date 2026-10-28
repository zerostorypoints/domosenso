"""Reproducible runtime acceptance. Missing prerequisites always fail the gate."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import time

from check_config_parse import count_errors
from .runtime import Demo, DemoError, IMAGE, run


class Results:
    def __init__(self, path, runtime_only=False):
        self.path = path
        self.runtime_only = runtime_only
        self.cases = []

    def case(self, name, action):
        try:
            detail = action()
            self.cases.append({'case': name, 'status': 'pass', 'detail': detail})
            print(f'ok   {name}', flush=True)
            return True
        except (DemoError, OSError, AssertionError, ValueError, KeyError) as exc:
            self.cases.append({'case': name, 'status': 'fail', 'detail': str(exc)})
            print(f'FAIL {name}: {exc}', flush=True)
            return False

    def finish(self):
        report = {'scope': 'runtime-only (browser not run)' if self.runtime_only else 'runtime and browser', 'cases': self.cases, 'known_component_issues': ['#51 first-install tuning', '#52 startup reconciliation', '#53 forecast reconnect']}
        (self.path / 'check.json').write_text(json.dumps(report, indent=2))
        failed = [case['case'] for case in self.cases if case['status'] == 'fail']
        if failed:
            raise DemoError('demo checks failed: ' + ', '.join(failed) + f'; evidence: {self.path}/check.json')
        return report


def require(condition, detail):
    if not condition:
        raise DemoError(detail)


def wait_state(demo, entity, expected, timeout=20):
    deadline = time.monotonic() + timeout
    state = None
    while time.monotonic() < deadline:
        state = demo.api('/api/states/' + entity)['state']
        if state == expected:
            return
        time.sleep(.4)
    raise DemoError(f'{entity}: expected {expected}, observed {state}')


def services(demo):
    light = 'light.kitchen'
    demo.api('/api/services/light/turn_on', {'entity_id': light, 'brightness': 155})
    wait_state(demo, light, 'on')
    require(demo.api('/api/states/' + light)['attributes']['brightness'] == 155, 'light brightness effect missing')
    demo.api('/api/services/light/turn_off', {'entity_id': light})
    wait_state(demo, light, 'off')
    demo.api('/api/services/media_player/media_play', {'entity_id': 'media_player.living_room_speaker'})
    wait_state(demo, 'media_player.living_room_speaker', 'playing')
    demo.api('/api/services/media_player/media_pause', {'entity_id': 'media_player.living_room_speaker'})
    wait_state(demo, 'media_player.living_room_speaker', 'paused')
    demo.api('/api/services/media_player/volume_set', {'entity_id': 'media_player.living_room_speaker', 'volume_level': .4})
    require(demo.api('/api/states/media_player.living_room_speaker')['attributes']['volume_level'] == .4, 'volume service had no effect')
    forecasts = demo.api('/api/services/weather/get_forecasts?return_response', {'entity_id': 'weather.forecast_home', 'type': 'daily'})
    require(len(forecasts['service_response']['weather.forecast_home']['forecast']) == 5, 'forecast service missing')
    demo.api('/api/services/notify/mobile_app_dining_tablet', {'message': 'command_screen_on'})
    state = demo.api('/api/states/sensor.domosenso_demo_actions')
    require(state['attributes']['last_action']['domain'] == 'notify', 'tablet action not recorded')
    require(state['attributes']['last_action']['data']['message'] == 'command_screen_on', 'recorded tablet action differs')
    return 'Registered light/media/weather/notify services changed synthetic state; tablet wake recorded only'


def scenes(demo):
    fixture = json.loads((demo.config / 'demo.json').read_text())
    for name, scene in fixture['scenes'].items():
        demo.scenario(name)
        expected = {**fixture['baseline']['states'], **scene['states']}
        for entity in ['sensor.outside_temperature', 'light.kitchen', 'media_player.living_room_speaker']:
            require(demo.api('/api/states/' + entity)['state'] == str(expected[entity]), f'{name}: incorrect synthetic state for {entity}')
    return {'scenes': sorted(fixture['scenes']), 'scope': 'upstream fixture states; no clock/time travel or hardware emulation'}


def network_check(demo):
    """Prove a controlled endpoint is live, and HA cannot reach it from its internal network."""
    endpoint = demo.resource + '-endpoint'
    if demo.inspect(resource=endpoint):
        raise DemoError('controlled endpoint already exists; refusing to adopt it')
    try:
        run(['docker', 'run', '-d', '--pull=never', '--name', endpoint, *demo.labels(),
             '--network', demo.ui_resource, '--cap-drop=ALL', '--security-opt=no-new-privileges',
             '--read-only', '--entrypoint', 'python', IMAGE, '-m', 'http.server', '8765'])
        address = json.loads(run(['docker', 'inspect', endpoint]).stdout)[0]['NetworkSettings']['Networks'][demo.ui_resource]['IPAddress']
        probe = "import urllib.request; print(urllib.request.urlopen('http://%s:8765',timeout=2).status)" % address
        # Positive control on a separate UI network. Retry only the endpoint's server readiness.
        deadline = time.monotonic() + 15
        while True:
            result = run(['docker', 'exec', demo.ui_resource, 'python', '-c', probe], check=False)
            if result.returncode == 0:
                break
            if time.monotonic() > deadline:
                raise DemoError('controlled endpoint positive control failed: ' + result.stderr)
            time.sleep(.3)
        result = run(['docker', 'exec', demo.resource, 'python', '-c', probe], check=False, timeout=10)
        require(result.returncode != 0, 'HA can reach controlled endpoint outside internal network')
        routes = run(['docker', 'exec', demo.resource, 'cat', '/proc/net/route']).stdout
        require(not any(line.split()[1] == '00000000' for line in routes.splitlines()[1:]), 'HA unexpectedly has a default route')
        return {'positive_control': 'HTTP 200 from UI network', 'ha_egress': 'rejected', 'default_route': 'absent'}
    finally:
        obj = demo.inspect(resource=endpoint)
        if obj:
            run(['docker', 'rm', '-f', endpoint])


def config_check(demo):
    result = run(['docker', 'exec', demo.resource, 'python', '-m', 'homeassistant', '--script', 'check_config', '-c', '/config', '--json'], timeout=90, check=False)
    (demo.path / 'config-check.json').write_text(result.stdout)
    (demo.path / 'config-check.stderr').write_text(result.stderr)
    errors, lines = count_errors(result.stdout + '\n' + result.stderr)
    require(result.returncode == 0 and errors == 0, f'HA config check failed: exit {result.returncode}, {errors} errors: {lines}')
    return {'errors': errors}


def check(demo, runtime_only=False):
    demo.ensure(False)
    results = Results(demo.path, runtime_only)
    if not results.case('prerequisites and ownership', lambda: (run(['docker', 'info'], timeout=15), demo.audit(demo.inspect()), demo.ready(30), 'ready')[-1]):
        return results.finish()
    results.case('generated HA configuration', lambda: config_check(demo))
    results.case('registered synthetic service effects', lambda: services(demo))
    results.case('all existing catalog scene upstream states', lambda: scenes(demo))
    results.case('internal network and controlled egress rejection', lambda: network_check(demo))

    peer_name = 'check-' + hashlib.sha256(demo.name.encode()).hexdigest()[:12]
    peer = Demo(demo.root, peer_name)
    peer_created = False
    def concurrency():
        nonlocal peer_created
        require(not peer.path.exists(), 'acceptance peer already exists; refusing to adopt existing state')
        peer_created = True
        peer.up()
        expected = {'near_cm': 100, 'near_s': 1, 'controls_hold_s': 5, 'off_delay_s': 300, 'brightness_min': 16, 'brightness_max': 204, 'lux_max': 200}
        observed = {key: float(peer.api('/api/states/input_number.ramka_' + key)['state']) for key in expected}
        results.cases.append({'case': 'fresh-start component tuning (#51)', 'status': 'observation',
                              'detail': {'result': 'observed failure' if observed != expected else 'not reproduced', 'expected': expected, 'observed': observed}})
        peer.api('/api/services/input_select/select_option', {'entity_id': 'input_select.ramka_mode', 'option': 'off'})
        peer.down(); peer.up()
        print('observing startup reconciliation (#52) for 60 seconds', flush=True)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            time.sleep(min(1, deadline - time.monotonic()))
        mode = peer.api('/api/states/input_select.ramka_mode')['state']
        presence = peer.api('/api/states/binary_sensor.dining_ble_proxy_dining_presence')['state']
        results.cases.append({'case': 'restored off mode with present radar (#52)', 'status': 'observation',
                              'detail': {'result': 'observed failure' if presence == 'on' and mode == 'off' else 'not reproduced', 'presence': presence, 'modeAfter60Seconds': mode}})
        require(demo.metadata()['port'] != peer.metadata()['port'], 'instances share a port')
        demo.audit(demo.inspect()); peer.audit(peer.inspect())
        demo.api('/api/services/input_number/set_value', {'entity_id': 'input_number.ramka_near_cm', 'value': 130})
        peer.api('/api/services/input_number/set_value', {'entity_id': 'input_number.ramka_near_cm', 'value': 170})
        wait_state(demo, 'input_number.ramka_near_cm', '130.0')
        wait_state(peer, 'input_number.ramka_near_cm', '170.0')
        before = peer.api('/api/states/input_number.ramka_near_cm')['last_changed']
        demo.down(); demo.up()
        wait_state(demo, 'input_number.ramka_near_cm', '130.0')
        wait_state(peer, 'input_number.ramka_near_cm', '170.0')
        require(peer.api('/api/states/input_number.ramka_near_cm')['last_changed'] == before, 'peer changed during primary restart')
        peer.reset(peer.name)
        require(not peer.path.exists(), 'peer reset left generated state')
        demo.api('/api/')
        return 'Distinct containers, networks, ports; helper restored; peer unchanged; reset only removed peer'
    try:
        results.case('concurrent instances, restart persistence and reset isolation', concurrency)
    finally:
        if peer_created and peer.path.exists():
            results.case('acceptance peer cleanup', lambda: peer.reset(peer.name))

    def browser():
        command = ['node', demo.root / 'tests/dev_home_browser.mjs', demo.path]
        result = run(command, timeout=240, check=False)
        (demo.path / 'browser.stdout').write_text(result.stdout)
        (demo.path / 'browser.stderr').write_text(result.stderr)
        require(result.returncode == 0, 'browser acceptance failed; see browser.stdout, browser.stderr and browser.json')
        return json.loads((demo.path / 'browser.json').read_text())
    if not runtime_only:
        results.case('real HA frontend, en/de/pl, desktop/tablet, open-page restart', browser)
    # Component defects are explicit observations, separate from launcher infrastructure gates.
    results.cases.append({'case': 'component reliability coverage', 'status': 'observation',
                          'detail': 'Fresh and restored component observations are above. ' + ('Browser/#53 not run in runtime-only scope.' if runtime_only else 'See browser.json for delayed-weather #53 reconnect observation.') + ' No component fixes are included.'})
    return results.finish()
