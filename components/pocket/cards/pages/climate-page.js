// The Climate & air page (mockup media-climate-settings.html, the middle phone), on the page
// contract of pages/index.js:
//   - advice cards, only while a limit is crossed now (lib/climate.js adviceOf: "open a window" for
//     a poor CO2 or VOC, a poor air reading by name, too cold / warm / dry / humid per side), each
//     opening the trend of its reading; nothing about what might come;
//   - summary squares, one size in a two-column grid as every widget grid: Inside and Outside (the
//     areas of that type, SPEC-038 §3.9, lib/areas.js typed: the range of their main temperatures
//     in the worst one's colour; Inside's line how many are out of range, Outside's the humidity
//     when one sensor makes it; "No areas assigned" or "Main sensor not set" in place of a value),
//     each opening the sheet of its areas (or Settings → Areas when none has the type); Air (the
//     home's air score, lib/climate.js homeAir, with its level and arrow), opening its trend;
//   - the weather (lib/weather.js): today and the next days as a strip, opening the forecast sheet;
//     only when the config names a weather entity;
//   - a Temp / Humidity / Air switch, remembered per person (settings field climateView);
//   - every area with the chosen reading: its value in its level's colour
//     with its trend arrow, on a bar of its band (lib/climate.js readingBand: the comfort range
//     shaded, or the air's good / fair / poor with their marks) and a marker at the value. A row
//     opens its trend.
// render() builds the parts once; update() patches them, and rebuilds the advice or the list only
// when what they hold changes (another view, an advice coming or going).

import { roomLevels } from "../lib/attention.js";
import { numberOf, toneOf, levelKey } from "../lib/level.js";
import { trendNow } from "../lib/trend.js";
import { areasOf, typed } from "../lib/areas.js";
import { AIR_READINGS, readingsOf, entityOf, valueOf } from "../lib/checks.js";
import { adviceOf, homeAir, readingBand, VIEWS } from "../lib/climate.js";
import { typedSpec } from "../lib/detail-sheets.js";
import { trendSpec } from "../lib/trend-sheet.js";
import { forecastSpec } from "../lib/weather.js";
import { reportError } from "../lib/report.js";
import {
  el, setText, setAttr, setArrow, setLine, coalesce, number, temperature, percent, readingText, pluralOf,
} from "../lib/page-kit.js";

const RANK = { poor: 0, fair: 1, good: 2 };
const ADVICE_ICONS = {
  open_window: "mdi:window-open-variant", air_poor: "mdi:air-filter", too_warm: "mdi:thermometer-high",
  too_cold: "mdi:thermometer-low", too_dry: "mdi:water-off-outline", too_humid: "mdi:water",
};
// Below a comfort range --cold, above it --warm (the Ramka's convention), poor air --bad.
const ADVICE_TONES = { open_window: "poor", air_poor: "poor", too_warm: "warm", too_cold: "cold", too_dry: "cold", too_humid: "warm" };
const SQUARES = ["inside", "outside", "air"];

