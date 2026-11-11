"""A fictional mesh router for the demo; never loaded by a real home's configuration.

It takes the domain `tplink_deco` because the floor plan card finds a router's trackers through the
entity registry by platform (components/floorplan/cards/lib/wifi-rules.json): states set without the
registry are invisible to it. It owns only made-up nodes and clients with locally administered MACs
(02:00:…), shaped as the real integration reports them (SPEC-047), and talks to no network.
"""
from __future__ import annotations

from datetime import timedelta

from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

DOMAIN = 'tplink_deco'
PLATFORMS = ['device_tracker', 'sensor', 'switch']
POLL = timedelta(seconds=30)    # the rules' freshness interval_s: a poll older than 3 intervals reads stale
SIGNAL = f'{DOMAIN}_poll'
MANUFACTURER = 'Fictional Mesh'

# The three nodes stand at the demo plan's three access points (examples/demo-home/floorplan.json);
# the BSSIDs are the ones the plan's Wi-Fi readings were taken on.
NODES = {
    'access_point_living_room': {'name': 'Access point Living room', 'mac': '02:00:00:00:00:a1',
                                 'bssid': {'2_4_ghz': '02:00:00:00:00:11', '5_ghz': '02:00:00:00:00:01'}},
    'access_point_office': {'name': 'Access point Office', 'mac': '02:00:00:00:00:a2',
                            'bssid': {'2_4_ghz': '02:00:00:00:00:02', '5_ghz': '02:00:00:00:00:12'}},
    'access_point_hallway': {'name': 'Access point Hallway', 'mac': '02:00:00:00:00:a3',
                             'bssid': {'2_4_ghz': '02:00:00:00:00:03'}},
}
# Clients: (object id, name, MAC, node, connection_type, down kB/s, up kB/s). The streamer's MAC is the
# one the demo integration's "Streamer (Cast)" device carries: it matches through the registry, unplaced,
# and its "Streamer (DLNA)" twin on the plan gets the "Same device as …?" suggestion.
CLIENTS = [
    ('alex_phone', "Alex's phone", '02:00:00:00:01:01', 'access_point_living_room', 'band5', 60.0, 8.0),
    ('living_room_streamer', 'Living room streamer', '02:00:00:00:01:02', 'access_point_living_room', 'wired', 3200.0, 40.0),
    ('living_room_speaker', 'Living room speaker', '02:00:00:00:01:08', 'access_point_living_room', 'band5', 560.0, 12.0),
    ('sam_laptop', "Sam's laptop", '02:00:00:00:01:03', 'access_point_office', 'band6', 250.0, 30.0),
    ('office_desktop', 'Office desktop', '02:00:00:00:01:04', 'access_point_office', 'wired', 40.0, 12.0),
    ('sam_phone', "Sam's phone", '02:00:00:00:01:05', 'access_point_office', 'band5', 15.0, 3.0),
    ('kids_tablet', "Kids' tablet", '02:00:00:00:01:06', 'access_point_hallway', 'band2_4', 45.0, 6.0),
    ('thermostat', 'Thermostat', '02:00:00:00:01:07', 'access_point_hallway', 'band2_4', 0.4, 0.2),
]


def node_device(key):
    node = NODES[key]
    return {'connections': {(dr.CONNECTION_NETWORK_MAC, node['mac'])}, 'identifiers': {(DOMAIN, key)}}


async def async_setup(hass: HomeAssistant, config) -> bool:
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(hass.config_entries.flow.async_init(DOMAIN, context={'source': SOURCE_IMPORT}, data={}))
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    registry = dr.async_get(hass)
    for key, node in NODES.items():
        registry.async_get_or_create(config_entry_id=entry.entry_id, name=node['name'], manufacturer=MANUFACTURER,
                                     model='Fictional node', **node_device(key))
    registry.async_get_or_create(config_entry_id=entry.entry_id, identifiers={(DOMAIN, 'router')},
                                 name='Demo router', manufacturer=MANUFACTURER, model='Fictional mesh')
    runtime = hass.data[DOMAIN] = {'polling': True, 'updated': dt_util.utcnow()}

    @callback
    def poll(_now=None):
        # Every poll reports each client again, so its tracker's last_reported moves as a real poll does.
        if runtime['polling']:
            runtime['updated'] = dt_util.utcnow()
            async_dispatcher_send(hass, SIGNAL)

    entry.async_on_unload(async_track_time_interval(hass, poll, POLL))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
