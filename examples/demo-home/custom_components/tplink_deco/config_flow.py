"""The fictional router's one config entry, created from configuration.yaml (`tplink_deco:`): entities
need a config entry for the device registry, which the floor plan reads."""
from homeassistant.config_entries import ConfigFlow

from . import DOMAIN


class DemoRouterFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_import(self, data):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title='Demo router (fictional)', data={})
