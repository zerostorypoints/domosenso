// The room page (spec 6.3, mockup rooms.html screen 2), on the page contract of pages/index.js,
// for the room ctx.routeId (always one of config.rooms: the shell sends an unknown id to Rooms):
//   - a back button to Rooms with the room's name, and dots for the room's place in the home;
//   - a horizontal swipe (>= 60 px, mostly horizontal, decided after 8 px as the light tile does)
//     goes to the next room (swipe left) or the previous one, in the home's order; the first and
//     the last room stay (no wrap). A swipe that starts on a light tile is the tile's brightness
//     drag, one on the scene row scrolls the row: neither changes the room. Vertical moves are
//     the browser's scroll (touch-action: pan-y);
//   - Climate and Air squares when the room has those readings: each value in its level's colour
//     (lib/level.js through attention.js's roomLevels: good --ok, fair --warn, poor --bad) and the
//     worst reading's level text; values without limits have no level;
//   - the room's lights as one <pocket-light-tile>, and "N lights ›" opening a tile per lamp (the
//     group's entity_id attribute);
//   - its scenes as a sideways row of buttons (scene.turn_on);
//   - its player: artwork, title, artist, play/pause;
//   - a room with none of these: its name and "nothing to show here".
// The squares open nothing yet (the trend sheet is not built). render() builds every element
// once; update() patches text and classes, and rebuilds the lamp tiles only when the members change.

import { roomLevels } from "../lib/attention.js";
import { numberOf } from "../lib/level.js";
import {
  GONE, el, setText, setAttr, number, temperature, percent, pluralOf, call, lightsOf, membersOf,
  playerOf, shortName,
} from "../lib/page-kit.js";
import "../lib/light-tile.js";

const DIRECTION_PX = 8;      // movement before a gesture is a swipe or a scroll
const SWIPE_PX = 60;         // a swipe shorter than this does nothing
const AIR = ["score", "co2", "pm2_5", "voc", "nox"];
const RANK = { good: 0, fair: 1, poor: 2 };

