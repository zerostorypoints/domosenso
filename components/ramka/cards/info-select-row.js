// An entities-card row: Home Assistant's own row for a select, with an (i) at its end that tells
// what the option selected now does.
//
//   type: custom:ramka-info-select-row
//   entity: input_select.ramka_music_template
//   name: Response profile
//   descriptions:                       # option -> plain text; a line break starts a new line
//     custom: "Your own profile.\nBest use: anything."
//
// The description is a floating tooltip: an overlay next to the (i), below it or above it when there
// is no room below, kept inside the viewport (position: fixed, in the top layer as a popover where
// the browser has one), so a card's overflow does not clip it and no layout moves. Hover (a mouse)
// shows it, leaving hides it; a tap or click pins it open or closes it (tablet and phone have no
// hover); a tap elsewhere, Escape or a scroll closes it. The text is set with textContent: a
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

// The gap between the button and the tooltip, and the tooltip's least distance to the viewport edge.
const GAP = 6;
const MARGIN = 8;

// Where the tooltip goes: below the anchor (the button's rect), or above it when it does not fit
// below and fits better above; centred on the anchor, clamped to the viewport. Returns the
// fixed-position left and top and the side it opens on.
export function placeTip(anchor, size, viewport) {
  const below = anchor.bottom + GAP;
  const roomBelow = viewport.height - MARGIN - below;
  const roomAbove = anchor.top - GAP - MARGIN;
  const side = size.height > roomBelow && roomAbove > roomBelow ? "above" : "below";
  let top = side === "below" ? below : anchor.top - GAP - size.height;
  top = Math.max(MARGIN, Math.min(top, viewport.height - MARGIN - size.height));
  const centre = (anchor.left + anchor.right) / 2;
  let left = Math.min(centre - size.width / 2, viewport.width - MARGIN - size.width);
  left = Math.max(MARGIN, left);
  return { left: Math.round(left), top: Math.round(top), side };
}

// Home Assistant's card helpers, or null when the frontend has none or they fail to load.
async function cardHelpers() {
  if (typeof window.loadCardHelpers !== "function") return null;
  try { return await window.loadCardHelpers(); } catch { return null; }
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
      if (ev.key === "Escape") this._close();
    };
    // A scroll (of the page or any scroller around the row) would leave the tooltip behind.
    this._onScroll = () => {
      if (this._pinned || this._hovered) this._close();
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
    window.addEventListener("scroll", this._onScroll, true);
    window.addEventListener("resize", this._onScroll);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this._onOutside, true);
    document.removeEventListener("keydown", this._onKey);
    window.removeEventListener("scroll", this._onScroll, true);
    window.removeEventListener("resize", this._onScroll);
    this._close();
  }

  async _loadRow() {
    const config = this._config;
    const helpers = await cardHelpers();
    if (config !== this._config) return;  // a newer setConfig won
    if (!helpers) {
      // No helpers (a frontend that renamed or defers them): the row's name, not a blank line.
      console.warn("ramka-info-select-row: Home Assistant's card helpers are not available");
      this._slot.textContent = config.name || config.entity;
      return;
    }
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
          position: fixed; z-index: 10000; inset: auto; left: 0; top: 0; margin: 0;
          box-sizing: border-box; width: max-content; max-width: min(360px, calc(100vw - 16px));
          padding: 8px 12px; border-radius: 8px; overflow: visible;
          white-space: pre-line; font-size: 13px; line-height: 1.45; text-align: start;
          background: var(--card-background-color, var(--secondary-background-color));
          color: var(--primary-text-color); border: 1px solid var(--divider-color);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25); pointer-events: none;
        }
      </style>
      <div class="line">
        <div class="row"></div>
        <button type="button" aria-expanded="false" hidden><ha-icon icon="mdi:information-outline"></ha-icon></button>
        <div class="tip" role="tooltip" popover="manual" hidden></div>
      </div>`;
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

  _close() {
    this._hovered = false;
    this._setPinned(false);
  }

  // Shows the tooltip (in the top layer where popovers exist) and puts it next to the button.
  _show() {
    const tip = this._tip;
    tip.hidden = false;
    if (typeof tip.showPopover === "function" && !tip.matches(":popover-open")) {
      try { tip.showPopover(); } catch { /* not connected: plain fixed position */ }
    }
    const size = tip.getBoundingClientRect();
    const place = placeTip(this._button.getBoundingClientRect(), { width: size.width, height: size.height },
                           { width: window.innerWidth, height: window.innerHeight });
    tip.style.left = `${place.left}px`;
    tip.style.top = `${place.top}px`;
    tip.dataset.side = place.side;
  }

  _hide() {
    const tip = this._tip;
    if (typeof tip.hidePopover === "function" && tip.matches(":popover-open")) {
      try { tip.hidePopover(); } catch { /* already closed */ }
    }
    tip.hidden = true;
  }

  _update() {
    if (!this._button) return;
    const text = descriptionFor(this._config, this._hass);
    if (!text) this._pinned = false;
    const open = Boolean(text) && (this._pinned || this._hovered);
    this._button.hidden = !text;
    this._button.setAttribute("aria-expanded", String(open));
    if (this._hass) this._button.setAttribute("aria-label", t(this._hass, "card.info_select_row.about"));
    if (this._tip.textContent !== text) this._tip.textContent = text;
    if (open) this._show();
    else this._hide();
  }
}

customElements.define("ramka-info-select-row", RamkaInfoSelectRow);