const STYLE = `
  .climate .top { padding: 4px 4px 8px; }
  .climate .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .climate .advice { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .climate .advice:empty { display: none; }
  .climate .tip { box-sizing: border-box; width: 100%; min-height: 56px; margin: 0; padding: 10px 12px;
                  display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: var(--fg);
                  background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--bad);
                  border-radius: 16px; cursor: pointer; }
  .climate .tip.cold { border-left-color: var(--cold); }
  .climate .tip.warm { border-left-color: var(--warm); }
  .climate .tip .ic { --mdc-icon-size: 22px; color: var(--bad); flex: 0 0 auto; }
  .climate .tip.cold .ic { color: var(--cold); }
  .climate .tip.warm .ic { color: var(--warm); }
  .climate .tip .tx { flex: 1; min-width: 0; }
  .climate .t1 { display: block; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .climate .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
  .climate .chev { flex: 0 0 auto; color: var(--mut); font-size: 18px; }
  .climate .squares { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr)); grid-auto-rows: 1fr; gap: 10px; }
  .climate .squares > * { min-width: 0; }
  /* No min-height: an explicit one drops aspect-ratio's automatic minimum, and text that wraps
     would spill out; without it a square grows with its content (the row, 1fr, with it). */
  .climate .sq { box-sizing: border-box; width: 100%; aspect-ratio: 1 / .62; align-self: stretch;
                 margin: 0; padding: 12px; container-type: inline-size;
                 display: flex; flex-direction: column; justify-content: space-between; text-align: left;
                 font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
                 border-radius: 18px; cursor: pointer; }
  .climate .sq .head { font-size: 11.5px; color: var(--mut); }
  .climate .sq.note .num { font-size: 15px; font-weight: 600; color: var(--mut); }
  .climate .big { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; font-size: 24px;
                  font-size: clamp(16px, 15cqi, 24px); font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
  .climate .arrow { font-size: 16px; font-weight: 400; color: var(--mut); letter-spacing: 0; }
  .climate .lab { display: block; min-height: 15px; font-size: 11.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
  .climate .muted { opacity: .55; }
  .climate .lv-good { color: var(--ok); }
  .climate .lv-fair { color: var(--warn); }
  .climate .lv-poor { color: var(--bad); }
  .climate .lv-cold { color: var(--cold); }
  .climate .lv-warm { color: var(--warm); }
  .climate .sec { font-size: 12.5px; font-weight: 600; margin: 18px 4px 8px; color: var(--mut);
                  text-transform: uppercase; letter-spacing: .5px; }
  .climate .wx { box-sizing: border-box; width: 100%; min-height: 44px; margin: 0; padding: 12px 8px;
                 display: block; font: inherit; color: var(--fg); background: var(--card);
                 border: 1px solid var(--line); border-radius: 18px; cursor: pointer; }
  .climate .seg { display: flex; gap: 2px; margin: 18px 0 8px; padding: 3px; border-radius: 12px; background: var(--chip); }
  .climate .seg button { flex: 1; min-width: 44px; min-height: 44px; margin: 0; padding: 0 4px; border: 0; border-radius: 9px;
                         background: none; color: var(--fg); font: inherit; font-size: 13px; cursor: pointer; }
  .climate .seg button[aria-pressed="true"] { background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .1); }
  .climate .rows { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .climate .rows:empty { display: none; }
  .climate .row { box-sizing: border-box; width: 100%; min-height: 56px; margin: 0; padding: 10px 12px;
                  display: block; text-align: left; font: inherit; color: var(--fg); background: var(--card);
                  border: 0; border-top: 1px solid var(--line); }
  .climate .row:first-child { border-top: 0; }
  .climate button.row { cursor: pointer; }
  .climate .rh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .climate .nm { min-width: 0; }
  .climate .nm .an { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .climate .nm .rd { font-size: 12.5px; color: var(--mut); margin-left: 6px; }
  .climate .val { flex: 0 0 auto; display: flex; align-items: baseline; gap: 4px; font-size: 15px; font-weight: 600; }
  .climate .bar { position: relative; display: block; height: 8px; margin: 8px 0 3px; border-radius: 4px; background: var(--chip); }
  .climate .bar .z { position: absolute; top: 0; bottom: 0; border-radius: 4px; }
  .climate .bar .z.good { background: var(--ok); background: color-mix(in srgb, var(--ok) 32%, var(--card)); }
  .climate .bar .z.fair { background: var(--warn); background: color-mix(in srgb, var(--warn) 32%, var(--card)); }
  .climate .bar .z.poor { background: var(--bad); background: color-mix(in srgb, var(--bad) 32%, var(--card)); }
  .climate .bar .mk { position: absolute; top: -2px; width: 2px; height: 12px; margin-left: -1px; background: var(--warn); }
  .climate .bar .mk.poor { background: var(--bad); }
  .climate .bar .at { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px;
                      background: var(--fg); }
  .climate .empty { color: var(--mut); font-size: 15px; margin: 16px 0; text-align: center; }
  .climate [hidden] { display: none; }
  .climate button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

const areaName = (ctx, area) => (area.outside ? ctx.t("card.pocket.area.outside") : area.name);
const viewOf = (parts, ctx) => {
  const chosen = parts.view ?? ctx.settings?.climateView;
  return VIEWS.includes(chosen) ? chosen : VIEWS[0];
};

export function render(ctx) {
  const root = el("section", "climate");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <div class="advice" role="list"></div>
    <div class="squares">
      ${SQUARES.map((name) => `<button class="sq" type="button" data-square="${name}" hidden><span class="head"></span>
        <span class="value"><span class="big"><span class="num"></span><span class="arrow" hidden></span></span><span class="lab"></span></span></button>`).join("")}
    </div>
    <div class="weather" hidden>
      <div class="sec wx-title"></div>
      <button class="wx" type="button"><pocket-forecast mode="strip"></pocket-forecast></button>
    </div>
    <div class="seg" role="group">
      ${VIEWS.map((view) => `<button type="button" data-view="${view}" aria-pressed="false"></button>`).join("")}
    </div>
    <div class="rows"></div>
    <p class="empty" hidden></p>`;

  const parts = {
    ctx, view: null, adviceKey: null, rowsKey: null, cells: [],
    title: root.querySelector(".top b"),
    advice: root.querySelector(".advice"),
    squares: Object.fromEntries([...root.querySelectorAll(".sq")].map((sq) => [sq.dataset.square, sq])),
    weather: root.querySelector(".weather"),
    wxTitle: root.querySelector(".wx-title"),
    forecast: root.querySelector("pocket-forecast"),
    seg: root.querySelector(".seg"),
    rows: root.querySelector(".rows"),
    empty: root.querySelector(".empty"),
  };
  for (const [name, sq] of Object.entries(parts.squares)) {
    sq.addEventListener("click", () => {
      if ((name === "inside" || name === "outside") && !typed(parts.ctx.hass, parts.ctx.config, name).areas.length) {
        parts.ctx.navigate("#/settings/areas", { from: "climate" });
        return;
      }
      const spec = squareSheet(parts.ctx, name);
      if (spec) parts.ctx.openSheet?.(spec);
    });
  }
  root.querySelector(".wx").addEventListener("click", () => parts.ctx.openSheet?.(forecastSpec(parts.ctx)));
  for (const button of parts.seg.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view === viewOf(parts, parts.ctx)) return;
      parts.view = view;
      update(root, parts.ctx);
      // Shown at once; remembered for the person. A save that fails says so and keeps the view.
      Promise.resolve(parts.ctx.saveSettings?.({ climateView: view }))
        .catch(() => reportError(root, "card.pocket.settings.error"));
    });
  }
  // One redraw per frame however many trend answers land (lib/trend.js calls each widget once).
  parts.onTrend = coalesce(() => { if (root.isConnected) update(root, parts.ctx); });
  root._climate = parts;
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._climate;
  parts.ctx = ctx;
  setText(parts.title, ctx.t("card.pocket.climate.title"));
  updateAdvice(parts, ctx);
  updateSquares(parts, ctx);
  parts.weather.hidden = !ctx.config.weather;
  setText(parts.wxTitle, ctx.t("card.pocket.weather.title"));
  if (ctx.config.weather) parts.forecast.ctx = ctx;
  const view = viewOf(parts, ctx);
  setAttr(parts.seg, "aria-label", ctx.t("card.pocket.climate.view.label"));
  for (const button of parts.seg.querySelectorAll("button")) {
    setText(button, ctx.t(`card.pocket.climate.view.${button.dataset.view}`));
    setAttr(button, "aria-pressed", String(button.dataset.view === view));
  }
  updateRows(parts, ctx, view);
}

