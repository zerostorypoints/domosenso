// A floor plan of the home (SPEC-028): the rooms of one floor as polygons in metres, each labelled
// with its area's name, and the sensors and plants at their positions with their current readings.
// Wheel, pinch and the + / − / fit buttons zoom; dragging the background pans. In view mode nothing
// reacts to a tap, so the card can sit on a wall tablet.
//
// Administrators get an Edit button (unless `edit: false`): drag points and room corners, add a
// corner (double-click a wall) or remove one (double-click it), split a room, join two, link a room
// to an area or create one, and drag sensors without a position from the tray, one or a room's group
// at a time. Corners snap to a 5 cm grid; rooms show their floor area and wall lengths. Save writes
// the plan back into the `floorplan` dashboard, but only if nobody changed it there since it was loaded.
//
//   type: custom:floorplan-card
//   plan: {schema: 1, floors: [...]}   # optional: else read from the `floorplan` dashboard
//   floor: ground                      # optional: floor_id to show; default the first
//   edit: true                         # false: no Edit button, for embedding
//   values: true                       # false: points without their readings
//   layers: [climate, plants]          # optional: only these categories, no layer chips
//   layer_choice: one                  # with layers: a chip each, one layer shown at a time (the Ramka)
//   maps: true                         # false: no maps on the plants, climate and light layers
//   fill: true                         # optional: as tall as the screen below the card's top (the Ramka)
//
// With one of the plants, climate or light layers shown (Amendment 7) the bar offers its maps: the
// reading interpolated inside each room, or the lamps; and "now" or the map's figure over the last
// 24 hours, from the recorder's hourly statistics.

import { createT } from "./lib/i18n.js";
import { STYLE } from "./lib/style.js";
import { zoomAt, snapToEdge, pointInPolygon, widestRow, insideRooms } from "./lib/geometry.js";
import {
  supported, emptyPlan, autoPlace, tray, trayGroups, roomLabel, movePoint, moveCorner, insertCorner, removeCorner,
  splitRoom, joinRooms, linkRoom, withPlan, extract, addPoint, addPoints, candidateName, pointName,
  candidates, pointCategory, setPointCategory, joinPoint, separatePoint, registryLinks, presenceEntities,
  openSpaces, openRooms, closeRoom, facingWalls,
} from "./lib/plan.js";
import { categoryById, categoryName, colourOf, PLACEABLE } from "./lib/categories.js";
import { esc, dotHtml } from "./lib/html.js";
import { fitView, frame, toPlan, snapCorner, gridOnWall, nearestWall, entityMap, pointEntities, valueText } from "./lib/view.js";
import { trayHtml } from "./lib/tray.js";
import { drawGrid, drawDims, drawWallDistances } from "./lib/measure.js";
import { layoutLabels, placeNames, CHAR_EM } from "./lib/labels.js";
import { MAPS, SCALES, STEP_M, ruleOf, readingIds, labelClasses, figure, nowValue, formatValue, colourAt, heat, lampIndex, lampOf } from "./lib/maps.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });
const URL_PATH = "floorplan";
const SVG_NS = "http://www.w3.org/2000/svg";
const ZOOM_STEP = 1.25;
const TAP_PX = 5;         // a pointer that moved less than this is a tap, not a drag
const PICK_PX = 12;       // how far from a wall a split pick may land
const LABEL_PX = 14;      // a room name's size on screen, shrunk down to LABEL_MIN_PX to fit its room
const LABEL_MIN_PX = 9;
const STACK_PX = 14;      // placed dots closer than this on screen are one dot with a list
const HIDDEN_KEY = "domosenso.floorplan.hidden";   // localStorage: the layers this browser switched off
const CHOSEN_KEY = "domosenso.floorplan.chosen";   // localStorage: the one layer shown (layer_choice: one)
const MAP_KEY = "domosenso.floorplan.map";         // localStorage: the map chosen per layer
const AGG_KEY = "domosenso.floorplan.day";         // localStorage: true while the maps show the last 24 hours
const HOUR_MS = 60 * 60 * 1000;
const STATS_MS = HOUR_MS / 2;     // the 24-hour figures are fetched again this often while shown
const FILL_GAP_PX = 8;

// The devices a link reaches inside a cluster: two names, then how many more.
function linkLabel(names) {
  const sorted = [...names].sort();
  return sorted.length > 2 ? `${sorted.slice(0, 2).join(", ")} +${sorted.length - 2}` : sorted.join(", ");
}

// Browser storage may be missing or refuse (a private window, a preview): then the layers start as
// configured and a choice lasts for this page only.
function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not kept
  }
}

// A room name's screen size: LABEL_PX unless its estimated width (CHAR_EM a character) would pass 90 %
// of the room's widest run, `width` metres at `px` metres per screen pixel.
function labelSize(text, width, px) {
  const needed = String(text).length * CHAR_EM * LABEL_PX * px;
  const room = width * 0.9;
  return needed <= room ? LABEL_PX : Math.max(LABEL_MIN_PX, (LABEL_PX * room) / needed);
}

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (parent) parent.appendChild(node);
  return node;
}

const keyOf = (p) => p.device_id ?? p.entity_id;
// Only a path on this Home Assistant or an http(s) URL is shown as a photo.
const safePicture = (url) => typeof url === "string" && /^(\/(?!\/)|https?:\/\/)/.test(url);
const fmt = (v) => String(Math.round(v * 1e6) / 1e6);

