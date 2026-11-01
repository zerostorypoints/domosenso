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

import { createT } from "./lib/i18n.js";
import { STYLE } from "./lib/style.js";
import { zoomAt, snapToEdge, pointInPolygon, widestRow } from "./lib/geometry.js";
import {
  supported, emptyPlan, autoPlace, tray, trayGroups, roomLabel, movePoint, moveCorner, insertCorner, removeCorner,
  splitRoom, joinRooms, linkRoom, withPlan, extract, addPoint, addPoints, candidateName, pointName,
} from "./lib/plan.js";
import { fitView, frame, toPlan, snapCorner, gridOnWall, nearestWall, entityMap, pointEntities, valueText } from "./lib/view.js";
import { trayHtml } from "./lib/tray.js";
import { drawGrid, drawDims, drawWallDistances } from "./lib/measure.js";
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

// A room name's screen size: LABEL_PX unless its estimated width (0.55 em a character) would pass 90 %
// of the room's widest run, `width` metres at `px` metres per screen pixel.
function labelSize(text, width, px) {
  const needed = String(text).length * 0.55 * LABEL_PX * px;
  const room = width * 0.9;
  return needed <= room ? LABEL_PX : Math.max(LABEL_MIN_PX, (LABEL_PX * room) / needed);
}

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (parent) parent.appendChild(node);
  return node;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const keyOf = (p) => p.device_id ?? p.entity_id;
// Only a path on this Home Assistant or an http(s) URL is shown as a photo.
const safePicture = (url) => typeof url === "string" && /^(\/(?!\/)|https?:\/\/)/.test(url);
const fmt = (v) => String(Math.round(v * 1e6) / 1e6);

