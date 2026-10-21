// A button that acts on one tap or only on a double tap, for a wall tablet's controls panel.
//
//   type: custom:tap-button-card
//   name: Extend
//   icon: mdi:arrow-expand-horizontal
//   action: cover.open_cover               # the service to call
//   target: {entity_id: cover.awning_left}
//   data: {}                               # optional service data
//   taps: 2                                # 2 (default): a double tap acts, a single tap shows
//                                          #   the hint; 1: acts on a single tap
//   hint: Tap twice                        # optional, the text a lone tap shows (1.5 s); by
//                                          #   default the card.tap_button.hint of the language
//   rows: 1                                # 1: icon and name side by side; 2: icon above the name
//   columns: 4                             # grid columns, as any card's grid_options
//
// A double-tap button carries a "2×" badge so it reads as one before anybody touches it. A lone
// tap shakes the button and swaps the name for the hint; the call goes out only when a second
// tap lands within 400 ms of the first. The action fires on the second tap itself, with no wait.
// The dashboard's corner-taps-card sees every tap too (it keeps the controls up), which is
// harmless here.

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const DOUBLE_MS = 400;
const HINT_MS = 1500;

class TapButtonCard extends HTMLElement {
  setConfig(config) {
    if (!config.action) throw new Error("tap-button-card: action is required");
    this._config = { taps: 2, rows: 1, columns: 4, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  getCardSize() {
    return this._config.rows;
  }

  getGridOptions() {
    return { columns: this._config.columns, rows: this._config.rows, min_rows: 1 };
  }

  _render() {
    const c = this._config;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const tall = c.rows >= 2;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          height: 100%; box-sizing: border-box; cursor: pointer; user-select: none;
          -webkit-tap-highlight-color: transparent; touch-action: manipulation;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          flex-direction: ${tall ? "column" : "row"}; padding: 0 12px; position: relative;
          transition: background-color 150ms;
        }
        ha-card.pressed { background-color: var(--secondary-background-color); }
        ha-icon { --mdc-icon-size: ${tall ? 64 : 28}px; color: var(--state-icon-color, var(--primary-color)); }
        .name { font-size: ${tall ? 16 : 15}px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; }
        .name.hint { color: var(--warning-color, #ffa600); }
        .badge {
          position: absolute; top: 6px; right: 8px; font-size: 12px; font-weight: 600;
          color: var(--secondary-text-color); opacity: 0.8;
        }
        @keyframes shake { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(-4px) }
          50% { transform: translateX(4px) } 75% { transform: translateX(-2px) } }
        ha-card.shake { animation: shake 300ms; }
      </style>
      <ha-card>
        <ha-icon icon="${c.icon || "mdi:gesture-double-tap"}"></ha-icon>
        <span class="name">${c.name || ""}</span>
        ${c.taps === 2 ? '<span class="badge">2×</span>' : ""}
      </ha-card>`;
    this._card = this.shadowRoot.querySelector("ha-card");
    this._name = this.shadowRoot.querySelector(".name");
    this._card.addEventListener("click", (ev) => this._onTap(ev));
  }

  _fire() {
    const [domain, service] = this._config.action.split(".");
    this._hass.callService(domain, service, this._config.data || {}, this._config.target);
    this._card.classList.add("pressed");
    setTimeout(() => this._card.classList.remove("pressed"), 300);
    this._showName();
  }

  _showName() {
    clearTimeout(this._hintTimer);
    this._name.textContent = this._config.name || "";
    this._name.classList.remove("hint");
  }

  _showHint() {
    this._name.textContent = this._config.hint ?? t(this._hass, "card.tap_button.hint");
    this._name.classList.add("hint");
    this._card.classList.remove("shake");
    void this._card.offsetWidth;  // restart the animation on every lone tap
    this._card.classList.add("shake");
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._showName(), HINT_MS);
  }

  _onTap() {
    if (!this._hass) return;
    if (this._config.taps === 1) return this._fire();
    const now = Date.now();
    if (now - (this._firstTap || 0) < DOUBLE_MS) {
      this._firstTap = 0;
      clearTimeout(this._loneTimer);
      return this._fire();
    }
    this._firstTap = now;
    // Only a tap that no second one follows is a lone tap; the hint waits for that.
    this._loneTimer = setTimeout(() => { if (this._firstTap === now) this._showHint(); }, DOUBLE_MS);
  }
}

customElements.define("tap-button-card", TapButtonCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "tap-button-card", name: "Tap button", description: "One- or double-tap service button" });
