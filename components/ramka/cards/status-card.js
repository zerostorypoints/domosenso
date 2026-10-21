// Read-only status of the flat for a wall tablet: a grid of entities with their state in
// large type, readable from the table. Each item names an entity, optional labels per state,
// and the state's colour: `on` states (lights on, covers open, locks unlocked) in the theme
// colour, the rest muted. Numeric states get their unit. State words follow the Home Assistant
// language (en, de, pl; anything else falls back to en) and come from card.status.<state>; a
// state without an entry shows as Home Assistant reports it.
//
//   type: custom:status-card
//   height: calc(100dvh - 16px)
//   columns: 4
//   items:
//     - name: Side awning
//       entity: cover.awning_side
//       icon: mdi:storefront-outline           # optional, else the entity's own icon
//       states: {open: Out, closed: In}         # optional, wins over the translated defaults
//       active: [open, opening, closing]        # states shown in colour
//     - name: Hi-fi
//       entity: sensor.hifi_mains_power
//       decimals: 0
//     - name: Living room
//       entity: light.living_room
//       kind: light                              # off: a crossed-out bulb, no text; on: a lit
//                                                # bulb, the brightness in % and a bar

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const DEFAULT_ACTIVE = ["on", "open", "opening", "closing", "unlocked", "unlocking", "playing"];

// The translated word for a state, or the state itself when the dictionary has none.
function stateLabel(hass, state) {
  const key = `card.status.${state}`;
  const text = t(hass, key);
  return text === key ? state : text;
}

class StatusCard extends HTMLElement {
  setConfig(config) {
    if (!config.items || !config.items.length) throw new Error("status-card: items is required");
    this._config = { columns: 4, ...config };
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: this._config.height ? "auto" : 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
  }

  _build() {
    this._built = true;
    const rows = Math.ceil(this._config.items.length / this._config.columns);
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card { height: 100%; box-sizing: border-box; padding: 2cqh 1.5cqw; container-type: size;
                  display: grid; grid-template-columns: repeat(${this._config.columns}, 1fr);
                  grid-template-rows: repeat(${rows}, 1fr); gap: 1.5cqh 1.5cqw; overflow: hidden; }
        .item { display: flex; flex-direction: column; justify-content: center; align-items: center;
                border-radius: 2cqh; background: var(--secondary-background-color); min-width: 0; gap: 0.6cqh; }
        .item ha-icon { --mdc-icon-size: ${Math.min(11, 30 / rows)}cqh; color: var(--secondary-text-color); }
        .item.active ha-icon { color: var(--primary-color); }
        .name { font-size: ${Math.min(4.5, 14 / rows)}cqh; color: var(--secondary-text-color); white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis; max-width: 95%; }
        .state { font-size: ${Math.min(7, 22 / rows)}cqh; font-weight: 600; line-height: 1.1; white-space: nowrap;
                 overflow: hidden; text-overflow: ellipsis; max-width: 95%; color: var(--secondary-text-color); }
        .item.active .state { color: var(--primary-color); }
        .item.numeric .state { color: var(--primary-text-color); }
        .bar { width: 60%; height: 1.2cqh; min-height: 4px; border-radius: 1cqh; margin-top: 0.4cqh;
               background: var(--divider-color, rgba(128,128,128,0.35)); overflow: hidden; display: none; }
        .bar > div { height: 100%; width: 0; background: var(--primary-color); border-radius: 1cqh; }
        .item.lit .bar { display: block; }
      </style>
      <ha-card>
        ${this._config.items.map(() => `<div class="item"><ha-icon></ha-icon><div class="state"></div><div class="bar"><div></div></div><div class="name"></div></div>`).join("")}
      </ha-card>`;
    if (this._config.height) this.style.height = this._config.height;
    this._items = Array.from(root.querySelectorAll(".item"));
  }

  _update() {
    this._config.items.forEach((item, i) => {
      const el = this._items[i];
      const s = this._hass.states[item.entity];
      const state = s ? s.state : "unavailable";
      el.querySelector(".name").textContent = item.name;
      const icon = el.querySelector("ha-icon");
      if (item.kind === "light") {
        // A light: crossed-out bulb when off, a lit bulb with the brightness when on.
        const on = state === "on";
        const pct = on ? Math.round(((s && s.attributes.brightness) || 255) / 255 * 100) : 0;
        icon.setAttribute("icon", on ? "mdi:lightbulb-on" : "mdi:lightbulb-off-outline");
        // Off: the crossed-out bulb says it all, no text (a label in `states` would still show).
        el.querySelector(".state").textContent = on ? `${pct} %` : (item.states && item.states["off"]) || (state === "off" ? "" : stateLabel(this._hass, state));
        el.querySelector(".bar > div").style.width = `${pct}%`;
        el.classList.toggle("active", on);
        el.classList.toggle("lit", on);
        el.classList.remove("numeric");
        return;
      }
      icon.setAttribute("icon", item.icon || (s && s.attributes.icon) || "mdi:circle-outline");
      const n = parseFloat(state);
      const numeric = Number.isFinite(n) && !/^(on|off|open|closed)$/.test(state) && item.decimals !== undefined;
      let text;
      if (numeric) {
        text = `${n.toFixed(item.decimals)} ${(s && s.attributes.unit_of_measurement) || ""}`.trim();
      } else {
        const map = item.states || {};
        const key = state === "on" && map[true] !== undefined ? true : state === "off" && map[false] !== undefined ? false : state;
        text = map[key] || stateLabel(this._hass, state);
      }
      el.querySelector(".state").textContent = text;
      const active = (item.active || DEFAULT_ACTIVE).includes(state);
      el.classList.toggle("active", active && !numeric);
      el.classList.toggle("numeric", numeric);
    });
  }
}

customElements.define("status-card", StatusCard);
