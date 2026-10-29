"""Real HA light services backed only by the fictional fixture."""
from homeassistant.components.light import LightEntity, ColorMode
from . import DemoEntity, DOMAIN


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([DemoLight(hass, eid) for eid in hass.data[DOMAIN]['states'] if eid.startswith('light.')])


class DemoLight(DemoEntity, LightEntity):
    _attr_supported_color_modes = {ColorMode.BRIGHTNESS}
    _attr_color_mode = ColorMode.BRIGHTNESS

    @property
    def is_on(self):
        return self.runtime['states'][self.entity_id] == 'on'

    @property
    def brightness(self):
        return self.fixture_attributes.get('brightness', 200) if self.is_on else 0

    async def async_turn_on(self, **kwargs):
        self.change('turn_on', 'on', brightness=kwargs.get('brightness', 200))

    async def async_turn_off(self, **kwargs):
        self.change('turn_off', 'off')
