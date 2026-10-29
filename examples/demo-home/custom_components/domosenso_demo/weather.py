"""WeatherEntity supplies real HA forecast subscriptions without a cloud provider."""
from datetime import timedelta
from homeassistant.core import callback
from homeassistant.components.weather import WeatherEntity, WeatherEntityFeature
from homeassistant.const import UnitOfTemperature, UnitOfPressure, UnitOfSpeed
from homeassistant.util import dt
from . import DemoEntity, DOMAIN


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    from homeassistant.helpers.event import async_call_later
    entities = [DemoWeather(hass, 'weather.forecast_home')]
    delay = hass.data[DOMAIN]['weather_delay']
    if delay:
        @callback
        def add_later(_):
            async_add_entities(entities)
        async_call_later(hass, delay, add_later)
    else:
        async_add_entities(entities)


class DemoWeather(DemoEntity, WeatherEntity):
    _attr_supported_features = WeatherEntityFeature.FORECAST_DAILY
    _attr_native_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_native_pressure_unit = UnitOfPressure.HPA
    _attr_native_wind_speed_unit = UnitOfSpeed.KILOMETERS_PER_HOUR

    @property
    def condition(self):
        return self.runtime['states'][self.entity_id]

    @property
    def native_temperature(self):
        return self.fixture_attributes.get('temperature', 12.4)

    @property
    def humidity(self):
        return self.fixture_attributes.get('humidity', 71)

    @property
    def native_pressure(self):
        return self.fixture_attributes.get('pressure', 1016)

    @property
    def native_wind_speed(self):
        return self.fixture_attributes.get('wind_speed', 14)

    async def async_forecast_daily(self):
        return [{'datetime': (dt.utcnow() + timedelta(days=i)).isoformat(), 'condition': self.condition,
                 'native_temperature': 15 + i, 'native_templow': 8 + i, 'precipitation_probability': 10}
                for i in range(5)]
