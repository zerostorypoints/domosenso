// The Rooms tab (spec 6.3, mockup rooms.html screen 1), on the page contract of pages/index.js:
// a 2-column grid of square widgets, one per room in the home's order. Each square shows
//   - the room's name, with a dot when attention() (lib/attention.js) has an item for the room,
//     coloured by the worst of them;
//   - one key value big: the temperature when the room has one, else how many lamps are on, else
//     nothing;
//   - a line of secondaries: humidity, the air score, lamps on (when the big value is not
//     already that), and ♪ while its player plays.
// A tap opens the room page. render() builds the squares once; update() patches their text.

import { attention } from "../lib/attention.js";
import { numberOf } from "../lib/level.js";
import {
  el, setText, setAttr, setLine, number, temperature, percent, pluralOf, lightsOf, lightsOn, playing,
} from "../lib/page-kit.js";

const STYLE = `
  .rooms .top { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 4px 8px; }
  .rooms .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .rooms .top .count { font-size: 12px; color: var(--mut); }
  .rooms .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rooms .sq { box-sizing: border-box; aspect-ratio: 1 / .82; min-height: 96px; margin: 0; padding: 12px;
               display: flex; flex-direction: column; justify-content: space-between; text-align: left;
               font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
               border-radius: 18px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .rooms .sq:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .rooms .name { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; min-width: 0; }
  .rooms .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rooms .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--warn); }
  .rooms .dot.poor { background: var(--bad); }
  .rooms .dot[hidden], .rooms .big[hidden] { display: none; }
  .rooms .big { display: block; font-size: 24px; font-weight: 600; letter-spacing: -.5px; }
  .rooms .big.lights { font-size: 20px; }
  .rooms .lab .muted { opacity: .55; }
  .rooms .lab { display: block; min-height: 15px; font-size: 11.5px; color: var(--mut); margin-top: 2px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export function render(ctx) {
  const root = el("section", "rooms");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b> <span class="count"></span></div>
    <div class="grid"></div>`;
  const parts = { title: root.querySelector(".top b"), count: root.querySelector(".top .count"), squares: [], ctx };
  const grid = root.querySelector(".grid");
  for (const room of ctx.config.rooms) {
    const sq = el("button", "sq",
      `<span class="name"><span></span><i class="dot" role="img" hidden></i></span>
       <span class="value"><span class="big"></span><span class="lab"></span></span>`);
    sq.type = "button";
    sq.addEventListener("click", () => parts.ctx.navigate(`#/room/${room.id}`));
    parts.squares.push({ room, sq });
    grid.append(sq);
  }
  root._rooms = parts;
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._rooms;
  parts.ctx = ctx;
  const { hass } = ctx;
  const rooms = ctx.config.rooms;
  setText(parts.title, ctx.t("card.pocket.rooms.title"));
  setText(parts.count, ctx.t(`card.pocket.rooms.count.${pluralOf(ctx, rooms.length)}`, { count: rooms.length }));

  const worst = {};
  for (const item of attention(hass, ctx.config)) {
    if (worst[item.room] !== "poor") worst[item.room] = item.level;
  }

  for (const { room, sq } of parts.squares) {
    const lights = lightsOf(room).length > 0;
    const on = lightsOn(hass, room);
    const onText = on > 0 ? ctx.t("card.pocket.rooms.lights_on", { count: on }) : ctx.t("card.pocket.rooms.all_off");
    const hasTemp = !!room.climate?.temperature;

    const big = sq.querySelector(".big");
    big.hidden = !hasTemp && !lights;
    big.classList.toggle("lights", !hasTemp && lights);
    setText(big, hasTemp ? temperature(ctx, numberOf(hass, room.climate.temperature)) : lights ? onText : "");

    // A reading the room names but cannot read now: a muted dash, so the line does not jump.
    const bits = [];
    if (room.climate?.humidity) {
      const humidity = numberOf(hass, room.climate.humidity);
      bits.push({ text: percent(ctx, humidity), muted: humidity == null });
    }
    if (room.air?.score) {
      const score = numberOf(hass, room.air.score);
      bits.push({ text: ctx.t("card.pocket.rooms.air",
        { value: score == null ? ctx.t("card.pocket.format.none") : number(ctx, score, 0) }), muted: score == null });
    }
    if (hasTemp && lights) bits.push({ text: onText });
    if (playing(hass, room)) bits.push({ text: ctx.t("card.pocket.home.playing") });
    setLine(sq.querySelector(".lab"), bits);

    setText(sq.querySelector(".name span"), room.name);
    const dot = sq.querySelector(".dot");
    dot.hidden = !worst[room.id];
    dot.classList.toggle("fair", worst[room.id] === "fair");
    dot.classList.toggle("poor", worst[room.id] === "poor");
    setAttr(dot, "aria-label", ctx.t("card.pocket.rooms.attention"));
  }
}
