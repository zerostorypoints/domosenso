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
// After a Home Assistant restart an open page reconnects before the weather integration is back:
// the subscription is refused or answers with no days. The card subscribes again on every
// reconnect and as soon as the weather entity is there again, and retries until days arrive, so
// the forecast comes back without a page reload.

import { createT, formatDate, weekdayShort } from "./lib/i18n.js";
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
    // "Partly cloudy, wind 8 km/h" in the middle.
    this._q(".cond").textContent = this._conditionName(w);
    const wind = w.attributes.wind_speed;
    const parts = [];
    if (wind != null) parts.push(t(this._hass, "card.clock.wind", { speed: Math.round(wind), unit: w.attributes.wind_speed_unit || "km/h" }));
    const p = this._config.pressure && this._hass.states[this._config.pressure];
    if (p && !isNaN(parseFloat(p.state))) parts.push(`${Math.round(parseFloat(p.state))} ${p.attributes.unit_of_measurement || "hPa"}`);
    this._q(".cond2").textContent = parts.join(" · ");
    this._clock();
    this._fit();
  }
}

customElements.define("clock-weather-card", ClockWeatherCard);
