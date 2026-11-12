"""Node and client trackers with the real integration's attributes (device_type, mac, deco_mac,
connection_type, down/up_kilobytes_per_s)."""
from homeassistant.components.device_tracker import ScannerEntity
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from . import CLIENTS, DOMAIN, NODES, SIGNAL


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([NodeTracker(key) for key in NODES] + [ClientTracker(*client) for client in CLIENTS])


class DemoTracker(ScannerEntity):
    _attr_should_poll = False
    _attr_has_entity_name = False

    @property
    def is_connected(self):
        return True

    @property
    def unique_id(self):
        # ScannerEntity's own is the mac_address, which a client tracker has none of.
        return self._attr_unique_id

    async def async_added_to_hass(self):
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL, self._polled))

    @callback
    def _polled(self):
        self.async_write_ha_state()


class NodeTracker(DemoTracker):
    """A node: its MAC links the tracker to the node's device (ScannerEntity finds it by connection)."""

    def __init__(self, key):
        node = NODES[key]
        self.entity_id = f'device_tracker.{key}'
        self._attr_unique_id = f'{DOMAIN}_{key}'
        self._attr_name = node['name']
        self._attr_mac_address = node['mac']
        self._attr_hostname = node['name']   # ScannerEntity names the device after it (else after the MAC)
        self._attr_extra_state_attributes = {'device_type': 'deco', 'mac': node['mac'], 'demo': True}


class ClientTracker(DemoTracker):
    """A client: no device of its own (no mac_address), so the card matches it to another device by MAC."""

    def __init__(self, key, name, mac, node, link, down, up):
        self.entity_id = f'device_tracker.{key}'
        self._attr_unique_id = f'{DOMAIN}_client_{key}'
        self._attr_name = name
        self._attr_extra_state_attributes = {
            'device_type': 'client', 'mac': mac, 'deco_mac': NODES[node]['mac'], 'deco_device': node,
            'connection_type': link, 'down_kilobytes_per_s': down, 'up_kilobytes_per_s': up, 'demo': True,
        }
