// Room temperatures for a wall tablet, readable from across the room: a grid of rooms
// that fills the card, each with the temperature in large type and the humidity under it.
// A missing reading shows card.common.noValue. Sizes are shares of the card's own height (cqh),
// capped by its width (--u) so that in a window squarer than the tablet the type still fits the
// tiles; and with `height` the card takes its height from the screen rather than from grid rows.
//
//   type: custom:rooms-card
//   height: calc(100vh - 304px)
//   columns: 3
//   entity: sensor.ramka_climate_rooms              # optional: its `rooms` attribute, the settings
//                                                   # page's widgets ({type, label, main, extra, ...}
//                                                   # or an empty one, lib/climate-widgets.js),
//                                                   # replaces `rooms` while it holds a reading; the
//                                                   # n-th widget with one gets series colour n, an
//                                                   # empty widget is an empty tile
//   slots: input_number.ramka_climate_slots         # optional, with entity: how many widgets of the
//                                                   # list show (a number or an entity); the rest
//                                                   # stay in the list, unseen
//   thresholds: input_boolean.ramka_climate_thresholds  # optional, with entity: while on, the values
//                                                   # are coloured by their thresholds (below)
//   air_limits:                                     # optional: the Air page's limits, fair from and
//     co2: [input_number.ramka_air_co2_raised, input_number.ramka_air_co2_high]     # poor from, for
//     pm2_5: [input_number.ramka_air_pm2_5_raised, input_number.ramka_air_pm2_5_high]  # Air quality
//   air_colors:                                     # optional: the Air page's colours (ids of
//     good: input_select.ramka_air_color_good       # lib/colours.js), for Air quality; without
//     fair: input_select.ramka_air_color_fair       # them neutral, amber and red
//     poor: input_select.ramka_air_color_poor
//   neutral_color: input_select.ramka_climate_color_neutral  # optional: the neutral colour (an id);
//                                                   # without it the primary text colour
//   rooms:
//     - name: Living room
//       temperature: sensor.living_room_temperature
//       humidity: sensor.living_room_humidity       # optional
//       color: 1                                    # optional: the temperature in the theme's
//                                                   # --graph-color-1, the colour HA's charts
//                                                   # give series 1; without it, plain text
//
// A reading shows its entity's unit; without one, °C for the temperature and % for the humidity.
//
// Threshold-based colours (`thresholds` on): a Temperature widget's temperature is blue below its
// comfort range, the neutral colour (`neutral_color`) within it, red above; its humidity the same
// with its own range. An Air quality widget's CO2 and PM2.5 in the Air page's colours (`air_colors`),
// good, fair or poor by the Air page's limits (their defaults while a helper has no number; the good
// colour without them), so the Ramka and the Air page agree. A Custom widget's main value: the colour
// chosen in its settings, else the neutral colour. Off: each widget's main value in its series
// colour, as before the types. The layout is the same either way.

import { createT } from "./lib/i18n.js";

// The translations and the shared widget module carry this module's own ?v= (the deploy's hash of
// this file): /local/ is served with a 31-day cache, so an import without it can stay the old file
// after a deploy in the same version.
const version = new URL(import.meta.url).search;
const load = (path, json) => import(new URL(path, import.meta.url).href + version, json ? { with: { type: "json" } } : undefined);
const [widgets, en, de, pl] = await Promise.all([
  load("./lib/climate-widgets.js"), load("../translations/en.json", true), load("../translations/de.json", true),
  load("../translations/pl.json", true)]);
const { COMFORT, AIR_READINGS, THRESHOLD, NEUTRAL, AIR_COLOURS, colourCss, selectedColour, seriesSlot, slotColor, readWidget,
  hasReading, band, level } = widgets;

const t = createT({ en: en.default, de: de.default, pl: pl.default });

