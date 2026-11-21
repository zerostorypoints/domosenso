// The weather component's dangerous-weather status (SPEC-053 amendment 1), described once for the
// Ramka's cards that show it: the floating indicator (weather-banner-card), the controls' warnings
// list (weather-warnings-card) and the Climate page's weather widget (clock-weather-card).
//
// Read from the weather component's entities:
//   binary_sensor.weather_warning  on while the wind level is strong or gale, or any official warning
//                                  is in effect (15 min off-delay)
//   sensor.weather_warnings        attribute `warnings`: every official warning, most severe first,
//                                  each {type, level, severity, event, headline, onset, expires}
//   sensor.weather_wind_level      calm | breezy | strong | gale; speed, gust, direction (km/h)
// The event and headline come from the feed in the home's language: shown as they are.
// Plain ES module: no DOM.

import en from '../../translations/en.json' with { type: 'json' };
import de from '../../translations/de.json' with { type: 'json' };
import pl from '../../translations/pl.json' with { type: 'json' };
import {createT, language} from './i18n.js';

const t = createT({en, de, pl});

export const WARNING = 'binary_sensor.weather_warning';
export const WARNINGS = 'sensor.weather_warnings';
export const WIND_LEVEL = 'sensor.weather_wind_level';

// The Air page's fair and poor (cards/lib/colours.js amber and red), and an orange between them.
export const LEVEL_COLOURS = {yellow: '#f5c542', orange: '#ffa94d', red: '#ff7a5c'};
export const WIND_COLOURS = {strong: LEVEL_COLOURS.yellow, gale: LEVEL_COLOURS.red};
export const TYPE_ICONS = {
  wind: 'mdi:weather-windy', snow_ice: 'mdi:snowflake-alert', thunderstorm: 'mdi:weather-lightning',
  fog: 'mdi:weather-fog', heat: 'mdi:thermometer-high', cold: 'mdi:snowflake-thermometer', coastal: 'mdi:waves',
  forest_fire: 'mdi:fire-alert', avalanche: 'mdi:image-filter-hdr', rain: 'mdi:weather-pouring',
  flood: 'mdi:home-flood', rain_flood: 'mdi:home-flood', other: 'mdi:alert',
};
export const WIND_ICON = 'mdi:weather-windy';
const LEVELS = ['calm', 'breezy', 'strong', 'gale'];
const DATE_LOCALES = {en: 'en-GB', de: 'de-CH', pl: 'pl-PL'};

const own = (dict, key) => Object.prototype.hasOwnProperty.call(dict, key);

// Is the dangerous-weather sensor on?
export function warningOn(hass) {
  return hass?.states?.[WARNING]?.state === 'on';
}

// Every official warning in effect, most severe first (as the sensor lists them); [] without any.
export function warningsOf(hass) {
  const list = hass?.states?.[WARNINGS]?.attributes?.warnings;
  return Array.isArray(list) ? list.filter((w) => w && typeof w === 'object') : [];
}

export const iconOf = (w) => TYPE_ICONS[w?.type] || TYPE_ICONS.other;
export const colourOf = (w) => LEVEL_COLOURS[w?.level] || LEVEL_COLOURS.orange;

// The type's name in the hass language ("Thunderstorm"); other types: "Warning".
export function typeName(hass, w) {
  return t(hass, `card.weather.type.${own(TYPE_ICONS, w?.type) ? w.type : 'other'}`);
}

// What the warning is about, in the feed's words: its event, else its headline, else the type's name.
export function warningSubject(hass, w) {
  return String(w?.event || w?.headline || typeName(hass, w)).trim();
}

// Which value of the weather widget a warning type is about: the wind, the temperature, or the
// condition (rain, thunderstorm, snow, fog and the rest).
export function valueOf(w) {
  if (w?.type === 'wind') return 'wind';
  if (w?.type === 'heat' || w?.type === 'cold') return 'temp';
  return 'cond';
}

