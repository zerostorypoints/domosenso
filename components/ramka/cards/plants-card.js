// Plants for a wall tablet, readable from across the room: one tile per plant with three
// gauges, sun, fertiliser and water, each a bar with the plant's good band on it and a dot for
// where it is, a smoothed line of the soil moisture over the last days against the same band,
// and one line of text saying what to do. No numbers: the bar says where it sits, the text says
// the action. Plants that need something come first, watering before anything else. A plant that
// needs nothing gets no text at all: the green dots say it. Gauge labels and actions follow the
// Home Assistant language (en, de, pl; anything else falls back to en). Sizes are shares of
// the card's own height (cqh), capped by its width (--u) so that in a window squarer than the
// tablet the type still fits the tiles.
//
//   type: custom:plants-card
//   height: calc(100dvh - 16px)
//   days: 7                            # optional: the moisture line's span (hourly means from
//                                      # the statistics of the plant's moisture sensor)
//   defaults:                          # the bands, as in the plant package (the plant entity
//     min_moisture: 15                 # does not expose them); a plant may override any of them
//     max_moisture: 60
//     min_conductivity: 350
//     max_conductivity: 2000
//     min_brightness: 500
//   plants:
//     - entity: plant.plant_1          # the core plant integration
//       room: Living room
//     - {entity: plant.plant_4, room: Conservatory, min_brightness: 1000}
//
// Sun is the brightest reading of the plant integration's check_days (attribute max_brightness),
// the same figure its "brightness low" is judged on, on a log scale from 100 lx to four times the
// plant's minimum. Columns follow the count (2 up to 4 plants, 3 up to 9, 4 up to 12, then 5).

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const GAUGES = [
  { key: "brightness", label: "card.plants.gauge.sun", value: (a) => a.max_brightness ?? a.brightness },
  { key: "conductivity", label: "card.plants.gauge.fertiliser", value: (a) => a.conductivity },
  { key: "moisture", label: "card.plants.gauge.water", value: (a) => a.moisture },
];

class PlantsCard extends HTMLElement {
  setConfig(config) {
    if (!config.plants || !config.plants.length) throw new Error("plants-card: plants is required");
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
    if (!this._built) this._build();
    this._update();
    if (Date.now() - (this._statsAt || 0) > 30 * 60 * 1000) this._fetch();
  }

  // Hourly means of every plant's moisture sensor, the way statistics-graph gets them; again
  // every 30 minutes, which is finer than the line needs.
  async _fetch() {
    this._statsAt = Date.now();
    const ids = this._config.plants.map((p) => this._moistureId(p)).filter(Boolean);
    if (!ids.length) return;
    const days = this._config.days || 7;
    try {
      this._stats = await this._hass.callWS({
        type: "recorder/statistics_during_period", period: "hour", types: ["mean"], statistic_ids: ids,
        start_time: new Date(Date.now() - days * 86400000).toISOString() });
      this._update();
    } catch (e) {
      this._statsAt = Date.now() - 25 * 60 * 1000;  // try again in five minutes
    }
  }

  _moistureId(p) {
    const s = this._hass.states[p.entity];
    return p.moisture || (s && s.attributes.sensors && s.attributes.sensors.moisture);
  }

