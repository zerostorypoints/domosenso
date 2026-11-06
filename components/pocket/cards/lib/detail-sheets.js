// The detail sheets behind the widgets, shown by the shell's sheet (lib/sheet.js) for
// ctx.openSheet(spec), each on the page contract (render(ctx, spec), update(el, ctx)):
//
//   checks  {kind: "checks", title, readings?, inside?}   every reading that was checked, per area
//           (the Outside included unless inside), problems first (lib/checks.js): its name, its
//           level in words and as a dot, its value in the level's colour and its trend arrow; a row
//           opens that reading's trend sheet on top of the list (Back or close returns to it). Behind Home's "All good", its attention pills and (only
//           temperature, rooms only) its inside chip.
//   air     {kind: "air", title, subtitle, area}           every air reading of one area, the same
//           rows, in the home's order; behind the area page's Air square.
//   lights  {kind: "lights", title}                         every lamp, per room, each a
//           <pocket-light-tile> to switch or dim it: the sheet is where a light is turned on, so it
//           lists them all, not only those on. Behind Home's lights-on chip.
//   plants  {kind: "plants", title}                         every plant by area (lib/plants.js), the
//           worst first: its name, what it needs (or fine) as a dot and words; a row opens the trend
//           of its soil moisture (else its first reading with a sensor), the sensor's other
//           measurements a pick away. Behind Overview's plants widget.
//
// Every widget on Overview opens a sheet of one of two kinds: an aggregate (many sensors: a list,
// each row opening its trend; inside, lights, power, plants) or one sensor (its trend, its
// measurements a pick away; outside, air). A widget never leaves the page: pages are reached from
// Systems or the bar.
//
//   checksSpec(ctx, options?), airSpec(ctx, area), lightsSpec(ctx) -> spec   what a page passes
//
// render() builds the rows once; update() patches them, and rebuilds the list only when its rows
// or their order change. Trend arrows come from lib/trend.js trendNow: fetched once per reading
// and REFRESH_MS; the answers that land before the next frame are drawn in one redraw.

import { toneOf, levelKey } from "./level.js";
import { areasOf } from "./areas.js";
import { checksOf, areaRows, AIR_READINGS } from "./checks.js";
import { trendNow } from "./trend.js";
import { trendSpec } from "./trend-sheet.js";
import { plantsOf } from "./plants.js";
import { sensorSpec } from "./sensor-list.js";
import { el, setText, setArrow, readingText, lampsOf, shortName, coalesce } from "./page-kit.js";
import "./light-tile.js";

export const DETAIL_STYLE = `
  .detail { padding-bottom: 4px; }
  .detail .dtitle { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .detail .dtitle b { font-size: 17px; font-weight: 600; }
  .detail .dtitle span, .detail .empty { font-size: 12.5px; color: var(--mut); }
  .detail .empty { margin: 16px 0; text-align: center; font-size: 15px; }
  .detail .empty[hidden], .detail .arrow[hidden] { display: none; }
  .detail .gname { margin: 14px 4px 6px; font-size: 12.5px; font-weight: 600; color: var(--mut);
                   text-transform: uppercase; letter-spacing: .5px; }
  .detail .rows { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .detail .drow { box-sizing: border-box; width: 100%; min-height: 52px; margin: 0; padding: 8px 12px;
                  display: flex; align-items: center; gap: 10px; text-align: left; font: inherit; color: var(--fg);
                  background: var(--card); border: 0; border-top: 1px solid var(--line); }
  .detail .drow:first-child { border-top: 0; }
  .detail button.drow { cursor: pointer; }
  .detail button.drow:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .detail .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--line); }
  .detail .dname { flex: 1; min-width: 0; }
  .detail .dname .r { display: block; font-size: 15px; }
  .detail .dname .lt { display: block; font-size: 12.5px; color: var(--mut); margin-top: 1px; }
  .detail .dval { flex: 0 0 auto; display: flex; align-items: baseline; gap: 4px; font-size: 17px; font-weight: 600; }
  .detail .arrow { font-size: 15px; color: var(--mut); font-weight: 400; }
  .detail .muted { opacity: .55; }
  .detail .num.lv-good { color: var(--ok); }
  .detail .num.lv-fair { color: var(--warn); }
  .detail .num.lv-poor { color: var(--bad); }
  .detail .num.lv-cold { color: var(--cold); }
  .detail .num.lv-warm { color: var(--warm); }
  .detail .dot.lv-good { background: var(--ok); }
  .detail .dot.lv-fair { background: var(--warn); }
  .detail .dot.lv-poor { background: var(--bad); }
  .detail .dot.lv-cold { background: var(--cold); }
  .detail .dot.lv-warm { background: var(--warm); }
  .detail .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr)); grid-auto-rows: 1fr; gap: 10px; }
`;