// --- advice -------------------------------------------------------------------------------------

function adviceText(ctx, item) {
  const what = item.advice === "air_poor" ? ctx.t(`card.pocket.reading.${item.reading}.poor`)
    : ctx.t(`card.pocket.climate.advice.${item.advice}`);
  return ctx.t("card.pocket.home.pill", { room: item.area.name, message: what });
}

function updateAdvice(parts, ctx) {
  const items = adviceOf(ctx.hass, ctx.config);
  const key = JSON.stringify(items.map((item) => [item.area.id, item.advice, item.reading]));
  if (key !== parts.adviceKey) {
    parts.adviceKey = key;
    parts.tips = items.map((item) => {
      const tip = el("button", `tip ${ADVICE_TONES[item.advice]}`,
        `<ha-icon class="ic"></ha-icon><span class="tx"><span class="t1"></span><span class="t2"></span></span><span class="chev">›</span>`);
      tip.type = "button";
      tip.setAttribute("role", "listitem");
      tip.querySelector("ha-icon").setAttribute("icon", ADVICE_ICONS[item.advice]);
      tip.addEventListener("click", () => {
        const spec = trendSpec(parts.ctx, item.area, item.reading);
        if (spec) parts.ctx.openSheet?.(spec);
      });
      return { tip, item };
    });
    parts.advice.replaceChildren(...parts.tips.map(({ tip }) => tip));
  }
  for (const { tip, item } of parts.tips) {
    setText(tip.querySelector(".t1"), adviceText(ctx, item));
    const unit = ctx.hass?.states?.[entityOf(item.area, item.reading)]?.attributes?.unit_of_measurement;
    setText(tip.querySelector(".t2"), ctx.t("card.pocket.climate.advice_value", {
      reading: ctx.t(`card.pocket.trend.reading.${item.reading}`),
      value: readingText(ctx, item.reading, valueOf(ctx.hass, item.area, item.reading), unit) }));
  }
}

