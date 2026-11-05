// The Power page (#/power), on the page contract of pages/index.js. It needs no input: every meter
// comes from Home Assistant's registries (lib/power.js, the way an area's All sensors are found).
//   - squares, one size in a two-column grid as every widget grid: Now (lib/power.js powerNow: the
//     sum of the power meters that measure separate loads, and how many), opening the meters sheet
//     (powerSheet below: each counted meter, each opening its trend); Today (lib/energy.js: today's
//     kWh from Home Assistant's Energy dashboard, the grid's import or the devices'), opening the
//     trend of its first statistic when that is an entity; each hidden while it has nothing;
//   - every area with meters (the pocket's areas first, then HA's other areas, then the entities
//     in no area), its devices under it by name, a row per sensor of class power, apparent power,
//     power factor, energy, current or voltage: the name without the device's in front, the value
//     as Home Assistant words it and the trend arrow of the last hour (none for energy, a counter
//     that only rises); each row opens its trend sheet;
//   - with no meter at all, one line says so.
// render() builds the parts once; update() patches the values, and rebuilds the list only when the
// meters or their grouping change.

import { powerSensors, powerNow, classOf, entityName } from "../lib/power.js";
import { todayNow } from "../lib/energy.js";
import { sensorValue } from "../lib/sensors.js";
import { sensorSpec } from "../lib/sensor-list.js";
import { trendNow } from "../lib/trend.js";
import { DETAIL_STYLE } from "../lib/detail-sheets.js";
import { el, setText, setAttr, setArrow, setLine, coalesce, number, pluralOf } from "../lib/page-kit.js";

const NO_ARROW = new Set(["energy"]);

const STYLE = `
  .power .top { padding: 4px 4px 8px; }
  .power .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .power .squares { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 10px; }
  .power .squares > * { min-width: 0; }
  .power .squares:not(:has(.sq:not([hidden]))) { display: none; }
  .power .sq { box-sizing: border-box; width: 100%; aspect-ratio: 1 / .62; align-self: stretch;
               margin: 0; padding: 12px; container-type: inline-size;
               display: flex; flex-direction: column; justify-content: space-between; text-align: left;
               font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
               border-radius: 18px; cursor: pointer; }
  .power .sq .head { font-size: 11.5px; color: var(--mut); }
  .power .big { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; font-size: 24px;
                font-size: clamp(16px, 15cqi, 24px); font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
  .power .lab { display: block; min-height: 15px; font-size: 11.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
  .power .sec { font-size: 12.5px; font-weight: 600; margin: 18px 4px 8px; color: var(--mut);
                text-transform: uppercase; letter-spacing: .5px; overflow-wrap: anywhere; }
  .power .rows { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: var(--card); }
  .power .dev { padding: 10px 12px 2px; font-size: 12.5px; font-weight: 600; color: var(--mut); overflow-wrap: anywhere;
                border-top: 1px solid var(--line); }
  .power .rows > .dev:first-child { border-top: 0; }
  .power .row { box-sizing: border-box; width: 100%; min-height: 44px; margin: 0; padding: 6px 12px;
                display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left;
                font: inherit; color: var(--fg); background: none; border: 0; border-top: 1px solid var(--line);
                cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .power .rows > .row:first-child, .power .dev + .row { border-top: 0; }
  .power .row .nm { font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
  .power .row .val { flex: 0 0 auto; max-width: 55%; display: flex; align-items: baseline; gap: 4px;
                     font-size: 15px; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
  .power .arrow { font-size: 15px; font-weight: 400; color: var(--mut); }
  .power .empty { color: var(--mut); font-size: 15px; margin: 32px 0; text-align: center; }
  .power [hidden] { display: none; }
  .power button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

// The name of a group's area: the pocket area's (the Outside in words), else Home Assistant's,
// else "No area".
export function areaLabel(ctx, group) {
  if (group.area) return group.area.outside ? ctx.t("card.pocket.area.outside") : group.area.name;
  if (group.areaId) return ctx.hass?.areas?.[group.areaId]?.name ?? group.areaId;
  return ctx.t("card.pocket.power.no_area");
}

// Watts in words: up to 1 000 W whole watts, above that kW with two digits (one from 10 kW).
export function wattsText(ctx, value) {
  if (value == null) return ctx.t("card.pocket.format.none");
  if (Math.abs(value) < 1000) return ctx.t("card.pocket.trend.value", { value: number(ctx, value, 0), unit: "W" });
  const kw = value / 1000;
  return ctx.t("card.pocket.trend.value", { value: number(ctx, kw, Math.abs(kw) < 10 ? 2 : 1), unit: "kW" });
}

const arrowOf = (ctx, id, onReady) => {
  const kind = classOf(ctx.hass, id);
  return NO_ARROW.has(kind) ? null : trendNow(ctx.hass, id, kind, onReady);
};

export function render(ctx) {
  const root = el("section", "power");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <div class="squares">
      ${["now", "today"].map((name) => `<button class="sq" type="button" data-square="${name}" hidden><span class="head"></span>
        <span class="value"><span class="big"><span class="num"></span></span><span class="lab"></span></span></button>`).join("")}
    </div>
    <div class="list"></div>
    <p class="empty" hidden></p>`;
  const parts = {
    ctx, key: null, rows: [], names: [], devs: [],
    title: root.querySelector(".top b"),
    now: root.querySelector('[data-square="now"]'),
    today: root.querySelector('[data-square="today"]'),
    list: root.querySelector(".list"),
    empty: root.querySelector(".empty"),
  };
  parts.now.addEventListener("click", () => parts.ctx.openSheet?.(powerSpec(parts.ctx)));
  parts.today.addEventListener("click", () => {
    const id = parts.todayEntity;
    if (id) parts.ctx.openSheet?.(sensorSpec(parts.ctx, id, parts.ctx.t("card.pocket.power.today"),
      parts.ctx.t(`card.pocket.power.from.${parts.todaySource}`)));
  });
  parts.onTrend = coalesce(() => { if (root.isConnected) update(root, parts.ctx); });
  root._power = parts;
  update(root, ctx);
  return root;
}

