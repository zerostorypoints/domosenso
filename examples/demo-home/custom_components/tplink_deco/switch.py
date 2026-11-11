"""The router's polling switch: off stops the polls, so the card's traffic reads stale after three intervals."""
from homeassistant.components.switch import SwitchEntity

from . import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([Polling()])


class Polling(SwitchEntity):
    _attr_should_poll = False
    _attr_has_entity_name = False
    _attr_device_info = {'identifiers': {(DOMAIN, 'router')}}

    def __init__(self):
        self.entity_id = 'switch.demo_router_polling'
        self._attr_unique_id = f'{DOMAIN}_polling'
        self._attr_name = 'Demo router polling'

    @property
    def is_on(self):
        return self.hass.data[DOMAIN]['polling']

    async def async_turn_on(self, **kwargs):
        self.hass.data[DOMAIN]['polling'] = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        self.hass.data[DOMAIN]['polling'] = False
        self.async_write_ha_state()