const areaName = (ctx, area) => (area.outside ? ctx.t("card.pocket.area.outside") : area.name);

export function checksSpec(ctx, { readings, inside } = {}) {
  const spec = { kind: "checks", title: ctx.t(inside ? "card.pocket.checks.inside" : "card.pocket.checks.title") };
  if (readings) spec.readings = readings;
  if (inside) spec.inside = true;
  return spec;
}

export function airSpec(ctx, area) {
  return { kind: "air", area: area.id, title: ctx.t("card.pocket.area.air"), subtitle: areaName(ctx, area) };
}

export function lightsSpec(ctx) {
  return { kind: "lights", title: ctx.t("card.pocket.lights.title") };
}

export function plantsSpec(ctx) {
  return { kind: "plants", title: ctx.t("card.pocket.plants.title") };
}

// The sheet's frame: a title row, the list, and a line for an empty list.
function frame(spec) {
  const root = el("div", `detail ${spec.kind}`);
  root.innerHTML = `<style>${DETAIL_STYLE}</style>
    <div class="dtitle"><b></b><span></span></div>
    <div class="list"></div>
    <p class="empty" hidden></p>`;
  return {
    root, spec, listKey: null,
    title: root.querySelector(".dtitle b"), subtitle: root.querySelector(".dtitle span"),
    list: root.querySelector(".list"), empty: root.querySelector(".empty"),
  };
}

// --- reading rows (checks, air) -----------------------------------------------------------------

function readingRow(parts, area, row) {
  const node = el(row.entity ? "button" : "div", "drow",
    `<i class="dot"></i><span class="dname"><span class="r"></span><span class="lt"></span></span>
     <span class="dval"><span class="num"></span><span class="arrow" hidden></span></span>`);
  if (row.entity) {
    node.type = "button";
    node.addEventListener("click", () => {
      const spec = trendSpec(parts.ctx, area, row.reading);
      // On top of this sheet: Back or close comes back to the list, at this row.
      if (spec) parts.ctx.openSheet?.(spec, { stack: true });
    });
  }
  node.dataset.reading = row.reading;
  return {
    node, area, reading: row.reading,
    dot: node.querySelector(".dot"), name: node.querySelector(".r"), level: node.querySelector(".lt"),
    num: node.querySelector(".num"), arrow: node.querySelector(".arrow"),
  };
}

function setClass(node, base, tone, muted = false) {
  const name = [base, tone && `lv-${tone}`, muted && "muted"].filter(Boolean).join(" ");
  if (node.className !== name) node.className = name;
}

function patchRow(parts, cell, row, ctx) {
  const { hass } = ctx;
  const tone = toneOf(row.result);
  const unit = row.entity ? hass?.states?.[row.entity]?.attributes?.unit_of_measurement : undefined;
  setText(cell.name, ctx.t(`card.pocket.trend.reading.${row.reading}`));
  let level = ctx.t("card.pocket.checks.no_limits");
  if (row.value == null) level = ctx.t("card.pocket.checks.no_value");
  else if (row.result) level = ctx.t(`card.pocket.reading.${row.reading}.${levelKey(row.result)}`);
  setText(cell.level, level);
  setText(cell.num, readingText(ctx, row.reading, row.value, unit));
  setClass(cell.num, "num", tone, row.value == null);
  setClass(cell.dot, "dot", tone);
  setArrow(cell.arrow, ctx, trendNow(hass, row.entity, row.reading, parts.onReady));
}