function rebuild(parts, groups) {
  parts.rows = [];
  parts.names = [];
  parts.devs = [];
  parts.list.replaceChildren(...groups.map((group) => {
    const box = el("div", "area");
    box.dataset.area = group.areaId ?? "";
    const name = el("div", "sec");
    parts.names.push({ node: name, group });
    const rows = el("div", "rows");
    for (const device of group.devices) {
      if (device.name) {
        const dev = el("div", "dev");
        parts.devs.push({ node: dev, device });
        rows.append(dev);
      }
      for (const id of device.entities) {
        const row = el("button", "row", `<span class="nm"></span><span class="val"><span class="num"></span><span class="arrow" hidden></span></span>`);
        row.type = "button";
        row.dataset.entity = id;
        row.addEventListener("click", () => parts.ctx.openSheet?.(sensorSpec(parts.ctx, id,
          entityName(parts.ctx.hass, id, device.name), areaLabel(parts.ctx, group))));
        parts.rows.push({ id, device, row, name: row.querySelector(".nm"), num: row.querySelector(".num"),
          arrow: row.querySelector(".arrow") });
        rows.append(row);
      }
    }
    box.append(name, rows);
    return box;
  }));
}

export function update(root, ctx) {
  const parts = root._power;
  parts.ctx = ctx;
  const { hass } = ctx;
  setText(parts.title, ctx.t("card.pocket.power.title"));
  const groups = powerSensors(hass, ctx.config);
  const key = JSON.stringify(groups.map((g) => [g.areaId, g.devices.map((d) => [d.device, d.entities])]));
  if (key !== parts.key) {
    parts.key = key;
    rebuild(parts, groups);
  }
  for (const { node, group } of parts.names) setText(node, areaLabel(ctx, group));
  for (const { node, device } of parts.devs) setText(node, device.name);
  for (const cell of parts.rows) {
    setText(cell.name, entityName(hass, cell.id, cell.device.name));
    setText(cell.num, sensorValue(hass, cell.id, ctx.t));
    setArrow(cell.arrow, ctx, arrowOf(ctx, cell.id, parts.onTrend));
  }
  updateSquares(parts, ctx, groups);
  parts.empty.hidden = groups.length > 0;
  setText(parts.empty, groups.length ? "" : ctx.t("card.pocket.power.empty"));
}

