// The trend sheet's content (mockup rooms.html screen 3), shown by the shell's sheet (lib/sheet.js)
// for ctx.openSheet({kind: "trend", ...}): one reading of one area over 24 h, 7 d or 30 d.
//
//   trendSpec(ctx, area, reading) -> spec | null    what a page passes to ctx.openSheet for an
//       area's reading (lib/areas.js area; reading temperature, humidity, score, co2, pm2_5, voc,
//       nox): the entity, the title and the area's name, the comfort band and the level limits
//       (climate-air's helper ids, read at run time); null when the area names no entity for it
//   render(ctx, spec) -> HTMLElement,  update(el, ctx)   on the page contract (pages/index.js)
//
// spec = {kind: "trend", entity, title, subtitle?, reading?, digits?, timeline?,
//         band?: {low?, high?},                   helper ids: the shaded comfort band (a missing
//                                                 side runs to the chart's edge)
//         level?: {kind: "range", low, high} | {kind: "rising" | "falling", fair, poor}}   helper ids
//
// The sheet shows the title and the area, the current value in its level's colour (good --ok,
// fair --warn, poor --bad; poor below a range --cold, above it --warm), the band and the span of
// the period in words, a 24 h / 7 d / 30 d switch and one SVG line (no chart library) over the
// band. Data from lib/history.js seriesOf: history for 24 h, statistics for 7 d and 30 d; while it
// loads, when it has no numbers or when the call fails, a line of text says so. render() builds
// everything once; what the data gives (its span, the timeline's share) is worked out once when it
// lands; update() patches the value and redraws the chart only when its data or band changed. A
// long series (a sensor that reports every second) is drawn from at most four points per drawing
// unit across (the first, lowest, highest and last of each), so the path stays short.
//
// timeline: true (an on/off or other non-numeric entity, lib/sensor-list.js) draws its states as a
// timeline instead of a line: one band across, a segment per state from history (lib/history.js
// statesOf; statistics hold numbers only, so 24 h and 7 d alone), "on" in the accent, any other
// state muted, unavailable or unknown left empty; the value is the state as Home Assistant words
// it, and the note how long it was on in the period.

import { level, numberOf } from "./level.js";
import { comfortOf } from "./areas.js";
import { RANGES, STATE_RANGES, seriesOf, statesOf } from "./history.js";
import { sensorValue } from "./sensors.js";
import { formatDate } from "./i18n.js";
import { el, setAttr, setText, number, temperature, percent } from "./page-kit.js";

export const RANGE_IDS = Object.keys(RANGES);
const DEFAULT_RANGE = "24h";
const W = 320;                 // the chart's drawing units; it stretches to the sheet's width
const H = 150;
const PAD = 0.08;              // room over and under the line, a share of the value span
const DIGITS = { temperature: 1, humidity: 0, score: 0, co2: 0, pm2_5: 0, voc: 0, nox: 0 };

const COMFORT = { temperature: ["temp_low", "temp_high"], humidity: ["humidity_low", "humidity_high"] };
const AIR = { score: "falling", co2: "rising", pm2_5: "rising", voc: "rising", nox: "rising" };

