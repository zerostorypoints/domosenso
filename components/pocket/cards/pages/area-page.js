// The area page (spec 6.3, mockup rooms.html screen 2), on the page contract of pages/index.js,
// for the area ctx.routeId: a room, or the Outside pseudo-area (lib/areas.js areasOf; always one
// of them: the shell sends an unknown id to Areas). The Outside has only its Climate square.
//   - a back button to Areas with the area's name, and dots for the area's place in the home;
//   - a horizontal swipe (>= 60 px, mostly horizontal, decided after 8 px as the light tile does)
//     goes to the next area (swipe left) or the previous one, in the home's order; the first and
//     the last area stay (no wrap). It starts anywhere on the page, a light tile's body too, but
//     on an element marked data-drag, which keeps its sideways moves: a light tile's brightness
//     strip, the scene row (it scrolls). The page is at least as tall as the screen above the bar,
//     so a swipe below a short page's content is the page's too. Vertical moves are the browser's
//     scroll (touch-action: pan-y);
//   - Climate and Air squares when the room has those readings, one size for every square on
//     every area page (a fixed aspect in a two-column grid; a lone square keeps it, it does not
//     stretch). A square shows its title, one big value in its level's colour (lib/level.js
//     through attention.js's roomLevels: good --ok, fair --warn, poor --bad; below a comfort range
//     --cold, above it --warm) with its trend arrow (lib/trend.js, the last hour), and one short
//     line built to fit (SHORT_LINE_CHARS): Climate the humidity and the worst level ("44 % · In
//     range"), Air the worst air reading and its level ("CO₂ fine"). Nothing is cut: the rest is in
//     the square's sheet. Values without limits have no level;
//   - the room's lights as one <pocket-light-tile>, and "N lights ›" opening a tile per lamp (the
//     group's entity_id attribute);
//   - its scenes as a sideways row of buttons (scene.turn_on), a pressed one marked until Home
//     Assistant reports that it ran;
//   - its player: artwork, title, artist, play/pause; a tap elsewhere opens Media with it
//     (#/media/<id>);
// Every control sends through ctx.optimistic (lib/optimistic.js): its new state shows at once.
//   - the area's part of the floor plan (lib/area-plan.js: the floorplan component's own card with
//     the area's room alone), when the home has the floorplan and the area is on it;
//   - "All sensors" (lib/sensor-list.js), collapsed: every sensor of the area's HA area by the
//     catalog's categories, as the floor plan finds them, each with a number opening its trend;
//   - a room with none of these: its name and "nothing to show here".
// The Climate square opens the trend sheet (ctx.openSheet, lib/trend-sheet.js) of its first
// reading when the area names an entity for it (the Outside's weather attribute has none: that
// square opens nothing); the Air square opens the air sheet (lib/detail-sheets.js): every air
// reading with its value, level and arrow, each opening its trend.
// render() builds every element
// once; update() patches text and classes, and rebuilds the lamp tiles only when the members change.

import { roomLevels } from "../lib/attention.js";
import { numberOf, toneOf, levelKey } from "../lib/level.js";
import { trendNow } from "../lib/trend.js";
import { airSpec } from "../lib/detail-sheets.js";
import { areasOf, climateReadings as climateOf, climateValue } from "../lib/areas.js";
import {
  GONE, operable, el, setArt, setText, setAttr, setArrow, coalesce, number, temperature, percent, pluralOf, lightsOf, membersOf,
  playerOf, shortName,
} from "../lib/page-kit.js";
import { trendSpec, readingSpec } from "../lib/trend-sheet.js";
import { SENSOR_STYLE, renderSensors } from "../lib/sensor-list.js";
import { PLAN_STYLE, renderAreaPlan } from "../lib/area-plan.js";
import "../lib/light-tile.js";