function updateSquares(parts, ctx, groups) {
  const now = powerNow(ctx.hass, groups);
  parts.now.hidden = !now;
  setText(parts.now.querySelector(".head"), ctx.t("card.pocket.power.now"));
  if (now) {
    setText(parts.now.querySelector(".num"), wattsText(ctx, now.watts));
    const count = now.entities.length;
    setLine(parts.now.querySelector(".lab"), [{ text: ctx.t(`card.pocket.power.meters.${pluralOf(ctx, count)}`, { count }) }]);
  }
  const today = todayNow(ctx.hass, parts.onTrend);
  parts.today.hidden = !today;
  setText(parts.today.querySelector(".head"), ctx.t("card.pocket.power.today"));
  if (today) {
    setText(parts.today.querySelector(".num"), ctx.t("card.pocket.trend.value", {
      value: number(ctx, today.kwh, today.kwh < 10 ? 2 : 1), unit: "kWh" }));
    setLine(parts.today.querySelector(".lab"), [{ text: ctx.t(`card.pocket.power.from.${today.source}`) }]);
    // A statistic of an entity (sensor.x) has a trend; an external one (domain:x) has none.
    parts.todayEntity = today.stats.find((id) => !id.includes(":") && ctx.hass?.states?.[id]) ?? null;
    parts.todaySource = today.source;
  } else {
    parts.todayEntity = null;
  }
  setAttr(parts.today, "aria-disabled", String(!parts.todayEntity));
}

// --- the meters sheet: what the Now square adds up ----------------------------------------------

export function powerSpec(ctx) {
  return { kind: "power", title: ctx.t("card.pocket.power.now") };
}

function drawSheet(parts, ctx) {
  const groups = powerSensors(ctx.hass, ctx.config);
  const now = powerNow(ctx.hass, groups);
  const ids = now?.entities ?? [];
  const where = new Map();
  for (const group of groups) for (const device of group.devices) {
    for (const id of device.entities) where.set(id, { group, device });
  }
  const key = JSON.stringify(ids);
  if (key !== parts.key) {
    parts.key = key;
    parts.cells = ids.map((id) => {
      const node = el("button", "drow", `<span class="dname"><span class="r"></span><span class="lt"></span></span>
        <span class="dval"><span class="num"></span><span class="arrow" hidden></span></span>`);
      node.type = "button";
      node.dataset.entity = id;
      node.addEventListener("click", () => {
        const at = where.get(id);
        parts.ctx.openSheet?.(sensorSpec(parts.ctx, id, entityName(parts.ctx.hass, id, at?.device?.name),
          at ? areaLabel(parts.ctx, at.group) : ""), { stack: true });
      });
      return { id, node, name: node.querySelector(".r"), line: node.querySelector(".lt"),
        num: node.querySelector(".num"), arrow: node.querySelector(".arrow") };
    });
    const rows = el("div", "rows");
    rows.append(...parts.cells.map((c) => c.node));
    parts.list.replaceChildren(...(ids.length ? [rows] : []));
  }
  for (const cell of parts.cells) {
    const at = where.get(cell.id);
    setText(cell.name, at?.device?.name ?? entityName(ctx.hass, cell.id, null));
    setText(cell.line, at ? areaLabel(ctx, at.group) : "");
    setText(cell.num, sensorValue(ctx.hass, cell.id, ctx.t));
    setArrow(cell.arrow, ctx, trendNow(ctx.hass, cell.id, "power", parts.onReady));
  }
  setText(parts.subtitle, now ? wattsText(ctx, now.watts) : "");
  setText(parts.rule, ctx.t("card.pocket.power.rule"));
  parts.empty.hidden = ids.length > 0;
  setText(parts.empty, ids.length ? "" : ctx.t("card.pocket.power.empty"));
}

function updateSheet(root, ctx) {
  const parts = root._powerSheet;
  parts.ctx = ctx;
  setText(parts.title, parts.spec.title ?? "");
  drawSheet(parts, ctx);
}

export const powerSheet = {
  render(ctx, spec) {
    const root = el("div", "detail power-sheet");
    root.innerHTML = `<style>${DETAIL_STYLE}</style>
      <div class="dtitle"><b></b><span></span></div>
      <p class="empty rule"></p>
      <div class="list"></div>
      <p class="empty none" hidden></p>`;
    const parts = { root, spec, ctx, key: null, cells: [],
      title: root.querySelector(".dtitle b"), subtitle: root.querySelector(".dtitle span"),
      rule: root.querySelector(".rule"), list: root.querySelector(".list"), empty: root.querySelector(".none") };
    parts.onReady = coalesce(() => { if (root.isConnected) updateSheet(root, parts.ctx); });
    root._powerSheet = parts;
    updateSheet(root, ctx);
    return root;
  },
  update: (root, ctx) => updateSheet(root, ctx),
};
