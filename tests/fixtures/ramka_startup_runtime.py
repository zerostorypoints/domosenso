"""Exercise rendered startup actions with HA's real script engine and an unavailable peer."""
import asyncio
import copy
import logging
import re
import tempfile
from pathlib import Path

import yaml
from homeassistant.core import Context, HomeAssistant, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import Script

LOGS = []


class LogCapture(logging.Handler):
    def emit(self, record):
        LOGS.append(record.getMessage())


logging.getLogger().handlers[:] = [LogCapture()]
logging.getLogger().setLevel(logging.INFO)
PACKAGE = yaml.safe_load(Path('/fixture/package.yaml').read_text())
CONTROLLER = next(a for a in PACKAGE['automation'] if a['id'] == 'ramka_reconcile_after_start')
PRESENCE = CONTROLLER['actions'][-1]['choose'][0]['conditions'][0]['entity_id']
WAKE = PACKAGE['script']['ramka_screen_on']
BATTERY = 'sensor.' + re.search(r'states.sensor.([a-z0-9_]+)', WAKE['sequence'][0]['value_template'])[1]
NOTIFY = next(step['action'] for step in WAKE['sequence'] if step.get('action', '').startswith('notify.'))


def walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)


async def check(mode='ambient', presence='on', failures=2, arrive=False, disappear=False,
                overlap=False, register_late=False, ignore_receipt=False):
    with tempfile.TemporaryDirectory() as directory:
        logs_before = len(LOGS)
        hass = HomeAssistant(directory)
        attempts = []
        sleeps = []
        entered = asyncio.Event()
        release = asyncio.Event()

        async def notify(call):
            if call.data.get('message') != 'command_screen_off_timeout':
                return
            attempts.append(1)
            if overlap and len(attempts) == 1:
                entered.set()
                await release.wait()
            if disappear:
                hass.states.async_set(PRESENCE, 'off')
            if len(attempts) <= failures:
                raise HomeAssistantError('Fixture screen client is not connected')

        async def sleep(call):
            sleeps.append(1)

        async def select(call):
            entities = call.data['entity_id']
            for entity in entities if isinstance(entities, list) else [entities]:
                hass.states.async_set(entity, call.data['option'])

        async def cancel(call):
            pass

        hass.services.async_register(*NOTIFY.split('.', 1), notify)
        real_wake = Script(hass, cv.SCRIPT_SCHEMA(WAKE['sequence']), 'screen fixture',
                           'script', script_mode=WAKE['mode'])

        async def wake_service(call):
            result = await real_wake.async_run(context=call.context)
            return result.service_response if result is not None else None

        # Match the core script service adapter, retaining the real single-mode run behavior.
        hass.services.async_register('script', 'ramka_screen_on', wake_service,
                                     supports_response=SupportsResponse.OPTIONAL)
        hass.services.async_register('script', 'ramka_screen_off', sleep)
        hass.services.async_register('input_select', 'select_option', select)
        hass.services.async_register('timer', 'cancel', cancel)
        hass.states.async_set(PRESENCE, presence)
        hass.states.async_set('input_select.ramka_mode', mode)
        hass.states.async_set('input_number.ramka_off_delay_s', '1')
        if not register_late:
            hass.states.async_set(BATTERY, '80')
        await hass.async_start()
        if ignore_receipt:
            await hass.services.async_call('script', 'ramka_screen_on', {}, blocking=True, context=Context())
            await hass.async_stop()
            return len(attempts), 0, mode, None
        actions = copy.deepcopy(CONTROLLER['actions'])
        # Keep the actual bound and conditions; shorten only the retry cadence for this test.
        for node in walk(actions):
            if node.get('delay') == '00:00:05':
                node['delay'] = {'milliseconds': 1}
        script = Script(hass, cv.SCRIPT_SCHEMA(actions), 'startup fixture', 'automation')
        async def approach():
            await asyncio.sleep(0.02)
            hass.states.async_set(PRESENCE, 'on')
        task = asyncio.create_task(approach()) if arrive else None
        async def register():
            await asyncio.sleep(0.005)
            hass.states.async_set(BATTERY, '80')
        registration = asyncio.create_task(register()) if register_late else None
        external = None
        if overlap:
            external = asyncio.create_task(hass.services.async_call(
                'script', 'ramka_screen_on', {}, blocking=True, return_response=True, context=Context()))
            await entered.wait()
        run = asyncio.create_task(script.async_run(context=Context()))
        if overlap:
            await asyncio.sleep(0.005)
            assert not run.done(), 'a skipped busy script must not count as successful delivery'
            release.set()
            try:
                await external
            except HomeAssistantError:
                pass
        error = None
        try:
            await run
        except HomeAssistantError as caught:
            error = caught
        if task:
            await task
        if registration:
            await registration
        final_mode = hass.states.get('input_select.ramka_mode').state
        await hass.async_stop()
        # A top-level HA stop(error=true) is logged and traced rather than re-raised.
        if error is None:
            error = next((message for message in LOGS[logs_before:]
                          if 'did not accept the startup policy' in message), None)
        return len(attempts), len(sleeps), final_mode, error


async def main():
    for mode in ('off', 'ambient', 'controls', 'calendar'):
        calls, sleeps, final_mode, error = await check(mode=mode)
        assert (calls, sleeps, final_mode, error) == (3, 0, 'ambient' if mode == 'off' else mode, None)
    calls, sleeps, _, error = await check(presence='off', arrive=True)
    assert (calls, sleeps, error) == (3, 0, None), 'arrival must interrupt the startup wait'
    calls, sleeps, mode, error = await check(presence='off', mode='off')
    assert (calls, sleeps, mode, error) == (0, 1, 'off', None), 'off helper must still actuate sleep'
    calls, _, _, error = await check(failures=100)
    assert calls == 24 and error is not None, (calls, error, LOGS[-3:])
    calls, _, _, error = await check(failures=100, disappear=True)
    assert calls == 1 and error is None, 'do not send wake commands after presence leaves'
    calls, _, _, error = await check(overlap=True)
    assert calls == 3 and error is None, 'overlapping real screen scripts must retry after a skip'
    calls, _, _, error = await check(register_late=True)
    assert calls == 3 and error is None, 'an unmet real screen guard must not count as delivery'
    calls, _, _, error = await check(failures=0, ignore_receipt=True)
    assert calls == 1 and error is None, 'existing callers can ignore the optional receipt'
    print('startup runtime: 11 cases passed (real screen script, late push, overlap, arrival, absence, bound)')


asyncio.run(main())
