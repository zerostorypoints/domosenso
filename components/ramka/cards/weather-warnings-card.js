// The controls' weather warnings (SPEC-053 amendment 1). The indicator says something is up from
// across the room; this is where it is read when someone walks up and the controls come up. While
// the weather component's binary_sensor.weather_warning is on (whatever the indicator's setting):
// a "Weather warnings" button with the number of official warnings, in the most severe one's icon
// and colour. A tap opens an overlay listing every official warning (type icon, level colour, the
// feed's event and headline, until when) and, from breezy, the wind level with speed and gusts.
// A tap on the backdrop or the close button closes it; so does the mode leaving the controls.
//
// It floats (position: fixed) at the top right, over the columns' heading row, instead of taking a
// row: the controls' columns are sized to fit the screen and a row more would push them off it.
//
// Taps: the card is marked data-own-tap, so corner-taps-card does not take a tap on it for a tap on
// the page, and data-own-swipe, so scrolling the list is no swipe that leaves the controls. A tap on
// it still counts as a touch of the controls: it runs `keep` (script.<prefix>_show_controls, which
// restarts the controls' hold timer, as any tap on the controls does), so the list stays up at
// least controls_hold_s after the last tap, and as long as someone is near.
//
//   - type: custom:weather-warnings-card
//     mode: input_select.ramka_mode          # shown in these modes only
//     modes: [controls]
//     hide_when:                             # optional: hidden while all of these hold (the plan)
//       - {entity: input_boolean.ramka_controls_plan, state: "on"}
//     keep: script.ramka_show_controls       # optional: run on each tap on the button or the list

import en from '../translations/en.json' with { type: 'json' };
import de from '../translations/de.json' with { type: 'json' };
import pl from '../translations/pl.json' with { type: 'json' };
import {createT} from './lib/i18n.js';
import {warningOn, warningsOf, windText, iconOf, colourOf, warningTitle, untilText, allHold, inModes,
  WIND_ICON, weatherStatus} from './lib/weather-warnings.js';

const t = createT({en, de, pl});

// Is the button shown?
export function buttonShown(hass, config = {}) {
  return warningOn(hass) && inModes(hass, config, ['controls']) && !(config.hide_when && allHold(hass, config.hide_when));
}

// The overlay's rows: [{icon, colour, title, detail, until}] for each official warning, then the
// wind line (text only) from breezy.
export function warningRows(hass, now = new Date()) {
  const rows = warningsOf(hass).map((w) => {
    const title = warningTitle(hass, w);
    const headline = String(w.headline || '').trim();
    return {icon: iconOf(w), colour: colourOf(w), title,
      detail: headline && headline !== String(w.event || '').trim() ? headline : '', until: untilText(hass, w.expires, now) || ''};
  });
  return {rows, wind: windText(hass, 'breezy')};
}

class WeatherWarningsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._open = false;
    this._kept = 0;
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
  connectedCallback() {
    this.setAttribute('data-own-tap', '');
    this.setAttribute('data-own-swipe', '');
    this._render();
  }

  _keep() {
    const script = this._config?.keep;
    if (!script || !this._hass?.callService) return;
    const now = Date.now();
    if (now - this._kept < 1000) return;
    this._kept = now;
    const [domain, name] = script.split('.');
    this._hass.callService(domain, name, {});
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>
      :host{position:fixed;top:14px;right:16px;z-index:6}
      :host([open]){z-index:9000}
      button{font:inherit;color:inherit;cursor:pointer}
      .open{display:flex;align-items:center;gap:10px;height:44px;padding:0 16px;border-radius:999px;
        background:rgba(0,0,0,.72);border:2px solid currentColor;font-size:20px;white-space:nowrap}
      .open[hidden],.backdrop[hidden],.count[hidden]{display:none}
      .open span{color:var(--primary-text-color,#fff)}
      .count{min-width:26px;padding:0 6px;border-radius:13px;background:currentColor;box-sizing:border-box;text-align:center}
      .count b{color:#000;font-weight:600}
      ha-icon{--mdc-icon-size:26px;flex:none}
      .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}
      .panel{width:min(760px,calc(100vw - 64px));max-height:calc(100vh - 64px);overflow:auto;box-sizing:border-box;
        padding:20px 24px;border-radius:16px;background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#fff)}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px}
      h2{margin:0;font-size:26px;font-weight:600}
      .close{min-width:48px;height:48px;border-radius:24px;border:0;background:rgba(127,127,127,.25);font-size:18px;padding:0 16px}
      ul{list-style:none;margin:0;padding:0}
      li{display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-top:1px solid rgba(127,127,127,.3)}
      li ha-icon{--mdc-icon-size:34px;margin-top:2px}
      .title{font-size:22px;font-weight:600}
      .detail,.until{font-size:18px;color:var(--secondary-text-color,#bbb)}
      .wind,.none{font-size:20px;padding:12px 0;border-top:1px solid rgba(127,127,127,.3)}
      .none{color:var(--secondary-text-color,#bbb)}
    </style>
    <button type="button" class="open" hidden><ha-icon></ha-icon><span></span><span class="count" hidden><b></b></span></button>
    <div class="backdrop" hidden><div class="panel" role="dialog" aria-modal="true">
      <header><h2></h2><button type="button" class="close"></button></header><ul></ul><div class="wind"></div><div class="none"></div>
    </div></div>`;
    const q = (s) => this.shadowRoot.querySelector(s);
    q('.open').addEventListener('click', () => { this._open = true; this._keep(); this._render(); });
    q('.close').addEventListener('click', () => { this._open = false; this._render(); });
    q('.backdrop').addEventListener('click', (ev) => {
      if (ev.target === q('.backdrop')) { this._open = false; this._render(); } else this._keep();
    });
  }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot.querySelector('.open')) this._build();
    const q = (s) => this.shadowRoot.querySelector(s);
    const hass = this._hass;
    const shown = buttonShown(hass, this._config);
    if (!shown) this._open = false;
    q('.open').hidden = !shown || this._open;
    q('.backdrop').hidden = !this._open;
    this.toggleAttribute('open', this._open);
    if (!shown) return;
    const status = weatherStatus(hass);
    const list = warningsOf(hass);
    const button = q('.open');
    button.style.color = status?.colour || 'var(--primary-text-color,#fff)';
    button.querySelector('ha-icon').setAttribute('icon', list.length ? status.icon : WIND_ICON);
    button.querySelector('span').textContent = t(hass, 'card.weather.button');
    q('.count').hidden = !list.length;
    q('.count b').textContent = String(list.length);
    button.setAttribute('aria-haspopup', 'dialog');
    if (!this._open) return;
    q('h2').textContent = t(hass, 'card.weather.title');
    q('.close').textContent = t(hass, 'card.weather.close');
    const {rows, wind} = warningRows(hass);
    q('ul').replaceChildren(...rows.map((r) => {
      const li = document.createElement('li');
      const icon = document.createElement('ha-icon');
      icon.setAttribute('icon', r.icon);
      icon.style.color = r.colour;
      const text = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'title';
      title.style.color = r.colour;
      title.textContent = r.title;
      text.append(title);
      for (const [cls, value] of [['detail', r.detail], ['until', r.until]]) {
        if (!value) continue;
        const line = document.createElement('div');
        line.className = cls;
        line.textContent = value;
        text.append(line);
      }
      li.append(icon, text);
      return li;
    }));
    q('.wind').hidden = !wind;
    q('.wind').textContent = wind || '';
    q('.none').hidden = rows.length > 0;
    q('.none').textContent = t(hass, 'card.weather.none');
  }
}

if (!customElements.get('weather-warnings-card')) customElements.define('weather-warnings-card', WeatherWarningsCard);
