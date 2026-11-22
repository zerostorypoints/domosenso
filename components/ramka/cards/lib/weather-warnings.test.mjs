import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weatherStatus, warningTitle, untilText, windText, iconOf, colourOf, TYPE_ICONS, allHold, inModes} from './weather-warnings.js';
import {hass, NOW, THUNDER, WIND, RED_RAIN} from '../testing/weather-fixtures.mjs';

const strip = (s) => s && {text: s.text, icon: s.icon, colour: s.colour};

test('nothing while the warning is off, or without the weather component', () => {
  assert.equal(weatherStatus(hass({on: 'off', warnings: [THUNDER]}), NOW), null);
  assert.equal(weatherStatus({states: {}}, NOW), null);
});

test('the most severe official warning: level, event, end; +N for the others', () => {
  assert.deepEqual(strip(weatherStatus(hass({warnings: [THUNDER]}), NOW)),
    {text: 'Orange warning: Thunderstorm · until 22:00', icon: 'mdi:weather-lightning', colour: '#ffa94d'});
  assert.deepEqual(strip(weatherStatus(hass({warnings: [RED_RAIN, THUNDER, WIND]}), NOW)),
    {text: 'Red warning: Heavy rain · +2', icon: 'mdi:weather-pouring', colour: '#ff7a5c'});
  // Ending on another day: its day name.
  assert.equal(weatherStatus(hass({warnings: [WIND]}), NOW).text, 'Yellow warning: Wind · until Thursday 06:00');
  assert.equal(weatherStatus(hass({warnings: [WIND]}), NOW).colour, '#f5c542');
});

test('without an event: the headline, then the type; an unknown level or type', () => {
  assert.equal(warningTitle(hass(), {...THUNDER, event: ''}), 'Orange warning: Orange thunderstorm warning for Northvale');
  assert.equal(warningTitle(hass(), {type: 'fog', level: 'yellow'}), 'Yellow warning: Fog');
  assert.equal(warningTitle(hass(), {type: 'tsunami', level: 'purple'}), 'Weather warning: Warning');
  assert.equal(iconOf({type: 'tsunami'}), 'mdi:alert');
  assert.equal(colourOf({level: 'purple'}), '#ffa94d');
});

test('every type has its icon', () => {
  assert.deepEqual(TYPE_ICONS, {
    wind: 'mdi:weather-windy', snow_ice: 'mdi:snowflake-alert', thunderstorm: 'mdi:weather-lightning',
    fog: 'mdi:weather-fog', heat: 'mdi:thermometer-high', cold: 'mdi:snowflake-thermometer', coastal: 'mdi:waves',
    forest_fire: 'mdi:fire-alert', avalanche: 'mdi:image-filter-hdr', rain: 'mdi:weather-pouring',
    flood: 'mdi:home-flood', rain_flood: 'mdi:home-flood', other: 'mdi:alert'});
});

test('without official warnings: the wind level, coloured strong and gale', () => {
  assert.deepEqual(strip(weatherStatus(hass(), NOW)), {text: 'Strong wind · 45 km/h SW', icon: 'mdi:weather-windy', colour: '#f5c542'});
  assert.deepEqual(strip(weatherStatus(hass({level: 'gale', speed: 64, gust: 70.4, direction: 'NW'}), NOW)),
    {text: 'Gale · 64 km/h NW · gusts 70 km/h', icon: 'mdi:weather-windy', colour: '#ff7a5c'});
  // The warning's 15 minutes' off-delay can outlast the level: no colour then.
  assert.equal(weatherStatus(hass({level: 'breezy', speed: 30, direction: null}), NOW).colour, null);
  assert.equal(weatherStatus(hass({level: 'breezy', speed: 30, direction: null}), NOW).text, 'Breezy · 30 km/h');
  assert.equal(weatherStatus(hass({warnings: []}), NOW).text, 'Strong wind · 45 km/h SW');
});

test('the wind line from breezy, calm left out', () => {
  assert.equal(windText(hass({level: 'calm'})), null);
  assert.equal(windText(hass({level: 'breezy', speed: 30})), 'Breezy · 30 km/h SW');
  assert.equal(windText(hass({speed: null})), 'Strong wind');
});

test('German and Polish', () => {
  assert.equal(weatherStatus(hass({language: 'de', level: 'gale', gust: 70, direction: 'NE'}), NOW).text, 'Sturm · 45 km/h NO · Böen 70 km/h');
  assert.equal(weatherStatus(hass({language: 'de', warnings: [WIND, THUNDER]}), NOW).text, 'Gelbe Warnung: Wind · bis Donnerstag 06:00 · +1');
  assert.equal(weatherStatus(hass({language: 'pl', warnings: [THUNDER]}), NOW).text, 'Pomarańczowe ostrzeżenie: Thunderstorm · do 22:00');
  assert.equal(warningTitle(hass({language: 'pl'}), {type: 'snow_ice', level: 'red'}), 'Czerwone ostrzeżenie: Śnieg i lód');
  assert.equal(untilText(hass({language: 'pl'}), WIND.expires, NOW), 'do 06:00, czwartek');
});

test('until: in the hass time zone; nothing without a readable end', () => {
  const zurich = {...hass(), config: {time_zone: 'Europe/Zurich'}};
  assert.equal(untilText(zurich, THUNDER.expires, NOW), 'until 23:00');
  assert.equal(untilText(zurich, '2026-11-18T23:30:00+00:00', NOW), 'until Thursday 00:30');
  assert.equal(untilText(hass(), null, NOW), null);
  assert.equal(untilText(hass(), 'soon', NOW), null);
});

test('the key: the warnings\' types and levels and the wind level, not speeds or times', () => {
  const key = (o) => weatherStatus(hass(o), NOW).key;
  assert.equal(key({warnings: [THUNDER]}), key({warnings: [{...THUNDER, expires: '2026-11-18T23:00:00+00:00'}], speed: 50}));
  assert.equal(key({warnings: [THUNDER, WIND]}), key({warnings: [WIND, THUNDER]}));
  assert.notEqual(key({warnings: [THUNDER]}), key({warnings: [THUNDER, WIND]}));
  assert.notEqual(key({warnings: [THUNDER]}), key({warnings: [{...THUNDER, level: 'red'}]}));
  assert.notEqual(key({}), key({level: 'gale'}));
  assert.equal(key({}), key({speed: 47}));
});

test('conditions and modes', () => {
  const h = hass({extra: {'input_select.m': {state: 'ambient'}, 'binary_sensor.v': {state: 'off'}}});
  assert.equal(allHold(h, [{entity: 'input_select.m', state: 'ambient'}, {entity: 'binary_sensor.v', state: 'off'}]), true);
  assert.equal(allHold(h, [{entity: 'input_select.m', state: ['controls', 'ambient']}, {entity: 'binary_sensor.v', state: 'on'}]), false);
  assert.equal(allHold(h, []), false);
  assert.equal(inModes(h, {mode: 'input_select.m'}, ['ambient']), true);
  assert.equal(inModes(h, {mode: 'input_select.m', modes: ['controls']}, ['ambient']), false);
  assert.equal(inModes(h, {}, ['controls']), true);
});