const DIRECTION_PX = 8;      // movement before a gesture is a swipe or a scroll
const SWIPE_PX = 60;         // a swipe shorter than this does nothing
const SWIPE_RATIO = 1.5;     // a swipe at least this many times wider than tall (a thumb's arc)
const AIR = ["score", "co2", "pm2_5", "voc", "nox"];
const RANK = { good: 0, fair: 1, poor: 2 };
// The longest a square's short line may be, in characters, in every language: what fits beside
// nothing else at 11.5 px in half of a 360 px phone. A test holds every translation to it.
export const SHORT_LINE_CHARS = 22;

const STYLE = `
  /* As tall as the screen between HA's header and the bar (main's padding: 12 px over, 16 px under). */
  .room { touch-action: pan-y; box-sizing: border-box;
          min-height: calc(100vh - var(--kiosk-header-height, var(--header-height, 56px)) - var(--bar, 64px) - 28px);
          min-height: calc(100dvh - var(--kiosk-header-height, var(--header-height, 56px)) - env(safe-area-inset-top, 0px)
                           - var(--bar, 64px) - var(--safe, 0px) - 28px); }
  .room .top { display: flex; align-items: center; margin: -4px 0 2px; }
  .room .top .aset { margin-left: auto; min-width: 44px; min-height: 44px; border: 0; border-radius: 12px; background: none;
    color: var(--mut); display: inline-flex; align-items: center; justify-content: center; }
  .room .back { min-height: 44px; margin: 0 0 0 -8px; padding: 0 8px 0 0; border: 0; background: none;
                display: flex; align-items: center; gap: 2px; font: inherit; color: var(--fg); cursor: pointer;
                min-width: 44px; -webkit-tap-highlight-color: transparent; }
  .room .back ha-icon { --mdc-icon-size: 28px; flex: 0 0 auto; }
  .room .back .name { font-size: 24px; font-weight: 650; letter-spacing: -.4px; text-align: left; overflow-wrap: anywhere; }
  .room .dots { display: flex; gap: 5px; justify-content: center; margin: 2px 0 12px; }
  .room .dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--line); }
  .room .dots i.a { width: 16px; background: var(--fg); }
  /* One size for every square: equal columns, equal rows (the tallest square's height, so text
     that has to wrap makes them all grow alike), a fixed aspect otherwise. */
  .room .squares { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr)); grid-auto-rows: 1fr; gap: 10px; }
  .room .squares > * { min-width: 0; }
  /* No min-height: an explicit one drops aspect-ratio's automatic minimum, and text that wraps
     would spill out; without it a square grows with its content (the row, 1fr, with it). */
  .room .sq { box-sizing: border-box; aspect-ratio: 1 / .62; align-self: stretch; padding: 12px;
              container-type: inline-size;
              display: flex; flex-direction: column; justify-content: space-between;
              background: var(--card); border: 1px solid var(--line); border-radius: 18px; }
  .room button.sq { width: 100%; margin: 0; font: inherit; color: var(--fg); text-align: left; cursor: pointer; }
  .room .sq .head { font-size: 11.5px; color: var(--mut); display: flex; align-items: center; gap: 5px; }
  .room .sq .head i { width: 7px; height: 7px; border-radius: 50%; background: transparent; }
  .room .sq .head i.lv-good { background: var(--ok); }
  .room .sq .head i.lv-fair { background: var(--warn); }
  .room .sq .head i.lv-poor { background: var(--bad); }
  .room .sq .head i.lv-cold { background: var(--cold); }
  .room .sq .head i.lv-warm { background: var(--warm); }
  .room .sq .value { min-width: 0; }
  /* The big value shrinks with its square (16-24 px) and wraps rather than spill out of it. */
  .room .big { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; font-size: 24px;
               font-size: clamp(16px, 15cqi, 24px); font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
  .room .big .arrow { font-size: 16px; font-weight: 400; color: var(--mut); letter-spacing: 0; }
  .room .big .arrow[hidden] { display: none; }
  .room .lab { display: block; min-height: 15px; font-size: 11.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
  .room .sq .muted { opacity: .55; }
  .room .lv-good { color: var(--ok); }
  .room .lv-fair { color: var(--warn); }
  .room .lv-poor { color: var(--bad); }
  .room .lv-cold { color: var(--cold); }
  .room .lv-warm { color: var(--warm); }
  .room .sec { font-size: 12.5px; font-weight: 600; margin: 18px 4px 8px; color: var(--mut);
               text-transform: uppercase; letter-spacing: .5px; }
  .room .sec[hidden], .room .media[hidden], .room .members[hidden], .room .members-toggle[hidden],
  .room .art img[hidden], .room .art ha-icon[hidden] { display: none; }
  .room .members-toggle { display: block; min-width: 44px; min-height: 44px; margin: 4px 0 0 auto; padding: 0 4px; border: 0;
                          background: none; font: inherit; font-size: 13px; color: var(--mut); cursor: pointer; }
  .room .members { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr)); grid-auto-rows: 1fr; gap: 10px; margin-top: 4px; }
  .room .scenes { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; touch-action: pan-x pan-y;
                  margin: 10px -16px 0; padding: 0 16px; }
  .room .scenes::-webkit-scrollbar { display: none; }
  .room .scn { flex: 0 0 auto; min-width: 44px; min-height: 44px; margin: 0; padding: 10px 14px; font: inherit; font-size: 13px;
               color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 14px;
               cursor: pointer; }
  .room .scn.sent { border-color: var(--acc); background: color-mix(in srgb, var(--acc) 16%, var(--card)); }
  .room .scn:disabled, .room .play:disabled { opacity: .55; cursor: default; }
  .room .media { display: flex; align-items: center; gap: 12px; padding: 12px;
                 background: var(--card); border: 1px solid var(--line); border-radius: 20px; }
  .room .media.muted .meta, .room .media.muted .art { opacity: .55; }
  .room .media .open { flex: 1; min-width: 0; min-height: 52px; margin: 0; padding: 0; border: 0; background: none;
                       display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: var(--fg);
                       cursor: pointer; }
  .room .art { display: block; width: 52px; height: 52px; border-radius: 12px; flex: 0 0 auto; overflow: hidden;
               background: var(--chip); }
  .room .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .room .art ha-icon { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;
                       color: var(--mut); --mdc-icon-size: 26px; }
  .room .meta { flex: 1; min-width: 0; }
  .room .t1 { display: block; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .room .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
  .room .play { width: 44px; height: 44px; flex: 0 0 auto; margin: 0; padding: 0; border: 0; border-radius: 50%;
                background: var(--chip); color: var(--fg); display: flex; align-items: center; justify-content: center;
                cursor: pointer; }
  .room .empty { color: var(--mut); font-size: 16px; margin: 32px 0; text-align: center; }
  .room button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

// A square: the first reading big with its arrow; Climate's other readings on the line under it,
// each value in a span of its own so it carries its level's colour, then the level text.
function square(kind, readings, opens) {
  const sq = el(opens ? "button" : "div", `sq ${kind}`,
    `<span class="head"><span class="title"></span><i></i></span>
     <span class="value"><span class="big"><span class="num"></span><span class="arrow" hidden></span></span><span class="lab"></span></span>`);
  if (opens) sq.type = "button";
  const lab = sq.querySelector(".lab");
  const big = sq.querySelector(".big");
  const lineReadings = kind === "climate" ? readings : readings.slice(0, 1);
  const cells = lineReadings.map((reading, i) => {
    if (i === 0) return { reading, value: big, num: big.querySelector(".num") };
    if (i > 1) lab.append(el("span", "sep", " · "));
    const value = el("span", "v");
    lab.append(value);
    return { reading, value, num: value };
  });
  const sep = el("span", "sep");
  const text = el("span", "lvt");
  lab.append(sep, text);
  return { kind, sq, readings, cells, sep, text, arrow: big.querySelector(".arrow"),
    title: sq.querySelector(".title"), dot: sq.querySelector(".head i") };
}

export function render(ctx) {
  const root = el("section", "room");
  const rooms = areasOf(ctx.config, ctx.t);
  const index = Math.max(0, rooms.findIndex((r) => r.id === ctx.routeId));
  const room = rooms[index];
  const lights = lightsOf(room);
  const scenes = [room.scenes ?? []].flat().filter(Boolean);
  const climateReadings = climateOf(room);
  const airReadings = AIR.filter((r) => room.air?.[r]);
  const player = playerOf(room);

  root.innerHTML = `<style>${STYLE}${SENSOR_STYLE}${PLAN_STYLE}</style>
    <div class="top"><button class="back" type="button"><ha-icon icon="mdi:chevron-left"></ha-icon><span class="name"></span></button><button class="aset" type="button"><ha-icon icon="mdi:tune-variant"></ha-icon></button></div>
    <div class="dots" role="img">${rooms.map((r, i) => `<i${i === index ? ' class="a"' : ""}></i>`).join("")}</div>`;

  const parts = { room, rooms, index, ctx, squares: [], scenes: [], tiles: [], memberTiles: [], membersKey: null,
    back: root.querySelector(".back"), name: root.querySelector(".top .name"), dots: root.querySelector(".dots") };
  // Back to where the area was opened from (Areas, Home's Inside sheet, its settings), else to Areas.
  parts.back.addEventListener("click", () => (parts.ctx.back ? parts.ctx.back("#/areas") : parts.ctx.navigate("#/areas")));
  // The area's settings (SPEC-038 §3.9): its page under Settings → Areas. This second way in is this
  // feature's UX choice (DESIGN.md 10.1, decisions log), not a default of the design system.
  root.querySelector(".top .aset").addEventListener("click", () =>
    parts.ctx.navigate(`#/settings/areas/${encodeURIComponent(parts.room?.id ?? parts.ctx.routeId)}`));

  // The other main sensors the area's settings chose (lib/kinds.json: light level, sound, pressure):
  // one square each, its value with Home Assistant's unit, opening its trend.
  const indicators = Object.entries(room.indicators ?? {}).filter(([, entity]) => entity);
  if (climateReadings.length || airReadings.length || indicators.length) {
    const box = el("div", "squares");
    // Climate opens its first reading's trend; Air its sheet of every air reading.
    const sheetOf = (kind, c) => (kind === "air" ? airSpec(c, room) : trendSpec(c, room, climateReadings[0]));
    const add = (kind, readings) => {
      const s = square(kind, readings, !!sheetOf(kind, ctx));
      if (s.sq.tagName === "BUTTON") {
        s.sq.addEventListener("click", () => {
          const spec = sheetOf(kind, parts.ctx);
          if (spec) parts.ctx.openSheet?.(spec);
        });
      }
      parts.squares.push(s);
    };
    if (climateReadings.length) add("climate", climateReadings);
    if (airReadings.length) add("air", airReadings);
    for (const [kind, entity] of indicators) {
      const s = square("indicator", [kind], true);
      s.entity = entity;
      s.sq.dataset.kind = kind;
      s.sq.addEventListener("click", () => {
        const spec = readingSpec(parts.ctx, parts.room, kind, entity);
        if (spec) parts.ctx.openSheet?.(spec);
      });
      parts.squares.push(s);
    }
    box.append(...parts.squares.map((s) => s.sq));
    root.append(box);
  }

  if (lights.length || scenes.length) {
    parts.lightsSec = el("div", "sec");
    root.append(parts.lightsSec);
  }
  if (lights.length) {
    const group = el("div", "group");
    const tile = document.createElement("pocket-light-tile");
    tile.t = ctx.t;
    tile.optimistic = ctx.optimistic;
    parts.groupTile = tile;
    parts.tiles.push(tile);
    group.append(tile);
    parts.toggle = el("button", "members-toggle");
    parts.toggle.type = "button";
    parts.toggle.addEventListener("click", () => {
      parts.open = !parts.open;
      updateMembers(parts, parts.ctx);
    });
    parts.members = el("div", "members");
    root.append(group, parts.toggle, parts.members);
  }
  if (scenes.length) {
    const row = el("div", "scenes");
    row.dataset.drag = "";
    for (const scene of scenes) {
      const button = el("button", "scn");
      button.type = "button";
      button.addEventListener("click", () => {
        const { hass, offline, optimistic } = parts.ctx;
        if (offline || !hass?.callService) return;
        optimistic.send(root, hass, { domain: "scene", service: "turn_on", data: { entity_id: scene },
          errorKey: "card.pocket.error.scene", expect: { [scene]: { changed: true } } });
      });
      parts.scenes.push({ scene, button });
      row.append(button);
    }
    root.append(row);
  }

  parts.musicSec = el("div", "sec");
  parts.media = el("div", "media",
    `<button class="open" type="button"><span class="art"><img alt="" hidden><ha-icon icon="mdi:music"></ha-icon></span>
     <span class="meta"><span class="t1"></span> <span class="t2"></span></span></button>
     <button class="play" type="button"><ha-icon></ha-icon></button>`);
  parts.player = player;
  parts.media.querySelector(".open").addEventListener("click", () =>
    parts.ctx.navigate(`#/media/${encodeURIComponent(room.id)}`));
  parts.media.querySelector(".play").addEventListener("click", () => {
    const { hass, offline, optimistic } = parts.ctx;
    const state = player ? hass?.states?.[player] : undefined;
    if (offline || !operable(state) || !hass.callService) return;
    optimistic.send(root, hass, { domain: "media_player", service: "media_play_pause", data: { entity_id: player },
      errorKey: "card.pocket.error.media",
      expect: { [player]: { state: state.state === "playing" ? "paused" : "playing" } } });
  });
  root.append(parts.musicSec, parts.media);

  parts.plan = renderAreaPlan(ctx, room);
  if (parts.plan) root.append(parts.plan.el);
  parts.sensors = renderSensors(ctx, room);
  root.append(parts.sensors.el);

  if (!lights.length && !scenes.length && !parts.squares.length && !player) {
    parts.empty = el("p", "empty");
    root.append(parts.empty);
  }

  swipeBetweenRooms(root, parts);
  // Stable (lib/trend.js calls each waiting widget once); one redraw per frame for all answers.
  parts.onTrend = coalesce(() => { if (root.isConnected) update(root, parts.ctx); });
  root._room = parts;
  update(root, ctx);
  return root;
}