// groups: [{area, rows, name?}]; rebuilt when the areas, rows or order change, else patched.
function drawReadings(parts, ctx, groups) {
  const key = JSON.stringify(groups.map((g) => [g.area.id, g.rows.map((r) => r.reading)]));
  if (key !== parts.listKey) {
    parts.listKey = key;
    parts.cells = [];
    parts.names = [];
    parts.list.replaceChildren(...groups.map((group) => {
      const box = el("div", "grp");
      if (group.named) {
        const name = el("div", "gname");
        parts.names.push({ node: name, area: group.area });
        box.append(name);
      }
      const rows = el("div", "rows");
      rows.append(...group.rows.map((row) => {
        const cell = readingRow(parts, group.area, row);
        parts.cells.push(cell);
        return cell.node;
      }));
      box.append(rows);
      return box;
    }));
  }
  for (const { node, area } of parts.names) setText(node, areaName(ctx, area));
  let i = 0;
  for (const group of groups) for (const row of group.rows) patchRow(parts, parts.cells[i++], row, ctx);
}

function renderReadings(ctx, spec, draw) {
  const parts = frame(spec);
  parts.ctx = ctx;
  parts.draw = draw;
  // Stable (lib/trend.js calls each waiting widget once); every row's answer that lands before
  // the next frame is drawn in one redraw (parts.redraws counts them).
  parts.redraws = 0;
  parts.onReady = coalesce(() => {
    if (!parts.root.isConnected) return;
    parts.redraws += 1;
    update(parts.root, parts.ctx);
  });
  parts.root._detail = parts;
  update(parts.root, ctx);
  return parts.root;
}

export const checks = {
  render: (ctx, spec) => renderReadings(ctx, spec, (parts, c) => {
    const groups = checksOf(c.hass, c.config, { readings: spec.readings, inside: spec.inside })
      .map((group) => ({ ...group, named: true }));
    drawReadings(parts, c, groups);
    parts.empty.hidden = groups.length > 0;
    setText(parts.empty, groups.length ? "" : c.t("card.pocket.checks.empty"));
  }),
  update: (root, ctx) => update(root, ctx),
};

export const air = {
  render: (ctx, spec) => renderReadings(ctx, spec, (parts, c) => {
    const area = areasOf(c.config).find((a) => a.id === spec.area);
    const rows = area ? areaRows(c.hass, area, c.config?.thresholds, AIR_READINGS) : [];
    drawReadings(parts, c, rows.length ? [{ area, rows }] : []);
    parts.empty.hidden = rows.length > 0;
    setText(parts.empty, rows.length ? "" : c.t("card.pocket.checks.empty"));
  }),
  update: (root, ctx) => update(root, ctx),
};

// --- lights -------------------------------------------------------------------------------------

function drawLights(parts, ctx) {
  const { hass, config } = ctx;
  const seen = new Set();
  const groups = [];
  for (const room of config.rooms ?? []) {
    const ids = lampsOf(hass, room).filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (ids.length) groups.push({ room, ids });
  }
  const key = JSON.stringify(groups.map((g) => [g.room.id, g.ids]));
  if (key !== parts.listKey) {
    parts.listKey = key;
    parts.names = [];
    parts.list.replaceChildren(...groups.map(({ room, ids }) => {
      const box = el("div", "grp");
      const name = el("div", "gname");
      parts.names.push({ node: name, room });
      const tiles = el("div", "tiles");
      tiles.append(...ids.map((id) => {
        let tile = parts.tiles.get(id);
        if (!tile) {
          tile = document.createElement("pocket-light-tile");
          parts.tiles.set(id, tile);
        }
        tile.config = { name: shortName(hass, id, room), entities: [id] };
        return tile;
      }));
      box.append(name, tiles);
      return box;
    }));
  }
  for (const { node, room } of parts.names) setText(node, room.name);
  for (const tile of parts.tiles.values()) {
    tile.t = ctx.t;
    tile.optimistic = ctx.optimistic;
    tile.offline = ctx.offline;
    tile.hass = hass;
  }
  parts.empty.hidden = groups.length > 0;
  setText(parts.empty, groups.length ? "" : ctx.t("card.pocket.lights.none"));
}