class FloorplanCard extends HTMLElement {
  setConfig(config) {
    this._config = { edit: true, values: true, ...config };
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
    if (this._hass) this._load();
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: 8, min_columns: 6, min_rows: 4 };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._entities = entityMap(hass);
    if (!this.shadowRoot) this._build();
    if (first) {
      this._load();
      return;
    }
    // hass is set for every state change in Home Assistant: redraw only what changed. A new reading
    // redraws the plan alone, so a half-typed area name or an open select survives it.
    const stamp = this._valueStamp();
    if (stamp === this._stamp) return;
    if (stamp.split("\n")[0] !== this._stamp?.split("\n")[0]) this._render();
    else {
      this._drawSvg(this._status === "ready" && this._mode === "edit");
      this._stamp = stamp;
    }
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
        <div class="bar"></div>
        <div class="area-panel"></div>
        <div class="body"><svg xmlns="${SVG_NS}" preserveAspectRatio="xMidYMid meet"></svg><div class="tray"></div><div class="tip" hidden></div></div>
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
    $(".bar").innerHTML = ready ? this._barHtml(editing) : "";
    $(".area-panel").innerHTML = editing ? this._areaPanelHtml() : "";
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
    let html = btn("zoom_in", "+", t(h, "card.floorplan.zoom_in"))
      + btn("zoom_out", "−", t(h, "card.floorplan.zoom_out"))
      + btn("fit", t(h, "card.floorplan.fit"));
    html += '<span class="spacer"></span>';
    if (!editing) {
      if (this._config.edit && h?.user?.is_admin) html += btn("edit", t(h, "card.floorplan.edit"));
      return html;
    }
    if (this._doc.floors.length > 1) {
      const name = (id) => h.floors?.[id]?.name || id;
      html += `<select class="floor" aria-label="${esc(t(h, "card.floorplan.floor"))}">${this._doc.floors.map((f) =>
        `<option value="${esc(f.floor_id)}" ${f.floor_id === this._floorId ? "selected" : ""}>${esc(name(f.floor_id))}</option>`).join("")}</select>`;
    }
    for (const tool of ["move", "split", "join"]) {
      html += btn("tool", t(h, `card.floorplan.tool.${tool}`), "", `data-tool="${tool}" class="${tool === this._tool ? "on" : ""}"`);
    }
    const dirty = this._doc !== this._base;
    html += btn("cancel", t(h, "card.floorplan.cancel"), "", this._saving ? "disabled" : "");
    html += btn("save", t(h, this._saving ? "card.floorplan.saving" : "card.floorplan.save"), "",
      `class="primary" ${dirty && !this._saving ? "" : "disabled"}`);
    return html;
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
    return `<label>${esc(label)}</label>
      <select class="area"><option value="" ${target && h.areas?.[target] ? "" : "selected"} disabled>${esc(t(h, "card.floorplan.area.choose"))}</option>${options}</select>
      <input type="text" placeholder="${esc(t(h, "card.floorplan.area.new"))}">
      <button data-action="create_area">${esc(t(h, "card.floorplan.area.create"))}</button>`;
  }

  _trayHtml() {
    const groups = trayGroups(this._doc, this._hass);
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
    const floor = this._floor;
    if (this._status !== "ready" || !floor) return;
    const v = this._view;
    svg.setAttribute("viewBox", `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.w)} ${fmt(v.h)}`);
    const px = this._px();
    const h = this._hass;
    for (const room of floor.rooms) {
      const cls = ["room"];
      if (room.area_id === this._selected) cls.push("selected");
      if (this._picks.includes(room.area_id)) cls.push("picked");
      el("polygon", { class: cls.join(" "), "data-kind": "room", "data-area": room.area_id,
        points: room.polygon.map((p) => p.join(",")).join(" ") }, svg);
      const label = roomLabel(room, h);
      const spot = widestRow(room.polygon);
      const text = el("text", { class: `label${label.missing ? " missing" : ""}`, x: spot.x, y: spot.y,
        "font-size": labelSize(label.text, spot.width, px) * px }, svg);
      text.textContent = label.text;
      if (label.missing) el("title", {}, text).textContent = t(h, "card.floorplan.missing_area");
    }
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
    for (const point of floor.points) this._drawMarker(svg, point, px, editing);
    const picked = editing && floor.points.find((p) => keyOf(p) === this._picked);
    const room = picked && floor.rooms.find((r) => pointInPolygon([picked.x, picked.y], r.polygon));
    if (room) drawWallDistances(svg, el, { hass: h, t, poly: room.polygon, pt: [picked.x, picked.y], px });
    const ghost = this._drag?.ghost;
    if (ghost) {
      const g = el("g", { class: "marker ghost", transform: `translate(${fmt(ghost.at[0])} ${fmt(ghost.at[1])})` }, svg);
      el("circle", { r: 7 * px }, g);
      el("text", { class: "name", y: 22 * px, "font-size": 13 * px }, g).textContent = ghost.label;
    }
  }

  _drawMarker(svg, point, px, editing) {
    const h = this._hass;
    const cls = ["marker"];
    if (editing && !point.placed) cls.push("unplaced");
    if (editing && keyOf(point) === this._picked) cls.push("picked");
    const g = el("g", { class: cls.join(" "), "data-kind": "point",
      "data-key": keyOf(point), transform: `translate(${fmt(point.x)} ${fmt(point.y)})` }, svg);
    el("circle", { r: 7 * px }, g);
    // Readings only: names would collide once a plan holds many sensors, so they are in the tooltip.
    // A plant's value is its name, so a plant is a dot.
    const name = pointName(h, point);
    const values = this._config.values
      ? pointEntities(point, this._entities).map((id) => valueText(h, id)).filter((v) => v !== "—" && v !== name) : [];
    values.forEach((text, i) => {
      el("text", { class: "value", y: (22 + 15 * i) * px, "font-size": 13 * px }, g).textContent = text;
    });
  }

  _valueStamp() {
    const floor = this._floor;
    if (!floor || !this._hass) return "";
    const ids = this._config.values ? floor.points.flatMap((p) => pointEntities(p, this._entities)) : [];
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
    this._render();
  }

  _toggleGroup(key) {     // the tray alone: _render would rebuild the area panel and drop a half-typed name
    this._trayOpen.set(key, !this._groupOpen(key));
    this.shadowRoot.querySelector(".tray").innerHTML = this._trayHtml();
  }

  _onChange(e) {
    if (e.target.matches?.("select.floor")) {
      this._floorId = this._doc.floors.find((f) => String(f.floor_id) === e.target.value)?.floor_id ?? this._floorId;
      this._doc = autoPlace(this._doc, this._hass, this._floorId);
      this._view = fitView(this._floor);
      this._resetPicks();
      this._render();
    } else if (e.target.matches?.("select.area") && e.target.value) {
      this._applyArea(e.target.value);
    }
  }

  _enterEdit() {
    this._mode = "edit";
    this._tool = "move";
    this._say(null);
    this._doc = autoPlace(this._doc, this._hass, this._floorId);
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
    const item = e.target.closest?.(".tray [data-key], .tray summary[data-group]");
    const inSvg = this._svg.contains(e.target) || e.target === this._svg;
    if (!item && !inSvg) return;
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
    if (item?.hasAttribute("data-group")) this._drag = { ...base, kind: "group", key: item.getAttribute("data-group") };
    else if (item) this._drag = { ...base, kind: "tray", key: item.getAttribute("data-key") };
    else if (editing && this._tool === "move" && kind === "point") {
      this._drag = { ...base, kind: "point", key: target.getAttribute("data-key") };
      this._picked = this._drag.key;    // drawn on the first move or the pointerup: not under the pointer now
    }
    else if (editing && this._tool === "move" && kind === "corner") {
      this._drag = { ...base, kind: "corner", area: target.getAttribute("data-area"), index: Number(target.getAttribute("data-index")) };
    } else this._drag = { ...base, kind: "pan", area: kind === "room" ? target.getAttribute("data-area") : null };
  }

  // ---- tooltip: a sensor's photo (a plant's, from the plants component), name and readings ------

  _hover(e) {
    const marker = e.target.closest?.("g.marker[data-key]:not(.ghost)");
    const item = !marker && e.target.closest?.(".tray [data-key]");
    let content = null;
    if (marker) {
      const point = this._floor?.points.find((p) => keyOf(p) === marker.getAttribute("data-key"));
      if (point) content = { key: `m:${keyOf(point)}`, name: pointName(this._hass, point), ids: pointEntities(point, this._entities) };
    } else if (item) {
      const c = tray(this._doc, this._hass).find((x) => x.key === item.getAttribute("data-key"));
      if (c) content = { key: `t:${c.key}`, name: candidateName(this._hass, c), ids: c.entities };
    }
    this._showTip(content, e);
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
      tip.innerHTML = (pic ? `<img src="${esc(pic)}" alt="">` : "")
        + `<div class="tip-name">${esc(content.name)}</div>`
        + values.map((v) => `<div class="tip-value">${esc(v)}</div>`).join("");
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

  _dragLabel(d) {
    if (d.kind === "group") {
      const g = trayGroups(this._doc, this._hass).find((x) => x.key === d.key);
      return g ? `${g.name ?? t(this._hass, "card.floorplan.tray.no_room")} (${g.items.length})` : "";
    }
    const c = tray(this._doc, this._hass).find((x) => x.key === d.key);
    return c ? candidateName(this._hass, c) : "";
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
      this._render();
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) < TAP_PX) return;
    d.moved = true;
    if (d.kind === "pan") {
      const { s } = frame(d.view0, this._rect());
      if (!s) return;
      this._view = { ...d.view0, x: d.view0.x - (e.clientX - d.start[0]) / s, y: d.view0.y - (e.clientY - d.start[1]) / s };
    } else if (d.kind === "point") {
      this._doc = movePoint(this._doc, this._floorId, d.key, this._at(e)) ?? this._doc;
    } else if (d.kind === "corner") {
      this._doc = moveCorner(this._doc, this._floorId, d.area, d.index, this._at(e)) ?? this._doc;
    } else {      // a tray item or group is dropped on pointerup; until then a ghost shows where
      const r = this._rect();
      const inside = e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
      d.ghost = inside ? { at: this._at(e), label: this._dragLabel(d) } : null;
      this._drawSvg(true);    // the plan alone: a re-render would rebuild the tray under the pointer
      return;
    }
    this._render();
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
      const r = this._rect();
      if (e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height) {
        const g = d.kind === "group" && trayGroups(this._doc, this._hass).find((x) => x.key === d.key);
        const c = d.kind === "tray" && tray(this._doc, this._hass).find((x) => x.key === d.key);
        if (g) this._edit(addPoints(this._doc, this._floorId, g.items, this._at(e)));
        else if (c) this._edit(addPoint(this._doc, this._floorId, c, this._at(e)));
      }
    } else if (d.kind === "pan" && !d.moved && this._mode === "edit") {
      this._tap(this._at(e), d.area);
    } else if (d.kind === "point" && !d.moved) {
      return void this._drawSvg(true);    // a tap picks the point: its distances to the walls show
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
