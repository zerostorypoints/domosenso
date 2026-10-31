// An entities-card row: Home Assistant's own row for a select, with an (i) at its end that tells
// what the option selected now does.
//
//   type: custom:ramka-info-select-row
//   entity: input_select.ramka_music_template
//   name: Response profile
//   descriptions:                       # option -> plain text; a line break starts a new line
//     custom: "Your own profile.\nBest use: anything."
//
// Hover (a mouse) shows the description; a tap or click pins it open or closes it (tablet and
// phone have no hover); a tap elsewhere or Escape closes it. The text is set with textContent: a
// description is text, never markup. Without a description for the current option the (i) is
// hidden. The row itself is Home Assistant's (loadCardHelpers().createRowElement), so the select
// behaves as on any entities card. The descriptions come from the dashboard's render, in the page's
// language; only the button's label is this card's own text.

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

// The description of the entity's current option, or "" when there is none.
export function descriptionFor(config, hass) {
  const state = hass?.states?.[config?.entity]?.state;
  const text = state === undefined ? undefined : (config.descriptions || {})[state];
  return typeof text === "string" ? text : "";
}

class RamkaInfoSelectRow extends HTMLElement {
  constructor() {
    super();
    this._pinned = false;
    this._hovered = false;
    this._onOutside = (ev) => {
      if (this._pinned && !ev.composedPath().includes(this)) this._setPinned(false);
    };
    this._onKey = (ev) => {
      if (ev.key === "Escape") {
        this._hovered = false;
        this._setPinned(false);
      }
    };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("ramka-info-select-row: entity is required");
    this._config = { descriptions: {}, ...config };
    this._row = null;
    this._render();
    this._loadRow();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._row) this._row.hass = hass;
    this._update();
  }

  connectedCallback() {
    document.addEventListener("pointerdown", this._onOutside, true);
    document.addEventListener("keydown", this._onKey);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this._onOutside, true);
    document.removeEventListener("keydown", this._onKey);
  }

  async _loadRow() {
    const config = this._config;
    const helpers = await window.loadCardHelpers();
    if (config !== this._config) return;  // a newer setConfig won
    const row = helpers.createRowElement({ entity: config.entity, ...(config.name ? { name: config.name } : {}) });
    if (this._hass) row.hass = this._hass;
    this._row = row;
    this._slot.replaceChildren(row);
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .line { display: flex; align-items: center; gap: 4px; }
        .row { flex: 1; min-width: 0; }
        button {
          flex: none; width: 40px; height: 40px; padding: 0; border: none; border-radius: 50%;
          background: none; cursor: pointer; color: var(--secondary-text-color);
          -webkit-tap-highlight-color: transparent;
        }
        button:hover, button[aria-expanded="true"] { color: var(--primary-color); }
        button[hidden], .tip[hidden] { display: none; }
        ha-icon { --mdc-icon-size: 20px; }
        .tip {
          margin: 4px 0 8px auto; max-width: 420px; padding: 8px 12px; border-radius: 8px;
          white-space: pre-line; font-size: 13px; line-height: 1.45;
          background: var(--secondary-background-color); color: var(--primary-text-color);
          border: 1px solid var(--divider-color);
        }
      </style>
      <div class="line">
        <div class="row"></div>
        <button type="button" aria-expanded="false" hidden><ha-icon icon="mdi:information-outline"></ha-icon></button>
      </div>
      <div class="tip" role="tooltip" hidden></div>`;
    this._slot = this.shadowRoot.querySelector(".row");
    this._button = this.shadowRoot.querySelector("button");
    this._tip = this.shadowRoot.querySelector(".tip");
    this._button.addEventListener("click", () => this._setPinned(!this._pinned));
    this._button.addEventListener("pointerenter", (ev) => {
      if (ev.pointerType === "mouse") { this._hovered = true; this._update(); }
    });
    this._button.addEventListener("pointerleave", () => { this._hovered = false; this._update(); });
    this._update();
  }

  _setPinned(on) {
    this._pinned = on;
    this._update();
  }

  _update() {
    if (!this._button) return;
    const text = descriptionFor(this._config, this._hass);
    if (!text) this._pinned = false;
    const open = Boolean(text) && (this._pinned || this._hovered);
    this._button.hidden = !text;
    this._button.setAttribute("aria-expanded", String(open));
    if (this._hass) this._button.setAttribute("aria-label", t(this._hass, "card.info_select_row.about"));
    this._tip.textContent = text;
    this._tip.hidden = !open;
  }
}

customElements.define("ramka-info-select-row", RamkaInfoSelectRow);
