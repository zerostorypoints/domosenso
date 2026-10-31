// Plants for a wall tablet, readable from across the room at any count (SPEC-022): a page of up to
// `per_page` tiles that grow to fill it, and above that pages that turn every `page_s` seconds, the
// plants that need something first, with a strip of one dot per plant. A tile has the plant's photo
// (or a leaf in its state's colour), its name and room, a smoothed line of the soil moisture over the last days
// against the watering threshold, one line saying what to do, and when it was watered or when it
// will need water. Up to four tiles also show three gauges, sun, fertiliser and water, each a bar
// with the plant's good band and a dot for where it is. With more than four plants list pages
// follow the tiles: one row per plant with its room, action, bars and line, at most `list_rows` rows a page
// (SPEC-022 amendment 2). Three states, never red: good (green),
// neutral (grey: no reading, or water due within three days) and needs something (amber). Labels
// follow the Home Assistant language (en, de, pl; anything else falls back to en). Sizes are shares
// of the card's own height (cqh), capped by its width (--u) so that in a window squarer than the
// tablet the type still fits the tiles.
//
//   type: custom:plants-card
//   height: calc(100dvh - 16px)
//   discover: true                     # every plant.* with the attribute domosenso_plant (the
//                                      # plants component sets it with domosenso_room,
//                                      # domosenso_bands and entity_picture); or a list:
//   plants:
//     - entity: plant.plant_1          # the core plant integration
//       room: Living room
//     - {entity: plant.plant_4, room: Conservatory, min_brightness: 1000}
//   defaults: {min_moisture: 15, ...}  # the list's bands; discover reads them from the plant
//   per_page: input_number.ramka_plants_per_page   # a number or an entity; default 6
//   page_s: input_number.ramka_plants_page_s       # a number or an entity; default 10
//   days: 7                            # optional: the moisture line's span (hourly means from
//                                      # the statistics of the plant's moisture sensor)
//   list: true                         # optional: false drops the list pages
//   list_rows: 7                       # optional: rows per list page
//
// "Watered" and "water in" come from sensor.<plant>_last_watered and sensor.<plant>_water_in_days
// when they exist. The page index is kept in the browser, so the next pass of the ambient loop
// continues where the last one stopped.

import { createT, language } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const GAUGES = [
  { key: "brightness", label: "card.plants.gauge.sun", value: (a) => a.max_brightness ?? a.brightness },
  { key: "conductivity", label: "card.plants.gauge.fertiliser", value: (a) => a.conductivity },
  { key: "moisture", label: "card.plants.gauge.water", value: (a) => a.moisture },
];
const STATE_ORDER = { need: 0, neutral: 1, good: 2 };
const PAGE_KEY = "domosenso.ramka.plants.page";
const DAY = 86400000;
const LEAF = `<svg class="leaf" viewBox="0 0 24 24"><path fill="currentColor" d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>`;

// The page index survives a new card element; without localStorage (a private window, tests) it
// lives as long as the module.
let memoryPage = 0;
function loadPage() {
  try {
    if (globalThis.localStorage) {
      const v = parseInt(globalThis.localStorage.getItem(PAGE_KEY), 10);
      return Number.isFinite(v) ? v : 0;
    }
  } catch (e) { /* storage refused */ }
  return memoryPage;
}
function savePage(v) {
  try {
    if (globalThis.localStorage) { globalThis.localStorage.setItem(PAGE_KEY, String(v)); return; }
  } catch (e) { /* storage refused */ }
  memoryPage = v;
}

const objectId = (entity) => entity.slice(entity.indexOf(".") + 1);