// "Orange warning: Thunderstorm": the level, then the feed's event (or its headline, or the type).
export function warningTitle(hass, w) {
  const level = own(LEVEL_COLOURS, w?.level) ? t(hass, `card.weather.warning.${w.level}`) : t(hass, 'card.weather.warning.any');
  const what = String(w?.event || w?.headline || typeName(hass, w)).trim();
  return `${level}: ${what}`;
}

function parts(hass, at) {
  const zone = hass?.config?.time_zone || undefined;
  const f = (options) => new Intl.DateTimeFormat('en-CA', {timeZone: zone, ...options}).format(at);
  return {day: f({year: 'numeric', month: '2-digit', day: '2-digit'}), time: f({hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})};
}

// "until 18:00" today, "until Thursday 06:00" on another day (the hass language and time zone);
// null without a readable end.
export function untilText(hass, iso, now = new Date(), weekday = 'long') {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    const end = parts(hass, at);
    if (end.day === parts(hass, now).day) return t(hass, 'card.weather.until', {time: end.time});
    const day = new Intl.DateTimeFormat(DATE_LOCALES[language(hass)], {weekday,
      timeZone: hass?.config?.time_zone || undefined}).format(at);
    return t(hass, 'card.weather.until_day', {day, time: end.time});
  } catch {
    return null;
  }
}

// The judged wind level from `from` up ("Strong wind · 45 km/h SW · gusts 70 km/h"), or null.
export function windText(hass, from = 'breezy') {
  const s = hass?.states?.[WIND_LEVEL];
  if (!s || LEVELS.indexOf(s.state) < LEVELS.indexOf(from)) return null;
  const a = s.attributes || {};
  let text = t(hass, `card.weather.level.${s.state}`);
  const speed = Number(a.speed);
  if (a.speed != null && Number.isFinite(speed)) {
    const key = `card.weather.direction.${a.direction}`;
    const dir = a.direction ? t(hass, key) : '';
    text += ` · ${Math.round(speed)} km/h${dir ? ' ' + (dir === key ? a.direction : dir) : ''}`;
  }
  const gust = Number(a.gust);
  if (a.gust != null && Number.isFinite(gust)) text += ` · ${t(hass, 'card.weather.gusts', {gust: Math.round(gust)})}`;
  return text;
}

export function windLevel(hass) {
  const level = hass?.states?.[WIND_LEVEL]?.state;
  return LEVELS.includes(level) ? level : null;
}

// What is up, in one line: {text, icon, colour, key} or null while the warning is off. The most
// severe official warning ("Orange warning: Thunderstorm · until 22:00 · +1"); without one, the
// wind level (strong, gale). `key` is what it is about, the warnings' types and levels and the wind
// level, not speeds or times: a new key brings the indicator's full text back.
export function weatherStatus(hass, now = new Date()) {
  if (!warningOn(hass)) return null;
  const list = warningsOf(hass);
  const wind = windLevel(hass);
  const key = [...new Set(list.map((w) => `${w.type}:${w.level}`))].sort().join(',') + `|wind:${wind}`;
  if (list.length) {
    const top = list[0];
    let text = warningTitle(hass, top);
    const until = untilText(hass, top.expires, now);
    if (until) text += ` · ${until}`;
    if (list.length > 1) text += ` · ${t(hass, 'card.weather.more', {count: list.length - 1})}`;
    return {text, icon: iconOf(top), colour: colourOf(top), key};
  }
  // The warning's 15 minutes' off-delay can outlast the level: then the level as it is, uncoloured.
  const text = windText(hass, 'calm') || t(hass, 'card.weather.warning.any');
  return {text, icon: WIND_ICON, colour: WIND_COLOURS[wind] || null, key};
}

// Does every condition hold? Each {entity, state} (a state or a list of states).
export function allHold(hass, conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return false;
  return conditions.every((c) => {
    const state = hass?.states?.[c?.entity]?.state;
    return (Array.isArray(c.state) ? c.state : [c.state]).map(String).includes(state);
  });
}

// Is the dashboard's mode (config.mode, an input_select) one of config.modes? True without a mode
// (the preview frames, whatever the tablet shows).
export function inModes(hass, config, fallback) {
  if (!config?.mode) return true;
  return (config.modes || fallback).includes(hass?.states?.[config.mode]?.state);
}
