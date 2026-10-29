"""Synthetic upstream boundaries; never loaded by a real home's configuration."""
from __future__ import annotations

import json
from pathlib import Path

import voluptuous as vol
from homeassistant.core import callback
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

DOMAIN = 'domosenso_demo'
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({vol.Optional('weather_delay', default=0): vol.All(vol.Coerce(int), vol.Range(min=0, max=60))})}, extra=vol.ALLOW_EXTRA)
PLATFORM_DOMAINS = {'light', 'media_player', 'weather', 'calendar'}


@callback
def record(hass, domain, service, data):
    """Record intended hardware actions locally, without calling any physical device."""
    runtime = hass.data[DOMAIN]
    runtime['actions'].append({'at': dt_util.utcnow().isoformat(), 'domain': domain, 'service': service, 'data': dict(data)})
    hass.states.async_set('sensor.domosenso_demo_actions', str(len(runtime['actions'])), {
        'friendly_name': 'Recorded demo actions', 'last_action': runtime['actions'][-1],
    })
    runtime['store'].async_delay_save(lambda: {'actions': runtime['actions']}, 1)


@callback
def publish(hass):
    runtime = hass.data[DOMAIN]
    for entity_id, state in runtime['states'].items():
        domain, slug = entity_id.split('.', 1)
        if domain in PLATFORM_DOMAINS or domain.startswith('input_') or slug.startswith('ramka_'):
            continue
        hass.states.async_set(entity_id, str(state), runtime['attributes'].get(entity_id, {}))
    for entity in runtime['entities'].values():
        entity.async_write_ha_state()


async def async_setup(hass, config):
    fixture = await hass.async_add_executor_job(
        lambda: json.loads(Path(hass.config.path('demo.json')).read_text())
    )
    store = Store(hass, 1, 'domosenso_demo_actions')
    stored = await store.async_load() or {'actions': []}
    runtime = hass.data[DOMAIN] = {
        **fixture, 'states': dict(fixture['baseline']['states']),
        'attributes': {key: dict(value) for key, value in fixture['baseline']['attributes'].items()},
        'entities': {}, 'actions': stored['actions'], 'store': store, 'queue_index': 0, 'weather_delay': config[DOMAIN]['weather_delay'],
    }
    publish(hass)
    hass.states.async_set('sensor.domosenso_demo_actions', str(len(runtime['actions'])),
                          {'friendly_name': 'Recorded demo actions',
                           'last_action': runtime['actions'][-1] if runtime['actions'] else None})

    async def scenario(call):
        scene_id = call.data['scene']
        if scene_id not in runtime['scenes']:
            raise vol.Invalid('unknown fictional scene')
        scene = runtime['scenes'][scene_id]
        runtime['states'] = {**runtime['baseline']['states'], **scene['states']}
        runtime['attributes'] = {key: {**value, **scene.get('attributes', {}).get(key, {})}
                                 for key, value in runtime['baseline']['attributes'].items()}
        publish(hass)
        weather = runtime['entities'].get('weather.forecast_home')
        if weather:
            await weather.async_update_listeners({'daily'})
        # Helpers and derived entities remain owned by the real component. Use its services.
        for entity_id, state in scene['states'].items():
            if entity_id.startswith('input_boolean.'):
                await hass.services.async_call('input_boolean', 'turn_on' if state == 'on' else 'turn_off', {'entity_id': entity_id}, blocking=True)
        tablet = scene.get('tablet')
        if tablet:
            for suffix, value in [('mode', tablet['mode']), ('ambient', tablet.get('page'))]:
                if value:
                    await hass.services.async_call('input_select', 'select_option', {'entity_id': 'input_select.ramka_' + suffix, 'option': value}, blocking=True)
        record(hass, DOMAIN, 'scenario', {'scene': scene_id})

    async def notification(call):
        record(hass, 'notify', call.service, call.data)

    async def generic_action(call):
        record(hass, call.domain, call.service, call.data)
        ids = call.data.get('entity_id', [])
        if isinstance(ids, str):
            ids = [ids]
        if call.domain == 'scene':
            for eid in runtime['states']:
                if eid.startswith('light.'):
                    runtime['states'][eid] = 'off'
        else:
            for eid in ids:
                if eid not in runtime['states']:
                    continue
                if call.domain == 'cover':
                    if call.service == 'stop_cover':
                        continue  # Record the stop intention; preserve position and state.
                    position = call.data.get('position', 100 if call.service == 'open_cover' else 0)
                    runtime['states'][eid] = 'open' if position else 'closed'
                    runtime['attributes'].setdefault(eid, {})['current_position'] = position
                elif call.domain == 'lock':
                    runtime['states'][eid] = 'locked' if call.service == 'lock' else 'unlocked'
        publish(hass)

    hass.services.async_register(DOMAIN, 'scenario', scenario, schema=vol.Schema({vol.Required('scene'): str}))
    for name in ['mobile_app_dining_tablet', 'mobile_app_alex_phone']:
        hass.services.async_register('notify', name, notification)
    for domain, services in {'cover': ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'], 'lock': ['lock', 'unlock'], 'scene': ['turn_on']}.items():
        for service in services:
            hass.services.async_register(domain, service, generic_action)
    return True


class DemoEntity(Entity):
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, hass, entity_id):
        self.hass = hass
        self.entity_id = entity_id
        self._attr_unique_id = 'domosenso_demo_' + entity_id
        self._attr_name = entity_id.split('.', 1)[1].replace('_', ' ').title()

    @property
    def runtime(self):
        return self.hass.data[DOMAIN]

    @property
    def fixture_attributes(self):
        return self.runtime['attributes'].get(self.entity_id, {})

    @property
    def extra_state_attributes(self):
        return {'demo': True}

    async def async_added_to_hass(self):
        self.runtime['entities'][self.entity_id] = self

    def change(self, service, state=None, **attributes):
        if state is not None:
            self.runtime['states'][self.entity_id] = state
        self.runtime['attributes'].setdefault(self.entity_id, {}).update(attributes)
        record(self.hass, self.entity_id.split('.')[0], service, {'entity_id': self.entity_id, **attributes})
        self.async_write_ha_state()