export const TREND_STYLE = `
  .trend { padding-bottom: 4px; }
  .trend .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .trend .title { font-size: 17px; font-weight: 600; }
  .trend .where, .trend .note, .trend .axis { font-size: 12.5px; color: var(--mut); }
  .trend .where { text-align: right; overflow-wrap: anywhere; }
  .trend .now { margin-top: 6px; }
  .trend .big { font-size: 28px; font-weight: 600; letter-spacing: -.5px; }
  .trend .note { text-align: right; }
  .trend .big.muted { opacity: .55; }
  .trend .lv-good { color: var(--ok); }
  .trend .lv-fair { color: var(--warn); }
  .trend .lv-poor { color: var(--bad); }
  .trend .lv-cold { color: var(--cold); }
  .trend .lv-warm { color: var(--warm); }
  .trend .seg { display: flex; gap: 2px; margin: 12px 0; padding: 3px; border-radius: 12px; background: var(--chip); }
  .trend .seg button { flex: 1; min-width: 44px; min-height: 44px; margin: 0; padding: 0; border: 0; border-radius: 9px;
                       background: none; color: var(--fg); font: inherit; font-size: 13px; cursor: pointer; }
  .trend .seg button[aria-pressed="true"] { background: var(--card); font-weight: 600;
                                            box-shadow: 0 1px 3px rgba(0, 0, 0, .1); }
  .trend .seg button:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .trend .chart { position: relative; height: 170px; }
  .trend svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .trend svg[hidden], .trend .band[hidden], .trend .state[hidden] { display: none; }
  .trend .band { fill: var(--ok); opacity: .12; }
  .trend .line { fill: none; stroke: var(--acc); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
  .trend .state { position: absolute; inset: 0; margin: 0; display: flex; align-items: center; justify-content: center;
                  font-size: 15px; color: var(--mut); text-align: center; }
  .trend .axis { display: flex; justify-content: space-between; margin-top: 6px; }
  .trend .tl-on { fill: var(--acc); }
  .trend .tl-other { fill: var(--line); }
`;

export function trendSpec(ctx, area, reading) {
  if (!area) return null;
  const airKind = AIR[reading];
  const entity = airKind ? area.air?.[reading] : area.climate?.[reading];
  if (!entity) return null;
  const spec = {
    kind: "trend", entity, reading,
    title: ctx.t(`card.pocket.trend.reading.${reading}`),
    subtitle: area.outside ? ctx.t("card.pocket.area.outside") : area.name,
  };
  const thresholds = ctx.config?.thresholds;
  if (airKind) {
    const limits = thresholds?.air?.[reading];
    if (limits?.fair && limits?.poor) {
      spec.level = { kind: airKind, fair: limits.fair, poor: limits.poor };
      spec.band = airKind === "rising" ? { high: limits.fair } : { low: limits.fair };
    }
  } else {
    const comfort = comfortOf(thresholds, area);
    const [low, high] = COMFORT[reading] ?? [];
    if (comfort?.[low] && comfort?.[high]) {
      spec.level = { kind: "range", low: comfort[low], high: comfort[high] };
      spec.band = { low: comfort[low], high: comfort[high] };
    }
  }
  return spec;
}

export function render(ctx, spec) {
  const root = el("div", "trend");
  root.innerHTML = `<style>${TREND_STYLE}</style>
    <div class="row"><span class="title"></span><span class="where"></span></div>
    <div class="row now"><span class="big"></span><span class="note"></span></div>
    <div class="seg" role="group">${(spec.timeline ? STATE_RANGES : RANGE_IDS).map((id) => `<button type="button" data-range="${id}"></button>`).join("")}</div>
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" hidden>
        <rect class="band" x="0" width="${W}" hidden></rect>
        <path class="line" vector-effect="non-scaling-stroke"></path>
        <g class="timeline"></g>
      </svg>
      <p class="state" role="status"></p>
    </div>
    <div class="axis"><span class="from"></span><span class="to"></span></div>`;
  const parts = {
    spec, ctx, range: DEFAULT_RANGE, data: {}, chartKey: null,
    title: root.querySelector(".title"), where: root.querySelector(".where"),
    big: root.querySelector(".big"), note: root.querySelector(".note"),
    seg: root.querySelector(".seg"), buttons: [...root.querySelectorAll(".seg button")],
    svg: root.querySelector("svg"), band: root.querySelector(".band"), line: root.querySelector(".line"),
    timeline: root.querySelector(".timeline"),
    state: root.querySelector(".state"), from: root.querySelector(".from"), to: root.querySelector(".to"),
  };
  for (const button of parts.buttons) {
    button.addEventListener("click", () => {
      if (parts.range === button.dataset.range) return;
      parts.range = button.dataset.range;
      load(root, parts);
      update(root, parts.ctx);
    });
  }
  root._trend = parts;
  load(root, parts);
  update(root, ctx);
  return root;
}