const STYLE = `
  .room { touch-action: pan-y; }
  .room .top { display: flex; align-items: center; margin: -4px 0 2px; }
  .room .back { min-height: 44px; margin: 0 0 0 -8px; padding: 0 8px 0 0; border: 0; background: none;
                display: flex; align-items: center; gap: 2px; font: inherit; color: var(--fg); cursor: pointer;
                min-width: 0; -webkit-tap-highlight-color: transparent; }
  .room .back ha-icon { --mdc-icon-size: 28px; flex: 0 0 auto; }
  .room .back .name { font-size: 24px; font-weight: 650; letter-spacing: -.4px;
                      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .room .dots { display: flex; gap: 5px; justify-content: center; margin: 2px 0 12px; }
  .room .dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--line); }
  .room .dots i.a { width: 16px; background: var(--fg); }
  .room .squares { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .room .sq { box-sizing: border-box; aspect-ratio: 1 / .62; min-height: 88px; padding: 12px;
              display: flex; flex-direction: column; justify-content: space-between;
              background: var(--card); border: 1px solid var(--line); border-radius: 18px; }
  .room .sq .head { font-size: 11.5px; color: var(--mut); display: flex; align-items: center; gap: 5px; }
  .room .sq .head i { width: 7px; height: 7px; border-radius: 50%; background: transparent; }
  .room .sq .head i.lv-good { background: var(--ok); }
  .room .sq .head i.lv-fair { background: var(--warn); }
  .room .sq .head i.lv-poor { background: var(--bad); }
  .room .big { display: block; font-size: 24px; font-weight: 600; letter-spacing: -.5px; }
  .room .lab { display: block; min-height: 15px; font-size: 11.5px; color: var(--mut); margin-top: 2px;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .room .sq .muted { opacity: .55; }
  .room .lv-good { color: var(--ok); }
  .room .lv-fair { color: var(--warn); }
  .room .lv-poor { color: var(--bad); }
  .room .sec { font-size: 12.5px; font-weight: 600; margin: 18px 4px 8px; color: var(--mut);
               text-transform: uppercase; letter-spacing: .5px; }
  .room .sec[hidden], .room .media[hidden], .room .members[hidden], .room .members-toggle[hidden],
  .room .art img[hidden] { display: none; }
  .room .members-toggle { display: block; min-height: 44px; margin: 4px 0 0 auto; padding: 0 4px; border: 0;
                          background: none; font: inherit; font-size: 13px; color: var(--mut); cursor: pointer; }
  .room .members { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
  .room .scenes { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; touch-action: pan-x pan-y;
                  margin: 10px -16px 0; padding: 0 16px; }
  .room .scenes::-webkit-scrollbar { display: none; }
  .room .scn { flex: 0 0 auto; min-height: 44px; margin: 0; padding: 10px 14px; font: inherit; font-size: 13px;
               color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 14px;
               cursor: pointer; }
  .room .scn:disabled, .room .play:disabled { opacity: .55; cursor: default; }
  .room .media { display: flex; align-items: center; gap: 12px; padding: 12px;
                 background: var(--card); border: 1px solid var(--line); border-radius: 20px; }
  .room .media.muted .meta, .room .media.muted .art { opacity: .55; }
  .room .art { display: block; width: 52px; height: 52px; border-radius: 12px; flex: 0 0 auto; overflow: hidden;
               background: var(--chip); }
  .room .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .room .meta { flex: 1; min-width: 0; }
  .room .t1 { display: block; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .room .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; overflow: hidden;
              text-overflow: ellipsis; white-space: nowrap; }
  .room .play { width: 44px; height: 44px; flex: 0 0 auto; margin: 0; padding: 0; border: 0; border-radius: 50%;
                background: var(--chip); color: var(--fg); display: flex; align-items: center; justify-content: center;
                cursor: pointer; }
  .room .empty { color: var(--mut); font-size: 16px; margin: 32px 0; text-align: center; }
  .room button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

// A square of readings: the first one big, the others on the line under it, each value in a
// span of its own so it carries its level's colour.
function square(kind, readings) {
  const sq = el("div", `sq ${kind}`,
    `<span class="head"><span class="title"></span><i></i></span>
     <span class="value"><span class="big"></span><span class="lab"></span></span>`);
  const lab = sq.querySelector(".lab");
  const cells = readings.map((reading, i) => {
    if (i === 0) return { reading, value: sq.querySelector(".big") };
    if (i > 1) lab.append(el("span", "sep", " · "));
    const value = el("span", "v");
    lab.append(value);
    return { reading, value };
  });
  const sep = el("span", "sep");
  const text = el("span", "lvt");
  lab.append(sep, text);
  return { kind, sq, cells, sep, text, title: sq.querySelector(".title"), dot: sq.querySelector(".head i") };
}

export function render(ctx) {
  const root = el("section", "room");
  const rooms = ctx.config.rooms;
  const index = Math.max(0, rooms.findIndex((r) => r.id === ctx.routeId));
  const room = rooms[index];
  const lights = lightsOf(room);
  const scenes = [room.scenes ?? []].flat().filter(Boolean);
  const climateReadings = ["temperature", "humidity"].filter((r) => room.climate?.[r]);
  const airReadings = AIR.filter((r) => room.air?.[r]);
  const player = playerOf(room);

  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><button class="back" type="button"><ha-icon icon="mdi:chevron-left"></ha-icon><span class="name"></span></button></div>
    <div class="dots" role="img">${rooms.map((r, i) => `<i${i === index ? ' class="a"' : ""}></i>`).join("")}</div>`;

  const parts = { room, index, ctx, squares: [], scenes: [], tiles: [], memberTiles: [], membersKey: null,
    back: root.querySelector(".back"), name: root.querySelector(".top .name"), dots: root.querySelector(".dots") };
  parts.back.addEventListener("click", () => parts.ctx.navigate("#/rooms"));

  if (climateReadings.length || airReadings.length) {
    const box = el("div", "squares");
    if (climateReadings.length) parts.squares.push(square("climate", climateReadings));
    if (airReadings.length) parts.squares.push(square("air", airReadings));
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
    for (const scene of scenes) {
      const button = el("button", "scn");
      button.type = "button";
      button.addEventListener("click", () => {
        const { hass, offline } = parts.ctx;
        if (offline || !hass?.callService) return;
        call(root, hass, "scene", "turn_on", { entity_id: scene }, "card.pocket.error.scene");
      });
      parts.scenes.push({ scene, button });
      row.append(button);
    }
    root.append(row);
  }

  parts.musicSec = el("div", "sec");
  parts.media = el("div", "media",
    `<span class="art"><img alt="" hidden></span>
     <span class="meta"><span class="t1"></span> <span class="t2"></span></span>
     <button class="play" type="button"><ha-icon></ha-icon></button>`);
  parts.player = player;
  parts.media.querySelector(".play").addEventListener("click", () => {
    const { hass, offline } = parts.ctx;
    const state = player ? hass?.states?.[player] : undefined;
    if (offline || !state || GONE.has(state.state) || !hass.callService) return;
    call(root, hass, "media_player", "media_play_pause", { entity_id: player }, "card.pocket.error.media");
  });
  root.append(parts.musicSec, parts.media);

  if (!lights.length && !scenes.length && !parts.squares.length && !player) {
    parts.empty = el("p", "empty");
    root.append(parts.empty);
  }

  swipeBetweenRooms(root, parts);
  root._room = parts;
  update(root, ctx);
  return root;
}