class RoomsCard extends HTMLElement {
  setConfig(config) {
    if (!config.rooms || !config.rooms.length) throw new Error("rooms-card: rooms is required");
    this._config = { columns: 3, ...config };
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: this._config.height ? "auto" : 6 };
  }

  set hass(hass) {
    this._hass = hass;
    const rooms = this._live() || this._config.rooms;
    if (this._built !== rooms.length) this._build(rooms.length);
    this._update(rooms);
  }

  // The settings page's widgets, as `rooms` entries ({spacer: true} for an empty tile): the first
  // `slots` of them, no trailing empty one; null while the entity has no reading among them. `color`
  // is the theme slot of the n-th widget with a reading, `widget` the widget itself.
  _live() {
    const list = this._config.entity && this._hass.states[this._config.entity]?.attributes?.rooms;
    if (!Array.isArray(list)) return null;
    const places = list.slice(0, this._slots(list.length)).map((r) => readWidget(r, this._hass.states));
    while (places.length && !hasReading(places.at(-1))) places.pop();
    let n = 0;
    const rooms = places.map((w) => (hasReading(w)
      ? { name: w.label, temperature: w.main, humidity: w.extra || null, color: seriesSlot(++n), widget: w }
      : { spacer: true }));
    return n ? rooms : null;
  }

  // How many places show: `slots` as a number or an entity's state, 1 to 20; all without one.
  _slots(all) {
    const slots = this._config.slots;
    const n = typeof slots === "number" ? slots : parseInt(slots && this._hass.states[slots]?.state, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 20) : all;
  }

  _build(count) {
    this._built = count;
    const rows = Math.ceil(count / this._config.columns);
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card { height: 100%; --u: min(1cqh, 0.22cqw); box-sizing: border-box; padding: 2cqh 1.5cqw; container-type: size;
                  display: grid; grid-template-columns: repeat(${this._config.columns}, 1fr);
                  grid-template-rows: repeat(${rows}, 1fr); gap: 1.5cqh 1.5cqw; overflow: hidden; }
        .room { display: flex; flex-direction: column; justify-content: center; align-items: center;
                border-radius: calc(2 * var(--u)); background: var(--secondary-background-color); min-width: 0; }
        .room.spacer { visibility: hidden; }
        .name { font-size: calc(${Math.min(7, 24 / rows)} * var(--u)); color: var(--secondary-text-color); white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis; max-width: 95%; }
        .temp { font-size: calc(${Math.min(16, 56 / rows)} * var(--u)); font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .hum { font-size: calc(${Math.min(6, 20 / rows)} * var(--u)); color: var(--secondary-text-color); }
      </style>
      <ha-card>
        ${Array.from({ length: count }, () => `<div class="room"><div class="name"></div><div class="temp"></div><div class="hum"></div></div>`).join("")}
      </ha-card>`;
    if (this._config.height) this.style.height = this._config.height;
    this._rooms = Array.from(root.querySelectorAll(".room"));
  }

  _value(id, digits) {
    const s = id && this._hass.states[id];
    if (!s || ["unknown", "unavailable", ""].includes(s.state)) return null;
    const n = parseFloat(s.state);
    return Number.isFinite(n) ? n.toFixed(digits) : s.state;
  }

  _number(id) {
    const n = parseFloat(id && this._hass.states[id]?.state);
    return Number.isFinite(n) ? n : null;
  }

  // An Air page limit: the helper's number, else the package's default.
  _airLimit(reading, i) {
    return this._number(this._config.air_limits?.[reading]?.[i]) ?? AIR_READINGS[reading][i];
  }

  // The two values' colours: [main, second]; "" keeps the card's own (plain text, the second grey).
  _colors(room) {
    const off = [room.color ? slotColor(this, room.color) : "", ""];
    if (!this._config.thresholds || this._hass.states[this._config.thresholds]?.state !== "on") return off;
    // The configured rooms (before the seed) are temperatures and humidities.
    const w = room.widget || { type: "temperature" };
    const { low, high } = THRESHOLD;
    const states = this._hass.states;
    const own = this._config.neutral_color;
    const neutral = own ? selectedColour(states, own, NEUTRAL) : THRESHOLD.neutral;
    if (w.type === "temperature") {
      const range = (value, lowKey, highKey) =>
        ({ low, within: neutral, high, null: "" })[band(value, w[lowKey] ?? COMFORT[lowKey], w[highKey] ?? COMFORT[highKey])];
      return [range(this._number(room.temperature), "temp_low", "temp_high"), range(this._number(room.humidity), "hum_low", "hum_high")];
    }
    if (w.type === "air") {
      const picked = this._config.air_colors;
      const colours = picked
        ? Object.fromEntries(Object.entries(AIR_COLOURS).map(([key, id]) => [key, selectedColour(states, picked[key], id)]))
        : { good: THRESHOLD.neutral, fair: THRESHOLD.raised, poor: THRESHOLD.high };
      const air = (value, reading) => (this._config.air_limits?.[reading]
        ? ({ ...colours, null: "" })[level(value, this._airLimit(reading, 0), this._airLimit(reading, 1))]
        : (value === null ? "" : colours.good));
      return [air(this._number(room.temperature), "co2"), air(this._number(room.humidity), "pm2_5")];
    }
    return [colourCss(w.color) || neutral, ""];
  }

  _unit(id, fallback) {
    const unit = this._hass.states[id]?.attributes?.unit_of_measurement;
    return typeof unit === "string" ? unit : fallback;
  }

  _update(rooms) {
    rooms.forEach((room, i) => {
      const el = this._rooms[i];
      el.classList.toggle("spacer", !!room.spacer);
      if (room.spacer) {
        for (const part of el.children) part.textContent = "";
        return;
      }
      el.querySelector(".name").textContent = room.name;
      const temperature = this._value(room.temperature, 1);
      const temp = el.querySelector(".temp");
      temp.textContent = temperature == null ? t(this._hass, "card.common.noValue") : `${temperature} ${this._unit(room.temperature, "°C")}`.trim();
      const [mainColor, secondColor] = this._colors(room);
      temp.style.color = mainColor;
      const h = this._value(room.humidity, 0);
      const hum = el.querySelector(".hum");
      hum.textContent = h == null ? "" : `${h} ${this._unit(room.humidity, "%")}`.trim();
      hum.style.color = secondColor;
    });
  }
}

customElements.define("rooms-card", RoomsCard);