// Fetches the current range once per sheet; a switch back shows what was fetched, and tries again
// a range whose fetch failed (offline, an error) or found no websocket. An answer
// that lands after the sheet closed is dropped with it; one for a range the person has left is
// kept for a switch back, and the redraw shows the range that is current.
function load(root, parts) {
  const range = parts.range;
  if (parts.data[range] && parts.data[range].status !== "error") return;
  const hass = parts.ctx.hass;
  if (typeof hass?.callWS !== "function") {
    parts.data[range] = { status: "error" };
    return;
  }
  const now = Date.now();
  parts.data[range] = { status: "loading" };
  const entry = parts.data[range];
  (parts.spec.timeline ? statesOf : seriesOf)(hass, parts.spec.entity, range, now).then(
    (points) => Object.assign(entry, digest(parts.spec, points, now - RANGES[range].span, now)),
    () => Object.assign(entry, { status: "error" }))
    .then(() => { if (root.isConnected) update(root, parts.ctx); });
}

export function update(root, ctx) {
  const parts = root._trend;
  parts.ctx = ctx;
  const { spec } = parts;
  const { hass } = ctx;
  setText(parts.title, spec.title ?? "");
  setText(parts.where, spec.subtitle ?? "");
  setAttr(parts.seg, "aria-label", ctx.t("card.pocket.trend.period"));
  for (const button of parts.buttons) {
    setText(button, ctx.t(`card.pocket.trend.range.${button.dataset.range}`));
    setAttr(button, "aria-pressed", String(button.dataset.range === parts.range));
  }

  if (spec.timeline) {
    updateTimeline(parts, ctx);
    return;
  }
  const value = numberOf(hass, spec.entity);
  const unit = hass?.states?.[spec.entity]?.attributes?.unit_of_measurement;
  const format = (v) => valueText(ctx, spec, v, unit);
  setText(parts.big, format(value));
  const name = ["big", levelClass(value, hass, spec.level), value == null && "muted"].filter(Boolean).join(" ");
  if (parts.big.className !== name) parts.big.className = name;

  const band = { low: numberOf(hass, spec.band?.low), high: numberOf(hass, spec.band?.high) };
  const data = parts.data[parts.range];
  const span = data?.status === "ready" ? data.span : null;
  const notes = [];
  if (band.low != null && band.high != null) {
    notes.push(ctx.t("card.pocket.trend.band", { low: format(band.low), high: format(band.high) }));
  } else if (band.low != null) notes.push(ctx.t("card.pocket.trend.band_low", { low: format(band.low) }));
  else if (band.high != null) notes.push(ctx.t("card.pocket.trend.band_high", { high: format(band.high) }));
  if (span) {
    notes.push(ctx.t("card.pocket.trend.span", { range: ctx.t(`card.pocket.trend.range.${parts.range}`),
      min: format(span.min), max: format(span.max) }));
  }
  setText(parts.note, notes.join(" · "));
  drawChart(parts, ctx, data, band);
}

// A reading's value in words: temperature and humidity as everywhere in the pocket, anything else
// with its entity's unit.
function valueText(ctx, spec, value, unit) {
  if (value == null) return ctx.t("card.pocket.format.none");
  if (spec.reading === "temperature") return temperature(ctx, value);
  if (spec.reading === "humidity") return percent(ctx, value);
  const digits = spec.digits ?? DIGITS[spec.reading] ?? 1;
  const text = number(ctx, value, digits, { grouping: false });
  return unit ? ctx.t("card.pocket.trend.value", { value: text, unit }) : text;
}

function levelClass(value, hass, spec) {
  if (!spec) return null;
  const limits = spec.kind === "range"
    ? { low: numberOf(hass, spec.low), high: numberOf(hass, spec.high) }
    : { fair: numberOf(hass, spec.fair), poor: numberOf(hass, spec.poor) };
  const result = level(value, spec.kind, limits);
  if (!result) return null;
  if (result.side === "low") return "lv-cold";
  if (result.side === "high") return "lv-warm";
  return `lv-${result.level}`;
}