// --- squares ------------------------------------------------------------------------------------

const resultIn = (ctx, area, reading) =>
  area ? roomLevels(ctx.hass, area, ctx.config.thresholds).find((found) => found.reading === reading)?.result ?? null : null;

function squareSheet(ctx, name) {
  if (name === "inside" || name === "outside") return typedSpec(ctx, name);
  if (name === "air") return trendSpec(ctx, homeAir(ctx.hass, ctx.config)?.room, "score");
  return null;
}

function setSquare(parts, ctx, name, { shown, value, muted, result, entity, reading, line = [] }) {
  const sq = parts.squares[name];
  sq.hidden = !shown;
  if (!shown) return;
  setText(sq.querySelector(".head"), ctx.t(`card.pocket.climate.square.${name}`));
  const big = sq.querySelector(".big");
  const tone = toneOf(result);
  const className = tone ? `big lv-${tone}` : "big";
  if (big.className !== className) big.className = className;
  const num = big.querySelector(".num");
  setText(num, value);
  num.classList.toggle("muted", !!muted);
  setArrow(big.querySelector(".arrow"), ctx, entity ? trendNow(ctx.hass, entity, reading, parts.onTrend) : null);
  setLine(sq.querySelector(".lab"), line);
}

function updateSquares(parts, ctx) {
  const { hass, config } = ctx;
  for (const type of ["inside", "outside"]) {
    const group = typed(hass, config, type);
    let value = ctx.t("card.pocket.areas.none_assigned");
    if (group.areas.length && !group.measured.length) value = ctx.t("card.pocket.areas.sensor_not_set");
    else if (group.measured.length) {
      const { min, max } = group;
      value = min == null ? ctx.t("card.pocket.format.none")
        : number(ctx, min, 1) === number(ctx, max, 1) ? temperature(ctx, min)
          : ctx.t("card.pocket.format.temperature_range", { min: number(ctx, min, 1), max: number(ctx, max, 1) });
    }
    const results = group.measured.map(({ area }) => resultIn(ctx, area, "temperature")).filter(Boolean);
    const worst = [...results].sort((a, b) => RANK[a.level] - RANK[b.level])[0] ?? null;
    const line = [];
    if (type === "inside" && results.length) {
      const out = results.filter((result) => result.level !== "good").length;
      line.push({ text: out ? ctx.t(`card.pocket.climate.out_of_range.${pluralOf(ctx, out)}`, { count: out })
        : ctx.t("card.pocket.climate.all_in_range") });
    }
    if (type === "outside" && group.measured.length === 1) {
      const humidity = valueOf(hass, group.measured[0].area, "humidity");
      if (humidity != null) line.push({ text: percent(ctx, humidity) });
      if (worst) line.push({ text: ctx.t(`card.pocket.reading.temperature.${levelKey(worst)}`) });
    }
    setSquare(parts, ctx, type, { shown: true, value, muted: group.min == null, result: worst,
      entity: group.entity, reading: "temperature", line });
    parts.squares[type].classList.toggle("note", !group.measured.length);
  }

  const air = homeAir(hass, config);
  const airResult = air?.result ?? null;
  setSquare(parts, ctx, "air", { shown: !!air,
    value: air?.value == null ? ctx.t("card.pocket.format.none") : number(ctx, air.value, 0), muted: air?.value == null,
    result: airResult, entity: air?.entity, reading: "score",
    line: airResult ? [{ text: ctx.t(`card.pocket.square.air.score.${airResult.level}`) }] : [] });
}

