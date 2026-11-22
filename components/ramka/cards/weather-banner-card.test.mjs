import {test} from 'node:test';
import assert from 'node:assert/strict';
import './testing/dom-env.mjs';
import {weatherBanner, styleOf, secondsOf, STYLES, forgetBanner} from './weather-banner-card.js';
import {beforeEach} from 'node:test';
beforeEach(() => forgetBanner());
import {hass as base, NOW, THUNDER, WIND} from './testing/weather-fixtures.mjs';

const MODE = 'input_select.ramka_mode';
const AMBIENT = 'input_select.ramka_ambient';
const MUSIC_VIEW = 'binary_sensor.ramka_music_view';
const AWNINGS = 'binary_sensor.awnings_wind';
const STYLE = 'input_select.ramka_weather_banner';
const SECONDS = 'input_number.ramka_weather_banner_s';
const config = {mode: MODE, modes: ['ambient'], awnings: AWNINGS, style: STYLE, seconds: SECONDS,
  hide_when: [{entity: AMBIENT, state: 'climate'}, {entity: MUSIC_VIEW, state: 'off'}]};

function hass({mode = 'ambient', ambient = 'air', musicView = 'off', awnings = 'off', style = 'icon', seconds = '30.0', ...rest} = {}) {
  const h = base(rest);
  Object.assign(h.states, {
    [MODE]: {state: mode, attributes: {}},
    [AMBIENT]: {state: ambient, attributes: {}},
    [MUSIC_VIEW]: {state: musicView, attributes: {}},
    [AWNINGS]: {state: awnings, attributes: {}},
    [STYLE]: {state: style, attributes: {}},
    [SECONDS]: {state: seconds, attributes: {}},
  });
  return h;
}

test('off first and by default: a missing or unknown setting is off', () => {
  assert.equal(STYLES[0], 'off');
  assert.equal(styleOf(hass({style: 'unknown'}), config), 'off');
  assert.equal(styleOf(hass(), {}), 'off');
  assert.equal(styleOf(hass({style: 'hide'}), config), 'hide');
  assert.equal(secondsOf(hass({seconds: '45.0'}), config), 45);
  assert.equal(secondsOf(hass({seconds: 'unavailable'}), config), 30);
});

test('over the ambient pages only, not over the controls, nor the Climate page', () => {
  assert.ok(weatherBanner(hass(), config));
  assert.equal(weatherBanner(hass({mode: 'controls'}), config), null);
  assert.equal(weatherBanner(hass({mode: 'calendar'}), config), null);
  assert.equal(weatherBanner(hass({mode: 'off'}), config), null);
  assert.equal(weatherBanner(hass({ambient: 'climate'}), config), null);
  // Climate behind the music view: the now-playing screen is on, the banner shows over it.
  assert.ok(weatherBanner(hass({ambient: 'climate', musicView: 'on'}), config));
  // Without a mode (the preview frames): whatever the tablet shows.
  assert.ok(weatherBanner(hass({mode: 'controls'}), {style: STYLE}));
});

test('hidden while the warning is off, with the awnings banner, or without the weather component', () => {
  assert.equal(weatherBanner(hass({on: 'off'}), config), null);
  assert.equal(weatherBanner(hass({awnings: 'on'}), config), null);
  assert.equal(weatherBanner({language: 'en', states: {}}, config), null);
});

test('the most severe warning, its icon and colour; the wind level without one', () => {
  const b = weatherBanner(hass({warnings: [THUNDER, WIND]}), config, NOW);
  assert.deepEqual({text: b.text, icon: b.icon, colour: b.colour},
    {text: 'Orange warning: Thunderstorm · until 22:00 · +1', icon: 'mdi:weather-lightning', colour: '#ffa94d'});
  const w = weatherBanner(hass({level: 'gale', gust: 70}), config, NOW);
  assert.deepEqual({text: w.text, icon: w.icon, colour: w.colour},
    {text: 'Gale · 45 km/h SW · gusts 70 km/h', icon: 'mdi:weather-windy', colour: '#ff7a5c'});
});

function card(t) {
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: NOW});
  const el = document.createElement('weather-banner-card');
  el.setConfig(config);
  document.body.append(el);
  t.after(() => el.remove());
  return {el, banner: () => el.shadowRoot.querySelector('.banner')};
}

