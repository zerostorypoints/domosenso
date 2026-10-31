// The Climate page's rooms, picked on the settings dashboard: one row per place (`slots`, the number
// of places; ten without it), each a name, a main reading and a supplementary one (by default the
// temperature and the humidity), chosen from the home's sensors that have a unit with Home
// Assistant's own entity picker, which searches as you type. The n-th room is the n-th room tile and
// the n-th line of the 7-day charts, in the theme's series colour n, the swatch in front of the row.
//
//   type: custom:climate-rooms-card
//   entity: sensor.ramka_climate_rooms         # attribute `rooms`: places in order, each
//                                              # {label, main, extra} or a spacer {spacer: true}
//   slots: input_number.ramka_climate_slots    # optional: how many rows (a number or an entity), 1-20
//   script: script.ramka_climate_rooms_set     # called with {rooms: [...]}
//
// The picker is frontend internals a dashboard does not load by itself: the entities card's editor
// imports it (HA 2026.9.2), so the card asks for that editor once. If the picker still is not there
// (a renamed element), each reading is a plain dropdown of the same sensors.
//
// The order is changed by dragging a row by its handle (pointer events: mouse, touch and pen; the
// handle takes the touch, so the page does not scroll under the finger) or with the row's up and down
// buttons (keyboard, screen readers). It is a plain ordered list, not the Ramka's grid.
//
// A row without a main reading is a spacer: it keeps its place, an empty tile on the Ramka; empty
// rows at the end are left out. Rooms beyond the number of places stay in the list, unseen on the
// Ramka, until the user removes them here or raises the number. A name left empty becomes the main
// sensor's area, else its own name. A sensor that is gone stays chosen, marked, until another is
// picked (it may come back).

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const DEFAULT_SLOTS = 10;
const MAX_SLOTS = 20;
// HA's own series colours when the theme has none (src/common/color/colors.ts), as rooms-card.
const PALETTE = ["#4269d0", "#f4bd4a", "#ff725c", "#6cc5b0", "#a463f2", "#ff8ab7", "#9c6b4e", "#97bbf5", "#01ab63", "#9498a0"];