// --- the list -----------------------------------------------------------------------------------

// The rows of a view: [{area, reading}] in the home's order (air: each area's air readings in turn).
function rowsOf(ctx, view) {
  const areas = areasOf(ctx.config, ctx.t);
  const readings = view === "air" ? AIR_READINGS : [view];
  return areas.flatMap((area) => readingsOf(area).filter((reading) => readings.includes(reading))
    .map((reading) => ({ area, reading })));
}

function rowCell(parts, ctx, { area, reading }) {
  const air = AIR_READINGS.includes(reading);
  const opens = !!trendSpec(ctx, area, reading);
  const node = el(opens ? "button" : "div", "row",
    `<span class="rh"><span class="nm"><span class="an"></span><span class="rd"></span></span>
       <span class="val"><span class="num"></span><span class="arrow" hidden></span></span></span>
     <span class="bar" hidden>${air ? `<i class="z"></i><i class="z"></i><i class="z"></i><i class="mk"></i><i class="mk"></i>`
       : `<i class="z"></i>`}<i class="at"></i></span>`);
  if (opens) {
    node.type = "button";
    node.addEventListener("click", () => {
      const spec = trendSpec(parts.ctx, area, reading);
      if (spec) parts.ctx.openSheet?.(spec);
    });
  }
  node.dataset.area = area.id;
  node.dataset.reading = reading;
  return {
    node, area, reading, air,
    name: node.querySelector(".an"), what: node.querySelector(".rd"), num: node.querySelector(".num"),
    arrow: node.querySelector(".arrow"), bar: node.querySelector(".bar"),
    zones: [...node.querySelectorAll(".z")], marks: [...node.querySelectorAll(".mk")], at: node.querySelector(".at"),
  };
}

const setStyle = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };

function patchRow(parts, ctx, cell) {
  const { hass } = ctx;
  const { area, reading } = cell;
  setText(cell.name, areaName(ctx, area));
  setText(cell.what, cell.air ? ctx.t(`card.pocket.trend.reading.${reading}`) : "");
  const value = valueOf(hass, area, reading);
  const unit = hass?.states?.[entityOf(area, reading)]?.attributes?.unit_of_measurement;
  setText(cell.num, readingText(ctx, reading, value, unit));
  const tone = toneOf(resultIn(ctx, area, reading));
  const className = ["num", tone && `lv-${tone}`, value == null && "muted"].filter(Boolean).join(" ");
  if (cell.num.className !== className) cell.num.className = className;
  setArrow(cell.arrow, ctx, trendNow(hass, entityOf(area, reading), reading, parts.onTrend));

  const band = readingBand(hass, ctx.config, area, reading);
  cell.bar.hidden = !band;
  if (!band) return;
  band.zones.forEach((zone, i) => {
    const node = cell.zones[i];
    if (!node) return;
    const name = `z ${zone.level}`;
    if (node.className !== name) node.className = name;
    setStyle(node, "left", `${zone.from}%`);
    setStyle(node, "width", `${Math.max(0, zone.to - zone.from)}%`);
  });
  band.marks.forEach((mark, i) => {
    const node = cell.marks[i];
    if (!node) return;
    const name = `mk ${mark.level}`;
    if (node.className !== name) node.className = name;
    setStyle(node, "left", `${mark.at}%`);
  });
  cell.at.hidden = band.at == null;
  if (band.at != null) setStyle(cell.at, "left", `${band.at}%`);
}

function updateRows(parts, ctx, view) {
  const rows = rowsOf(ctx, view);
  const key = JSON.stringify([view, rows.map((row) => [row.area.id, row.reading])]);
  if (key !== parts.rowsKey) {
    parts.rowsKey = key;
    parts.cells = rows.map((row) => rowCell(parts, ctx, row));
    parts.rows.replaceChildren(...parts.cells.map((cell) => cell.node));
  }
  for (const cell of parts.cells) patchRow(parts, ctx, cell);
  parts.empty.hidden = rows.length > 0;
  setText(parts.empty, rows.length ? "" : ctx.t("card.pocket.climate.empty"));
}