class FloorplanCard extends HTMLElement {
  setConfig(config) {
    this._config = { edit: true, values: true, maps: true, ...config };
    this._status = "loading";      // loading | none | unsupported | ready
    this._doc = null;              // the plan as edited
    this._loaded = null;           // the plan as read: the save guard compares against it
    this._base = null;             // the plan as read, with one empty floor if it had none: Cancel returns here
    this._mode = "view";
    this._tool = "move";
    this._picks = [];              // split: wall points; join: area ids
    this._selected = null;         // move tool: the room whose area panel is open
    this._picked = null;           // move tool: the point whose distances to the walls show
    this._pendingSplit = null;
    this._message = null;          // {key, vars}
    this._view = null;
    this._drag = null;
    this._pointers = new Map();
    this._stamp = null;
    this._trayOpen = new Map();    // tray group key -> open, as the user left it
    this._hidden = new Set(load(HIDDEN_KEY, []));   // category ids switched off by this browser's layer chips
    const listed = Array.isArray(this._config.layers) ? this._config.layers : [];
    this._one = this._config.layer_choice === "one" && listed.length > 0;
    const chosen = load(CHOSEN_KEY, null);
    this._chosen = listed.includes(chosen) ? chosen : listed[0] ?? null;   // with layer_choice: one
    this._entryDomains = {};       // config entry id -> integration domain, once config_entries/get answered
    this._hoverKey = null;         // the marker under the pointer: its registry links show
    this._openCluster = null;      // the room whose cluster list is open (edit mode)
    this._maps = load(MAP_KEY, {}) || {};          // layer -> the device class (or "lamps") of its map
    this._day = load(AGG_KEY, false) === true;     // the maps show the last 24 hours, not now
    this._stats = null;            // statistic id -> hourly rows, the last 24 hours
    this._statIds = "";
    this._statsAt = 0;
    this._heatCache = null;
    if (this._hass) this._load();
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: this._config?.fill ? "auto" : 8, min_columns: 6, min_rows: 4 };
  }

  connectedCallback() {
    this._onResize ??= () => this._fill();
    window.addEventListener("resize", this._onResize);
  }

  // The plan's size changed (the card was shown, `fill` grew it, the window turned): readings and
  // markers are sized in screen pixels, so lay them out again. A card drawn while hidden (the
  // Ramka's plan view before its swipe) had no size and drew at a fallback scale.
  _resized() {
    const r = this._rect();
    if (`${Math.round(r.width)}x${Math.round(r.height)}` === this._drawnSize) return;
    this._drawSvg(this._status === "ready" && this._mode === "edit");
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
  }

  // `fill`: as tall as the screen below the card's top; true when the height changed.
  _fill() {
    if (!this._config?.fill) return false;
    const top = this.getBoundingClientRect().top;
    const height = `${Math.max(280, Math.round(window.innerHeight - top - FILL_GAP_PX))}px`;
    if (this.style.height === height) return false;
    this.style.height = height;
    return true;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._registry();
    if (!this.shadowRoot) this._build();
    if (first) {
      this._loadEntries();
      this._load();
      return;
    }
    // hass is set for every state change in Home Assistant: redraw only what changed. A new reading
    // redraws the plan alone, so a half-typed area name or an open select survives it.
    this._wantStats();
    const stamp = this._valueStamp();
    if (stamp === this._stamp) return;
    if (stamp.split("\n")[0] !== this._stamp?.split("\n")[0]) this._render();
    else {
      this._drawSvg(this._status === "ready" && this._mode === "edit");
      this._stamp = stamp;
    }
  }

  // Config entry domains, so a device's integrations read as SPEC-010's scan reads them (Amendment 5).
  // `config_entries/get` needs no admin; a refusal leaves the entity platforms standing in.
  async _loadEntries() {
    try {
      const entries = await this._hass.callWS({ type: "config_entries/get" });
      this._entryDomains = Object.fromEntries((Array.isArray(entries) ? entries : []).map((e) => [e.entry_id, e.domain]));
    } catch {
      return;
    }
    this._render();
  }

  // The candidates and each point's readings, worked out again only when the registries or the
  // entry domains change: hass is set for every state change in Home Assistant. A device class or a
  // plant's sensors (states) changing alone shows with the next registry change or page load.
  _registry() {
    const h = this._hass || {};
    const key = [h.entities, h.devices, h.areas, this._entryDomains];
    if (this._regKey && key.every((v, i) => v === this._regKey[i])) return;
    this._regKey = key;
    const list = candidates(h, this._entryDomains);
    this._cands = new Map(list.map((c) => [c.key, c]));
    this._entities = entityMap(h, list);
    this._catCache = new WeakMap();
    this._readCache = new WeakMap();
    this._lamps = lampIndex(h);
  }

  // A point's reading entities by device class (a plant's through its named sensors).
  _readings(point) {
    let ids = this._readCache.get(point);
    if (!ids) this._readCache.set(point, (ids = readingIds(this._hass, pointEntities(point, this._entities))));
    return ids;
  }

  // The layer whose maps the bar offers: the one shown of plants, climate and light, outside edit mode.
  _mapLayer() {
    if (!this._config.maps || this._mode === "edit" || this._status !== "ready" || !this._floor) return null;
    let ids;
    if (this._one) ids = [this._chosen];
    else if (this._config.layers) ids = this._config.layers;
    else ids = [...new Set(this._floor.points.flatMap((p) => this._cat(p).roles))].filter((id) => this._visible(id));
    return ids.length === 1 && MAPS[ids[0]] ? ids[0] : null;
  }

  // The map shown: {layer, cls, rule}; null without one.
  _map() {
    const layer = this._mapLayer();
    if (!layer) return null;
    const [cls, rule] = MAPS[layer].find(([c]) => c === this._maps[layer]) ?? MAPS[layer][0];
    return { layer, cls, rule };
  }

  // A reading now, or its figure over the last 24 hours by the layer's rule.
  _value(id, cls, layer) {
    return this._day ? figure(this._stats?.[id], ruleOf(layer, cls)) : nowValue(this._hass, id);
  }

  // The last 24 hours' statistics of every reading on the floor, while a reading map shows them:
  // fetched when the readings change and every STATS_MS.
  _wantStats() {
    const map = this._map();
    if (!this._day || !map || map.cls === "lamps") return;
    // Every point's: an unplaced one's label shows its figure too; only the heat leaves it out.
    const ids = [...new Set(this._floor.points.flatMap((p) => Object.values(this._readings(p))))].sort().join(",");
    if (!ids || (ids === this._statIds && Date.now() - this._statsAt < STATS_MS)) return;
    this._fetchStats(ids);
  }

  async _fetchStats(ids) {
    this._statIds = ids;
    this._statsAt = Date.now();
    try {
      this._stats = await this._hass.callWS({ type: "recorder/statistics_during_period", period: "hour",
        types: ["mean", "min", "max"], statistic_ids: ids.split(","),
        start_time: new Date(Date.now() - 24 * HOUR_MS).toISOString() });
    } catch {
      this._stats = {};
      this._statsAt = Date.now() - STATS_MS + 5 * 60 * 1000;     // try again in five minutes
    }
    this._heatCache = null;
    this._render();
  }

  // A point's category and roles, once per point object: an edit makes a new one.
  _cat(point) {
    let cat = this._catCache.get(point);
    if (!cat) this._catCache.set(point, (cat = pointCategory(this._hass, point, this._cands)));
    return cat;
  }

  _visible(categoryId) {
    if (this._one) return categoryId === this._chosen;
    return this._config.layers ? this._config.layers.includes(categoryId) : !this._hidden.has(categoryId);
  }

  // A point shows while any of its roles' layers is on (a radar on a proxy: radio or presence).
  _shown(cat) {
    return cat.roles.some((id) => this._visible(id));
  }

  get _floor() {
    return this._doc?.floors.find((f) => f.floor_id === this._floorId) ?? null;
  }

  async _load() {
    if (this._config.plan) {
      this._setPlan(this._config.plan);
      return;
    }
    this._render();
    let plan = null;
    try {
      plan = extract(await this._hass.callWS({ type: "lovelace/config", url_path: URL_PATH }));
    } catch {
      plan = null;    // no dashboard: the same as no plan
    }
    this._setPlan(plan);
  }

  _setPlan(plan) {
    if (!plan) this._status = "none";
    else if (!supported(plan)) this._status = "unsupported";
    else {
      this._status = "ready";
      // `floors: []` is a valid plan (what `floorplan push` writes first): edit it as one floor without an id.
      this._doc = plan.floors.length ? plan : { ...plan, floors: emptyPlan([null]).floors };
      this._loaded = plan;
      this._base = this._doc;
      const wanted = plan.floors.find((f) => f.floor_id === this._config.floor);
      this._floorId = (wanted ?? plan.floors[0])?.floor_id ?? null;
      this._view = fitView(this._floor);
    }
    this._render();
  }

  // ---- DOM ---------------------------------------------------------------------------------

  _build() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