class PlantsCard extends HTMLElement {
  setConfig(config) {
    if (!config.discover && !(config.plants && config.plants.length)) {
      throw new Error("plants-card: plants or discover is required");
    }
    this._config = config;
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: this._config.height ? "auto" : 6 };
  }

  // Home Assistant hands over a new hass for every state change in the house, several a second
  // with a radar; the card works only when one of its own entities changed (states are replaced,
  // never mutated, so identity says it).
  _watched(hass) {
    const ids = [this._config.per_page, this._config.page_s].filter((v) => typeof v === "string");
    for (const id of Object.keys(hass.states)) {
      if (id.startsWith("plant.") || /^sensor\..*_(last_watered|water_in_days)$/.test(id)) ids.push(id);
    }
    return ids.map((id) => hass.states[id]);
  }

  set hass(hass) {
    const watched = this._watched(hass);
    const same = this._seen && watched.length === this._seen.length && watched.every((s, i) => s === this._seen[i]);
    this._hass = hass;
    this._seen = watched;
    if (same) return;
    if (!this._built) this._build();
    this._update();
    const ids = this._plants().map((p) => this._moistureId(p)).filter(Boolean).join(",");
    if (ids !== this._statIds || Date.now() - (this._statsAt || 0) > 30 * 60 * 1000) this._fetch(ids);
  }

  connectedCallback() {
    this._schedule();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
    this._timer = null;
  }

  _schedule() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._page = ((this._page ?? loadPage()) + 1) % (this._pages || 1);
      savePage(this._page);
      if (this._hass) this._update();
      this._schedule();
    }, this._number("page_s", 10) * 1000);
  }

  // A number from the config: a literal, or the state of the entity it names.
  _number(key, fallback) {
    const v = this._config[key];
    const n = typeof v === "string" ? parseFloat(this._hass?.states[v]?.state) : v;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  _plants() {
    if (!this._config.discover) return this._config.plants;
    return Object.keys(this._hass.states)
      .filter((id) => id.startsWith("plant.") && this._hass.states[id].attributes.domosenso_plant)
      .sort()
      .map((id) => {
        const a = this._hass.states[id].attributes;
        return { ...(a.domosenso_bands || {}), entity: id, room: a.domosenso_room, rooms: a.domosenso_rooms };
      });
  }

  // Hourly means of every plant's moisture sensor, the way statistics-graph gets them; again
  // every 30 minutes, which is finer than the line needs, and when the plants change.
  async _fetch(ids) {
    this._statsAt = Date.now();
    this._statIds = ids;
    if (!ids) return;
    const days = this._config.days || 7;
    try {
      this._stats = await this._hass.callWS({
        type: "recorder/statistics_during_period", period: "hour", types: ["mean"], statistic_ids: ids.split(","),
        start_time: new Date(Date.now() - days * DAY).toISOString() });
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
  // line) and always takes in the watering threshold, drawn dashed.
  _chart(el, p, r) {
    const svg = el.querySelector("svg.chart");
    const rows = (this._stats && this._stats[this._moistureId(p)]) || [];
    const pts = rows.filter((x) => x.mean != null).map((x) => [x.start, x.mean]);
    if (pts.length < 2) { svg.innerHTML = ""; return; }
    const W = 100, H = 30, b = r.b.moisture;
    const t0 = Date.now() - (this._config.days || 7) * DAY, t1 = Date.now();
    const vals = pts.map((q) => q[1]);
    const lo = Math.max(0, Math.min(...vals, b.lo) - 3), hi = Math.max(...vals, b.lo) + 3;
    const x = (ts) => ((ts - t0) / (t1 - t0)) * W;
    const y = (v) => H - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * H;
    const xy = pts.map(([ts, v]) => [x(ts), y(v)]);
    const now = r.v.moisture;
    const color = now >= b.lo && now <= b.hi ? "var(--good)" : "var(--act)";
    svg.innerHTML = `<line x1="0" x2="${W}" y1="${y(b.lo).toFixed(1)}" y2="${y(b.lo).toFixed(1)}" stroke="var(--act)"
        stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0.7"/>
      <path d="${this._path(xy)}" fill="none" stroke="${color}" stroke-width="2.2"
        vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  _build() {
    this._built = true;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%;
                --good: var(--plant-good, #5be37a); --neutral: var(--plant-neutral, #9aa0a6);
                --act: var(--plant-act, #f5b942); }
        ha-card { height: 100%; --u: min(1cqh, 0.66cqw); box-sizing: border-box; padding: 2cqh 1.5cqw;
                  container-type: size; display: flex; flex-direction: column; gap: 2cqh; overflow: hidden; }
        .title { font-size: calc(6 * var(--u)); color: var(--secondary-text-color); }
        .page { flex: 1; min-height: 0; display: grid; gap: 2cqh 1.5cqw; }
        .plant { display: grid; grid-template-columns: var(--photo) 1fr; gap: 3%; min-width: 0; min-height: 0;
                 padding: 2.5%; box-sizing: border-box; border-radius: calc(2 * var(--u));
                 background: var(--secondary-background-color); border-left: calc(0.8 * var(--u)) solid var(--c); }
        [data-state="good"] { --c: var(--good); }
        [data-state="neutral"] { --c: var(--neutral); }
        [data-state="need"] { --c: var(--act); }
        .photo { border-radius: calc(1.5 * var(--u)); overflow: hidden; display: flex; align-items: center;
                 justify-content: center; min-height: 0; color: var(--c); background: rgba(255,255,255,0.06); }
        .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .photo .leaf { width: 55%; height: 55%; }
        .list { flex: 1; min-height: 0; display: grid; gap: 1.2cqh; }
        .row { display: grid; grid-template-columns: var(--rh) 1.3fr 1fr 1fr 1fr 1.2fr; align-items: center;
               gap: 1.6cqw; min-height: 0; padding: 0 1.4cqw 0 0; border-radius: calc(1.5 * var(--u));
               background: var(--secondary-background-color); border-left: calc(0.7 * var(--u)) solid var(--c);
               overflow: hidden; }
        .row .photo { height: 100%; border-radius: 0; }
        .row.top { background: none; border: none; color: var(--secondary-text-color); font-size: calc(3 * var(--u)); }
        .rowname { display: flex; flex-direction: column; min-width: 0; }
        .rowname .name { font-size: calc(4.2 * var(--u)); }
        .sub { font-size: calc(3.2 * var(--u)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
               color: var(--secondary-text-color); }
        .sub .act { color: var(--c); font-weight: 600; }
        .row .g { display: block; }
        .row .gl { display: none; }
        .body { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; min-height: 0; }
        .head { display: flex; flex-direction: column; min-width: 0; }
        .name, .room, .meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .name { font-weight: 500; }
        .room, .meta, .g { color: var(--secondary-text-color); }
        .g { display: grid; grid-template-columns: 5.5em 1fr; align-items: center; gap: 0.6em; }
        .bar { position: relative; border-radius: 99px; background: rgba(255,255,255,0.08); }
        .band { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: rgba(91,227,122,0.25); }
        .dot { position: absolute; top: 50%; border-radius: 50%; transform: translate(-50%, -50%); background: currentColor; }
        .chart { display: block; width: 100%; overflow: visible; }
        .action { font-weight: 600; line-height: 1.15; min-height: 1.15em; color: var(--c);
                  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .strip { display: flex; align-items: center; gap: 1.2em; font-size: calc(3.2 * var(--u));
                 color: var(--secondary-text-color); }
        .pg, .cnt { white-space: nowrap; }
        .dots { display: flex; flex-wrap: wrap; gap: 0.35em; flex: 1; }
        .dots i { display: block; width: 0.8em; height: 0.8em; border-radius: 50%; background: var(--c); }
        .dots i.here { outline: 0.15em solid var(--primary-text-color); outline-offset: 0.12em; }
        .none { margin: auto; font-size: calc(6 * var(--u)); color: var(--secondary-text-color); }
      </style>
      <ha-card>${this._config.title ? `<div class="title"></div>` : ""}<div class="page"></div></ha-card>`;
    if (this._config.height) this.style.height = this._config.height;
    this._card = root.querySelector("ha-card");
    this._pageEl = root.querySelector(".page");
    this._listEl = document.createElement("div");
    this._listEl.className = "list";
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

  // When it was watered, or when it will need water (that one wins when known).
  _meta(p) {
    const id = objectId(p.entity);
    const inDays = parseFloat(this._hass.states[`sensor.${id}_water_in_days`]?.state);
    if (Number.isFinite(inDays)) {
      if (inDays < 1) return { inDays, text: t(this._hass, "card.plants.waterToday") };
      if (inDays < 2) return { inDays, text: t(this._hass, "card.plants.waterTomorrow") };
      return { inDays, text: t(this._hass, "card.plants.waterIn", { count: Math.round(inDays) }) };
    }
    const at = Date.parse(this._hass.states[`sensor.${id}_last_watered`]?.state);
    if (!Number.isFinite(at)) return { inDays: null, text: "" };
    // Calendar days: watered at 23:00 is "yesterday" the next morning.
    const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const ago = Math.round((midnight(new Date()) - midnight(new Date(at))) / DAY);
    const key = ago <= 0 ? "wateredToday" : ago === 1 ? "wateredYesterday" : "wateredAgo";
    return { inDays: null, text: t(this._hass, `card.plants.${key}`, { count: ago }) };
  }

  // The actions, most urgent first: rank 0 water, 1 too wet, 2 something else to do, 3 nothing,
  // 4 no reading; then the tile's state.
  _read(p) {
    const s = this._hass.states[p.entity];
    const a = (s && s.attributes) || {};
    const b = this._bands(p);
    const v = Object.fromEntries(GAUGES.map((g) => [g.key, parseFloat(g.value(a))]));
    const m = this._meta(p);
    if (!Number.isFinite(v.moisture)) {
      return { a, b, v, m, rank: 4, state: "neutral", text: t(this._hass, "card.plants.noReading") };
    }
    const acts = [];
    let rank = 3;
    if (v.moisture < b.moisture.lo) { acts.push(t(this._hass, "card.plants.water")); rank = 0; }
    else if (v.moisture > b.moisture.hi) { acts.push(t(this._hass, "card.plants.dontWater")); rank = 1; }
    if (Number.isFinite(v.brightness) && v.brightness < b.brightness.lo) acts.push(t(this._hass, "card.plants.moreLight"));
    if (Number.isFinite(v.conductivity) && v.conductivity < b.conductivity.lo) acts.push(t(this._hass, "card.plants.fertilise"));
    else if (Number.isFinite(v.conductivity) && v.conductivity > b.conductivity.hi) acts.push(t(this._hass, "card.plants.flush"));
    const temp = String(a.problem || "");
    if (temp.includes("temperature low")) acts.push(t(this._hass, "card.plants.tooCold"));
    if (temp.includes("temperature high")) acts.push(t(this._hass, "card.plants.tooWarm"));
    if (acts.length && rank === 3) rank = 2;
    const state = rank < 3 ? "need" : m.inDays != null && m.inDays <= 3 ? "neutral" : "good";
    return { a, b, v, m, rank, state, text: acts.join(" · ") };
  }

  // The tiles of one page; built again only when the plants on it change.
  _buildPage(rows, bars) {
    const n = rows.length;
    const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
    const lines = Math.ceil(n / cols);
    const k = n === 1 ? 1.6 : n <= 2 ? 1.3 : n <= 4 ? 1.05 : 1;  // type grows as the tiles do
    const el = this._pageEl;
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${lines}, 1fr)`;
    const u = (x) => `calc(${(x * k).toFixed(2)} * var(--u))`;
    const gauge = (g) => `<div class="g" data-k="${g.key}"><span class="gl"></span>
        <span class="bar" style="height: ${u(2)}"><span class="band"></span>
        <span class="dot" style="width: ${u(3.2)}; height: ${u(3.2)}"></span></span></div>`;
    el.innerHTML = rows.map(() => `<div class="plant" style="--photo: ${bars ? 34 : 38}%">
        <div class="photo" style="font-size: ${u(10)}"></div>
        <div class="body">
          <div class="head"><span class="name" style="font-size: ${u(5.2)}"></span>
            <span class="room" style="font-size: ${u(3.4)}"></span></div>
          ${bars ? `<div class="gauges" style="font-size: ${u(3.4)}">${GAUGES.map(gauge).join("")}</div>` : ""}
          <svg class="chart" style="height: ${u(10)}" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
          <div><div class="action" style="font-size: ${u(4.2)}"></div>
            <div class="meta" style="font-size: ${u(3.2)}"></div></div>
        </div></div>`).join("");
    this._els = Array.from(el.querySelectorAll(".plant"));
  }

  // The rows of one list page, under a header row; built again only when the plants on it change.
  _buildList(rows) {
    const el = this._listEl;
    const per = this._listRows;
    el.style.gridTemplateRows = `auto repeat(${per}, 1fr)`;
    // The photo is square: as wide as a row is high (the card's height less the header, the strip
    // and the gaps, shared by the rows).
    el.style.setProperty("--rh", `calc((100cqh - ${12 + per * 1.2}cqh) / ${per})`);
    const head = [t(this._hass, "card.plants.list.plant"), ...GAUGES.map((g) => t(this._hass, g.label)),
      t(this._hass, "card.plants.list.days", { count: this._config.days || 7 })];
    const gauge = (g) => `<div class="g" data-k="${g.key}"><span class="gl"></span>
        <span class="bar" style="display: block; height: calc(1.8 * var(--u))"><span class="band"></span>
        <span class="dot" style="width: calc(3 * var(--u)); height: calc(3 * var(--u))"></span></span></div>`;
    el.innerHTML = `<div class="row top"><span></span>${head.map(() => "<span></span>").join("")}</div>` +
      rows.map(() => `<div class="row"><div class="photo"></div>
        <div class="rowname"><span class="name"></span><span class="sub"><span class="rm"></span><span class="what"></span></span></div>
        ${GAUGES.map(gauge).join("")}
        <svg class="chart" style="height: calc(8 * var(--u))" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
        </div>`).join("");
    [...el.querySelector(".top").children].slice(1).forEach((span, i) => { span.textContent = head[i]; });
    this._els = Array.from(el.querySelectorAll(".row:not(.top)"));
  }

  // The three bars of a tile or a row: the good band, and a dot where the plant is.
  _gauges(el, r) {
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
      dot.style.color = val >= b.lo && val <= b.hi ? "var(--good)" : "var(--act)";
    }
  }

  _photo(el, p, a) {
    const box = el.querySelector(".photo");
    const src = a.entity_picture || "";
    const name = this._name(p, a);
    if (box.dataset.src === src && box.dataset.name === name) return;
    box.dataset.src = src;
    box.dataset.name = name;
    if (src) {
      box.style.background = "none";
      box.innerHTML = "<img alt=\"\">";
      box.querySelector("img").setAttribute("src", src);
    } else {
      // The leaf takes the state's colour from the tile (currentColor), so a change of state needs
      // no rebuild.
      box.style.background = "";
      box.innerHTML = LEAF;
    }
  }

  _strip(rows, page, pages, onPage) {
    let strip = this._card.querySelector(".strip");
    if (pages <= 1) { if (strip) strip.remove(); return; }
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "strip";
      strip.innerHTML = `<span class="pg"></span><div class="dots"></div><span class="cnt"></span>`;
      this._card.appendChild(strip);
    }
    strip.querySelector(".pg").textContent = `${page + 1} / ${pages}`;
    // One dot per plant, grouped by room in the order the rooms first come up.
    const rooms = [...new Set(rows.map((x) => x.p.room || ""))];
    const grouped = rooms.flatMap((room) => rows.filter((x) => (x.p.room || "") === room));
    const dots = strip.querySelector(".dots");
    dots.innerHTML = grouped.map(() => "<i></i>").join("");
    [...dots.children].forEach((dot, i) => {
      dot.dataset.state = grouped[i].r.state;
      dot.dataset.room = grouped[i].p.room || "";
      if (onPage.has(grouped[i].p.entity)) dot.className = "here";
    });
    const need = rows.filter((x) => x.r.state === "need").length;
    strip.querySelector(".cnt").textContent = `${t(this._hass, "card.plants.needCount", { count: need })} · ${
      t(this._hass, "card.plants.okCount", { count: rows.length - need })}`;
  }

  // The plant's name and room in the dashboard's language when given per language (plants
  // component: domosenso_names, domosenso_rooms), else the friendly name and the room.
  _name(p, a) {
    return (a.domosenso_names && a.domosenso_names[language(this._hass)]) || a.friendly_name || p.entity;
  }

  _room(p) {
    return (p.rooms && p.rooms[language(this._hass)]) || p.room || "";
  }

  _update() {
    // Needs something, then neutral, then good; within that the most urgent action, then the
    // driest against its threshold; no reading last.
    const dryness = (r) => (Number.isFinite(r.v.moisture) ? r.v.moisture - r.b.moisture.lo : Infinity);
    const rows = this._plants().map((p) => ({ p, r: this._read(p) }))
      .sort((x, y) => STATE_ORDER[x.r.state] - STATE_ORDER[y.r.state] || x.r.rank - y.r.rank
        || (dryness(x.r) === dryness(y.r) ? 0 : dryness(x.r) < dryness(y.r) ? -1 : 1));
    if (this._config.title) {
      const water = rows.filter((x) => x.r.rank === 0).length;
      this.shadowRoot.querySelector(".title").textContent =
        `${this._config.title}${water ? ` · ${t(this._hass, "card.plants.toWater", { count: water })}` : ""}`;
    }
    let none = this._card.querySelector(".none");
    if (!rows.length) {
      this._pageEl.innerHTML = "";
      this._key = "";
      this._pages = 1;
      this._strip(rows, 0, 1, new Set());
      if (!none) { none = document.createElement("div"); none.className = "none"; this._card.appendChild(none); }
      none.textContent = t(this._hass, "card.plants.none");
      return;
    }
    if (none) none.remove();
    const per = Math.round(this._number("per_page", 6));
    const tilePages = Math.ceil(rows.length / per);
    // The list pages, with the rows shared evenly (15 plants at 7 a page: 5, 5, 5).
    const listPages = this._config.list !== false && rows.length > 4
      ? Math.ceil(rows.length / Math.max(1, Math.round(this._config.list_rows || 7))) : 0;
    const pages = tilePages + listPages;
    this._pages = pages;
    if (this._page == null) this._page = loadPage();
    if (this._page >= pages || this._page < 0) this._page = 0;
    const list = this._page >= tilePages;
    let shown;
    if (list) {
      this._listRows = Math.ceil(rows.length / listPages);
      const j = this._page - tilePages;
      shown = rows.slice(j * this._listRows, j * this._listRows + this._listRows);
    } else {
      shown = rows.slice(this._page * per, this._page * per + per);
    }
    const bars = list || shown.length <= 4;
    const key = `${list ? `list${this._listRows}` : bars}:${shown.map((x) => x.p.entity).join(",")}`;
    if (key !== this._key) {
      this._key = key;
      if (list) {
        this._pageEl.replaceWith(this._listEl);
        this._buildList(shown);
      } else {
        this._listEl.replaceWith(this._pageEl);
        this._buildPage(shown, bars);
      }
    }
    shown.forEach(({ p, r }, i) => {
      const el = this._els[i];
      el.dataset.state = r.state;
      el.querySelector(".name").textContent = this._name(p, r.a);
      this._photo(el, p, r.a);
      if (bars) this._gauges(el, r);
      this._chart(el, p, r);
      if (list) {
        // The room always (with many plants it is how to find the pot), then what to do.
        const what = el.querySelector(".what");
        el.querySelector(".rm").textContent = this._room(p);
        what.textContent = r.text || r.m.text ? ` · ${r.text || r.m.text}` : "";
        what.classList.toggle("act", Boolean(r.text));
        return;
      }
      el.querySelector(".room").textContent = this._room(p);
      el.querySelector(".action").textContent = r.text;
      el.querySelector(".meta").textContent = r.m.text;
    });
    this._strip(rows, this._page, pages, new Set(shown.map((x) => x.p.entity)));
  }
}

customElements.define("plants-card", PlantsCard);