test('the card: nothing while off (the default), text only, never markup', (t) => {
  const {el, banner} = card(t);
  el.hass = hass({style: 'off', warnings: [THUNDER]});
  assert.equal(banner().hidden, true);
  el.hass = hass({style: 'unknown', warnings: [THUNDER]});
  assert.equal(banner().hidden, true);
  el.hass = hass({warnings: [{...THUNDER, event: '<img src=x>'}]});
  assert.equal(banner().hidden, false);
  assert.equal(el.shadowRoot.querySelector('img'), null);
  assert.match(el.shadowRoot.textContent, /Orange warning: <img src=x>/);
  assert.equal(el.shadowRoot.querySelector('ha-icon').getAttribute('icon'), 'mdi:weather-lightning');
  el.hass = hass({mode: 'controls', warnings: [THUNDER]});
  assert.equal(banner().hidden, true);
});

test('full text first, then the icon, hidden or always, as set; something new brings it back', (t) => {
  const {el, banner} = card(t);
  const compact = () => banner().classList.contains('compact');
  el.hass = hass({seconds: '10', warnings: [THUNDER]});
  assert.equal(banner().hidden, false);
  assert.equal(compact(), false);
  t.mock.timers.tick(9000);
  // Another end time, another wind speed: still the same message.
  el.hass = hass({seconds: '10', speed: 47, warnings: [{...THUNDER, expires: '2026-11-18T23:00:00+00:00'}]});
  assert.equal(compact(), false);
  t.mock.timers.tick(1100);
  assert.equal(compact(), true);
  assert.equal(banner().hidden, false);
  el.hass = hass({seconds: '10', warnings: [THUNDER, WIND]});  // one more warning: the full text again
  assert.equal(compact(), false);
  el.hass = hass({seconds: '10', style: 'hide', warnings: [THUNDER, WIND]});
  t.mock.timers.tick(10100);
  assert.equal(banner().hidden, true);
  el.hass = hass({seconds: '10', style: 'always', warnings: [THUNDER, WIND]});
  assert.equal(banner().hidden, false);
  assert.equal(compact(), false);
  el.hass = hass({style: 'off', warnings: [THUNDER, WIND]});
  assert.equal(banner().hidden, true);
});

test('the clock follows the warning, not the screen: hidden on the Climate page or the controls and back, still the icon', (t) => {
  const {el, banner} = card(t);
  const compact = () => banner().classList.contains('compact');
  el.hass = hass({seconds: '10', warnings: [THUNDER]});
  t.mock.timers.tick(10100);
  assert.equal(compact(), true);
  el.hass = hass({seconds: '10', ambient: 'climate', warnings: [THUNDER]});
  assert.equal(banner().hidden, true);
  el.hass = hass({seconds: '10', mode: 'controls', warnings: [THUNDER]});
  assert.equal(banner().hidden, true);
  el.hass = hass({seconds: '10', ambient: 'plants', warnings: [THUNDER]});
  assert.equal(banner().hidden, false);
  assert.equal(compact(), true, 'the same message: no second full text');
});

test('one clock for every copy of the card (the preview frames) and after a reload', (t) => {
  const first = card(t);
  first.el.hass = hass({seconds: '10', warnings: [THUNDER]});
  t.mock.timers.tick(10100);
  // A new element: another frame, or the page reloaded.
  const second = document.createElement('weather-banner-card');
  second.setConfig(config);
  document.body.append(second);
  t.after(() => second.remove());
  second.hass = hass({seconds: '10', warnings: [THUNDER]});
  assert.equal(second.shadowRoot.querySelector('.banner').classList.contains('compact'), true);
});

test('a restart (the sensor unavailable) does not restart the full text', (t) => {
  const {el, banner} = card(t);
  el.hass = hass({seconds: '10', warnings: [THUNDER]});
  t.mock.timers.tick(10100);
  el.hass = hass({seconds: '10', on: 'unavailable', warnings: []});
  el.hass = hass({seconds: '10', warnings: [THUNDER]});
  assert.equal(banner().classList.contains('compact'), true);
});

test('the warning over, then back: the full text again', (t) => {
  const {el, banner} = card(t);
  el.hass = hass({seconds: '10', warnings: [THUNDER]});
  t.mock.timers.tick(10100);
  el.hass = hass({seconds: '10', on: 'off', warnings: []});
  assert.equal(banner().hidden, true);
  el.hass = hass({seconds: '10', warnings: [THUNDER]});
  assert.equal(banner().classList.contains('compact'), false);
});