// What a landed answer gives, worked out once: the points in time order, the span of the numbers
// (a line) or the share of the period on and whether any state falls in it (a timeline).
function digest(spec, points, start, end) {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const entry = { status: "ready", points: sorted, start, end };
  if (spec.timeline) {
    entry.share = onShare(sorted, start, end);
    entry.has = sorted.some((p) => p.s != null && p.t <= end);
  } else entry.span = spanOf(sorted);
  return entry;
}

// The lowest and the highest number, in one pass (a spread of a long array overflows the stack).
export function spanOf(points) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points ?? []) {
    if (p.v == null) continue;
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  return min <= max ? { min, max } : null;
}

// SVG elements have no `hidden` property in Safari (only HTML elements do): setting it there is a
// plain JS property and the `hidden` attribute stays, so the chart never shows. The attribute is
// toggled instead.
export function showSvg(node, shown) {
  node.toggleAttribute("hidden", !shown);
}

function drawChart(parts, ctx, data, band) {
  const status = data?.status ?? "loading";
  const has = status === "ready" && data.span;
  let message = "";
  if (status === "loading") message = ctx.t("card.pocket.trend.loading");
  else if (status === "error") message = ctx.t("card.pocket.trend.error");
  else if (!has) message = ctx.t("card.pocket.trend.empty");
  setText(parts.state, message);
  parts.state.hidden = !message;
  showSvg(parts.svg, has);
  const dateOptions = parts.range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" };
  const locale = { locale: { language: ctx.lang } };
  setText(parts.from, has ? formatDate(locale, new Date(data.start), dateOptions) : "");
  setText(parts.to, has ? formatDate(locale, new Date(data.end), dateOptions) : "");
  if (!has) return;
  const key = JSON.stringify([parts.range, data.start, band.low, band.high]);
  if (key === parts.chartKey) return;
  parts.chartKey = key;
  const chart = chartOf(data.points, band, data.start, data.end);
  setAttr(parts.line, "d", chart.path);
  showSvg(parts.band, !!chart.band);
  if (chart.band) {
    setAttr(parts.band, "y", String(chart.band.y));
    setAttr(parts.band, "height", String(chart.band.height));
  }
}

// The line and the band in drawing units: time across, value up; the value axis spans the points
// and the band's edges, with PAD over and under. An unknown value breaks the line; the last value
// holds until the end of the period (a state lasts until it changes). More than MAX_POINTS numbers
// are thinned to the first, lowest, highest and last of each drawing unit across (thin below).
export function chartOf(points, band, start, end) {
  const edges = [band?.low, band?.high].filter((v) => v != null);
  const span = spanOf(points);
  let lo = Math.min(span?.min ?? Infinity, ...edges);
  let hi = Math.max(span?.max ?? -Infinity, ...edges);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * PAD;
  lo -= pad;
  hi += pad;
  const x = (t) => round(Math.min(W, Math.max(0, ((t - start) / (end - start)) * W)));
  const y = (v) => round(H - ((v - lo) / (hi - lo)) * H);
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const last = sorted[sorted.length - 1];
  if (last && last.v != null && last.t < end) sorted.push({ t: end, v: last.v });
  const series = sorted.length > MAX_POINTS ? thin(sorted, start, end) : sorted;
  let path = "";
  let pen = false;
  for (const p of series) {
    if (p.v == null) { pen = false; continue; }
    path += `${pen ? "L" : "M"}${x(p.t)} ${y(p.v)} `;
    pen = true;
  }
  let shaded = null;
  if (edges.length) {
    const top = band.high != null ? y(band.high) : 0;
    const bottom = band.low != null ? y(band.low) : H;
    shaded = { y: top, height: round(Math.max(0, bottom - top)) };
  }
  return { path: path.trim(), band: shaded };
}

const round = (n) => Math.round(n * 10) / 10;

const MAX_POINTS = 2 * W;      // below this the series is drawn as it is