// The area swipe: a horizontal move of the finger anywhere on the page but an element marked
// data-drag (looked for along the event's composed path: a tile's strip is inside its shadow
// root). A swipe ends with the next page, or (first / last area) with nothing; either way the
// click the browser may fire after it is dropped. The next page is a new element with listeners
// of its own (the shell renders it on the replaced route).
function swipeBetweenRooms(root, parts) {
  let swipe = null;
  let swallow = false;
  root.addEventListener("pointerdown", (e) => {
    swallow = false;
    swipe = null;
    if (e.button != null && e.button !== 0) return;
    if (ownsDrag(e, root)) return;
    swipe = { x: e.clientX, y: e.clientY, mode: "pending" };
  });
  root.addEventListener("pointermove", (e) => {
    if (!swipe || swipe.mode !== "pending") return;
    const dx = Math.abs(e.clientX - swipe.x);
    const dy = Math.abs(e.clientY - swipe.y);
    if (dx < DIRECTION_PX && dy < DIRECTION_PX) return;
    swipe.mode = dx > dy ? "swipe" : "scroll";
  });
  root.addEventListener("pointerup", (e) => {
    const g = swipe;
    swipe = null;
    if (!g || g.mode === "scroll") return;
    const dx = e.clientX - g.x;
    const dy = Math.abs(e.clientY - g.y);
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < SWIPE_RATIO * dy) return;
    swallow = true;
    const next = parts.rooms[parts.index + (dx < 0 ? 1 : -1)];
    // At the first or last room there is no next page, yet swallow stays set: the click the
    // browser fires after the finger lifts would otherwise press whatever the swipe ended on.
    // The next pointerdown clears it.
    if (next) parts.ctx.navigate(`#/area/${next.id}`, { replace: true });
  });
  root.addEventListener("pointercancel", () => { swipe = null; });
  root.addEventListener("click", (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}

// Whether the gesture starts on an element that keeps its sideways moves (data-drag).
function ownsDrag(e, root) {
  for (const node of e.composedPath?.() ?? []) {
    if (node === root) return false;
    if (node.hasAttribute?.("data-drag")) return true;
  }
  return false;
}

export function update(root, ctx) {
  const parts = root._room;
  parts.ctx = ctx;
  const { room } = parts;
  const { rooms } = parts;
  setText(parts.name, room.outside ? ctx.t("card.pocket.area.outside") : room.name);
  setAttr(parts.back, "aria-label", ctx.t("card.pocket.area.back"));
  setAttr(root.querySelector(".top .aset"), "aria-label", ctx.t("card.pocket.areas.settings"));
  setAttr(parts.dots, "aria-label", ctx.t("card.pocket.area.position", { index: parts.index + 1, count: rooms.length }));
  updateSquares(parts, ctx);
  if (parts.lightsSec) {
    setText(parts.lightsSec, ctx.t(parts.groupTile ? "card.pocket.area.lights" : "card.pocket.area.scenes"));
  }
  if (parts.groupTile) {
    parts.groupTile.config = { name: ctx.t("card.pocket.area.all_lights"), entities: lightsOf(room) };
    updateMembers(parts, ctx);
  }
  for (const tile of parts.tiles) {
    tile.t = ctx.t;
    tile.optimistic = ctx.optimistic;
    tile.offline = ctx.offline;
    tile.hass = ctx.hass;
  }
  for (const { scene, button } of parts.scenes) {
    setText(button, shortName(ctx.hass, scene, room));
    const sent = !!ctx.optimistic?.pending(scene);
    button.classList.toggle("sent", sent);
    setAttr(button, "aria-busy", String(sent));
    button.disabled = !!ctx.offline;
  }
  updateMedia(parts, ctx);
  parts.plan?.update(ctx);
  parts.sensors.update(ctx);
  if (parts.empty) {
    setText(parts.empty, ctx.t("card.pocket.area.empty"));
    // Its sensors or its part of the plan are something to show.
    parts.empty.hidden = !parts.sensors.el.hidden || (parts.plan && !parts.plan.el.hidden);
  }
}

function setClass(node, base, lv, muted = false) {
  const name = [base, lv && `lv-${lv}`, muted && "muted"].filter(Boolean).join(" ");
  if (node.className !== name) node.className = name;
}

function formatted(ctx, reading, value) {
  if (value == null) return ctx.t("card.pocket.format.none");
  if (reading === "temperature") return temperature(ctx, value);
  if (reading === "humidity") return percent(ctx, value);
  return ctx.t(`card.pocket.area.reading.${reading}`, { value: number(ctx, value, 0, { grouping: false }) });
}

function updateSquares(parts, ctx) {
  const { hass } = ctx;
  const { room } = parts;
  const levels = Object.fromEntries(roomLevels(hass, room, ctx.config.thresholds)
    .filter(({ result }) => result).map(({ reading, result }) => [reading, result]));
  for (const s of parts.squares) {
    if (s.kind === "indicator") {
      const reading = s.readings[0];
      const n = numberOf(hass, s.entity);
      const unit = hass?.states?.[s.entity]?.attributes?.unit_of_measurement;
      setClass(s.cells[0].value, "big", null, n == null);
      setText(s.cells[0].num, n == null ? ctx.t("card.pocket.format.none") : `${number(ctx, n, 0, { grouping: false })}${unit ? ` ${unit}` : ""}`);
      setArrow(s.arrow, ctx, trendNow(hass, s.entity, reading, parts.onTrend));
      setText(s.title, ctx.t(`card.pocket.areas.kind.${reading}`));
      setText(s.text, "");
      setText(s.sep, "");
      continue;
    }
    const source = s.kind === "climate" ? room.climate : room.air;
    const valueOf = (reading) => (s.kind === "climate" ? climateValue(hass, room, reading) : numberOf(hass, source[reading]));
    s.cells.forEach(({ reading, value, num }, i) => {
      const n = valueOf(reading);
      setClass(value, i === 0 ? "big" : "v", toneOf(levels[reading]), n == null);
      setText(num, formatted(ctx, reading, n));
    });
    // The worst level among the square's readings (Air: every air reading, not only the big one;
    // on a tie the line names another reading than the big one, which shows its own colour).
    let worst = null;
    const order = s.kind === "air" ? [...s.readings.slice(1), s.readings[0]] : s.readings;
    for (const reading of order) {
      const lv = levels[reading];
      if (lv && (!worst || RANK[lv.level] > RANK[worst.result.level])) worst = { reading, result: lv };
    }
    const first = s.readings[0];
    setArrow(s.arrow, ctx, trendNow(hass, source?.[first], first, parts.onTrend));
    setText(s.text, shortLevel(ctx, s.kind, worst));
    // No values on the line (a square of one reading, Air): no separator before the level text.
    setText(s.sep, s.text.textContent && s.cells.length > 1 ? " · " : "");
    setText(s.title, ctx.t(`card.pocket.area.${s.kind}`));
    setClass(s.dot, "", toneOf(worst?.result));
  }
}

// The level part of a square's short line: Climate the worst reading's level ("In range", "Too
// cold"), Air the worst air reading by name and level ("CO₂ fine", "PM2.5 high").
export function shortLevel(ctx, kind, worst) {
  if (!worst) return "";
  const { reading, result } = worst;
  if (kind === "air") return ctx.t(`card.pocket.square.air.${reading}.${result.level}`);
  return ctx.t(`card.pocket.reading.${reading}.${result.level === "good" ? "good" : levelKey(result)}`);
}

function updateMembers(parts, ctx) {
  const { hass } = ctx;
  const { room } = parts;
  const members = membersOf(hass, room);
  const names = members.map((id) => shortName(hass, id, room));
  const key = JSON.stringify([members, names]);
  if (key !== parts.membersKey) {
    parts.membersKey = key;
    for (const tile of parts.memberTiles) parts.tiles.splice(parts.tiles.indexOf(tile), 1);
    parts.memberTiles = members.map((id, i) => {
      const tile = document.createElement("pocket-light-tile");
      tile.t = ctx.t;
      tile.offline = ctx.offline;
      tile.optimistic = ctx.optimistic;
      tile.config = { name: names[i], entities: [id] };
      tile.hass = hass;
      return tile;
    });
    parts.tiles.push(...parts.memberTiles);
    parts.members.replaceChildren(...parts.memberTiles);
  }
  parts.toggle.hidden = members.length === 0;
  parts.members.hidden = !parts.open || members.length === 0;
  setText(parts.toggle, `${ctx.t(`card.pocket.area.members.${pluralOf(ctx, members.length)}`, { count: members.length })} ›`);
  setAttr(parts.toggle, "aria-expanded", String(!!parts.open));
}

function updateMedia(parts, ctx) {
  const { media, player, room } = parts;
  const state = player ? ctx.hass?.states?.[player] : undefined;
  media.hidden = !state;
  parts.musicSec.hidden = !state;
  setText(parts.musicSec, ctx.t("card.pocket.area.music"));
  if (!state) return;
  const gone = GONE.has(state.state);
  const a = gone ? {} : state.attributes ?? {};
  const isPlaying = state.state === "playing";
  media.classList.toggle("muted", gone);
  const title = gone ? ctx.t("card.pocket.format.none") : a.media_title || ctx.t("card.pocket.home.nothing_playing");
  setText(media.querySelector(".t1"), title);
  setAttr(media.querySelector(".open"), "aria-label", title);
  setText(media.querySelector(".t2"), a.media_artist || a.media_album_artist || room.name);
  setArt(media.querySelector(".art img"), media.querySelector(".art ha-icon"), a.entity_picture);
  const play = media.querySelector(".play");
  setAttr(play, "aria-label", ctx.t(isPlaying ? "card.pocket.home.pause" : "card.pocket.home.play"));
  setAttr(play.querySelector("ha-icon"), "icon", isPlaying ? "mdi:pause" : "mdi:play");
  play.disabled = !!ctx.offline || gone;
}
