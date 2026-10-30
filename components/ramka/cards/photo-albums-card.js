// The photo albums the Ramka's photo series come from, as checkboxes: "All albums", then one per
// album (a top-level folder of the photo folder), for the settings dashboard's Photos page.
//
//   type: custom:photo-albums-card
//   entity: sensor.ramka_photo_albums          # attributes `available` and `chosen` (lists)
//   script: script.ramka_photo_albums_set      # called with {chosen: [...]}
//
// None chosen is all: "All albums" is ticked then, and ticking it clears the choice. Ticking an
// album adds it, unticking removes it; with the last one gone it is all again. A chosen album that
// is no longer in the folder stays listed, marked, until it is unticked (its folder may come back).
// The filter narrows a long list by name; it changes nothing.

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);

class PhotoAlbumsCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("photo-albums-card: entity is required");
    if (!config.script) throw new Error("photo-albums-card: script is required");
    this._config = config;
    this._filter = "";
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    const attrs = hass.states[this._config.entity]?.attributes || {};
    const available = list(attrs.available);
    const chosen = list(attrs.chosen);
    const key = JSON.stringify([available, chosen, hass.locale?.language]);
    if (key === this._built) return;
    this._built = key;
    this._available = available;
    this._chosen = chosen;
    this._render();
  }

  _render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        ha-card { padding: 12px 16px; }
        input[type="search"] { width: 100%; box-sizing: border-box; padding: 6px 8px; margin-bottom: 8px;
                               font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
                               border: 1px solid var(--divider-color); border-radius: 6px; }
        ul { list-style: none; margin: 0; padding: 0; max-height: 360px; overflow-y: auto; }
        li label { display: flex; align-items: center; gap: 10px; padding: 4px 0; cursor: pointer; }
        li.all { border-bottom: 1px solid var(--divider-color); margin-bottom: 4px; font-weight: 500; }
        li[hidden] { display: none; }
        .missing { color: var(--secondary-text-color); font-style: italic; }
        .empty { color: var(--secondary-text-color); }
      </style>
      <ha-card>
        <input type="search">
        <ul></ul>
      </ha-card>`;
    const search = root.querySelector("input[type=search]");
    search.placeholder = t(this._hass, "card.photo_albums.filter");
    search.value = this._filter;
    search.addEventListener("input", () => {
      this._filter = search.value;
      this._applyFilter();
    });
    const ul = root.querySelector("ul");
    ul.append(this._row(t(this._hass, "card.photo_albums.all"), this._chosen.length === 0, () => this._set([]), "all"));
    const missing = this._chosen.filter((a) => !this._available.includes(a));
    const names = [...this._available, ...missing.sort()];
    if (!names.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = t(this._hass, "card.photo_albums.none");
      ul.append(li);
    }
    for (const name of names) {
      const on = this._chosen.includes(name);
      const label = missing.includes(name) ? `${name} (${t(this._hass, "card.photo_albums.missing")})` : name;
      const li = this._row(label, on, () => this._set(on ? this._chosen.filter((a) => a !== name) : [...this._chosen, name]));
      li.dataset.name = name.toLowerCase();
      if (missing.includes(name)) li.querySelector("span").className = "missing";
      ul.append(li);
    }
    this._applyFilter();
  }

  _row(text, checked, onChange, className = "") {
    const li = document.createElement("li");
    if (className) li.className = className;
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.addEventListener("change", onChange);
    const span = document.createElement("span");
    span.textContent = text;
    label.append(box, span);
    li.append(label);
    return li;
  }

  _applyFilter() {
    const needle = this._filter.trim().toLowerCase();
    for (const li of this.shadowRoot.querySelectorAll("li[data-name]")) li.hidden = !!needle && !li.dataset.name.includes(needle);
  }

  _set(chosen) {
    const [domain, service] = this._config.script.split(".");
    this._hass.callService(domain, service, { chosen });
  }
}

customElements.define("photo-albums-card", PhotoAlbumsCard);