// The points of a long series that a line W units wide can show: per unit across, the first, the
// lowest, the highest and the last number in time order; a gap (null) is kept, so the line still
// breaks there.
export function thin(series, start, end) {
  const out = [];
  let bucket = null;
  let first = null;
  let low = null;
  let high = null;
  let last = null;
  const close = () => {
    if (first) out.push(...[...new Set([first, low, high, last])].sort((a, b) => a.t - b.t));
    first = low = high = last = null;
  };
  for (const p of series) {
    if (p.v == null) {
      close();
      bucket = null;
      if (out.length && out[out.length - 1].v != null) out.push(p);
      continue;
    }
    const at = Math.min(W - 1, Math.max(0, Math.floor(((p.t - start) / (end - start)) * W)));
    if (at !== bucket) {
      close();
      bucket = at;
    }
    if (!first) first = low = high = p;
    if (p.v < low.v) low = p;
    if (p.v > high.v) high = p;
    last = p;
  }
  close();
  return out;
}

// ---- the timeline of a non-numeric entity ------------------------------------------------------

function updateTimeline(parts, ctx) {
  setText(parts.big, sensorValue(ctx.hass, parts.spec.entity, ctx.t));
  if (parts.big.className !== "big") parts.big.className = "big";
  const data = parts.data[parts.range];
  const ready = data?.status === "ready";
  const share = ready ? data.share : null;
  setText(parts.note, share == null ? "" : ctx.t("card.pocket.trend.on_share", {
    share: percent(ctx, share * 100), range: ctx.t(`card.pocket.trend.range.${parts.range}`) }));
  const status = data?.status ?? "loading";
  const has = ready && data.has;
  let message = "";
  if (status === "loading") message = ctx.t("card.pocket.trend.loading");
  else if (status === "error") message = ctx.t("card.pocket.trend.error");
  else if (!has) message = ctx.t("card.pocket.trend.empty");
  setText(parts.state, message);
  parts.state.hidden = !message;
  showSvg(parts.svg, has);
  showSvg(parts.band, false);
  const dateOptions = parts.range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" };
  const locale = { locale: { language: ctx.lang } };
  setText(parts.from, has ? formatDate(locale, new Date(data.start), dateOptions) : "");
  setText(parts.to, has ? formatDate(locale, new Date(data.end), dateOptions) : "");
  if (!has) return;
  const key = JSON.stringify(["timeline", parts.range, data.start]);
  if (key === parts.chartKey) return;
  parts.chartKey = key;
  const ns = "http://www.w3.org/2000/svg";
  parts.timeline.replaceChildren(...timelineOf(data.points, data.start, data.end).map((seg) => {
    const rect = document.createElementNS(ns, "rect");
    for (const [name, value] of Object.entries({ x: seg.x, width: seg.width, y: TIMELINE_Y, height: TIMELINE_H,
      class: seg.on ? "tl-on" : "tl-other", "data-state": seg.state })) rect.setAttribute(name, String(value));
    return rect;
  }));
}

const TIMELINE_H = 48;
const TIMELINE_Y = (H - TIMELINE_H) / 2;

// The segments of the states over [start, end] in drawing units: each state from its change to the
// next (the last until the end); unavailable, unknown and no state are gaps.
export function timelineOf(points, start, end) {
  const series = [...points].sort((a, b) => a.t - b.t);
  const x = (t) => round(Math.min(W, Math.max(0, ((t - start) / (end - start)) * W)));
  const out = [];
  series.forEach((p, i) => {
    const to = i + 1 < series.length ? series[i + 1].t : end;
    if (p.s == null || p.s === "unavailable" || p.s === "unknown" || to <= start) return;
    const x0 = x(p.t);
    const width = round(x(to) - x0);
    if (width > 0) out.push({ x: x0, width, state: p.s, on: p.s === "on" });
  });
  return out;
}

// How much of [start, end] the entity was "on", 0 to 1; null without an on/off state in it.
export function onShare(points, start, end) {
  const series = [...points].sort((a, b) => a.t - b.t);
  if (!series.some((p) => p.s === "on" || p.s === "off")) return null;
  let on = 0;
  series.forEach((p, i) => {
    const from = Math.max(start, p.t);
    const to = Math.min(end, i + 1 < series.length ? series[i + 1].t : end);
    if (p.s === "on" && to > from) on += to - from;
  });
  return on / (end - start);
}