// The room swipe: a horizontal move of the finger anywhere on the page but a light tile or the
// scene row. A swipe ends with the next page, or (first / last room) with nothing; either way the
// click the browser may fire after it is dropped.
function swipeBetweenRooms(root, parts) {
  let swipe = null;
  let swallow = false;
  root.addEventListener("pointerdown", (e) => {
    swallow = false;
    swipe = null;
    if (e.button != null && e.button !== 0) return;
    if (e.target?.closest?.("pocket-light-tile, .scenes")) return;
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
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 2 * dy) return;
    swallow = true;
    const rooms = parts.ctx.config.rooms;
    const next = rooms[parts.index + (dx < 0 ? 1 : -1)];
    // At the first or last room there is no next page, yet swallow stays set: the click the
    // browser fires after the finger lifts would otherwise press whatever the swipe ended on.
    // The next pointerdown clears it.
    if (next) parts.ctx.navigate(`#/room/${next.id}`, { replace: true });
  });
  root.addEventListener("pointercancel", () => { swipe = null; });
  root.addEventListener("click", (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}

export function update(root, ctx) {
  const parts = root._room;
  parts.ctx = ctx;
  const { room } = parts;
  const rooms = ctx.config.rooms;
  setText(parts.name, room.name);
  setAttr(parts.back, "aria-label", ctx.t("card.pocket.room.back"));
  setAttr(parts.dots, "aria-label", ctx.t("card.pocket.room.position", { index: parts.index + 1, count: rooms.length }));
  updateSquares(parts, ctx);
  if (parts.lightsSec) {
    setText(parts.lightsSec, ctx.t(parts.groupTile ? "card.pocket.room.lights" : "card.pocket.room.scenes"));
  }
  if (parts.groupTile) {
    parts.groupTile.config = { name: ctx.t("card.pocket.room.all_lights"), entities: lightsOf(room) };
    updateMembers(parts, ctx);
  }
  for (const tile of parts.tiles) {
    tile.t = ctx.t;
    tile.offline = ctx.offline;
    tile.hass = ctx.hass;
  }
  for (const { scene, button } of parts.scenes) {
    setText(button, shortName(ctx.hass, scene, room));
    button.disabled = !!ctx.offline;
  }
  updateMedia(parts, ctx);
  if (parts.empty) setText(parts.empty, ctx.t("card.pocket.room.empty"));
}

function setClass(node, base, lv, muted = false) {
  const name = [base, lv && `lv-${lv}`, muted && "muted"].filter(Boolean).join(" ");
  if (node.className !== name) node.className = name;
}

function formatted(ctx, reading, value) {
  if (value == null) return ctx.t("card.pocket.format.none");
  if (reading === "temperature") return temperature(ctx, value);
  if (reading === "humidity") return percent(ctx, value);
  return ctx.t(`card.pocket.room.reading.${reading}`, { value: number(ctx, value, 0, { grouping: false }) });
}

function updateSquares(parts, ctx) {
  const { hass } = ctx;
  const { room } = parts;
  const levels = Object.fromEntries(roomLevels(hass, room, ctx.config.thresholds)
    .filter(({ result }) => result).map(({ reading, result }) => [reading, result]));
  for (const s of parts.squares) {
    const source = s.kind === "climate" ? room.climate : room.air;
    let worst = null;
    s.cells.forEach(({ reading, value }, i) => {
      const lv = levels[reading];
      const n = numberOf(hass, source[reading]);
      setClass(value, i === 0 ? "big" : "v", lv?.level, n == null);
      setText(value, formatted(ctx, reading, n));
      if (lv && (!worst || RANK[lv.level] > RANK[worst.result.level])) worst = { reading, result: lv };
    });
    let text = "";
    if (worst) {
      const { level, side } = worst.result;
      text = level === "good" ? ctx.t(`card.pocket.reading.${worst.reading}.good`)
        : ctx.t(`card.pocket.reading.${worst.reading}.${side ? `${level}_${side}` : level}`);
    }
    // No values on the line (a square of one reading): no separator before the level text.
    setText(s.sep, text && s.cells.length > 1 ? " · " : "");
    setText(s.text, text);
    setText(s.title, ctx.t(`card.pocket.room.${s.kind}`));
    setClass(s.dot, "", worst?.result.level);
  }
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
      tile.config = { name: names[i], entities: [id] };
      tile.hass = hass;
      return tile;
    });
    parts.tiles.push(...parts.memberTiles);
    parts.members.replaceChildren(...parts.memberTiles);
  }
  parts.toggle.hidden = members.length === 0;
  parts.members.hidden = !parts.open || members.length === 0;
  setText(parts.toggle, `${ctx.t(`card.pocket.room.members.${pluralOf(ctx, members.length)}`, { count: members.length })} ›`);
  setAttr(parts.toggle, "aria-expanded", String(!!parts.open));
}

function updateMedia(parts, ctx) {
  const { media, player, room } = parts;
  const state = player ? ctx.hass?.states?.[player] : undefined;
  media.hidden = !state;
  parts.musicSec.hidden = !state;
  setText(parts.musicSec, ctx.t("card.pocket.room.music"));
  if (!state) return;
  const gone = GONE.has(state.state);
  const a = gone ? {} : state.attributes ?? {};
  const isPlaying = state.state === "playing";
  media.classList.toggle("muted", gone);
  setText(media.querySelector(".t1"),
    gone ? ctx.t("card.pocket.format.none") : a.media_title || ctx.t("card.pocket.home.nothing_playing"));
  setText(media.querySelector(".t2"), a.media_artist || a.media_album_artist || room.name);
  const img = media.querySelector(".art img");
  if (a.entity_picture) setAttr(img, "src", a.entity_picture);
  img.hidden = !a.entity_picture;
  const play = media.querySelector(".play");
  setAttr(play, "aria-label", ctx.t(isPlaying ? "card.pocket.home.pause" : "card.pocket.home.play"));
  setAttr(play.querySelector("ha-icon"), "icon", isPlaying ? "mdi:pause" : "mdi:play");
  play.disabled = !!ctx.offline || gone;
}