const EMPTY = { label: "", main: "", extra: "" };
const isRoom = (r) => !!(r && r.main);

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
    // The stored places: a room, or EMPTY for a spacer (or anything that is not a room).
    const places = (Array.isArray(list) ? list : []).slice(0, MAX_SLOTS).map((r) =>
      (r && typeof r === "object" && !r.spacer && typeof r.main === "string" && r.main
        ? { label: String(r.label || ""), main: r.main, extra: typeof r.extra === "string" ? r.extra : "" }
        : EMPTY));
    const slots = this._slots();
    const sensors = this._sensors();
    const key = JSON.stringify([places, slots, sensors, hass.locale?.language]);
    // Not under a finger: after the drop, the next update draws the rows.
    if (key === this._built || this._drag) return;
    this._built = key;
    this._rooms = Array.from({ length: slots }, (_, n) => places[n] || EMPTY);
    this._beyond = places.slice(slots);
    this._render(sensors);
  }

  // How many rows: `slots` as a number or an entity's state, 1 to 20; ten while it has none.
  _slots() {
    const slots = this._config.slots;
    const n = typeof slots === "number" ? slots : parseInt(slots && this._hass.states[slots]?.state, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), MAX_SLOTS) : DEFAULT_SLOTS;
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
    this._sensorList = sensors;
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        ha-card { padding: 12px 16px; }
        .row { display: grid; grid-template-columns: 28px 14px minmax(0, 1fr); gap: 6px 10px; align-items: center; padding: 8px 0;
               border-top: 2px solid transparent; border-bottom: 2px solid transparent; }
        .row + .row { box-shadow: 0 -1px 0 var(--divider-color); }
        .row.dragging { opacity: 0.6; background: var(--secondary-background-color); }
        .row.drop-above { border-top-color: var(--primary-color); }
        .row.drop-below { border-bottom-color: var(--primary-color); }
        .handle { grid-row: span 4; align-self: stretch; display: flex; align-items: center; justify-content: center;
                  cursor: grab; touch-action: none; user-select: none; color: var(--secondary-text-color); border-radius: 6px; }
        .row.dragging .handle { cursor: grabbing; }
        .swatch { width: 14px; height: 14px; border-radius: 50%; grid-row: span 4; align-self: start; margin-top: 8px;
                  box-sizing: border-box; }
        .swatch.spacer { border: 2px dashed var(--divider-color); }
        .head { grid-column: 3; display: flex; align-items: center; gap: 4px; }
        .room { font-weight: 500; color: var(--primary-text-color); flex: 1; }
        .head.spacer .room { color: var(--secondary-text-color); font-style: italic; }
        button { font: inherit; color: var(--primary-text-color); background: none; border: 1px solid var(--divider-color);
                 border-radius: 6px; min-width: 36px; min-height: 32px; cursor: pointer; }
        button:disabled { opacity: 0.35; cursor: default; }
        label { display: grid; grid-template-columns: 9em minmax(0, 1fr); align-items: center; gap: 8px;
                color: var(--secondary-text-color); grid-column: 3; }
        input, select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
                        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 8px; min-width: 0; width: 100%;
                        box-sizing: border-box; }
        ha-entity-picker { display: block; min-width: 0; width: 100%; }
        .beyond { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 8px; padding: 8px 12px;
                  border-radius: 6px; background: var(--secondary-background-color); color: var(--primary-text-color); }
        .beyond span { flex: 1; min-width: 12em; }
        .beyond button { padding: 0 12px; }
      </style>
      <ha-card></ha-card>`;
    const card = root.querySelector("ha-card");
    this._rows = [];
    this._pickers = [];
    let n = 0;
    this._rooms.forEach((room, index) => {
      const number = isRoom(room) ? ++n : 0;
      const row = document.createElement("div");
      row.className = "row";
      const handle = document.createElement("div");
      handle.className = "handle";
      handle.title = t(this._hass, "card.climate_rooms.handle");
      // The up and down buttons are the accessible way; the handle is for the pointer only.
      handle.setAttribute("aria-hidden", "true");
      const grip = document.createElement("ha-icon");
      grip.setAttribute("icon", "mdi:drag");
      handle.append(grip);
      this._dragHandle(handle, index);
      const swatch = document.createElement("div");
      swatch.className = number ? "swatch" : "swatch spacer";
      if (number) swatch.style.background = this._color(number);
      const head = document.createElement("div");
      head.className = number ? "head" : "head spacer";
      const title = document.createElement("span");
      title.className = "room";
      title.textContent = number ? t(this._hass, "card.climate_rooms.room", { n: number }) : t(this._hass, "card.climate_rooms.spacer");
      const up = this._moveButton("up", "mdi:chevron-up", index, index - 1);
      const down = this._moveButton("down", "mdi:chevron-down", index, index + 1);
      head.append(title, up, down);
      const label = document.createElement("input");
      label.type = "text";
      label.value = room.label;
      label.placeholder = room.main ? this._defaultLabel(room.main) : "";
      label.addEventListener("change", () => this._save());
      const main = this._reading(sensors, room.main);
      const extra = this._reading(sensors, room.extra);
      row.append(handle, swatch, head, this._field("card.climate_rooms.label", label), this._field("card.climate_rooms.main", main),
                 this._field("card.climate_rooms.extra", extra));
      card.append(row);
      this._rows.push({ row, label, main, extra, up, down });
    });
    const hidden = this._beyond.filter(isRoom).length;
    if (hidden) {
      const note = document.createElement("div");
      note.className = "beyond";
      const text = document.createElement("span");
      text.textContent = t(this._hass, "card.climate_rooms.beyond", { n: hidden });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-beyond";
      remove.textContent = t(this._hass, "card.climate_rooms.remove_beyond");
      remove.addEventListener("click", () => {
        this._rooms = this._current();
        this._beyond = [];
        this._save(this._rooms);
        this._render(this._sensorList);
      });
      note.append(text, remove);
      card.append(note);
    }
  }

  _moveButton(which, icon, from, to) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = which;
    const name = t(this._hass, `card.climate_rooms.${which}`);
    button.title = name;
    button.setAttribute("aria-label", name);
    const glyph = document.createElement("ha-icon");
    glyph.setAttribute("icon", icon);
    button.append(glyph);
    button.disabled = to < 0 || to >= this._rooms.length;
    button.addEventListener("click", () => this._move(from, to, which));
    return button;
  }

  // Dragging a row by its handle. The handle captures the pointer, so the moves keep coming when the
  // finger leaves it; the row drops before the first other row whose middle is below the pointer.
  _dragHandle(handle, index) {
    handle.addEventListener("pointerdown", (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      ev.preventDefault();
      if (handle.setPointerCapture && ev.pointerId !== undefined) {
        try { handle.setPointerCapture(ev.pointerId); } catch { /* a pointer the browser does not know */ }
      }
      this._drag = { from: index, to: index };
      this._rows[index].row.classList.add("dragging");
    });
    handle.addEventListener("pointermove", (ev) => {
      const drag = this._drag;
      if (!drag || drag.from !== index) return;
      ev.preventDefault();
      const others = this._rows.filter((_, i) => i !== index);
      let to = 0;
      for (const { row } of others) {
        const rect = row.getBoundingClientRect();
        if (ev.clientY > rect.top + rect.height / 2) to++;
      }
      drag.to = to;
      for (const { row } of this._rows) row.classList.remove("drop-above", "drop-below");
      if (to === index) return;
      if (to < others.length) others[to].row.classList.add("drop-above");
      else others.at(-1).row.classList.add("drop-below");
    });
    const end = (drop) => (ev) => {
      const drag = this._drag;
      if (!drag || drag.from !== index) return;
      this._drag = null;
      if (handle.releasePointerCapture && ev.pointerId !== undefined) {
        try { handle.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
      }
      for (const { row } of this._rows) row.classList.remove("dragging", "drop-above", "drop-below");
      if (drop) this._move(drag.from, drag.to);
    };
    handle.addEventListener("pointerup", end(true));
    handle.addEventListener("pointercancel", end(false));
  }

  // Moves row `from` to position `to`, saves, and draws the rows in the new order at once (the
  // update with the saved list draws them again); focus stays on the button that moved the row,
  // or its twin when that one is now disabled.
  _move(from, to, focus) {
    if (to < 0 || to >= this._rows.length || to === from) return;
    const rows = this._current();
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    this._rooms = rows;
    this._save(rows);
    this._render(this._sensorList);
    if (focus) {
      const moved = this._rows[to];
      (moved[focus].disabled ? moved[focus === "up" ? "down" : "up"] : moved[focus]).focus();
    }
  }

  // The rows as they stand in the controls: {label, main, extra}, raw.
  _current() {
    return this._rows.map((r) => ({ label: r.label.value, main: r.main.value || "", extra: r.extra.value || "" }));
  }

  _field(key, control) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = t(this._hass, key);
    label.append(span, control);
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

  // Every row in order (as the controls hold them, or `rows`), a spacer where it has no main
  // reading, then the rooms beyond the number of places as they were; no spacer at the end.
  _save(rows = this._current()) {
    const rooms = [...rows, ...this._beyond].map((r) => (r.main
      ? { label: r.label.trim() || this._defaultLabel(r.main), main: r.main, extra: r.extra }
      : { spacer: true }));
    while (rooms.length && rooms.at(-1).spacer) rooms.pop();
    const [domain, service] = this._config.script.split(".");
    this._hass.callService(domain, service, { rooms });
  }
}

customElements.define("climate-rooms-card", ClimateRoomsCard);
