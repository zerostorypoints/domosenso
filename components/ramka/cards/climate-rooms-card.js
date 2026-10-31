// The Climate page's widgets, picked on the settings dashboard: one row per widget (`slots`, the
// number of widgets; ten without it). Each row has a type, chosen in the dropdown of its header:
//   - Temperature: main = a temperature sensor, second = a humidity sensor;
//   - Air quality: main = a CO2 sensor, second = a PM2.5 sensor;
//   - Custom: main and second = any sensor with a reading (below);
//   - Empty: an empty tile on the Ramka (no readings).
// The pickers offer the sensors of the type's device class (any sensor with a reading when the home
// has none of that class), with Home Assistant's own entity picker, which searches as you type. A
// sensor has a reading when it has a unit, a state class (measurement, total, total_increasing) or a
// number for its state: a score without a unit (an air quality index) is a reading too. A
// name, and a "Settings" link that opens the widget's dialog: a Temperature widget's comfort ranges,
// an Air quality widget's limits (the Air page's helpers, shared with it), a Custom widget's colour
// (a dropdown of the Ramka's named colours, lib/colours.js, or Neutral: the Climate page's neutral
// colour, stored as no colour; lib/colour-list.js, each choice with its colour's dot, the swatch's).
// The n-th widget with a reading is the n-th tile and the n-th line of the 7-day charts, in series
// colour n (lib/climate-widgets.js), the swatch in front of the row.
//
//   type: custom:climate-rooms-card
//   entity: sensor.ramka_climate_rooms         # attribute `rooms`: widgets in order, each
//                                              # {type, label, main, extra, ...} or {type: empty, spacer: true}
//   slots: input_number.ramka_climate_slots    # optional: how many rows (a number or an entity), 1-20
//   script: script.ramka_climate_rooms_set     # called with {rooms: [...]}
//   air_limits:                                # optional: the Air page's limits, fair from and poor
//     co2: [input_number.ramka_air_co2_raised, input_number.ramka_air_co2_high]       # from, of the
//     pm2_5: [input_number.ramka_air_pm2_5_raised, input_number.ramka_air_pm2_5_high] # readings it has
//   neutral_color: input_select.ramka_climate_color_neutral  # optional: the neutral colour's swatch
//
// An entry from before the types reads as Temperature when its main sensor is a temperature, else
// Custom (lib/climate-widgets.js); the next save stores the type, no room is lost. A Custom widget's
// colour stored as a theme slot number (the build before the named colours) reads as that colour's
// id, and the next save stores the id.
//
// The picker is frontend internals a dashboard does not load by itself: the entities card's editor
// imports it (HA 2026.9.2), so the card asks for that editor once. If the picker still is not there
// (a renamed element), each reading is a plain dropdown of the same sensors.
//
// The order is changed by dragging a row by its handle (pointer events: mouse, touch and pen; the
// handle takes the touch, so the page does not scroll under the finger) or with the row's up and down
// buttons (keyboard, screen readers). It is a plain ordered list, not the Ramka's grid.
//
// Empty widgets at the end are left out when saved. Widgets beyond the number stay in the list,
// unseen on the Ramka, until the user removes them here or raises the number. A name left empty
// becomes the main sensor's area, else its own name. A sensor that is gone stays chosen, marked,
// until another is picked (it may come back).

import { createT } from "./lib/i18n.js";

// The translations and the shared widget module carry this module's own ?v= (the deploy's hash of
// this file): /local/ is served with a 31-day cache, so an import without it can stay the old file
// after a deploy in the same version, and a new key then shows raw (as card.climate_rooms.spacer did).
const version = new URL(import.meta.url).search;
const load = (path, json) => import(new URL(path, import.meta.url).href + version, json ? { with: { type: "json" } } : undefined);
const [widgets, colourLists, en, de, pl] = await Promise.all([
  load("./lib/climate-widgets.js"), load("./lib/colour-list.js"), load("../translations/en.json", true),
  load("../translations/de.json", true), load("../translations/pl.json", true)]);
const { TYPES, DEVICE_CLASSES, COMFORT, COLOUR_IDS, NEUTRAL, colourKey, colourCss, selectedColour, seriesSlot, slotColor,
  readWidget, hasReading, storedWidget } = widgets;
const { colourList, COLOUR_LIST_CSS } = colourLists;

const t = createT({ en: en.default, de: de.default, pl: pl.default });

