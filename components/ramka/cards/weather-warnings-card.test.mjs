import {test} from 'node:test';
import assert from 'node:assert/strict';
import './testing/dom-env.mjs';
import {buttonShown, warningRows} from './weather-warnings-card.js';
import {hass as base, NOW, THUNDER, WIND, RED_RAIN} from './testing/weather-fixtures.mjs';

const MODE = 'input_select.ramka_mode';
const PLAN = 'input_boolean.ramka_controls_plan';
const config = {mode: MODE, modes: ['controls'], hide_when: [{entity: PLAN, state: 'on'}], keep: 'script.ramka_show_controls'};

function hass({mode = 'controls', plan = 'off', banner = 'off', ...rest} = {}) {
  const h = base(rest);
  Object.assign(h.states, {[MODE]: {state: mode, attributes: {}}, [PLAN]: {state: plan, attributes: {}},
    'input_select.ramka_weather_banner': {state: banner, attributes: {}}});
  h.calls = [];
  h.callService = (domain, service, data) => h.calls.push([domain, service, data]);
  return h;
}

test('the button: on the controls while the warning is on, whatever the banner setting', () => {
  assert.equal(buttonShown(hass({banner: 'off'}), config), true);
  assert.equal(buttonShown(hass({on: 'off'}), config), false);
  assert.equal(buttonShown(hass({mode: 'ambient'}), config), false);
  assert.equal(buttonShown(hass({plan: 'on'}), config), false);
  assert.equal(buttonShown({states: {[MODE]: {state: 'controls'}}}, config), false);
  assert.equal(buttonShown(hass({mode: 'ambient'}), {}), true);   // the preview: no mode
});

test('the rows: every warning with its icon, colour, title, headline when it says more, end; the wind line', () => {
  const {rows, wind} = warningRows(hass({warnings: [RED_RAIN, THUNDER, WIND], gust: 70}), NOW);
  assert.deepEqual(rows, [
    {icon: 'mdi:weather-pouring', colour: '#ff7a5c', title: 'Red warning: Heavy rain', detail: 'Red rain warning', until: ''},
    {icon: 'mdi:weather-lightning', colour: '#ffa94d', title: 'Orange warning: Thunderstorm',
      detail: 'Orange thunderstorm warning for Northvale', until: 'until 22:00'},
    {icon: 'mdi:weather-windy', colour: '#f5c542', title: 'Yellow warning: Wind', detail: '', until: 'until Thursday 06:00'},
  ]);
  assert.equal(wind, 'Strong wind · 45 km/h SW · gusts 70 km/h');
  assert.equal(warningRows(hass({level: 'calm', warnings: [THUNDER]}), NOW).wind, null);
});

function card(t, h) {
  t.mock.timers.enable({apis: ['Date'], now: NOW});
  const el = document.createElement('weather-warnings-card');
  el.setConfig(config);
  document.body.append(el);
  el.hass = h;
  t.after(() => el.remove());
  const q = (s) => el.shadowRoot.querySelector(s);
  return {el, q};
}

test('the card keeps its taps and its drags: data-own-tap and data-own-swipe', (t) => {
  const {el} = card(t, hass({warnings: [THUNDER]}));
  assert.equal(el.hasAttribute('data-own-tap'), true);
  assert.equal(el.hasAttribute('data-own-swipe'), true);
});

test('the button: label, count, the most severe icon and colour; hidden while the warning is off', (t) => {
  const h = hass({warnings: [THUNDER, WIND]});
  const {el, q} = card(t, h);
  assert.equal(q('.open').hidden, false);
  assert.match(q('.open').textContent, /Weather warnings/);
  assert.equal(q('.count').hidden, false);
  assert.equal(q('.count').textContent, '2');
  assert.equal(q('.open ha-icon').getAttribute('icon'), 'mdi:weather-lightning');
  assert.equal(q('.open').style.color, '#ffa94d');
  el.hass = hass();    // the wind level alone: no count
  assert.equal(q('.count').hidden, true);
  assert.equal(q('.open ha-icon').getAttribute('icon'), 'mdi:weather-windy');
  el.hass = hass({on: 'off'});
  assert.equal(q('.open').hidden, true);
});

test('a tap opens the list and keeps the controls up; the backdrop or close closes it', (t) => {
  const h = hass({warnings: [THUNDER, WIND]});
  const {el, q} = card(t, h);
  assert.equal(q('.backdrop').hidden, true);
  q('.open').click();
  assert.equal(q('.backdrop').hidden, false);
  assert.equal(q('.open').hidden, true);
  assert.equal(el.hasAttribute('open'), true);
  assert.deepEqual(h.calls, [['script', 'ramka_show_controls', {}]]);
  assert.equal(q('h2').textContent, 'Weather warnings');
  assert.equal(q('ul').children.length, 2);
  assert.match(q('ul').textContent, /Orange warning: Thunderstorm.*until 22:00.*Yellow warning: Wind.*until Thursday 06:00/);
  assert.equal(q('.wind').textContent, 'Strong wind · 45 km/h SW');
  assert.equal(q('.none').hidden, true);
  // A tap inside the panel keeps the controls up (once a second) and leaves the list open.
  t.mock.timers.tick(1500);
  q('.panel').click();
  assert.equal(q('.backdrop').hidden, false);
  assert.equal(h.calls.length, 2);
  q('.backdrop').click();
  assert.equal(q('.backdrop').hidden, true);
  assert.equal(q('.open').hidden, false);
  q('.open').click();
  q('.close').click();
  assert.equal(q('.backdrop').hidden, true);
});

test('the list closes when the mode leaves the controls, or the plan comes', (t) => {
  const {el, q} = card(t, hass({warnings: [THUNDER]}));
  q('.open').click();
  el.hass = hass({mode: 'ambient', warnings: [THUNDER]});
  assert.equal(q('.backdrop').hidden, true);
  assert.equal(q('.open').hidden, true);
  el.hass = hass({warnings: [THUNDER]});
  assert.equal(q('.backdrop').hidden, true, 'back on the controls: closed until tapped again');
  q('.open').click();
  el.hass = hass({plan: 'on', warnings: [THUNDER]});
  assert.equal(q('.backdrop').hidden, true);
});

test('the wind level alone: no official warnings, said so, and the wind line', (t) => {
  const {q} = card(t, hass({level: 'gale', speed: 64}));
  q('.open').click();
  assert.equal(q('ul').children.length, 0);
  assert.equal(q('.none').hidden, false);
  assert.equal(q('.none').textContent, 'No official warnings in effect.');
  assert.equal(q('.wind').textContent, 'Gale · 64 km/h SW');
});

test('the feed\'s text is text, never markup', (t) => {
  const {q, el} = card(t, hass({warnings: [{...THUNDER, event: '<img src=x onerror=alert(1)>', headline: '<b>bold</b>'}]}));
  q('.open').click();
  assert.equal(el.shadowRoot.querySelector('img'), null);
  assert.equal(el.shadowRoot.querySelector('ul b'), null);
  assert.match(q('ul').textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(q('ul').textContent, /<b>bold<\/b>/);
});

test('German and Polish labels', (t) => {
  const {el, q} = card(t, hass({language: 'de', warnings: [THUNDER]}));
  assert.match(q('.open').textContent, /Wetterwarnungen/);
  q('.open').click();
  assert.equal(q('.close').textContent, 'Schliessen');
  el.hass = hass({language: 'pl', warnings: [THUNDER]});
  assert.equal(q('h2').textContent, 'Ostrzeżenia pogodowe');
  assert.equal(q('.close').textContent, 'Zamknij');
});
