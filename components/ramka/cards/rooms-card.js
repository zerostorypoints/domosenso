// Room temperatures for a wall tablet, readable from across the room: a grid of rooms
// that fills the card, each with the temperature in large type and the humidity under it.
// A missing reading shows card.common.noValue. Sizes are shares of the card's own height (cqh),
// capped by its width (--u) so that in a window squarer than the tablet the type still fits the
// tiles; and with `height` the card takes its height from the screen rather than from grid rows.
//
//   type: custom:rooms-card
//   height: calc(100vh - 304px)
//   columns: 3
//   entity: sensor.ramka_climate_rooms              # optional: its `rooms` attribute, a list of
//                                                   # places, each {label, main, extra} or a spacer
//                                                   # ({spacer: true}, or no main), replaces `rooms`
//                                                   # while it holds a room; the n-th room gets
//                                                   # colour n, a spacer is an empty tile
//   slots: input_number.ramka_climate_slots         # optional, with entity: how many places of the
//                                                   # list show (a number or an entity); the rest
//                                                   # stay in the list, unseen
//   rooms:
//     - name: Living room
//       temperature: sensor.living_room_temperature
//       humidity: sensor.living_room_humidity       # optional
//       color: 1                                    # optional: the temperature in the theme's
//                                                   # --graph-color-1, the colour HA's charts
//                                                   # give series 1; without it, plain text
//
// A reading shows its entity's unit; without one, °C for the temperature and % for the humidity.

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

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

  // The settings page's places, as `rooms` entries ({spacer: true} for an empty tile): the first
  // `slots` of them, no trailing spacer; null while the entity has no room among them.
  _live() {
    const list = this._config.entity && this._hass.states[this._config.entity]?.attributes?.rooms;
    if (!Array.isArray(list)) return null;
    const isRoom = (r) => r && typeof r === "object" && !r.spacer && typeof r.main === "string" && r.main;
    const places = list.slice(0, this._slots(list.length));
    while (places.length && !isRoom(places.at(-1))) places.pop();
    let n = 0;
    const rooms = places.map((r) => (isRoom(r)
      ? { name: String(r.label || ""), temperature: r.main, humidity: r.extra || null, color: ++n }
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

  // HA's own series colours when the theme has none (src/common/color/colors.ts).
  static PALETTE = ["#4269d0", "#f4bd4a", "#ff725c", "#6cc5b0", "#a463f2", "#ff8ab7", "#9c6b4e", "#97bbf5", "#01ab63", "#9498a0"];

  _color(n) {
    const v = getComputedStyle(this).getPropertyValue(`--graph-color-${n}`).trim();
    return v || RoomsCard.PALETTE[(n - 1) % RoomsCard.PALETTE.length];
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
      temp.style.color = room.color ? this._color(room.color) : "";
      const h = this._value(room.humidity, 0);
      el.querySelector(".hum").textContent = h == null ? "" : `${h} ${this._unit(room.humidity, "%")}`.trim();
    });
  }
}

customElements.define("rooms-card", RoomsCard);
