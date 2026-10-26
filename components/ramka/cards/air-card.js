// Air quality for a wall tablet, readable from across the room: one large tile for the
// overall score and a tile per reading, each coloured by where its value sits (good / raised /
// high) with the word for it underneath. Sizes are shares of the card's own height (cqh), capped by
// its width (--u) so that in a window squarer than the tablet the type still fits the tiles; and
// with `height` the card takes its height from the screen rather than from grid rows.
//
//   type: custom:air-card
//   height: calc(100dvh - 280px)
//   title: Air · Dining room
//   score:                                       # optional: the big tile on the left
//     name: Air quality
//     entity: sensor.air_quality_score
//     unit: /100
//     higher_is_better: true
//     levels: [[80, good], [60, fair], [0, poor]]   # [from, label]: first that holds
//   tiles:
//     - name: CO₂
//       entity: sensor.air_carbon_dioxide
//       unit: ppm
//       levels: [[800, fine], [1200, ventilate soon], [null, ventilate]]   # [below, label]
//
// Levels run good → raised → high and take the colours --air-good, --air-raised, --air-high
// (theme variables, with defaults below). A level written as just its limit, `[800]`, takes the
// word for its position from card.air.level.good / .raised / .high in the Home Assistant
// language (en, de, pl; anything else falls back to en); a label written out is shown as it is.
// A tile whose entity is missing or unavailable is left out, so a room's sensor can be listed
// before it is installed.

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const LEVEL_KEYS = ["good", "raised", "high"];

class AirCard extends HTMLElement {
  setConfig(config) {
    if (!config.tiles || !config.tiles.length) throw new Error("air-card: tiles is required");
    this._config = config;
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: this._config.height ? "auto" : 6 };
  }

  set hass(hass) {
    this._hass = hass;
    const shown = this._shown().map((tile) => tile.entity).join(",");
    if (shown !== this._built) this._build(shown);
    this._update();
  }

  _ok(id) {
    const s = id && this._hass.states[id];
    return !!s && !["unknown", "unavailable", ""].includes(s.state) && Number.isFinite(parseFloat(s.state));
  }

  _shown() {
    return this._config.tiles.filter((tile) => this._ok(tile.entity));
  }

  _build(shown) {
    this._built = shown;
    const tiles = this._shown();
    const score = this._config.score && this._ok(this._config.score.entity) ? this._config.score : null;
    const cols = Math.max(1, Math.ceil(tiles.length / 2));
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%;
                --good: var(--air-good, #5be37a); --raised: var(--air-raised, #f5c542); --high: var(--air-high, #ff6b5c); }
        ha-card { height: 100%; --u: min(1cqh, 0.41cqw); box-sizing: border-box; padding: 2cqh 1.5cqw; container-type: size;
                  display: grid; gap: 2cqh 1.5cqw; overflow: hidden;
                  grid-template-columns: ${score ? "1.3fr " : ""}repeat(${cols}, 1fr);
                  grid-template-rows: ${this._config.title ? "auto " : ""}1fr 1fr; }
        .title { grid-column: 1 / -1; font-size: calc(6 * var(--u)); color: var(--secondary-text-color); }
        .tile { display: flex; flex-direction: column; justify-content: center; align-items: center; min-width: 0;
                border-radius: calc(2 * var(--u)); background: var(--secondary-background-color); }
        .score { grid-row: span 2; }
        .name { font-size: calc(6 * var(--u)); color: var(--secondary-text-color); white-space: nowrap; }
        .value { font-size: calc(15 * var(--u)); font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .score .value { font-size: calc(30 * var(--u)); }
        .unit { font-size: 0.4em; font-weight: 400; margin-left: 0.15em; }
        .label { font-size: calc(5.5 * var(--u)); white-space: nowrap; }
        .score .label { font-size: calc(8 * var(--u)); }
      </style>
      <ha-card>
        ${this._config.title ? `<div class="title"></div>` : ""}
        ${score ? `<div class="tile score" data-i="score"><div class="name"></div><div class="value"></div><div class="label"></div></div>` : ""}
        ${tiles.map((_, i) => `<div class="tile" data-i="${i}"><div class="name"></div><div class="value"></div><div class="label"></div></div>`).join("")}
      </ha-card>`;
    if (this._config.height) this.style.height = this._config.height;
    if (this._config.title) root.querySelector(".title").textContent = this._config.title;
    this._tiles = tiles;
    this._score = score;
  }

  // [limit, label] pairs; the colour is the pair's position: good, raised, high.
  _level(tile, v) {
    const levels = tile.levels || [];
    const colors = ["var(--good)", "var(--raised)", "var(--high)"];
    for (let i = 0; i < levels.length; i++) {
      const [limit, label] = levels[i];
      const holds = tile.higher_is_better ? v >= (limit ?? -Infinity) : limit == null || v < limit;
      const position = Math.min(i, 2);
      if (holds) return { label: label ?? t(this._hass, `card.air.level.${LEVEL_KEYS[position]}`), color: colors[position] };
    }
    return { label: "", color: "" };
  }

  _fill(el, tile) {
    const v = parseFloat(this._hass.states[tile.entity].state);
    const lv = this._level(tile, v);
    el.querySelector(".name").textContent = tile.name;
    const value = el.querySelector(".value");
    value.innerHTML = `${v.toFixed(tile.digits ?? 0)}<span class="unit"></span>`;
    value.querySelector(".unit").textContent = tile.unit || "";
    value.style.color = lv.color;
    const label = el.querySelector(".label");
    label.textContent = lv.label;
    label.style.color = lv.color;
  }

  _update() {
    const root = this.shadowRoot;
    if (this._score) this._fill(root.querySelector('[data-i="score"]'), this._score);
    this._tiles.forEach((tile, i) => this._fill(root.querySelector(`[data-i="${i}"]`), tile));
  }
}

customElements.define("air-card", AirCard);
