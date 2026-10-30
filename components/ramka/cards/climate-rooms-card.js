// The Climate page's rooms, picked on the settings dashboard: five rows, each a name, a main reading
// and a supplementary one (by default the temperature and the humidity), chosen from the home's
// sensors that have a unit with Home Assistant's own entity picker, which searches as you type. Room n is the n-th tile and the n-th line of the 7-day charts,
// in the theme's series colour n, the swatch in front of the row.
//
//   type: custom:climate-rooms-card
//   entity: sensor.ramka_climate_rooms         # attribute `rooms`: [{label, main, extra}]
//   script: script.ramka_climate_rooms_set     # called with {rooms: [...]}
//
// The picker is frontend internals a dashboard does not load by itself: the entities card's editor
// imports it (HA 2026.9.2), so the card asks for that editor once. If the picker still is not there
// (a renamed element), each reading is a plain dropdown of the same sensors.
//
// A row without a main reading is no room: the rooms below it move up. A name left empty becomes
// the main sensor's area, else its own name. A sensor that is gone stays chosen, marked, until
// another is picked (it may come back).

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const SLOTS = 5;
// HA's own series colours when the theme has none (src/common/color/colors.ts), as rooms-card.
const PALETTE = ["#4269d0", "#f4bd4a", "#ff725c", "#6cc5b0", "#a463f2"];

class ClimateRoomsCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("climate-rooms-card: entity is required");
    if (!config.script) throw new Error("climate-rooms-card: script is required");
    this._config = config;
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    this._loadPicker();
    for (const picker of this._pickers || []) picker.hass = hass;
    const list = hass.states[this._config.entity]?.attributes?.rooms;
    const rooms = (Array.isArray(list) ? list : []).filter((r) => r && typeof r.main === "string" && r.main).slice(0, SLOTS)
      .map((r) => ({ label: String(r.label || ""), main: r.main, extra: typeof r.extra === "string" ? r.extra : "" }));
    const sensors = this._sensors();
    const key = JSON.stringify([rooms, sensors, hass.locale?.language]);
    if (key === this._built) return;
    this._built = key;
    this._rooms = rooms;
    this._render(sensors);
  }

  // Loads ha-entity-picker through the entities card's editor, then draws the rows again with it.
  _loadPicker() {
    if (this._pickerAsked || customElements.get("ha-entity-picker") || !window.loadCardHelpers) return;
    this._pickerAsked = true;
    window.loadCardHelpers()
      .then((helpers) => helpers.createCardElement({ type: "entities", entities: [] }))
      .then((card) => card.constructor.getConfigElement && card.constructor.getConfigElement())
      .then(() => customElements.whenDefined("ha-entity-picker"))
      .then(() => {
        this._built = null;
        if (this._hass) this.hass = this._hass;
      }, () => {});
  }

  // Every sensor with a unit, by name: [entity id, name, unit].
  _sensors() {
    return Object.entries(this._hass.states)
      .filter(([id, s]) => id.startsWith("sensor.") && typeof s.attributes?.unit_of_measurement === "string")
      .map(([id, s]) => [id, String(s.attributes.friendly_name || id), s.attributes.unit_of_measurement])
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  }

  _render(sensors) {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        ha-card { padding: 12px 16px; }
        .row { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 6px 10px; align-items: center; padding: 8px 0; }
        .row + .row { border-top: 1px solid var(--divider-color); }
        .swatch { width: 14px; height: 14px; border-radius: 50%; grid-row: span 3; align-self: start; margin-top: 8px; }
        label { display: grid; grid-template-columns: 9em minmax(0, 1fr); align-items: center; gap: 8px;
                color: var(--secondary-text-color); }
        input, select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
                        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 8px; min-width: 0; width: 100%;
                        box-sizing: border-box; }
        ha-entity-picker { display: block; min-width: 0; width: 100%; }
        .room { font-weight: 500; color: var(--primary-text-color); grid-column: 2; }
      </style>
      <ha-card></ha-card>`;
    const card = root.querySelector("ha-card");
    this._rows = [];
    this._pickers = [];
    for (let n = 0; n < SLOTS; n++) {
      const room = this._rooms[n] || { label: "", main: "", extra: "" };
      const row = document.createElement("div");
      row.className = "row";
      const swatch = document.createElement("div");
      swatch.className = "swatch";
      swatch.style.background = this._color(n + 1);
      const title = document.createElement("div");
      title.className = "room";
      title.textContent = t(this._hass, "card.climate_rooms.room", { n: n + 1 });
      const label = document.createElement("input");
      label.type = "text";
      label.value = room.label;
      label.placeholder = room.main ? this._defaultLabel(room.main) : "";
      label.addEventListener("change", () => this._save());
      const main = this._reading(sensors, room.main);
      const extra = this._reading(sensors, room.extra);
      row.append(swatch, title, this._field("card.climate_rooms.label", label), this._field("card.climate_rooms.main", main),
                 this._field("card.climate_rooms.extra", extra));
      card.append(row);
      this._rows.push({ label, main, extra });
    }
  }

  _field(key, control) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = t(this._hass, key);
    label.append(span, control);
    label.style.gridColumn = "2";
    return label;
  }

  // A reading's control: the entity picker when it is loaded, else a dropdown. Both have `value`.
  _reading(sensors, value) {
    if (!customElements.get("ha-entity-picker")) {
      const select = this._select(sensors, value);
      select.addEventListener("change", () => this._save());
      return select;
    }
    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.includeDomains = ["sensor"];
    picker.entityFilter = (state) => typeof state?.attributes?.unit_of_measurement === "string";
    picker.allowCustomEntity = false;
    picker.value = value || "";
    picker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      picker.value = ev.detail?.value || "";
      this._save();
    });
    this._pickers.push(picker);
    return picker;
  }

  _select(sensors, value) {
    const select = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t(this._hass, "card.climate_rooms.none");
    select.append(none);
    const options = sensors.map(([id, name, unit]) => [id, unit ? `${name} (${unit})` : name]);
    if (value && !sensors.some(([id]) => id === value)) options.push([value, `${value} (${t(this._hass, "card.climate_rooms.missing")})`]);
    for (const [id, text] of options) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = text;
      option.title = id;
      select.append(option);
    }
    select.value = value || "";
    return select;
  }

  // The main sensor's area (its own, else its device's), else the sensor's name.
  _defaultLabel(id) {
    const entity = this._hass.entities?.[id];
    const area = entity?.area_id || this._hass.devices?.[entity?.device_id]?.area_id;
    return this._hass.areas?.[area]?.name || String(this._hass.states[id]?.attributes?.friendly_name || id);
  }

  _color(n) {
    const v = getComputedStyle(this).getPropertyValue(`--graph-color-${n}`).trim();
    return v || PALETTE[(n - 1) % PALETTE.length];
  }

  _save() {
    const rooms = this._rows.filter((r) => r.main.value).map((r) => ({
      label: r.label.value.trim() || this._defaultLabel(r.main.value), main: r.main.value, extra: r.extra.value,
    }));
    const [domain, service] = this._config.script.split(".");
    this._hass.callService(domain, service, { rooms });
  }
}

customElements.define("climate-rooms-card", ClimateRoomsCard);
