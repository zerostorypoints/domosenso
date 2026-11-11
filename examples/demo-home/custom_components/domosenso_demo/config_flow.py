"""The demo integration's one config entry, created from configuration.yaml: it holds the fictional
devices the registry needs (the streamer listed twice); the entities stay YAML platforms."""
from homeassistant.config_entries import ConfigFlow

from . import DOMAIN


class DemoFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_import(self, data):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title='Domosenso fictional demo', data={})
