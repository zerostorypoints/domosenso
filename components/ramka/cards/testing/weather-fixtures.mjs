// The weather component's entities (SPEC-056 amendment 1) for the cards' tests: a hass with
// binary_sensor.weather_warning, sensor.weather_wind_level and, given `warnings`,
// sensor.weather_warnings. Fictional warnings; the time zone UTC, "now" NOW.

export const NOW = new Date('2026-11-18T12:00:00Z');   // a Wednesday

export const THUNDER = {type: 'thunderstorm', level: 'orange', severity: 3, event: 'Thunderstorm',
  headline: 'Orange thunderstorm warning for Northvale', onset: '2026-11-18T14:00:00+00:00', expires: '2026-11-18T22:00:00+00:00'};
export const WIND = {type: 'wind', level: 'yellow', severity: 2, event: 'Wind', headline: 'Wind',
  onset: '2026-11-18T18:00:00+00:00', expires: '2026-11-19T06:00:00+00:00'};
export const RED_RAIN = {type: 'rain', level: 'red', severity: 4, event: 'Heavy rain', headline: 'Red rain warning',
  onset: '2026-11-18T10:00:00+00:00', expires: null};

export function hass({on = 'on', level = 'strong', speed = 45.2, gust = null, direction = 'SW', warnings,
  language = 'en', extra = {}} = {}) {
  const states = {
    'binary_sensor.weather_warning': {state: on, attributes: {}},
    'sensor.weather_wind_level': {state: level, attributes: {speed, gust, judged: speed, bearing: 225, direction}},
    ...extra,
  };
  if (warnings) states['sensor.weather_warnings'] = {state: String(warnings.length), attributes: {warnings}};
  return {language, locale: {language}, config: {time_zone: 'UTC'}, states};
}