const DEFAULT_SLOTS = 10;
const MAX_SLOTS = 20;
const EMPTY = { type: "empty" };
// Per type, the label keys of its main and second readings.
const READINGS = {
  temperature: ["card.climate_rooms.main_temperature", "card.climate_rooms.extra_temperature"],
  air: ["card.climate_rooms.main_air", "card.climate_rooms.extra_air"],
  custom: ["card.climate_rooms.main", "card.climate_rooms.extra"],
};
// The Air page's readings an Air quality widget shows, with their legend in its dialog.
const AIR_KEYS = { co2: "card.climate_rooms.co2_limits", pm2_5: "card.climate_rooms.pm2_5_limits" };
// The state classes of a reading (a sensor without a unit is one with any of them).
const STATE_CLASSES = ["measurement", "total", "total_increasing"];

// Whether a sensor's state is a reading a widget can show: a unit, a state class or a number.
export function isReading(state) {
  const a = state?.attributes || {};
  if (typeof a.unit_of_measurement === "string") return true;
  if (STATE_CLASSES.includes(a.state_class)) return true;
  const value = state?.state;
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
}

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
    const places = (Array.isArray(list) ? list : []).slice(0, MAX_SLOTS).map((r) => readWidget(r, hass.states));
    const slots = this._slots();
    const sensors = this._sensors();
    const key = JSON.stringify([places, slots, sensors, hass.locale?.language]);
    // Not under a finger or an open dialog: the next update after it draws the rows.
    if (key === this._built || this._drag || this._dialog) return;
    this._built = key;
    this._rooms = Array.from({ length: slots }, (_, n) => ({ ...(places[n] || EMPTY) }));
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

  // Every sensor with a reading, by name: [entity id, name, unit ("" without one), device class]; not
  // the widgets' own sensor (its state, how many have a reading, is a number too).
  _sensors() {
    return Object.entries(this._hass.states)
      .filter(([id, s]) => id.startsWith("sensor.") && id !== this._config.entity && isReading(s))
      .map(([id, s]) => [id, String(s.attributes?.friendly_name || id),
                         typeof s.attributes?.unit_of_measurement === "string" ? s.attributes.unit_of_measurement : "",
                         typeof s.attributes?.device_class === "string" ? s.attributes.device_class : ""])
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  }

  // The device class a picker filters by: its type's, while the home has a sensor of it; else none.
  _filterClass(sensors, deviceClass) {
    return deviceClass && sensors.some((s) => s[3] === deviceClass) ? deviceClass : null;
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
        ${COLOUR_LIST_CSS}
        .row > .swatch { grid-row: span 4; align-self: start; margin-top: 11px; }
        .swatch.spacer { border: 2px dashed var(--divider-color); }
        .head { grid-column: 3; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .head select.type { flex: 1; min-width: 9em; width: auto; font-weight: 500; }
        .head.spacer select.type { color: var(--secondary-text-color); font-style: italic; }
        button { font: inherit; color: var(--primary-text-color); background: none; border: 1px solid var(--divider-color);
                 border-radius: 6px; min-width: 36px; min-height: 36px; cursor: pointer; }
        button:disabled { opacity: 0.35; cursor: default; }
        button.settings { border: none; color: var(--primary-color); text-decoration: underline; padding: 0 8px; }
        label { display: grid; grid-template-columns: 9em minmax(0, 1fr); align-items: center; gap: 8px;
                color: var(--secondary-text-color); grid-column: 3; }
        input, select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
                        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 8px; min-width: 0; width: 100%;
                        box-sizing: border-box; min-height: 36px; }
        ha-entity-picker { display: block; min-width: 0; width: 100%; }
        .beyond { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 8px; padding: 8px 12px;
                  border-radius: 6px; background: var(--secondary-background-color); color: var(--primary-text-color); }
        .beyond span { flex: 1; min-width: 12em; }
        .beyond button { padding: 0 12px; }
        dialog { border: none; border-radius: 12px; padding: 0; max-width: min(92vw, 440px); width: 100%; box-sizing: border-box;
                 background: var(--card-background-color, #fff); color: var(--primary-text-color);
                 box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); }
        dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
        .body { padding: 20px; display: grid; gap: 14px; }
        .body h2 { margin: 0; font-size: 1.2em; font-weight: 500; }
        .body p { margin: 0; color: var(--secondary-text-color); }
        fieldset { border: 1px solid var(--divider-color); border-radius: 8px; margin: 0; padding: 8px 12px 12px;
                   display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        legend { padding: 0 4px; color: var(--primary-text-color); }
        fieldset label { grid-column: auto; grid-template-columns: 1fr; gap: 4px; }
        .colours .colour-select { display: block; }
        .error { color: var(--error-color, #db4437); }
        .error:empty { display: none; }
        .actions { display: flex; justify-content: flex-end; gap: 8px; }
        .actions button { padding: 0 16px; }
        .actions button.save { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
      </style>
      <ha-card></ha-card>`;
    const card = root.querySelector("ha-card");
    this._rows = [];
    this._pickers = [];
    let n = 0;
    this._rooms.forEach((w, index) => {
      const number = hasReading(w) ? ++n : 0;
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
      if (number) swatch.style.background = slotColor(this, seriesSlot(number));
      const head = document.createElement("div");
      head.className = w.type === "empty" ? "head spacer" : "head";
      const type = this._typeSelect(w, index);
      const controls = { row, type };
      head.append(type);
      if (w.type !== "empty") {
        const settings = document.createElement("button");
        settings.type = "button";
        settings.className = "settings";
        settings.textContent = t(this._hass, "card.climate_rooms.settings");
        settings.addEventListener("click", () => this._openSettings(index));
        head.append(settings);
        controls.settings = settings;
      }
      controls.up = this._moveButton("up", "mdi:chevron-up", index, index - 1);
      controls.down = this._moveButton("down", "mdi:chevron-down", index, index + 1);
      head.append(controls.up, controls.down);
      row.append(handle, swatch, head);
      if (w.type !== "empty") {
        const label = document.createElement("input");
        label.type = "text";
        label.value = w.label;
        label.placeholder = w.main ? this._defaultLabel(w.main) : "";
        label.addEventListener("change", () => {
          w.label = label.value;
          this._save();
        });
        const [mainClass, extraClass] = DEVICE_CLASSES[w.type];
        const main = this._reading(sensors, w.main, this._filterClass(sensors, mainClass), (v) => { w.main = v; });
        const extra = this._reading(sensors, w.extra, this._filterClass(sensors, extraClass), (v) => { w.extra = v; });
        const [mainKey, extraKey] = READINGS[w.type];
        row.append(this._field("card.climate_rooms.label", label), this._field(mainKey, main), this._field(extraKey, extra));
        Object.assign(controls, { label, main, extra });
      }
      card.append(row);
      this._rows.push(controls);
    });
    const hidden = this._beyond.filter(hasReading).length;
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
        this._beyond = [];
        this._save();
        this._render(this._sensorList);
      });
      note.append(text, remove);
      card.append(note);
    }
  }

  // The row's type, a dropdown in its header. A new type keeps the name and the readings that fit
  // its pickers (a Custom widget takes any), and draws the row again with that type's fields.
  _typeSelect(w, index) {
    const select = document.createElement("select");
    select.className = "type";
    select.setAttribute("aria-label", t(this._hass, "card.climate_rooms.type", { n: index + 1 }));
    for (const type of TYPES) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = t(this._hass, `card.climate_rooms.types.${type}`);
      select.append(option);
    }
    select.value = w.type;
    select.addEventListener("change", () => {
      const type = select.value;
      if (type === "empty") {
        this._rooms[index] = { ...EMPTY };
      } else {
        const fits = (id, deviceClass) => {
          const dc = this._filterClass(this._sensorList, deviceClass);
          return id && (!dc || this._hass.states[id]?.attributes?.device_class === dc) ? id : "";
        };
        const [mainClass, extraClass] = DEVICE_CLASSES[type];
        this._rooms[index] = { type, label: w.label || "", main: fits(w.main, mainClass), extra: fits(w.extra, extraClass) };
      }
      this._save();
      this._render(this._sensorList);
      this._rows[index].type.focus();
    });
    return select;
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
    const [row] = this._rooms.splice(from, 1);
    this._rooms.splice(to, 0, row);
    this._save();
    this._render(this._sensorList);
    if (focus) {
      const moved = this._rows[to];
      (moved[focus].disabled ? moved[focus === "up" ? "down" : "up"] : moved[focus]).focus();
    }
  }

  _field(key, control) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = t(this._hass, key);
    label.append(span, control);
    return label;
  }

  // A reading's control: the entity picker when it is loaded, else a dropdown; both of the sensors
  // with a reading (isReading), of `deviceClass` when given. `set` takes the new value, then the rows are saved.
  _reading(sensors, value, deviceClass, set) {
    if (!customElements.get("ha-entity-picker")) {
      const select = this._select(deviceClass ? sensors.filter((s) => s[3] === deviceClass) : sensors, value);
      select.addEventListener("change", () => {
        set(select.value || "");
        this._save();
      });
      return select;
    }
    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.includeDomains = ["sensor"];
    if (deviceClass) picker.includeDeviceClasses = [deviceClass];
    picker.entityFilter = (state) => state?.entity_id !== this._config.entity && isReading(state)
      && (!deviceClass || state.attributes?.device_class === deviceClass);
    picker.allowCustomEntity = false;
    picker.value = value || "";
    picker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      picker.value = ev.detail?.value || "";
      set(picker.value);
      this._save();
    });
    this._pickers.push(picker);
    return picker;
  }

  // A dropdown of `sensors`; a chosen one that is not among them stays, by its name, or marked when
  // it is gone.
  _select(sensors, value) {
    const select = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t(this._hass, "card.climate_rooms.none");
    select.append(none);
    const options = sensors.map(([id, name, unit]) => [id, unit ? `${name} (${unit})` : name]);
    if (value && !sensors.some(([id]) => id === value)) {
      const known = this._hass.states[value];
      options.push([value, known ? String(known.attributes?.friendly_name || value) : `${value} (${t(this._hass, "card.climate_rooms.missing")})`]);
    }
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

  // ---- The widget's settings dialog -------------------------------------------------------------

  // A modal <dialog> over the page (the browser's top layer, so no card clips it): Escape, a tap on
  // the backdrop or Cancel close it unchanged; Save writes and closes. Updates wait while it is open.
  _openSettings(index) {
    const w = this._rooms[index];
    const dialog = document.createElement("dialog");
    dialog.className = "widget-settings";
    const body = document.createElement("form");
    body.className = "body";
    const title = document.createElement("h2");
    title.id = "widget-settings-title";
    const name = w.label.trim() || (w.main ? this._defaultLabel(w.main) : t(this._hass, "card.climate_rooms.widget", { n: index + 1 }));
    title.textContent = t(this._hass, "card.climate_rooms.settings_title", { name });
    dialog.setAttribute("aria-labelledby", title.id);
    body.append(title);
    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    const apply = { temperature: () => this._temperatureSettings(body, w), air: () => this._airSettings(body),
                    custom: () => this._customSettings(body, w) }[w.type]();
    const actions = document.createElement("div");
    actions.className = "actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel";
    cancel.textContent = t(this._hass, "card.climate_rooms.cancel");
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "save";
    save.textContent = t(this._hass, "card.climate_rooms.save");
    actions.append(cancel, save);
    body.append(error, actions);
    dialog.append(body);
    const close = () => {
      if (dialog.open && dialog.close) dialog.close();
      dialog.remove();
      if (this._dialog !== dialog) return;
      this._dialog = null;
      // What came in while it was open.
      this._built = null;
      if (this._hass) this.hass = this._hass;
    };
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (ev) => { ev.preventDefault(); close(); });
    dialog.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.preventDefault(); close(); } });
    // A click on the dialog itself, not on the form that fills its box, is on the backdrop.
    dialog.addEventListener("click", (ev) => { if (ev.target === dialog) close(); });
    body.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const problem = apply();
      if (problem) {
        error.textContent = t(this._hass, problem);
        return;
      }
      close();
    });
    this.shadowRoot.append(dialog);
    this._dialog = dialog;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    return dialog;
  }

  // A number input with its label; `attrs` are min, max, step.
  _number(key, value, attrs = {}) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = t(this._hass, key);
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) input.setAttribute(k, String(v));
    input.value = Number.isFinite(value) ? String(value) : "";
    label.append(span, input);
    return [label, input];
  }

  _fieldset(legendKey, items) {
    const set = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = t(this._hass, legendKey);
    set.append(legend, ...items);
    return set;
  }

  // Temperature: the comfort ranges of the temperature and of the humidity, kept in the widget.
  _temperatureSettings(body, w) {
    const inputs = {};
    const pair = (legend, lowKey, highKey, step) => {
      const [lowLabel, low] = this._number("card.climate_rooms.low", w[lowKey] ?? COMFORT[lowKey], { step });
      const [highLabel, high] = this._number("card.climate_rooms.high", w[highKey] ?? COMFORT[highKey], { step });
      low.name = lowKey;
      high.name = highKey;
      inputs[lowKey] = low;
      inputs[highKey] = high;
      return this._fieldset(legend, [lowLabel, highLabel]);
    };
    body.append(pair("card.climate_rooms.temp_range", "temp_low", "temp_high", 0.5),
                pair("card.climate_rooms.hum_range", "hum_low", "hum_high", 1));
    return () => {
      const v = Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, parseFloat(input.value)]));
      if (!Object.values(v).every(Number.isFinite) || v.temp_low >= v.temp_high || v.hum_low >= v.hum_high) {
        return "card.climate_rooms.invalid";
      }
      Object.assign(w, v);
      this._save();
      return null;
    };
  }

  // Air quality: the Air page's own limits, the same helpers (input_number.set_value), so a change
  // shows on the Air page too; only those the home has, the others said to be not set up.
  _airSettings(body) {
    const pairs = [];
    const how = document.createElement("p");
    how.textContent = t(this._hass, "card.climate_rooms.air_how");
    body.append(how);
    for (const [reading, legendKey] of Object.entries(AIR_KEYS)) {
      const entities = this._config.air_limits?.[reading];
      const states = Array.isArray(entities) && entities.length === 2 ? entities.map((e) => this._hass.states[e]) : [];
      if (!states.length || !states.every(Boolean)) {
        const note = document.createElement("p");
        note.className = "not-set-up";
        note.textContent = t(this._hass, "card.climate_rooms.air_not_set_up", { reading: t(this._hass, legendKey) });
        body.append(note);
        continue;
      }
      const pair = [];
      const items = ["card.climate_rooms.fair_from", "card.climate_rooms.poor_from"].map((key, i) => {
        const a = states[i].attributes || {};
        const old = parseFloat(states[i].state);
        const [label, input] = this._number(key, old, { min: a.min, max: a.max, step: a.step });
        input.name = entities[i];
        pair.push({ entity: entities[i], input, old });
        return label;
      });
      pairs.push(pair);
      body.append(this._fieldset(legendKey, items));
    }
    return () => {
      const values = pairs.map((pair) => pair.map((f) => ({ ...f, value: parseFloat(f.input.value) })));
      if (values.some(([raised, high]) => !Number.isFinite(raised.value) || !Number.isFinite(high.value) || raised.value >= high.value)) {
        return "card.climate_rooms.invalid";
      }
      for (const { entity, value, old } of values.flat()) {
        if (value !== old) this._hass.callService("input_number", "set_value", { entity_id: entity, value });
      }
      return null;
    };
  }

  // Custom: the value's colour with threshold-based colours on: a dropdown of the named colours, the
  // first entry Neutral (no colour stored: the Climate page's neutral colour, its dot that colour);
  // each choice and the value with its colour's dot (lib/colour-list.js).
  _customSettings(body, w) {
    const how = document.createElement("p");
    how.id = "widget-colour-how";
    how.textContent = t(this._hass, "card.climate_rooms.colour_how");
    const group = document.createElement("div");
    group.className = "colours";
    const neutral = this._config.neutral_color ? selectedColour(this._hass.states, this._config.neutral_color, NEUTRAL) : null;
    const choice = colourList({
      options: [{ value: "", text: t(this._hass, "card.climate_rooms.neutral"), colour: neutral },
                ...COLOUR_IDS.map((id) => ({ value: id, text: t(this._hass, colourKey(id)), colour: colourCss(id) }))],
      value: COLOUR_IDS.includes(w.color) ? w.color : "",
      label: how.textContent,
    });
    choice.element.classList.add("widget-colour");
    group.append(choice.element);
    body.append(how, group);
    return () => {
      choice.close();
      if (choice.value) w.color = choice.value;
      else delete w.color;
      this._save();
      return null;
    };
  }

  // The main sensor's area (its own, else its device's), else the sensor's name.
  _defaultLabel(id) {
    const entity = this._hass.entities?.[id];
    const area = entity?.area_id || this._hass.devices?.[entity?.device_id]?.area_id;
    return this._hass.areas?.[area]?.name || String(this._hass.states[id]?.attributes?.friendly_name || id);
  }

  // Every row in order, then the widgets beyond the number as they were; no empty one at the end.
  _save() {
    const rooms = [...this._rooms, ...this._beyond].map((w) => storedWidget(w, (id) => this._defaultLabel(id)));
    while (rooms.length && rooms.at(-1).type === "empty") rooms.pop();
    const [domain, service] = this._config.script.split(".");
    this._hass.callService(domain, service, { rooms });
  }
}

customElements.define("climate-rooms-card", ClimateRoomsCard);
