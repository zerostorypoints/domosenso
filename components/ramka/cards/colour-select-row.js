// An entities-card row for a colour setting: an input_select whose options are named colours of
// lib/colours.js (the Air page's good, fair and poor colours, the Climate page's neutral colour).
// It is a select as Home Assistant's own row, but the value and every choice in its list show the
// colour itself, the climate picker's dot in front of the name (lib/colour-list.js: the list opens
// as an overlay, by pointer, touch or keyboard).
//
//   type: custom:ramka-colour-select-row
//   entity: input_select.ramka_air_color_good
//   name: Good colour                    # optional: the entity's name without it
//   lang: de                             # optional: the page's language for the colours' names;
//                                        # the user's language without it
//
// The options are the entity's own (its `options` attribute), in its order; a colour of the list is
// named in the page's language (card.colours.<id>), an option that is none shows as itself with an
// outlined dot. A pick calls input_select.select_option; the row then follows the entity's state.

import { createT } from "./lib/i18n.js";

// The shared modules and the translations carry this module's own ?v= (the deploy's hash of
// its version directory): /local/ is served with a 31-day cache, so an import without it can stay the old file.
const version = new URL(import.meta.url).search;
const load = (path, json) => import(new URL(path, import.meta.url).href + version, json ? { with: { type: "json" } } : undefined);
const [colours, list, en, de, pl] = await Promise.all([
  load("./lib/colours.js"), load("./lib/colour-list.js"), load("../translations/en.json", true),
  load("../translations/de.json", true), load("../translations/pl.json", true)]);
const { colourCss, colourKey } = colours;
const { colourList, COLOUR_LIST_CSS } = list;

const t = createT({ en: en.default, de: de.default, pl: pl.default });

// The entity's options as the dropdown's choices: [{value, text, colour}].
export function colourOptions(stateObj, hass, lang) {
  const options = Array.isArray(stateObj?.attributes?.options) ? stateObj.attributes.options : [];
  const where = lang ? { ...hass, locale: { ...(hass?.locale || {}), language: lang } } : hass;
  return options.map((option) => {
    const value = String(option);
    const colour = colourCss(value);
    return { value, text: colour ? t(where, colourKey(value)) : value, colour };
  });
}

class RamkaColourSelectRow extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error("ramka-colour-select-row: entity is required");
    this._config = { ...config };
    this._key = null;
    this._render();
    if (this._hass) this.hass = this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._list) return;
    const stateObj = hass?.states?.[this._config.entity];
    this._badge.hass = hass;
    this._badge.stateObj = stateObj;
    this._name.textContent = this._config.name || String(stateObj?.attributes?.friendly_name || this._config.entity);
    const options = colourOptions(stateObj, hass, this._config.lang);
    const key = JSON.stringify([options, this._name.textContent]);
    if (key !== this._key) {
      this._key = key;
      this._list.setOptions(options);
    }
    this._list.setValue(stateObj ? stateObj.state : "");
    this._list.setDisabled(!stateObj || ["unavailable", "unknown"].includes(stateObj.state));
  }

  disconnectedCallback() {
    if (this._list) this._list.close();
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .line { display: flex; align-items: center; gap: 16px; min-height: 40px; }
        state-badge { flex: none; }
        .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .control { flex: 0 1 auto; min-width: 8em; max-width: 60%; }
        .control .colour-select { display: block; }
        ${COLOUR_LIST_CSS}
      </style>
      <div class="line">
        <state-badge></state-badge>
        <div class="name"></div>
        <div class="control"></div>
      </div>`;
    this._badge = this.shadowRoot.querySelector("state-badge");
    this._name = this.shadowRoot.querySelector(".name");
    this._list = colourList({
      label: this._config.name || "",
      onSelect: (option) => this._hass?.callService("input_select", "select_option",
                                                    { entity_id: this._config.entity, option }),
    });
    this.shadowRoot.querySelector(".control").append(this._list.element);
  }
}

customElements.define("ramka-colour-select-row", RamkaColourSelectRow);