  // A smooth SVG path through the points (Catmull-Rom as cubic Béziers), after a 9-hour moving
  // mean: the sensor reports whole percents, and the raw steps read as noise at this size.
  _path(pts) {
    const sm = pts.map((p, i) => {
      const w = pts.slice(Math.max(0, i - 4), i + 5);
      return [p[0], w.reduce((a, q) => a + q[1], 0) / w.length];
    });
    let d = `M${sm[0][0].toFixed(1)},${sm[0][1].toFixed(1)}`;
    for (let i = 0; i < sm.length - 1; i++) {
      const p0 = sm[i - 1] || sm[i], p1 = sm[i], p2 = sm[i + 1], p3 = sm[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  // The scale follows the data (a week moves a few points, which a 0-75 % axis flattens to a
  // line) and always takes in the watering threshold, drawn dashed. The line has the colour of
  // the water gauge's dot, not of the action: "Fertilise" says nothing about the water.
  _chart(el, p, r) {
    const svg = el.querySelector("svg");
    const rows = (this._stats && this._stats[this._moistureId(p)]) || [];
    const pts = rows.filter((x) => x.mean != null).map((x) => [x.start, x.mean]);
    if (pts.length < 2) { svg.innerHTML = ""; return; }
    const W = 100, H = 30, b = r.b.moisture;
    const t0 = Date.now() - (this._config.days || 7) * 86400000, t1 = Date.now();
    const vals = pts.map((q) => q[1]);
    const lo = Math.max(0, Math.min(...vals, b.lo) - 3), hi = Math.max(...vals, b.lo) + 3;
    const x = (ts) => ((ts - t0) / (t1 - t0)) * W;
    const y = (v) => H - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * H;
    const xy = pts.map(([ts, v]) => [x(ts), y(v)]);
    const now = r.v.moisture;
    const color = now < b.lo ? "var(--water)" : now > b.hi ? "var(--wet)" : "var(--good)";
    svg.innerHTML = `<line x1="0" x2="${W}" y1="${y(b.lo).toFixed(1)}" y2="${y(b.lo).toFixed(1)}" stroke="var(--water)"
        stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.7"/>
      <path d="${this._path(xy)}" fill="none" stroke="${color}" stroke-width="2.2"
        vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  _build() {
    this._built = true;
    const n = this._config.plants.length;
    const cols = this._config.columns || (n <= 4 ? 2 : n <= 9 ? 3 : n <= 12 ? 4 : 5);
    const rows = Math.ceil(n / cols);
    const k = 2 / Math.max(rows, 2);  // type shrinks with the number of rows, as in rooms-card
    const gauge = (g) => `<div class="g" data-k="${g.key}"><span class="gl"></span>
        <span class="bar"><span class="band"></span><span class="dot"></span></span></div>`;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%;
                --good: var(--plant-good, #5be37a); --act: var(--plant-act, #f5c542);
                --water: var(--plant-water, #ff6b5c); --wet: var(--plant-wet, #8fd3ff); }
        ha-card { height: 100%; --u: min(1cqh, 0.66cqw); box-sizing: border-box; padding: 2cqh 1.5cqw; container-type: size;
                  display: grid; gap: 2cqh 1.5cqw; overflow: hidden;
                  grid-template-columns: repeat(${cols}, 1fr);
                  grid-template-rows: ${this._config.title ? "auto " : ""}repeat(${rows}, 1fr); }
        .title { grid-column: 1 / -1; font-size: calc(6 * var(--u)); color: var(--secondary-text-color); }
        .plant { display: flex; flex-direction: column; justify-content: space-evenly; min-width: 0;
                 padding: 0 5%; border-radius: calc(2 * var(--u)); background: var(--secondary-background-color); }
        .head { display: flex; align-items: baseline; gap: 0.6em; min-width: 0; }
        .name { font-size: calc(${6 * k} * var(--u)); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .room { font-size: calc(${4.5 * k} * var(--u)); color: var(--secondary-text-color); white-space: nowrap; }
        .g { display: grid; grid-template-columns: 5.5em 1fr; align-items: center; gap: 0.6em;
             font-size: calc(${4.2 * k} * var(--u)); color: var(--secondary-text-color); }
        .bar { position: relative; height: calc(${2.4 * k} * var(--u)); border-radius: 99px; background: rgba(255,255,255,0.08); }
        .band { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: rgba(91,227,122,0.25); }
        .dot { position: absolute; top: 50%; width: calc(${3.8 * k} * var(--u)); height: calc(${3.8 * k} * var(--u)); border-radius: 50%;
               transform: translate(-50%, -50%); background: currentColor; }
        .chart { display: block; width: 100%; height: calc(${11 * k} * var(--u)); overflow: visible; }
        .action { font-size: calc(${4.6 * k} * var(--u)); font-weight: 600; line-height: 1.15; min-height: 1.15em;
                  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      </style>
      <ha-card>
        ${this._config.title ? `<div class="title"></div>` : ""}
        ${this._config.plants.map(() => `<div class="plant">
            <div class="head"><span class="name"></span><span class="room"></span></div>
            ${GAUGES.map(gauge).join("")}
            <svg class="chart" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
            <div class="action"></div></div>`).join("")}
      </ha-card>`;
    if (this._config.height) this.style.height = this._config.height;
    this._els = Array.from(root.querySelectorAll(".plant"));
  }

  _bands(p) {
    const d = { min_moisture: 15, max_moisture: 60, min_conductivity: 350, max_conductivity: 2000,
                min_brightness: 500, ...(this._config.defaults || {}), ...p };
    return {
      moisture: { lo: d.min_moisture, hi: d.max_moisture, top: d.max_moisture * 1.25, log: false },
      conductivity: { lo: d.min_conductivity, hi: d.max_conductivity, top: d.max_conductivity * 1.25, log: false },
      brightness: { lo: d.min_brightness, hi: Infinity, bottom: 100, top: d.min_brightness * 4, log: true },
    };
  }

  // Where a value sits on its bar, 0..100 %.
  _pos(b, v) {
    const f = b.log
      ? (Math.log10(Math.max(v, b.bottom)) - Math.log10(b.bottom)) / (Math.log10(b.top) - Math.log10(b.bottom))
      : v / b.top;
    return Math.max(0, Math.min(100, f * 100));
  }

  // The actions, most urgent first, and the colour of the tile's text: 0 water, 1 too wet,
  // 2 something else to do, 3 nothing, 4 no reading.
  _read(p) {
    const s = this._hass.states[p.entity];
    const a = (s && s.attributes) || {};
    const b = this._bands(p);
    const v = Object.fromEntries(GAUGES.map((g) => [g.key, parseFloat(g.value(a))]));
    const acts = [];
    let rank = 3;
    if (!Number.isFinite(v.moisture)) return { a, b, v, rank: 4, text: t(this._hass, "card.plants.noReading"), color: "var(--secondary-text-color)" };
    if (v.moisture < b.moisture.lo) { acts.push(t(this._hass, "card.plants.water")); rank = 0; }
    else if (v.moisture > b.moisture.hi) { acts.push(t(this._hass, "card.plants.dontWater")); rank = 1; }
    if (Number.isFinite(v.brightness) && v.brightness < b.brightness.lo) acts.push(t(this._hass, "card.plants.moreLight"));
    if (Number.isFinite(v.conductivity) && v.conductivity < b.conductivity.lo) acts.push(t(this._hass, "card.plants.fertilise"));
    else if (Number.isFinite(v.conductivity) && v.conductivity > b.conductivity.hi) acts.push(t(this._hass, "card.plants.flush"));
    const temp = String(a.problem || "");
    if (temp.includes("temperature low")) acts.push(t(this._hass, "card.plants.tooCold"));
    if (temp.includes("temperature high")) acts.push(t(this._hass, "card.plants.tooWarm"));
    if (acts.length && rank === 3) rank = 2;
    const color = ["var(--water)", "var(--wet)", "var(--act)", "var(--good)"][rank];
    // Nothing to do, nothing written: the green dots say it.
    return { a, b, v, rank, text: acts.join(" · "), color };
  }

  _update() {
    const rows = this._config.plants.map((p) => ({ p, r: this._read(p) }))
      .sort((x, y) => x.r.rank - y.r.rank
        || (x.r.v.moisture - x.r.b.moisture.lo) - (y.r.v.moisture - y.r.b.moisture.lo));
    if (this._config.title) {
      const water = rows.filter((x) => x.r.rank === 0).length;
      this.shadowRoot.querySelector(".title").textContent =
        `${this._config.title}${water ? ` · ${t(this._hass, "card.plants.toWater", { count: water })}` : ""}`;
    }
    rows.forEach(({ p, r }, i) => {
      const el = this._els[i];
      el.querySelector(".name").textContent = r.a.friendly_name || p.entity;
      el.querySelector(".room").textContent = p.room || "";
      for (const g of GAUGES) {
        const b = r.b[g.key], val = r.v[g.key];
        const row = el.querySelector(`[data-k="${g.key}"]`);
        row.querySelector(".gl").textContent = t(this._hass, g.label);
        const band = row.querySelector(".band");
        const lo = this._pos(b, b.lo), hi = b.hi === Infinity ? 100 : this._pos(b, b.hi);
        band.style.left = `${lo}%`;
        band.style.width = `${hi - lo}%`;
        const dot = row.querySelector(".dot");
        const ok = Number.isFinite(val);
        dot.style.display = ok ? "" : "none";
        if (!ok) continue;
        dot.style.left = `${this._pos(b, val)}%`;
        const inside = val >= b.lo && val <= b.hi;
        dot.style.color = inside ? "var(--good)"
          : g.key === "moisture" ? (val < b.lo ? "var(--water)" : "var(--wet)") : "var(--act)";
      }
      this._chart(el, p, r);
      const action = el.querySelector(".action");
      action.textContent = r.text;
      action.style.color = r.color;
    });
  }
}

customElements.define("plants-card", PlantsCard);
