// Lovelace card for a wall tablet: the time and the weather right now, in type readable
// from across the room. The built-in clock card stops at "large" (~50 px) and the weather
// forecast card spends its space on the coming days; this one spends it on the current values.
// Text and dates follow the Home Assistant language (en, de, pl; anything else falls back to en).
//
//   type: custom:clock-weather-card
//   weather: weather.forecast_home        # condition, temperature, wind from its attributes
//   temperature: sensor.outside_temperature  # optional: a sensor instead of the weather's temperature
//   pressure: sensor.air_pressure            # optional: air pressure after the wind, as the sensor
//                                            # reports it (at the sensor's altitude, not sea level)
//   forecast: 4                              # optional: the next N days (icon, max/min) on the right,
//                                            # from HA's weather/subscribe_forecast (daily)
//
// With the weather component (SPEC-056) the wind part reads sensor.weather_wind_level from breezy up:
// the level word, speed and direction, and the gust when known.
//
//   warnings: input_select.ramka_weather_banner  # optional (the Climate page's): while the weather
//                                            # component's binary_sensor.weather_warning is on and
//                                            # this select is not off, the condition line says the
//                                            # most severe warning in its level's colour (no icon),
//                                            # and the condition moves to the line below it
//
// After a Home Assistant restart an open page reconnects before the weather integration is back:
// the subscription is refused or answers with no days. The card subscribes again on every
// reconnect and as soon as the weather entity is there again, and retries until days arrive, so
// the forecast comes back without a page reload.

import { createT, formatDate, weekdayShort } from "./lib/i18n.js";
import { warningOn, warningsOf, warningSubject, untilText, colourOf, valueOf, windLevel, WIND_COLOURS } from "./lib/weather-warnings.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const ICONS = {
  "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", fog: "mdi:weather-fog",
  hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy", pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant", exceptional: "mdi:alert-circle-outline",
};
// The weather component's wind status (SPEC-056), consumed by the Ramka; the levels that change the line.
const WIND_LEVEL = "sensor.weather_wind_level";
const WIND_SHOWN = ["breezy", "strong", "gale"];
// Seconds to wait for a forecast with days before subscribing again; the last one repeats.
const RETRY_S = [10, 30, 60, 300];

