// The Areas tab (spec 6.3, mockup rooms.html screen 1), on the page contract of pages/index.js:
// a 2-column grid of square widgets, one per area (lib/areas.js: the rooms in the home's order,
// then the Outside when the home has it), all one size (equal columns and rows, a fixed aspect).
// Nothing is cut: a long name wraps, the big value shrinks with its square. Each square shows
//   - the room's name, with a dot when attention() (lib/attention.js) has an item for the room,
//     coloured by the worst of them (below a comfort range --cold, above it --warm);
//   - one key value big: the temperature in its level's colour with its trend arrow (lib/trend.js)
//     when the room has one, else how many lamps are on, else nothing;
//   - one short line built to fit (SHORT_LINE_CHARS, as the area page's): humidity, lamps on (when
//     the big value is not already that), and ♪ while its player plays. The air is in the dot and
//     on the area page.
// A tap opens the area page. render() builds the squares once; update() patches their text.

import { attention, roomLevels } from "../lib/attention.js";
import { toneOf } from "../lib/level.js";
import { trendNow } from "../lib/trend.js";
import { areasOf, climateReadings, climateValue } from "../lib/areas.js";
import {
  el, setText, setAttr, setArrow, setLine, temperature, percent, pluralOf, lightsOf, lightsOn, playing, coalesce,
} from "../lib/page-kit.js";

const STYLE = `
  .rooms .top { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 4px 8px; }
  .rooms .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .rooms .top .count { font-size: 12px; color: var(--mut); }
  .rooms .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 10px; }
  /* No min-height: an explicit one drops aspect-ratio's automatic minimum, and text that wraps
     would spill out; without it a square grows with its content (the row, 1fr, with it). */
  .rooms .sq { box-sizing: border-box; aspect-ratio: 1 / .82; align-self: stretch; min-width: 0;
               margin: 0; padding: 12px; container-type: inline-size;
               display: flex; flex-direction: column; justify-content: space-between; text-align: left;
               font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
               border-radius: 18px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .rooms .sq:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .rooms .name { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; min-width: 0; }
  .rooms .name span { min-width: 0; overflow-wrap: anywhere; }
  .rooms .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--warn); }
  .rooms .dot.poor { background: var(--bad); }
  .rooms .dot.cold { background: var(--cold); }
  .rooms .dot.warm { background: var(--warm); }
  .rooms .dot[hidden], .rooms .big[hidden], .rooms .arrow[hidden] { display: none; }
  /* The big value shrinks with its square (16-24 px) and wraps rather than spill out of it. */
  .rooms .big { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; font-size: 24px;
                font-size: clamp(16px, 15cqi, 24px); font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
  .rooms .big.lights { font-size: 20px; font-size: clamp(16px, 12.5cqi, 20px); }
  .rooms .big .arrow { font-size: 16px; font-weight: 400; color: var(--mut); letter-spacing: 0; }
  .rooms .big .muted { opacity: .55; }
  .rooms .lv-good { color: var(--ok); }
  .rooms .lv-fair { color: var(--warn); }
  .rooms .lv-poor { color: var(--bad); }
  .rooms .lv-cold { color: var(--cold); }
  .rooms .lv-warm { color: var(--warm); }
  .rooms .lab .muted { opacity: .55; }
  .rooms .lab { display: block; min-height: 15px; font-size: 11.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
`;

export function render(ctx) {
  const root = el("section", "rooms");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b> <span class="count"></span></div>
    <div class="grid"></div>`;
  const parts = { title: root.querySelector(".top b"), count: root.querySelector(".top .count"), squares: [], ctx };
  const grid = root.querySelector(".grid");
  for (const room of areasOf(ctx.config, ctx.t)) {
    const sq = el("button", "sq",
      `<span class="name"><span></span><i class="dot" role="img" hidden></i></span>
       <span class="value"><span class="big"><span class="num"></span><span class="arrow" hidden></span></span><span class="lab"></span></span>`);
    sq.type = "button";
    sq.addEventListener("click", () => parts.ctx.navigate(`#/area/${room.id}`));
    parts.squares.push({ room, sq });
    grid.append(sq);
  }
  // One redraw per frame however many trend answers land (lib/trend.js calls each widget once).
  parts.onTrend = coalesce(() => { if (root.isConnected) update(root, parts.ctx); });
  root._rooms = parts;
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._rooms;
  parts.ctx = ctx;
  const { hass } = ctx;
  const rooms = parts.squares;
  setText(parts.title, ctx.t("card.pocket.areas.title"));
  setText(parts.count, ctx.t(`card.pocket.areas.count.${pluralOf(ctx, rooms.length)}`, { count: rooms.length }));

  // attention() lists poor before fair: the first item of a room is its worst.
  const worst = {};
  for (const item of attention(hass, ctx.config)) worst[item.room] ??= item;

  for (const { room, sq } of parts.squares) {
    const lights = lightsOf(room).length > 0;
    const on = lightsOn(hass, room);
    const onText = on > 0 ? ctx.t("card.pocket.areas.lights_on", { count: on }) : ctx.t("card.pocket.areas.all_off");
    const climate = climateReadings(room);
    const hasTemp = climate.includes("temperature");

    const big = sq.querySelector(".big");
    big.hidden = !hasTemp && !lights;
    const value = hasTemp ? climateValue(hass, room, "temperature") : null;
    const result = hasTemp ? roomLevels(hass, room, ctx.config.thresholds)
      .find((found) => found.reading === "temperature")?.result : null;
    const tone = toneOf(result);
    const name = ["big", !hasTemp && lights && "lights", tone && `lv-${tone}`].filter(Boolean).join(" ");
    if (big.className !== name) big.className = name;
    const num = big.querySelector(".num");
    num.classList.toggle("muted", hasTemp && value == null);
    setText(num, hasTemp ? temperature(ctx, value) : lights ? onText : "");
    setArrow(big.querySelector(".arrow"), ctx,
      hasTemp ? trendNow(hass, room.climate?.temperature, "temperature", parts.onTrend) : null);

    // A reading the room names but cannot read now: a muted dash, so the line does not jump.
    const bits = [];
    if (climate.includes("humidity")) {
      const humidity = climateValue(hass, room, "humidity");
      bits.push({ text: percent(ctx, humidity), muted: humidity == null });
    }
    if (hasTemp && lights) bits.push({ text: onText });
    if (playing(hass, room)) bits.push({ text: ctx.t("card.pocket.home.playing") });
    setLine(sq.querySelector(".lab"), bits);

    setText(sq.querySelector(".name span"), room.outside ? ctx.t("card.pocket.area.outside") : room.name);
    const dot = sq.querySelector(".dot");
    const item = worst[room.id];
    const dotTone = item ? toneOf(item) : null;
    dot.hidden = !item;
    for (const t of ["fair", "poor", "cold", "warm"]) dot.classList.toggle(t, dotTone === t);
    setAttr(dot, "aria-label", ctx.t("card.pocket.areas.attention"));
  }
}