${STYLE}
      </style>
      <ha-card>
        <div class="layers"></div>
        <div class="bar"></div>
        <div class="area-panel"></div>
        <div class="body"><svg xmlns="${SVG_NS}" preserveAspectRatio="xMidYMid meet"></svg><div class="tray"></div><div class="cluster-list" hidden></div><div class="tip" hidden></div></div>
        <div class="hint"></div>
        <div class="message"></div>
      </ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    this._svg = this.shadowRoot.querySelector("svg");
    card.addEventListener("click", (e) => this._onClick(e));
    card.addEventListener("change", (e) => this._onChange(e));
    card.addEventListener("pointerdown", (e) => this._onDown(e));
    card.addEventListener("pointermove", (e) => this._onMove(e));
    card.addEventListener("pointerup", (e) => this._onUp(e));
    card.addEventListener("pointercancel", (e) => this._onUp(e, true));
    card.addEventListener("lostpointercapture", (e) => this._onUp(e, true));
    card.addEventListener("pointerleave", () => this._showTip(null));
    if (typeof ResizeObserver === "function") new ResizeObserver(() => this._resized()).observe(this._svg);
    this._svg.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    this._svg.addEventListener("dblclick", (e) => this._onDblClick(e));
  }

  _say(key, vars) {
    this._message = key ? { key, vars } : null;
  }

  _render() {
    if (!this.shadowRoot) return;
    const h = this._hass;
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    const ready = this._status === "ready";
    const editing = ready && this._mode === "edit";
    $("ha-card").classList.toggle("editing", editing);
    this._fill();
    $(".bar").innerHTML = ready ? this._barHtml(editing) : "";
    // One layer at a time (a wall tablet): the bars keep their taps (data-own-tap), so a page that
    // goes back on a tap anywhere does not go back on zoom, a map or a layer.
    $(".bar").toggleAttribute("data-own-tap", this._one);
    $(".layers").toggleAttribute("data-own-tap", this._one);
    this._wantStats();
    this._registry();
    this._tipKey = null;     // a tooltip shown before is drawn again on the next hover
    $(".layers").innerHTML = ready ? this._layersHtml() : "";
    $(".area-panel").innerHTML = editing ? this._areaPanelHtml() || this._pointPanelHtml() : "";
    $(".tray").innerHTML = editing ? this._trayHtml() : "";
    const floor = this._floor;
    const empty = ready && floor && !floor.rooms.length && !floor.points.length;
    const hint = empty ? "card.floorplan.hint.empty" : editing ? `card.floorplan.hint.${this._tool}` : null;
    $(".hint").textContent = hint ? t(h, hint) : "";
    const notice = { loading: "card.floorplan.loading", none: "card.floorplan.no_plan",
      unsupported: "card.floorplan.unsupported" }[this._status];
    $(".message").innerHTML = notice
      ? `<div class="notice">${esc(t(h, notice))}</div>`
      : this._message ? esc(t(h, this._message.key, this._message.vars)) : "";
    this._svg.style.display = ready ? "" : "none";
    this._drawSvg(editing);
    this._stamp = this._valueStamp();
  }

  _barHtml(editing) {
    const h = this._hass;
    const btn = (action, text, title, extra = "") =>
      `<button data-action="${action}" ${title ? `title="${esc(title)}" aria-label="${esc(title)}"` : ""} ${extra}>${esc(text)}</button>`;
    const zoom = btn("zoom_in", "+", t(h, "card.floorplan.zoom_in"))
      + btn("zoom_out", "−", t(h, "card.floorplan.zoom_out"))
      + btn("fit", t(h, "card.floorplan.fit"));
    // View mode: the maps on the left, zoom on the right; edit mode: zoom, then the tools.
    if (!editing) {
      let html = `${this._mapsHtml()}<span class="spacer"></span>${zoom}`;
      if (this._config.edit && h?.user?.is_admin) html += btn("edit", t(h, "card.floorplan.edit"));
      return html;
    }
    let html = `${zoom}<span class="spacer"></span>`;
    if (this._doc.floors.length > 1) {
      const name = (id) => h.floors?.[id]?.name || id;
      html += `<select class="floor" aria-label="${esc(t(h, "card.floorplan.floor"))}">${this._doc.floors.map((f) =>
        `<option value="${esc(f.floor_id)}" ${f.floor_id === this._floorId ? "selected" : ""}>${esc(name(f.floor_id))}</option>`).join("")}</select>`;
    }
    for (const tool of ["move", "split", "join", "open"]) {
      html += btn("tool", t(h, `card.floorplan.tool.${tool}`), "", `data-tool="${tool}" class="${tool === this._tool ? "on" : ""}"`);
    }
    const dirty = this._doc !== this._base;
    html += btn("cancel", t(h, "card.floorplan.cancel"), "", this._saving ? "disabled" : "");
    html += btn("save", t(h, this._saving ? "card.floorplan.saving" : "card.floorplan.save"), "",
      `class="primary" ${dirty && !this._saving ? "" : "disabled"}`);
    return html;
  }

  // The shown layer's maps, then now or the last 24 hours (not for the lamps).
  _mapsHtml() {
    const map = this._map();
    if (!map) return "";
    const h = this._hass;
    const chip = (attrs, on, text) => `<button ${attrs} aria-pressed="${on}" class="chip">${esc(text)}</button>`;
    let html = `<span class="maps">${MAPS[map.layer].map(([cls]) =>
      chip(`data-action="map" data-map="${cls}"`, cls === map.cls, t(h, `card.floorplan.maps.${cls}`))).join("")}</span>`;
    if (map.rule) {
      html += `<span class="maps">${chip('data-action="day" data-day="0"', !this._day, t(h, "card.floorplan.maps.now"))}`
        + chip('data-action="day" data-day="1"', this._day, t(h, "card.floorplan.maps.day",
          { figure: t(h, `card.floorplan.maps.figure.${map.rule === "mean" ? "mean" : `${map.cls}_${map.rule}`}`) }))
        + "</span>";
    }
    return html + this._legendHtml(map);
  }

  // The map's scale, compact, in the bar: never over the plan (on the Ramka a legend on the plan
  // covered a room). The chips name the map and now or 24 h; the full sentence is its tooltip.
  _legendHtml(map) {
    const h = this._hass;
    if (map.cls === "lamps") return `<span class="legend">${esc(t(h, "card.floorplan.maps.lamps_legend"))}</span>`;
    const s = SCALES[map.cls];
    const figureKey = map.rule === "mean" ? "mean" : `${map.cls}_${map.rule}`;
    const when = this._day ? t(h, "card.floorplan.maps.day_legend", { figure: t(h, `card.floorplan.maps.figure.${figureKey}`) })
      : t(h, "card.floorplan.maps.now_legend");
    return `<span class="legend" title="${esc(`${t(h, `card.floorplan.maps.${map.cls}`)}, ${when}`)}">`
      + `<span>${esc(formatValue(map.cls, s.lo))}</span>`
      + `<span class="scale" style="background: linear-gradient(90deg, ${s.ramp.join(", ")})"></span>`
      + `<span>${esc(formatValue(map.cls, s.hi))}</span>`
      + `<span class="hatch"></span><span>${esc(t(h, "card.floorplan.maps.no_sensor"))}</span></span>`;
  }

  _areaPanelHtml() {
    const h = this._hass;
    const target = this._pendingSplit ? null : this._selected;
    if (!target && !this._pendingSplit) return "";
    const used = new Set(this._floor.rooms.map((r) => r.area_id));
    const areas = Object.values(h.areas || {}).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const label = t(h, this._pendingSplit ? "card.floorplan.area.for_split" : "card.floorplan.area.label");
    const options = areas.map((a) => {
      const current = a.area_id === target;
      return `<option value="${esc(a.area_id)}" ${current ? "selected" : ""} ${used.has(a.area_id) && !current ? "disabled" : ""}>${esc(a.name)}</option>`;
    }).join("");
    // A room of an open space names the rooms it is open to, and can be closed off.
    const group = target && openSpaces(this._floor).find((g) => g.includes(target));
    const open = group ? `<span class="open-to">${esc(t(h, "card.floorplan.area.open_to", {
      rooms: group.filter((a) => a !== target).map((a) => h.areas?.[a]?.name || a).join(", ") }))}</span>`
      + `<button data-action="close_room">${esc(t(h, "card.floorplan.area.close_off"))}</button>` : "";
    return `${open}<label>${esc(label)}</label>
      <select class="area"><option value="" ${target && h.areas?.[target] ? "" : "selected"} disabled>${esc(t(h, "card.floorplan.area.choose"))}</option>${options}</select>
      <input type="text" placeholder="${esc(t(h, "card.floorplan.area.new"))}">
      <button data-action="create_area">${esc(t(h, "card.floorplan.area.create"))}</button>`;
  }

  // A chip per category with a point on this floor, unless the config fixes the layers.
  _layersHtml() {
    if ((this._config.layers && !this._one) || !this._floor) return "";
    const h = this._hass;
    const roles = this._floor.points.map((p) => this._cat(p).roles);
    const ids = new Set(this._one ? this._config.layers : roles.flat());
    const cats = PLACEABLE.filter((c) => ids.has(c.id));
    // One layer at a time (a wall tablet): the chips keep their taps (data-own-tap), so a page that
    // goes back on a tap anywhere does not go back on them.
    const pressed = (c) => (this._one ? c.id === this._chosen : !this._hidden.has(c.id));
    const own = this._one ? " data-own-tap" : "";
    if (!cats.length) return "";
    // A ring on the plan gets its explanation here once.
    const legend = roles.some((r) => r.length > 1)
      ? `<span class="ring-legend"><span class="ring"></span>${esc(t(h, "card.floorplan.roles.legend"))}</span>` : "";
    return `<span class="layers-label">${esc(t(h, "card.floorplan.layers"))}</span>` + cats.map((c) =>
      `<button data-action="layer" data-layer="${esc(c.id)}" aria-pressed="${pressed(c)}" class="chip"${own}>`
      + `${dotHtml(c)}${esc(categoryName(c, h?.language))}</button>`).join("")
      + legend;
  }

  // The tapped point's category: what the catalog says it is, or an override.
  _pointPanelHtml() {
    const point = this._picked && this._floor?.points.find((p) => keyOf(p) === this._picked);
    if (!point) return "";
    const h = this._hass;
    const current = this._cat(point).id;
    const options = PLACEABLE.map((c) =>
      `<option value="${esc(c.id)}" ${c.id === current ? "selected" : ""}>${esc(categoryName(c, h?.language))}</option>`).join("");
    const [, ...names] = this._pointNames(point);
    const joined = (point.also || []).map((id, i) => `<span class="joined">${esc(names[i])}`
      + `<button data-action="separate" data-device="${esc(id)}">${esc(t(h, "card.floorplan.point.separate"))}</button></span>`).join("");
    return `<div class="point-panel"><label>${esc(pointName(h, point))}: ${esc(t(h, "card.floorplan.point.category"))}</label>`
      + `<select class="category">${options}</select>`
      + (joined ? `<span class="joined-label">${esc(t(h, "card.floorplan.point.joined"))}</span>${joined}` : "")
      + "</div>";
  }

  _trayHtml() {
    const groups = trayGroups(this._doc, this._hass, [...this._cands.values()]);
    this._oneGroup = groups.length === 1;    // a lone group starts open, several start collapsed
    return trayHtml(this._hass, t, groups, (key) => this._groupOpen(key));
  }

  _groupOpen(key) {
    return this._trayOpen.get(key) ?? this._oneGroup;
  }

  _rect() {
    return this._svg.getBoundingClientRect();
  }

  // Metres per screen pixel, so handles and text keep their size at any zoom.
  _px() {
    const { s } = frame(this._view, this._rect());
    return s ? 1 / s : this._view.w / 800;
  }

  _drawSvg(editing) {
    const svg = this._svg;
    svg.replaceChildren();
    const size = this._rect();
    this._drawnSize = `${Math.round(size.width)}x${Math.round(size.height)}`;
    this._registry();
    const floor = this._floor;
    if (this._status !== "ready" || !floor) return;
    const v = this._view;
    svg.setAttribute("viewBox", `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.w)} ${fmt(v.h)}`);
    const px = this._px();
    const h = this._hass;
    const names = [];       // where each room's name is, for readings to keep clear of
    const map = this._map();
    this._mapNow = map;
    for (const room of floor.rooms) {
      const cls = ["room"];
      if (room.area_id === this._selected) cls.push("selected");
      if (this._picks.includes(room.area_id)) cls.push("picked");
      el("polygon", { class: cls.join(" "), "data-kind": "room", "data-area": room.area_id,
        points: room.polygon.map((p) => p.join(",")).join(" ") }, svg);
    }
    if (map) this._defs(svg, px);
    if (map && map.cls !== "lamps") this._drawHeat(svg, floor, map);
    // Walls between rooms of one open space: dashed and lighter, over the solid outline.
    for (const [a, b] of facingWalls(floor)) {
      const at = { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) };
      el("line", { class: "open-wall-mask", ...at }, svg);
      el("line", { class: "open-wall", ...at }, svg);
    }
    // Room names. In edit mode they stay in the middle of the room, the floor area under them, and
    // readings keep clear of them; in view mode the readings are laid out first and a name they
    // would cover moves to a free corner of its room (placeNames, after the layout below).
    const nameGroup = el("g", {}, svg);
    const roomNames = floor.rooms.map((room) => {
      const label = roomLabel(room, h);
      const spot = widestRow(room.polygon);
      const size = labelSize(label.text, spot.width, px) * px;
      const w = String(label.text).length * CHAR_EM * size;
      if (editing) {
        names.push({ x0: spot.x - w / 2, x1: spot.x + w / 2, y0: spot.y - size * 0.6,
          y1: spot.y + size * 0.6 + 16 * px });     // the floor area sits under it
      }
      return { label, size, poly: room.polygon, at: [spot.x, spot.y], w, h: size * 1.2 };
    });
    if (editing) drawGrid(svg, el, v, px);
    if (editing && this._tool === "move") {
      for (const room of floor.rooms) {
        room.polygon.forEach((a, i) => {
          const b = room.polygon[(i + 1) % room.polygon.length];
          el("line", { class: "edge", "data-kind": "edge", "data-area": room.area_id, "data-edge": i,
            x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, svg);
        });
      }
      for (const room of floor.rooms) {
        room.polygon.forEach((p, i) => el("circle", { class: "corner", "data-kind": "corner",
          "data-area": room.area_id, "data-index": i, cx: p[0], cy: p[1], r: 6 * px }, svg));
      }
    }
    const active = this._drag?.kind === "corner" ? this._drag.area : this._selected;
    if (editing) drawDims(svg, el, { hass: h, t, floor, px, active });
    for (const p of this._picks.filter(Array.isArray)) el("circle", { class: "pick", cx: p[0], cy: p[1], r: 5 * px }, svg);
    // A room's unplaced devices are one dot with their count; its list opens with a tap (edit mode).
    const clusters = this._clusters(floor);
    const inCluster = new Map([...clusters].flatMap(([area, c]) => c.points.map((p) => [keyOf(p), area])));
    // The registry links of the point dragged, hovered or (in edit mode) tapped. A device inside a
    // cluster has no marker of its own: its links end at the cluster's dot, which is named there.
    const linked = this._drag?.kind === "point" ? this._drag.key : this._hoverKey ?? (editing ? this._picked : null);
    if (linked) {
      const at = new Map(floor.points.map((p) => [keyOf(p), p]));
      const spot = (key) => (inCluster.has(key) ? clusters.get(inCluster.get(key)).at : [at.get(key).x, at.get(key).y]);
      const ends = new Map();     // far end -> {to, names}
      for (const link of registryLinks(h, floor.points)) {
        if (link.from !== linked && link.to !== linked) continue;
        const far = link.from === linked ? link.to : link.from;
        const end = inCluster.has(far) ? `cluster:${inCluster.get(far)}` : far;
        if (!ends.has(end)) ends.set(end, { to: spot(far), names: [], cluster: inCluster.has(far) });
        ends.get(end).names.push(pointName(h, at.get(far)));
      }
      const from = spot(linked);
      for (const { to, names, cluster } of ends.values()) {
        el("line", { class: "link", x1: from[0], y1: from[1], x2: to[0], y2: to[1] }, svg);
        if (cluster) {
          el("text", { class: "link-label", x: to[0], y: to[1] - 16 * px, "font-size": 11 * px }, svg)
            .textContent = linkLabel(names);
        }
      }
    }
    const clustered = new Set(inCluster.keys());
    // Readings laid out clear of walls, dots and each other; cluster dots are obstacles too. A
    // reading map also shows every placed point that measures it, whatever its layer.
    const measures = (p) => map && map.cls !== "lamps" && p.placed && this._readings(p)[map.cls]
      && this._value(this._readings(p)[map.cls], map.cls, map.layer) !== undefined;
    const shown = floor.points.filter((p) => !clustered.has(keyOf(p)) && (this._shown(this._cat(p)) || measures(p)));
    const labels = new Map(layoutLabels([
      ...shown.map((p) => ({ key: keyOf(p), at: [p.x, p.y], lines: this._lines(p).map((l) => l.text) })),
      ...[...clusters.values()].map((c) => ({ key: null, at: c.at, lines: [] })),
    ], { rooms: floor.rooms.map((r) => r.polygon), px, obstacles: names }).map((l) => [l.key, l]));
    const r = 9 * px;
    const taken = [...[...labels.values()].map((l) => l.box),
      ...[...shown.map((p) => [p.x, p.y]), ...[...clusters.values()].map((c) => c.at)]
        .map(([x, y]) => ({ x0: x - r, x1: x + r, y0: y - r, y1: y + r }))];
    const spots = editing ? roomNames.map((n) => n.at) : placeNames(roomNames, taken, px);
    roomNames.forEach(({ label, size }, i) => {
      const text = el("text", { class: `label${label.missing ? " missing" : ""}`, x: fmt(spots[i][0]),
        y: fmt(spots[i][1]), "font-size": size }, nameGroup);
      text.textContent = label.text;
      if (label.missing) el("title", {}, text).textContent = t(h, "card.floorplan.missing_area");
    });
    for (const point of shown) this._drawMarker(svg, point, px, editing, labels.get(keyOf(point)));
    for (const [area, c] of clusters) {
      const g = el("g", { class: "cluster", "data-kind": "cluster", "data-cluster": area,
        transform: `translate(${fmt(c.at[0])} ${fmt(c.at[1])})` }, svg);
      el("circle", { r: 11 * px }, g);
      el("text", { "font-size": 12 * px, "dominant-baseline": "central" }, g).textContent = String(c.points.length);
    }
    this._clusterList(clusters);
    const picked = editing && floor.points.find((p) => keyOf(p) === this._picked);
    const room = picked && floor.rooms.find((r) => pointInPolygon([picked.x, picked.y], r.polygon));
    if (room) drawWallDistances(svg, el, { hass: h, t, poly: room.polygon, pt: [picked.x, picked.y], px });
    const ghost = this._drag?.ghost;
    if (ghost) {
      const g = el("g", { class: "marker ghost", transform: `translate(${fmt(ghost.at[0])} ${fmt(ghost.at[1])})` }, svg);
      el("circle", { class: "shape", r: 7 * px }, g);
      el("text", { y: 22 * px, "font-size": 13 * px }, g).textContent = ghost.label;
    }
  }

  // Dots that would cover each other, as clusters of two or more: unplaced points by the room they
  // stand in (key: the area id), and placed points closer on screen than STACK_PX to one another
  // (a stack, key "at:" and its first point's key): zooming in parts them.
  _clusters(floor) {
    const byRoom = new Map();
    const placed = [];
    for (const point of floor.points) {
      if (!this._shown(this._cat(point))) continue;
      if (point.placed) {
        placed.push(point);
        continue;
      }
      const room = floor.rooms.find((r) => pointInPolygon([point.x, point.y], r.polygon));
      const key = room?.area_id ?? "";
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key).push(point);
    }
    // Single linkage: a dot within reach of any dot of a stack is in that stack.
    const reach = STACK_PX * this._px();
    const parent = placed.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    placed.forEach((a, i) => placed.forEach((b, j) => {
      if (j > i && Math.hypot(a.x - b.x, a.y - b.y) <= reach) parent[root(j)] = root(i);
    }));
    const stacks = new Map();
    placed.forEach((p, i) => {
      if (!stacks.has(root(i))) stacks.set(root(i), []);
      stacks.get(root(i)).push(p);
    });
    for (const points of stacks.values()) {
      const first = [...points].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1))[0];
      byRoom.set(`at:${keyOf(first)}`, points);
    }
    const out = new Map();
    for (const [area, points] of byRoom) {
      if (points.length < 2) continue;
      const at = [0, 1].map((i) => points.reduce((sum, p) => sum + (i ? p.y : p.x), 0) / points.length);
      out.set(area, { points, at });
    }
    return out;
  }

  // The open cluster's devices beside its dot: drag one out to where it stands, tap one to pick it.
  _clusterList(clusters) {
    const list = this.shadowRoot.querySelector(".cluster-list");
    const open = this._openCluster != null && clusters.get(this._openCluster);
    // Out of the way while a device is being dragged (from the list or the plan); back after the drop.
    if (open && this._drag?.kind === "point" && this._drag.moved) {
      list.hidden = true;
      return;
    }
    if (!open || this._mode !== "edit") {
      list.hidden = true;
      list.innerHTML = "";
      if (!open) this._openCluster = null;
      return;
    }
    const h = this._hass;
    const items = [...open.points].sort((a, b) => pointName(h, a).localeCompare(pointName(h, b)));
    list.innerHTML = items.map((p) => `<div class="item" data-point="${esc(keyOf(p))}" title="${esc(t(h, "card.floorplan.tray.drag"))}">`
      + `${dotHtml(categoryById(this._cat(p).id))}${esc(this._pointNames(p).join(" + "))}</div>`).join("");
    list.hidden = false;
    const { s, ox, oy } = frame(this._view, this._rect());
    const svgLeft = this._rect().left - this.shadowRoot.querySelector(".body").getBoundingClientRect().left;
    list.style.left = `${svgLeft + ox + (open.at[0] - this._view.x) * s + 16}px`;
    list.style.top = `${oy + (open.at[1] - this._view.y) * s - 12}px`;
  }

  _drawMarker(svg, point, px, editing, label = null) {
    const h = this._hass;
    const cls = ["marker"];
    if (editing && !point.placed) cls.push("unplaced");
    if (editing && keyOf(point) === this._picked) cls.push("picked");
    const cat = this._cat(point);
    cls.push(`cat-${cat.id}`);
    const g = el("g", { class: cls.join(" "), "data-kind": "point",
      "data-key": keyOf(point), transform: `translate(${fmt(point.x)} ${fmt(point.y)})` }, svg);
    const shape = { class: "shape", style: `fill: ${colourOf(categoryById(cat.id))}` };
    if (cat.marker === "square") el("rect", { ...shape, x: -6 * px, y: -6 * px, width: 12 * px, height: 12 * px }, g);
    else if (cat.marker === "diamond") {
      el("polygon", { ...shape, points: [[0, -8], [8, 0], [0, 8], [-8, 0]].map(([x, y]) => `${fmt(x * px)},${fmt(y * px)}`).join(" ") }, g);
    } else el("circle", { ...shape, r: 7 * px }, g);
    // Further roles (what else it senses) as rings in their colours, two at most.
    cat.roles.slice(1, 3).forEach((id, i) => el("circle", { class: "role-ring", r: (11 + 3 * i) * px,
      style: `stroke: ${colourOf(categoryById(id))}` }, g));
    // Its readings where the layout put them (relative to the dot), with a leader when moved away.
    // The lamps map: a lamp that is on glows by its brightness, one that is off is grey.
    const lamp = this._mapNow?.cls === "lamps" && point.device_id && lampOf(h, this._lamps, [point.device_id, ...(point.also || [])]);
    if (lamp?.on) g.insertBefore(el("circle", { class: "glow", r: (18 + lamp.brightness * 0.4) * px }), g.firstChild);
    else if (lamp) g.querySelector(".shape").setAttribute("style", "fill: var(--disabled-text-color, #888)");
    if (!label) return;
    const [x0, y0] = [label.cx - point.x, label.top - point.y];
    if (label.leader) {
      const near = [Math.max(label.box.x0, Math.min(point.x, label.box.x1)) - point.x,
        Math.max(label.box.y0, Math.min(point.y, label.box.y1)) - point.y];
      el("line", { class: "leader", x1: 0, y1: 0, x2: fmt(near[0]), y2: fmt(near[1]) }, g);
    }
    this._lines(point).forEach(({ text, main }, i) => {
      el("text", { class: main ? "value main" : "value", x: fmt(x0), y: fmt(y0 + (11 + 15 * i) * px),
        "font-size": 13 * px }, g).textContent = text;
    });
  }

  // The hatching of a room without a sensor and a lamp's glow, sized for this zoom.
  _defs(svg, px) {
    const defs = el("defs", {}, svg);
    const w = 8 * px;
    const hatch = el("pattern", { id: "fp-hatch", width: w, height: w, patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)" }, defs);
    el("line", { class: "hatch-line", x1: 0, y1: 0, x2: 0, y2: w, "stroke-width": 2 * px }, hatch);
    const glow = el("radialGradient", { id: "fp-glow" }, defs);
    el("stop", { offset: 0, "stop-color": "#fff3b0", "stop-opacity": 0.8 }, glow);
    el("stop", { offset: 1, "stop-color": "#fdd835", "stop-opacity": 0 }, glow);
  }

  // The heat of a reading map inside each room, hatched where a room has no such reading. Kept while
  // its samples are the same: a hover redraws the plan, and a few thousand cells are not free.
  _drawHeat(svg, floor, map) {
    const samples = floor.points.filter((p) => p.placed).flatMap((p) => {
      const id = this._readings(p)[map.cls];
      const value = id && this._value(id, map.cls, map.layer);
      return value === undefined ? [] : [{ at: [p.x, p.y], value }];
    });
    // Rooms of one open space share their readings.
    const index = new Map(floor.rooms.map((r, i) => [r.area_id, i]));
    const groups = openSpaces(floor).map((g) => g.map((area) => index.get(area)));
    const key = JSON.stringify([map.cls, samples, groups]);
    if (this._heatCache?.key !== key || this._heatCache.floor !== floor) {
      const g = el("g", { class: "heat" });
      const { cells, empty } = heat(floor.rooms.map((r) => r.polygon), samples, STEP_M, groups);
      // Cells on a slanted or offset wall overhang it: each room's cells are clipped to the room.
      const defs = el("defs", {}, g);
      const byRoom = new Map();
      floor.rooms.forEach((room, i) => {
        const clip = el("clipPath", { id: `fp-room-${i}` }, defs);
        el("polygon", { points: room.polygon.map((p) => p.join(",")).join(" ") }, clip);
        byRoom.set(i, el("g", { "clip-path": `url(#fp-room-${i})` }, g));
      });
      for (const c of cells) {
        el("rect", { x: fmt(c.x), y: fmt(c.y), width: STEP_M + 0.01, height: STEP_M + 0.01,
          fill: colourAt(map.cls, c.value) }, byRoom.get(c.room));
      }
      for (const i of empty) el("polygon", { class: "no-sensor", points: floor.rooms[i].polygon.map((p) => p.join(",")).join(" ") }, g);
      // The walls again, over the heat.
      for (const room of floor.rooms) el("polygon", { class: "wall", points: room.polygon.map((p) => p.join(",")).join(" ") }, g);
      this._heatCache = { key, floor, g };
    }
    svg.appendChild(this._heatCache.g);
  }

  // A marker's lines: its readings, or on a map the map's (the shown one first and marked main).
  _lines(point) {
    const map = this._mapNow;
    if (!map || !this._config.values) return this._values(point).map((text) => ({ text, main: false }));
    const h = this._hass;
    if (map.cls === "lamps") {
      const lamp = point.device_id && lampOf(h, this._lamps, [point.device_id, ...(point.also || [])]);
      return lamp ? [{ text: lamp.on ? `${lamp.brightness} %` : t(h, "card.floorplan.maps.off"), main: false }] : [];
    }
    const ids = this._readings(point);
    const plant = this._cat(point).id === "plants";
    return labelClasses(map.layer, plant, map.cls).flatMap((cls) => {
      const value = ids[cls] && this._value(ids[cls], cls, map.layer);
      return value === undefined ? [] : [{ text: formatValue(cls, value), main: cls === map.cls }];
    });
  }

  // Readings only: names would collide once a plan holds many sensors, so they are in the tooltip.
  // A plant's value is its name, so a plant is a dot.
  _values(point) {
    if (!this._config.values) return [];
    const h = this._hass;
    const name = pointName(h, point);
    return pointEntities(point, this._entities).map((id) => valueText(h, id)).filter((v) => v !== "—" && v !== name);
  }

  _valueStamp() {
    const floor = this._floor;
    if (!floor || !this._hass) return "";
    const ids = this._config.values ? floor.points.flatMap((p) => pointEntities(p, this._entities)) : [];
    // A map also follows a plant's sensors and the lamps.
    if (this._map()) {
      for (const p of floor.points) {
        ids.push(...Object.values(this._readings(p)));
        if (p.device_id && this._lamps.has(p.device_id)) ids.push(this._lamps.get(p.device_id));
      }
    }
    // The first line (the language and the areas' names) changes labels and selects: a full render.
    // An area created from the card arrives in a later hass and must show by name. JSON keeps a
    // name with a newline on that first line.
    const areas = Object.values(this._hass.areas || {}).map((a) => [a.area_id, a.name]).sort();
    return [JSON.stringify([this._hass.language, areas]),
      ids.map((id) => this._hass.states?.[id]?.state).join("|")].join("\n");
  }

  // ---- buttons and selects -----------------------------------------------------------------

  _onClick(e) {
    // A pointer tap on a group's summary toggles it in _onUp; a keyboard one (detail 0) here.
    const group = e.target.closest?.(".tray summary[data-group]");
    if (group) {
      e.preventDefault();
      if (e.detail === 0) this._toggleGroup(group.getAttribute("data-group"));
      return;
    }
    const button = e.target.closest?.("button[data-action]");
    if (!button || button.disabled) return;
    const action = button.getAttribute("data-action");
    const centre = [this._view.x + this._view.w / 2, this._view.y + this._view.h / 2];
    if (action === "zoom_in") this._view = zoomAt(this._view, 1 / ZOOM_STEP, centre);
    else if (action === "zoom_out") this._view = zoomAt(this._view, ZOOM_STEP, centre);
    else if (action === "fit") this._view = fitView(this._floor);
    else if (action === "edit") this._enterEdit();
    else if (action === "cancel") this._leaveEdit(this._base);
    else if (action === "save") return void this._save();
    else if (action === "tool") {
      this._tool = button.getAttribute("data-tool");
      this._resetPicks();
    } else if (action === "create_area") return void this._createArea();
    else if (action === "close_room") this._edit(closeRoom(this._doc, this._floorId, this._selected));
    else if (action === "separate") {
      this._edit(separatePoint(this._doc, this._floorId, this._picked, button.getAttribute("data-device")));
    } else if (action === "map") {
      this._maps = { ...this._maps, [this._mapLayer()]: button.getAttribute("data-map") };
      save(MAP_KEY, this._maps);
    } else if (action === "day") {
      this._day = button.getAttribute("data-day") === "1";
      save(AGG_KEY, this._day);
      this._heatCache = null;
    } else if (action === "layer" && this._one) {
      this._chosen = button.getAttribute("data-layer");
      save(CHOSEN_KEY, this._chosen);
    } else if (action === "layer") {
      const id = button.getAttribute("data-layer");
      if (this._hidden.has(id)) this._hidden.delete(id);
      else this._hidden.add(id);
      save(HIDDEN_KEY, [...this._hidden]);
    }
    this._render();
  }

  _toggleGroup(key) {     // the tray alone: _render would rebuild the area panel and drop a half-typed name
    this._trayOpen.set(key, !this._groupOpen(key));
    this.shadowRoot.querySelector(".tray").innerHTML = this._trayHtml();
  }

  _onChange(e) {
    if (e.target.matches?.("select.floor")) {
      this._floorId = this._doc.floors.find((f) => String(f.floor_id) === e.target.value)?.floor_id ?? this._floorId;
      this._doc = autoPlace(this._doc, this._hass, this._floorId, [...this._cands.values()]);
      this._view = fitView(this._floor);
      this._resetPicks();
      this._render();
    } else if (e.target.matches?.("select.area") && e.target.value) {
      this._applyArea(e.target.value);
    } else if (e.target.matches?.("select.category") && this._picked) {
      const own = this._cands?.get(this._picked)?.category ?? null;
      this._edit(setPointCategory(this._doc, this._floorId, this._picked, e.target.value, own));
      this._render();
    }
  }

  _enterEdit() {
    this._mode = "edit";
    this._tool = "move";
    this._say(null);
    this._doc = autoPlace(this._doc, this._hass, this._floorId, [...this._cands.values()]);
  }

  _leaveEdit(doc) {
    this._mode = "view";
    this._doc = doc;
    this._resetPicks();
  }

  _resetPicks() {
    this._picks = [];
    this._selected = null;
    this._picked = null;
    this._openCluster = null;
    this._pendingSplit = null;
  }

  // Apply a refusable edit: a refused one leaves the plan as it was and says so.
  _edit(next) {
    if (next) {
      this._doc = next;
      this._say(null);
    } else this._say("card.floorplan.refused");
    return !!next;
  }

  _applyArea(areaId) {
    if (this._pendingSplit) {
      const { area, a, b } = this._pendingSplit;
      this._edit(splitRoom(this._doc, this._floorId, area, a, b, areaId));
      this._resetPicks();
    } else if (this._selected) {
      if (this._edit(linkRoom(this._doc, this._floorId, this._selected, areaId))) this._selected = areaId;
    }
    this._render();
  }

  async _createArea() {
    const input = this.shadowRoot.querySelector(".area-panel input");
    const name = input?.value.trim();
    if (!name) return;
    try {
      const entry = await this._hass.callWS({ type: "config/area_registry/create", name });
      this._applyArea(entry.area_id);
    } catch (err) {
      this._say("card.floorplan.create_failed", { error: err?.message || String(err) });
      this._render();
    }
  }

  async _save() {
    this._saving = true;
    this._render();
    try {
      const config = await this._hass.callWS({ type: "lovelace/config", url_path: URL_PATH });
      if (JSON.stringify(extract(config)) !== JSON.stringify(this._loaded)) {
        this._say("card.floorplan.changed_elsewhere");
        return;
      }
      await this._hass.callWS({ type: "lovelace/config/save", url_path: URL_PATH, config: withPlan(config, this._doc) });
      this._loaded = this._doc;
      this._base = this._doc;
      this._leaveEdit(this._doc);
      this._say("card.floorplan.saved");
    } catch (err) {
      this._say("card.floorplan.save_failed", { error: err?.message || String(err) });
    } finally {
      this._saving = false;
      this._render();
    }
  }

  // ---- pointer: zoom, pan, drag, pick ------------------------------------------------------

  _at(e) {
    return toPlan(this._view, this._rect(), e.clientX, e.clientY);
  }

  _onWheel(e) {
    if (this._status !== "ready") return;
    e.preventDefault();
    this._view = zoomAt(this._view, e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, this._at(e));
    this._render();
  }

  _onDown(e) {
    if (this._status !== "ready" || (e.button !== undefined && e.button !== 0)) return;
    this._showTip(null);
    this._hoverKey = null;
    const item = e.target.closest?.(".tray [data-key], .tray summary[data-group]");
    const listed = e.target.closest?.(".cluster-list [data-point]");
    const inSvg = this._svg.contains(e.target) || e.target === this._svg;
    if (!item && !listed && !inSvg) return;
    if (listed) e.preventDefault();
    // No text selection or native drag from the tray: either would take the pointer away (pointercancel).
    if (item) e.preventDefault();
    // A primary pointer going down means no other is down: drop any whose pointerup never came.
    if (e.isPrimary) this._pointers.clear();
    this._pointers.set(e.pointerId, [e.clientX, e.clientY]);
    try {
      // On the svg even for a tray drag: the tray is redrawn while editing and would drop the capture.
      this._svg.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic or already released pointer cannot be captured; the events still bubble here
    }
    if (this._pointers.size === 2) {
      this._drag = { kind: "pinch", dist: this._pinchDist() };
      return;
    }
    const editing = this._mode === "edit";
    const target = e.target.closest?.("[data-kind]");
    const kind = target?.getAttribute("data-kind");
    const base = { start: [e.clientX, e.clientY], view0: this._view, moved: false };
    // A dot from a cluster's list or from the plan: drawn picked on the first move or the pointerup.
    const pointKey = listed?.getAttribute("data-point")
      ?? (editing && this._tool === "move" && kind === "point" ? target.getAttribute("data-key") : null);
    if (pointKey) {
      this._drag = { ...base, kind: "point", key: pointKey };
      this._picked = pointKey;
      this._selected = null;
    } else if (item) {
      const group = item.getAttribute("data-group");
      this._drag = group ? { ...base, kind: "group", key: group } : { ...base, kind: "tray", key: item.getAttribute("data-key") };
      this._drag.label = this._dragLabel(this._drag);     // the ghost's, fixed for the drag
    } else if (editing && this._tool === "move" && kind === "corner") {
      this._drag = { ...base, kind: "corner", area: target.getAttribute("data-area"), index: Number(target.getAttribute("data-index")) };
    } else {
      // A cluster drags like the background (a pan); a tap on it opens its list.
      const cluster = kind === "cluster" ? target.getAttribute("data-cluster") : null;
      this._drag = { ...base, kind: "pan", area: kind === "room" ? target.getAttribute("data-area") : null, cluster };
    }
  }

  // ---- tooltip: a sensor's photo (a plant's, from the plants component), name and readings ------

  _hover(e) {
    const marker = e.target.closest?.("g.marker[data-key]:not(.ghost)");
    const cluster = !marker && e.target.closest?.("g.cluster");
    const item = !marker && !cluster && e.target.closest?.(".tray [data-key], .cluster-list [data-point]");
    const hoverKey = marker ? marker.getAttribute("data-key") : null;
    if (hoverKey !== this._hoverKey) {
      this._hoverKey = hoverKey;     // its registry links show while it is hovered
      this._drawSvg(this._status === "ready" && this._mode === "edit");
    }
    // The tooltip's content is worked out only when the pointer reaches something new.
    const key = marker ? `m:${hoverKey}` : cluster ? `c:${cluster.getAttribute("data-cluster")}`
      : item?.hasAttribute("data-point") ? `l:${item.getAttribute("data-point")}` : item ? `t:${item.getAttribute("data-key")}` : null;
    if (key && key === this._tipKey) return void this._showTip({ key }, e);
    let content = null;
    if (marker) {
      const point = this._floor?.points.find((p) => keyOf(p) === hoverKey);
      if (point) {
        content = { key, name: this._pointNames(point).join(" + "), ids: pointEntities(point, this._entities),
          presence: presenceEntities(this._hass, point), roles: this._cat(point).roles };
      }
    } else if (cluster) {
      const c = this._clusters(this._floor).get(cluster.getAttribute("data-cluster"));
      if (c) content = { key, ids: [],
        name: c.points.map((p) => this._pointNames(p).join(" + ")).join(", ") };
    } else if (item?.hasAttribute("data-point")) {
      const point = this._floor?.points.find((p) => keyOf(p) === item.getAttribute("data-point"));
      if (point) content = { key, name: this._pointNames(point).join(" + "), ids: pointEntities(point, this._entities) };
    } else if (item) {
      const c = this._cands.get(item.getAttribute("data-key"));
      if (c) content = { key, name: candidateName(this._hass, c), ids: c.entities };
    }
    this._showTip(content, e);
  }

  // A point's device name, then those of the devices joined to it as the same hardware.
  _pointNames(point) {
    const h = this._hass;
    const joined = (point.also || []).map((id) => h.devices?.[id]?.name_by_user || h.devices?.[id]?.name || id);
    return [pointName(h, point), ...joined];
  }

  _showTip(content, e) {
    const tip = this.shadowRoot?.querySelector(".tip");
    if (!tip) return;
    if (!content) {
      tip.hidden = true;
      this._tipKey = null;
      return;
    }
    if (content.key !== this._tipKey) {
      const h = this._hass;
      const pic = content.ids.map((id) => h.states?.[id]?.attributes?.entity_picture).find(safePicture);
      const values = content.ids.map((id) => valueText(h, id)).filter((v) => v !== "—" && v !== content.name);
      // Presence and contact sensors by name: "Presence: Detected".
      const named = (id) => h.entities?.[id]?.name || h.entities?.[id]?.original_name
        || h.states?.[id]?.attributes?.friendly_name || id;
      const presence = (content.presence || []).map((id) => `${named(id)}: ${valueText(h, id)}`);
      // What the dot's colour and rings mean: its category, then "Also senses:" each further role.
      const lang = h?.language;
      const [main, ...further] = (content.roles || []).map(categoryById).filter(Boolean);
      const roles = main ? `<div class="tip-roles"><span class="dot" style="background: ${colourOf(main)}"></span>`
        + `${esc(categoryName(main, lang))}${further.map((c) => `<br><span class="ring" style="border-color: ${colourOf(c)}"></span>`
          + `${esc(t(h, "card.floorplan.roles.also"))} ${esc(categoryName(c, lang))}`).join("")}</div>` : "";
      tip.innerHTML = (pic ? `<img src="${esc(pic)}" alt="">` : "")
        + `<div class="tip-name">${esc(content.name)}</div>` + roles
        + [...values, ...presence].map((v) => `<div class="tip-value">${esc(v)}</div>`).join("");
      this._tipKey = content.key;
    }
    tip.hidden = false;
    // Below right of the pointer, flipped to its left near the card's right edge.
    const body = this.shadowRoot.querySelector(".body").getBoundingClientRect();
    const x = e.clientX - body.left;
    const y = e.clientY - body.top;
    const flip = x + 12 + (tip.offsetWidth || 0) > body.width;
    tip.style.left = `${flip ? Math.max(0, x - 12 - tip.offsetWidth) : x + 12}px`;
    tip.style.top = `${y + 12}px`;
  }

  // The point under a plan position, within a marker's reach on screen: a device point (a tray drop
  // joins it), or any placed point but `except` (a dragged dot stacks onto it).
  _pointAt([x, y], except = null, devices = true) {
    const reach = 10 * this._px();
    return this._floor?.points.find((p) => keyOf(p) !== except && (devices ? p.device_id : p.placed)
      && Math.hypot(p.x - x, p.y - y) <= reach) ?? null;
  }

  // Where a dot may stand: inside a room, else on the nearest wall.
  _inRooms(pt) {
    return insideRooms(pt, (this._floor?.rooms || []).map((r) => r.polygon));
  }

  _dragLabel(d) {
    if (d.kind === "group") {
      const g = trayGroups(this._doc, this._hass, [...this._cands.values()]).find((x) => x.key === d.key);
      return g ? `${g.name ?? t(this._hass, "card.floorplan.tray.no_room")} (${g.items.length})` : "";
    }
    const c = this._cands.get(d.key);
    return c ? candidateName(this._hass, c) : "";
  }

  // Whether the pointer is over the plan (a tray drop lands only there).
  _overSvg(e) {
    const r = this._rect();
    return e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
  }

  _pinchDist() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  }

  _onMove(e) {
    const d = this._drag;
    if (!d) this._hover(e);
    if (!d || !this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (d.kind === "pinch") {
      if (this._pointers.size < 2) return;
      const dist = this._pinchDist();
      const [a, b] = [...this._pointers.values()];
      const mid = toPlan(this._view, this._rect(), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      this._view = zoomAt(this._view, d.dist / dist, mid);
      d.dist = dist;
      this._drawSvg(this._mode === "edit");
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) < TAP_PX) return;
    d.moved = true;
    if (d.kind === "pan") {
      const { s } = frame(d.view0, this._rect());
      if (!s) return;
      this._view = { ...d.view0, x: d.view0.x - (e.clientX - d.start[0]) / s, y: d.view0.y - (e.clientY - d.start[1]) / s };
    } else if (d.kind === "point") {
      this._doc = movePoint(this._doc, this._floorId, d.key, this._inRooms(this._at(e))) ?? this._doc;
    } else if (d.kind === "corner") {
      this._doc = moveCorner(this._doc, this._floorId, d.area, d.index, this._at(e)) ?? this._doc;
    } else {      // a tray item or group is dropped on pointerup; until then a ghost shows where
      d.ghost = this._overSvg(e) ? { at: this._at(e), label: d.label } : null;
    }
    // The plan alone while dragging: the bar, panels and tray follow on the pointerup.
    this._drawSvg(this._mode === "edit");
  }

  _onUp(e, cancelled = false) {
    if (!this._pointers.delete(e.pointerId)) return;
    const d = this._drag;
    if (d?.kind === "pinch") {
      if (!this._pointers.size) this._drag = null;
      return;
    }
    this._drag = null;
    if (d?.ghost) this._drawSvg(this._mode === "edit");
    if (!d || cancelled) return;
    if (d.kind === "corner" && d.moved) {
      const pt = snapCorner(this._floor, d.area, this._at(e));
      this._doc = moveCorner(this._doc, this._floorId, d.area, d.index, pt) ?? this._doc;
    } else if (d.kind === "group" && !d.moved) {
      return void this._toggleGroup(d.key);
    } else if ((d.kind === "tray" || d.kind === "group") && d.moved) {
      if (this._overSvg(e)) {
        const cands = [...this._cands.values()];
        const g = d.kind === "group" && trayGroups(this._doc, this._hass, cands).find((x) => x.key === d.key);
        const c = d.kind === "tray" && tray(this._doc, this._hass, cands).find((x) => x.key === d.key);
        // A device dropped on a marker is the same hardware as that point (an amplifier's Cast device).
        const onto = c && c.kind === "device" && this._pointAt(this._at(e));
        if (g) this._edit(addPoints(this._doc, this._floorId, g.items, this._inRooms(this._at(e))));
        else if (onto) this._edit(joinPoint(this._doc, this._floorId, keyOf(onto), c));
        else if (c) this._edit(addPoint(this._doc, this._floorId, c, this._inRooms(this._at(e))));
      }
    } else if (d.kind === "pan" && !d.moved && this._mode === "edit" && d.cluster != null) {
      this._openCluster = d.cluster;
    } else if (d.kind === "pan" && !d.moved && this._mode === "edit") {
      this._openCluster = null;
      this._tap(this._at(e), d.area);
    } else if (d.kind === "point" && !d.moved) {
      // A tap picks the point: its distances to the walls and its category show.
    } else if (d.kind === "point") {
      // Dropped on another placed dot: onto it exactly, so the two stack into one dot with a list.
      const at = this._inRooms(this._at(e));
      const onto = this._pointAt(at, d.key, false);
      this._doc = movePoint(this._doc, this._floorId, d.key, onto ? [onto.x, onto.y] : at) ?? this._doc;
    } else if (!d.moved) return;
    this._render();
  }

  // A tap in edit mode: what it does depends on the tool. In view mode taps do nothing.
  _tap(pt, area) {
    if (this._tool === "move") {
      this._selected = area && area !== this._selected ? area : null;
      this._picked = null;
    } else if (this._tool === "join") {
      if (!area) return;
      this._picks = [...this._picks, area];
      if (this._picks.length === 2) {
        const [keep, drop] = this._picks;
        this._picks = [];
        if (keep !== drop) this._edit(joinRooms(this._doc, this._floorId, keep, drop));
      }
    } else if (this._tool === "open") {
      if (!area) return;
      this._picks = [...this._picks, area];
      if (this._picks.length === 2) {
        const [a, b] = this._picks;
        this._picks = [];
        if (a !== b) this._edit(openRooms(this._doc, this._floorId, a, b));
      }
    } else if (this._tool === "split") {
      const wall = nearestWall(this._floor, pt, PICK_PX * this._px());
      if (!wall) return;
      this._picks = [...this._picks, wall];
      if (this._picks.length === 2) this._startSplit();
    }
  }

  // Two wall points: the room is the one both lie on whose inside holds the line's middle (a shared
  // wall belongs to both rooms). The new half's area is chosen in the area panel.
  _startSplit() {
    const [a, b] = this._picks;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const room = this._floor.rooms.find((r) => snapToEdge(r.polygon, a, 1e-6) && snapToEdge(r.polygon, b, 1e-6)
      && pointInPolygon(mid, r.polygon));
    if (!room) {
      this._picks = [];
      this._say("card.floorplan.refused");
      return;
    }
    this._pendingSplit = { area: room.area_id, a, b };
  }

  _onDblClick(e) {
    if (this._mode !== "edit" || this._tool !== "move") return;
    const target = e.target.closest?.("[data-kind]");
    const kind = target?.getAttribute("data-kind");
    const area = target?.getAttribute("data-area");
    if (kind === "corner") {
      this._edit(removeCorner(this._doc, this._floorId, area, Number(target.getAttribute("data-index"))));
    } else if (kind === "edge") {
      const i = Number(target.getAttribute("data-edge"));
      const poly = this._floor.rooms.find((r) => r.area_id === area).polygon;
      const hit = snapToEdge([poly[i], poly[(i + 1) % poly.length]], this._at(e), Infinity);
      this._edit(insertCorner(this._doc, this._floorId, area, i, gridOnWall(poly, i, hit.pt)));
    } else return;
    this._render();
  }
}

if (!customElements.get("floorplan-card")) customElements.define("floorplan-card", FloorplanCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "floorplan-card")) {
  window.customCards.push({
    type: "floorplan-card",
    name: t(null, "card.floorplan.name"),
    description: t(null, "card.floorplan.description"),
  });
}
