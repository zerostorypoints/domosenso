"""Per node: down/up throughput (the sum of its clients) and a BSSID per band; for the router: the
whole network's totals (the card excludes `total_`) and the time of the last successful poll."""
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from . import CLIENTS, DOMAIN, NODES, SIGNAL, node_device

UNIT = 'kB/s'


async def async_setup_entry(hass, entry, async_add_entities):
    entities = []
    for key, node in NODES.items():
        mine = [c for c in CLIENTS if c[3] == key]
        entities += [
            Value(f'{key}_down', f"{node['name']} down", node_device(key), round(sum(c[5] for c in mine), 1), UNIT),
            Value(f'{key}_up', f"{node['name']} up", node_device(key), round(sum(c[6] for c in mine), 1), UNIT),
        ]
        entities += [Value(f'{key}_bssid_{band}', f"{node['name']} BSSID {band.replace('_', '.')}", node_device(key), mac)
                     for band, mac in node['bssid'].items()]
    router = {'identifiers': {(DOMAIN, 'router')}}
    entities += [
        Value('demo_router_total_down', 'Demo router total down', router, round(sum(c[5] for c in CLIENTS), 1), UNIT),
        Value('demo_router_total_up', 'Demo router total up', router, round(sum(c[6] for c in CLIENTS), 1), UNIT),
        LastUpdate(router),
    ]
    async_add_entities(entities)


class Value(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, object_id, name, device, value, unit=None):
        self.entity_id = f'sensor.{object_id}'
        self._attr_unique_id = f'{DOMAIN}_{object_id}'
        self._attr_name = name
        self._attr_device_info = device
        self._attr_native_value = value
        self._attr_native_unit_of_measurement = unit


class LastUpdate(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = False
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, device):
        self.entity_id = 'sensor.demo_router_client_last_successful_update'
        self._attr_unique_id = f'{DOMAIN}_client_last_successful_update'
        self._attr_name = 'Demo router client last successful update'
        self._attr_device_info = device

    @property
    def native_value(self):
        return self.hass.data[DOMAIN]['updated']

    async def async_added_to_hass(self):
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL, self._polled))

    @callback
    def _polled(self):
        self.async_write_ha_state()