export const lights = {
  render(ctx, spec) {
    const parts = frame(spec);
    parts.ctx = ctx;
    parts.tiles = new Map();
    parts.draw = drawLights;
    parts.root._detail = parts;
    update(parts.root, ctx);
    return parts.root;
  },
  update: (root, ctx) => update(root, ctx),
};

// --- plants -------------------------------------------------------------------------------------

const PLANT_TONE = (plant) => (plant.rank <= 1 ? "lv-poor" : plant.rank === 2 ? "lv-fair" : plant.rank === 3 ? "lv-good" : "");

function drawPlants(parts, ctx) {
  const { hass } = ctx;
  const groups = plantsOf(hass, ctx.config);
  const key = JSON.stringify(groups.map((g) => [g.areaId, g.label, g.plants.map((p) => p.id)]));
  if (key !== parts.listKey) {
    parts.listKey = key;
    parts.rows = [];
    parts.list.replaceChildren(...groups.map((group) => {
      const box = el("div", "grp");
      const name = el("div", "gname");
      name.textContent = group.area ? areaName(ctx, group.area)
        : group.label || (group.areaId ? hass.areas?.[group.areaId]?.name ?? group.areaId : ctx.t("card.pocket.plants.no_area"));
      const rows = el("div", "rows");
      for (const plant of group.plants) {
        const reading = plant.readings.find((r) => r.reading === "moisture" && r.entity) ?? plant.readings.find((r) => r.entity);
        const row = el(reading ? "button" : "div", "drow",
          `<i class="dot"></i><span class="dname"><span class="r"></span><span class="lt"></span></span>`);
        if (reading) {
          row.type = "button";
          row.addEventListener("click", () => parts.ctx.openSheet?.(
            sensorSpec(parts.ctx, reading.entity, ctx.t(`card.pocket.plants.reading.${reading.reading}`), plant.name), { stack: true }));
        }
        parts.rows.push({ row, id: plant.id });
        rows.append(row);
      }
      box.append(name, rows);
      return box;
    }));
  }
  const byId = new Map(groups.flatMap((g) => g.plants).map((p) => [p.id, p]));
  for (const { row, id } of parts.rows) {
    const plant = byId.get(id);
    if (!plant) continue;
    setText(row.querySelector(".r"), plant.name);
    setText(row.querySelector(".lt"), plant.reasons.length
      ? plant.reasons.map((r) => ctx.t(`card.pocket.plants.reason.${r}`)).join(" · ")
      : ctx.t(plant.rank === 4 ? "card.pocket.plants.no_reading" : "card.pocket.plants.fine"));
    const dot = row.querySelector(".dot");
    const name = ["dot", PLANT_TONE(plant)].filter(Boolean).join(" ");
    if (dot.className !== name) dot.className = name;
  }
  parts.empty.hidden = groups.length > 0;
  setText(parts.empty, groups.length ? "" : ctx.t("card.pocket.plants.empty"));
}

export const plants = {
  render(ctx, spec) {
    const parts = frame(spec);
    parts.ctx = ctx;
    parts.draw = drawPlants;
    parts.root._detail = parts;
    update(parts.root, ctx);
    return parts.root;
  },
  update: (root, ctx) => update(root, ctx),
};

function update(root, ctx) {
  const parts = root._detail;
  parts.ctx = ctx;
  setText(parts.title, parts.spec.title ?? "");
  setText(parts.subtitle, parts.spec.subtitle ?? "");
  parts.draw(parts, ctx);
}