class ClockWeatherCard extends HTMLElement {
  setConfig(config) {
    if (!config.weather) throw new Error("clock-weather-card: weather is required");
    this._config = config;
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 4, min_rows: 3 };
  }

  set hass(hass) {
    const first = !this._hass;
    const wasUp = this._weatherUp;
    this._hass = hass;
    const w = hass.states[this._config.weather];
    this._weatherUp = !!w && w.state !== "unavailable";
    if (!this._built) this._build();
    this._update();
    if (first && this._config.forecast) this._start();
    else if (this._conn && this._weatherUp && !wasUp && !this._days) { this._tries = 0; this._subscribe(); }
  }

  connectedCallback() {
    this._timer = setInterval(() => this._clock(), 1000);
    if (this._ro && this._built) this._ro.observe(this._q("ha-card"));
    if (this._hass && this._config.forecast && !this._unsub) this._start();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    if (this._ro) this._ro.disconnect();
    this._stop();
  }

  _start() {
    this._conn = this._hass.connection;
    this._onReady = () => { this._tries = 0; this._subscribe(); };
    this._conn.addEventListener?.("ready", this._onReady);
    this._tries = 0;
    this._subscribe();
  }

  _stop() {
    if (this._conn) this._conn.removeEventListener?.("ready", this._onReady);
    this._conn = this._onReady = null;
    this._unsubscribe();
  }

  _unsubscribe() {
    clearTimeout(this._retry);
    this._retry = null;
    // A subscription the server refused, or one on a connection that has gone, has nothing to end.
    if (this._unsub) { this._unsub.then((u) => u()).catch(() => {}); this._unsub = null; }
  }

  // The daily forecast the way the built-in weather card gets it: a websocket subscription. Until
  // it delivers days, the timer subscribes again.
  _subscribe() {
    this._unsubscribe();
    this._days = false;
    this._unsub = this._hass.connection.subscribeMessage(
      (msg) => {
        this._forecast = msg.forecast || [];
        this._renderForecast();
        if (this._forecast.length) { this._days = true; clearTimeout(this._retry); this._retry = null; }
      },
      { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: this._config.weather });
    this._unsub.catch(() => {});
    const wait = RETRY_S[Math.min(this._tries++, RETRY_S.length - 1)];
    this._retry = setTimeout(() => this._subscribe(), wait * 1000);
  }

  _renderForecast() {
    const box = this._q(".forecast");
    if (!box || !this._forecast) return;
    const days = this._forecast.slice(0, this._config.forecast);
    box.innerHTML = days.map((d) => {
      const date = new Date(d.datetime);
      const hass = this._hass;
      const hi = d.temperature != null ? Math.round(d.temperature) : "–";
      const lo = d.templow != null ? Math.round(d.templow) : "";
      return `<div class="day"><div class="dname">${weekdayShort(hass, date, t)}</div>
        <ha-icon icon="${ICONS[d.condition] || "mdi:weather-cloudy"}"></ha-icon>
        <div class="hi">${hi}°</div><div class="lo">${lo}${lo === "" ? "" : "°"}</div></div>`;
    }).join("");
    this._fit();
  }

  _build() {
    this._built = true;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        /* Sizes are shares of the card's own height (cqh), times --k: 1 unless the row would
           be wider than the card (the now-playing layout gives it 20 of 36 columns and 4 rows),
           then _fit() lowers --k so the time, the icon, the temperature and the forecast fit. */
        :host { display: block; height: 100%; }
        ha-card { height: 100%; box-sizing: border-box; padding: 3cqh 2.5cqw; display: flex; align-items: center;
                  justify-content: space-between; gap: 2.5cqw; overflow: hidden; container-type: size; }
        .time { font-size: calc(64cqh * var(--k, 1)); font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .date { font-size: calc(13cqh * var(--k, 1)); color: var(--secondary-text-color); margin-top: 2cqh; white-space: nowrap; }
        .wx { display: flex; align-items: center; gap: 1.5cqw; min-width: 0; }
        .wx ha-icon { --mdc-icon-size: calc(58cqh * var(--k, 1)); color: var(--primary-color); flex: none; }
        .temp { font-size: calc(50cqh * var(--k, 1)); font-weight: 600; line-height: 1; white-space: nowrap; }
        .wx > div { min-width: 0; }
        .cond, .cond2 { font-size: calc(12cqh * var(--k, 1)); color: var(--secondary-text-color); line-height: 1.25;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cond { margin-top: 2cqh; }
        .cond.warn { font-weight: 600; }
        .forecast { display: flex; gap: 2cqw; flex: none; height: 100%; align-items: stretch; }
        .forecast:empty { display: none; }
        .day { display: flex; flex-direction: column; align-items: center; justify-content: space-between; min-width: 10cqw; }
        .day ha-icon { --mdc-icon-size: calc(42cqh * var(--k, 1)); color: var(--primary-color); }
        .dname { font-size: calc(12cqh * var(--k, 1)); color: var(--secondary-text-color); text-transform: uppercase; line-height: 1; }
        .hi { font-size: calc(16cqh * var(--k, 1)); font-weight: 600; line-height: 1; }
        .lo { font-size: calc(12cqh * var(--k, 1)); color: var(--secondary-text-color); line-height: 1; }
      </style>
      <ha-card>
        <div><div class="time"></div><div class="date"></div></div>
        <div class="wx"><ha-icon></ha-icon><div><div class="temp"></div><div class="cond"></div><div class="cond2"></div></div></div>
        <div class="forecast"></div>
      </ha-card>`;
    this._q = (sel) => root.querySelector(sel);
    this._clock();
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this._q("ha-card"));
  }

  // Shrink everything together when the natural row is wider than the card. Measured at --k = 1
  // from the elements that cannot wrap (time, date, icon, temperature, forecast); the condition
  // text wraps under the temperature and takes what is left.
  _fit() {
    const card = this._q("ha-card");
    if (!card || !card.clientWidth) return;
    card.style.setProperty("--k", 1);
    const cs = getComputedStyle(card);
    const gap = parseFloat(cs.columnGap) || 0;
    const timeW = Math.max(this._q(".time").scrollWidth, this._q(".date").scrollWidth);
    const wx = this._q(".wx");
    const wxW = this._q(".wx ha-icon").offsetWidth + (parseFloat(getComputedStyle(wx).columnGap) || 0)
      + this._q(".temp").scrollWidth;
    const fc = this._q(".forecast");
    const fcW = fc.children.length ? fc.scrollWidth : 0;
    const need = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + timeW + wxW + fcW + gap * (fcW ? 2 : 1);
    if (need > card.clientWidth) card.style.setProperty("--k", (card.clientWidth / need * 0.97).toFixed(3));
  }

  // HA's own translation of the state when the frontend offers it, else the card's strings.
  _conditionName(w) {
    const own = typeof this._hass.formatEntityState === "function" ? this._hass.formatEntityState(w) : "";
    if (own) return own;
    const key = `card.clock.condition.${w.state}`;
    const name = t(this._hass, key);
    return name === key ? w.state : name;
  }

  // From breezy up, the weather component's judged level (SPEC-056) says more than the raw speed:
  // "Breezy, 32 km/h SW, gusts 49". Calm, or a home without the weather component's sensor, keeps
  // the plain speed line, so nothing changes there.
  _windLevel() {
    const s = this._hass.states[WIND_LEVEL];
    if (!s || !WIND_SHOWN.includes(s.state)) return "";
    const a = s.attributes || {};
    const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
    const speed = num(a.speed);
    if (speed == null) return "";
    const hass = this._hass;
    let text = t(hass, "card.clock.wind_judged", { level: t(hass, `card.clock.wind_level.${s.state}`), speed });
    if (a.direction) {
      const key = `card.clock.direction.${a.direction}`;
      const dir = t(hass, key);
      text += ` ${dir === key ? a.direction : dir}`;
    }
    const gust = num(a.gust);
    if (gust != null) text += `, ${t(hass, "card.clock.wind_gust", { gust })}`;
    return text;
  }

  // The warning (SPEC-056 amendment 1, the Climate page's): {text, colour, about} while the weather
  // component's warning is on and the indicator's setting (config.warnings) is not off, else null.
  // An official warning says what and until when in its colour ("Gale force wind · until Sat 12:00",
  // "+1" for more), no level word: the colour says the level. `about`: the value it concerns (wind,
  // temp, cond), coloured too. The wind level alone (strong, gale) has no text: its value is coloured.
  _warning() {
    const select = this._config.warnings;
    if (!select) return null;
    if (!["icon", "hide", "always"].includes(this._hass.states[select]?.state)) return null;
    if (!warningOn(this._hass)) return null;
    const list = warningsOf(this._hass);
    if (list.length) {
      const top = list[0];
      let text = warningSubject(this._hass, top);
      const until = untilText(this._hass, top.expires, new Date(), "short");
      if (until) text += ` · ${until}`;
      if (list.length > 1) text += ` · +${list.length - 1}`;
      return { text, colour: colourOf(top), about: valueOf(top) };
    }
    const colour = WIND_COLOURS[windLevel(this._hass)];
    return colour ? { text: null, colour, about: "wind" } : null;
  }

  _clock() {
    if (!this._built) return;
    const d = new Date();
    this._q(".time").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    this._q(".date").textContent = formatDate(this._hass, d, { weekday: "long", day: "numeric", month: "long" });
  }

  _update() {
    const w = this._hass.states[this._config.weather];
    if (!w) return;
    const cond = w.state;
    this._q(".wx ha-icon").setAttribute("icon", ICONS[cond] || "mdi:weather-cloudy");
    const sensor = this._config.temperature && this._hass.states[this._config.temperature];
    const temp = sensor && !isNaN(parseFloat(sensor.state)) ? parseFloat(sensor.state) : w.attributes.temperature;
    this._q(".temp").textContent = temp == null ? "" : `${Math.round(temp)} °C`;
    // The condition on its own line, wind and pressure on the next: a two-line clamp would cut
    // "Partly cloudy, wind 8 km/h" in the middle. An official warning takes the condition's line,
    // and the condition leads the line below: the card keeps its height (3 rows on the Climate
    // page), each line ends in an ellipsis. The value the warning is about takes its colour.
    const warning = this._warning();
    const paint = (el, about) => { el.style.color = warning?.about === about ? warning.colour : ""; };
    paint(this._q(".temp"), "temp");
    const line = this._q(".cond");
    line.textContent = warning?.text || this._conditionName(w);
    line.classList.toggle("warn", !!warning?.text);
    line.style.color = warning?.text ? warning.colour : "";
    if (!warning?.text) paint(line, "cond");
    const wind = w.attributes.wind_speed;
    const parts = [];
    if (warning?.text) parts.push([this._conditionName(w), "cond"]);
    const judged = this._windLevel();
    if (judged) parts.push([judged, "wind"]);
    else if (wind != null) parts.push([t(this._hass, "card.clock.wind", { speed: Math.round(wind), unit: w.attributes.wind_speed_unit || "km/h" }), "wind"]);
    const p = this._config.pressure && this._hass.states[this._config.pressure];
    if (p && !isNaN(parseFloat(p.state))) parts.push([`${Math.round(parseFloat(p.state))} ${p.attributes.unit_of_measurement || "hPa"}`, ""]);
    const second = this._q(".cond2");
    second.replaceChildren();
    parts.forEach(([text, about], i) => {
      if (i) second.append(" · ");
      const span = document.createElement("span");
      span.textContent = text;
      if (about) paint(span, about);
      second.append(span);
    });
    this._clock();
    this._fit();
  }
}

customElements.define("clock-weather-card", ClockWeatherCard);
