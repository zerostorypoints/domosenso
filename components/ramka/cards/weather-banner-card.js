// The weather indicator (SPEC-053 amendment 1): dangerous weather, said from across the room. While
// the weather component's binary_sensor.weather_warning is on: the most severe official warning
// ("Orange warning: Thunderstorm · until 22:00 · +1", its type's icon, its level's colour), or
// without one the wind level ("Strong wind · 45 km/h SW"). The texts: lib/weather-warnings.js.
//
// It floats over the page (position: fixed, as timer-status-card) instead of taking a row: every
// Ramka screen's height is calc(100dvh - fixed px), so a row above them pushes the bottom of the
// screen (the clock's date and weather line) off the panel. Top left: on the now-playing screen
// that is the artwork, never the title on the right. Over the ambient screens only: the controls
// have their warnings list (weather-warnings-card), and the Climate page says it in its weather
// widget (clock-weather-card's `warnings`), so the dashboard hides it there (`hide_when`).
//
// Off by default: a home sees nothing new until it chooses how (input_select
// <prefix>_weather_banner: off, icon, hide, always). On, it says its full text for a while
// (input_number <prefix>_weather_banner_s), then keeps only its icon (or goes, or stays) until what
// it is about changes: another warning type or level, another wind level.
//
//   - type: custom:weather-banner-card
//     mode: input_select.ramka_mode               # shown in these modes only
//     modes: [ambient]
//     hide_when:                                  # optional: hidden while all of these hold
//       - {entity: input_select.ramka_ambient, state: climate}
//       - {entity: binary_sensor.ramka_music_view, state: "off"}
//     awnings: binary_sensor.awnings_wind         # optional: while it is on, the awnings' own banner
//                                                 # shows instead ("Wind: awnings rolled in")
//     style: input_select.ramka_weather_banner    # optional; without it, or unknown: off
//     seconds: input_number.ramka_weather_banner_s  # optional; without it: 30
//
// Nothing is drawn while the warning is off, the mode is another one, or the entities do not exist
// (a home without the weather component).

import {weatherStatus, allHold, inModes, WARNING} from './lib/weather-warnings.js';

export const STYLES = ['off', 'icon', 'hide', 'always'];
export const DEFAULT_SECONDS = 30;

// {text, icon, colour, key} or null: what the indicator says now, whatever its style.
export function weatherBanner(hass, config = {}, now = new Date()) {
  if (!inModes(hass, config, ['ambient'])) return null;
  if (config.hide_when && allHold(hass, config.hide_when)) return null;
  if (config.awnings && hass?.states?.[config.awnings]?.state === 'on') return null;
  return weatherStatus(hass, now);
}

// What the card does: the setting, or off while it is missing or unknown.
export function styleOf(hass, config = {}) {
  const value = config.style ? hass?.states?.[config.style]?.state : undefined;
  return STYLES.includes(value) ? value : 'off';
}

// When the indicator first said what it says now: one clock for every copy of the card (the preview's
// frames) and across reloads (the tablet's page reload after a deploy), kept per message key. The
// clock starts when the message appears and is forgotten only when the warning itself ends, not
// while the indicator is merely hidden (the Climate page, the controls, the awnings' banner).
const STORE = 'domosenso-weather-banner';
const memory = {key: null, since: 0};

function load() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE) || 'null');
    if (saved && typeof saved.key === 'string' && Number.isFinite(saved.since)) Object.assign(memory, saved);
  } catch { /* no storage: the module's memory alone */ }
}

function save() {
  try { window.localStorage.setItem(STORE, JSON.stringify(memory)); } catch { /* as above */ }
}

// The start of the message `key` (null: the warning has ended; forget it).
export function sinceOf(key, now = Date.now()) {
  if (memory.key === null) load();
  if (key === null) {
    if (memory.key !== null) { memory.key = null; memory.since = 0; save(); }
    return null;
  }
  if (memory.key !== key) { memory.key = key; memory.since = now; save(); }
  return memory.since;
}

// For tests: start with nothing remembered.
export function forgetBanner() {
  memory.key = null;
  memory.since = 0;
  try { window.localStorage.removeItem(STORE); } catch { /* as above */ }
}

export function secondsOf(hass, config = {}) {
  const value = Number(config.seconds ? hass?.states?.[config.seconds]?.state : NaN);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SECONDS;
}

class WeatherBannerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._timer = null;
  }
  setConfig(config) {
    this._config = {...config};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._render();
  }
  getCardSize() { return 0; }
  getGridOptions() { return {columns: 'full', rows: 0}; }
  disconnectedCallback() {
    clearTimeout(this._timer);
    this._timer = null;
  }
  connectedCallback() {
    this._render();
  }
  _render() {
    if (!this.shadowRoot.querySelector('.banner')) {
      this.shadowRoot.innerHTML = `<style>
        :host{position:fixed;top:16px;left:16px;z-index:5;pointer-events:none;max-width:calc(50vw - 32px)}
        .banner{display:flex;align-items:center;gap:10px;padding:8px 18px;border-radius:999px;
          background:rgba(0,0,0,.72);border:2px solid currentColor;color:var(--primary-text-color,#fff);
          font-size:22px;line-height:1.2;white-space:nowrap;overflow:hidden;
          transition:padding .4s ease}
        .banner[hidden]{display:none}
        .banner.compact{padding:8px}
        .banner.compact span{display:none}
        ha-icon{--mdc-icon-size:26px;flex:none}
        span{overflow:hidden;text-overflow:ellipsis}
      </style><div class="banner" hidden><ha-icon></ha-icon><span></span></div>`;
    }
    const banner = this.shadowRoot.querySelector('.banner');
    const style = styleOf(this._hass, this._config);
    const now = Date.now();
    // The message's clock follows the warning, whether or not this copy shows it now. Forgotten
    // only when the warning is off: not before this copy has its hass, nor while the sensor is
    // unavailable (a restart), or the next screen would say the full text again.
    const status = weatherStatus(this._hass);
    const ended = this._hass?.states?.[WARNING]?.state === 'off';
    const since = status ? sinceOf(status.key, now) : (ended ? sinceOf(null, now) : null);
    const shown = style === 'off' || !status ? null : weatherBanner(this._hass, this._config);
    if (!shown) {
      banner.hidden = true;
      clearTimeout(this._timer);
      this._timer = null;
      return;
    }
    const left = since + secondsOf(this._hass, this._config) * 1000 - now;
    const full = style === 'always' || left > 0;
    banner.hidden = !full && style === 'hide';
    banner.classList.toggle('compact', !full);
    banner.querySelector('ha-icon').setAttribute('icon', shown.icon);
    banner.querySelector('span').textContent = shown.text;
    banner.style.color = shown.colour || 'var(--primary-text-color,#fff)';
    clearTimeout(this._timer);
    this._timer = full && style !== 'always' ? setTimeout(() => this._render(), left + 50) : null;
  }
}

if (!customElements.get('weather-banner-card')) customElements.define('weather-banner-card', WeatherBannerCard);
