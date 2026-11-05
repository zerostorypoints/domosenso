// The Home page (spec 6.2, mockup home-a-themes.html), on the page contract of pages/index.js:
//   - the title and today's date;
//   - attention pills (lib/attention.js), poor first; a pill opens its room; one green "all good"
//     pill when nothing is fair or poor;
//   - metric chips: inside (the range of the rooms' temperatures), outside, the air score of the
//     first room that has one, the number of lights on; a chip whose entity the config does not
//     name is left out, one whose reading is unavailable shows a dash;
//   - now playing, for the first room with media: artwork, title, artist, play/pause in place,
//     a tap elsewhere opens Media; no card while the player is missing from Home Assistant;
//   - Quick: a <pocket-light-tile> per room with lights (the prototype has no favourites yet) and
//     an All off tile;
//   - a sideways strip of the rooms, each opening its room page.
// render() builds every element once; update() only patches text and attributes (the pills are
// rebuilt only when the list of items changes), so a scroll or a drag survives hass updates.

import { attention } from "../lib/attention.js";
import { numberOf } from "../lib/level.js";
import { formatDate } from "../lib/i18n.js";
import {
  GONE, el, setText, setAttr, setLine, number, temperature, percent, call, lightsOf, lightsOn, lightsOnIn,
  playing,
} from "../lib/page-kit.js";
import "../lib/light-tile.js";

const STYLE = `
  .home .top { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 4px 4px; }
  .home .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .home .top .date { font-size: 12px; color: var(--mut); }
  .home .att, .home .chips, .home .strip { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
                                           margin: 4px -16px 14px; padding: 0 16px; }
  .home .att::-webkit-scrollbar, .home .chips::-webkit-scrollbar, .home .strip::-webkit-scrollbar { display: none; }
  .home .pill { flex: 0 0 auto; box-sizing: border-box; min-width: 44px; min-height: 44px; margin: 0; padding: 8px 12px;
                display: flex; gap: 7px; align-items: center; font: inherit; font-size: 12.5px; color: var(--fg);
                background: var(--card); border: 1px solid var(--line); border-radius: 999px; }
  .home button.pill { cursor: pointer; }
  .home .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--ok); }
  .home .dot.fair { background: var(--warn); }
  .home .dot.poor { background: var(--bad); }
  .home .chip { flex: 0 0 auto; min-width: 58px; padding: 9px 12px; font-size: 16px; font-weight: 600;
                background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
  .home .chip small { display: block; font-size: 11.5px; color: var(--mut); font-weight: 400; margin-top: 1px; }
  .home .chip[hidden], .home .now[hidden], .home .art img[hidden], .home .quick-sec[hidden] { display: none; }
  .home .now { display: flex; align-items: center; gap: 12px; padding: 12px;
               background: var(--card); border: 1px solid var(--line); border-radius: 20px; }
  .home .now .open { flex: 1; min-width: 0; min-height: 52px; margin: 0; padding: 0; border: 0; background: none;
                     display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: var(--fg);
                     cursor: pointer; }
  .home .now.muted .open { opacity: .55; }
  .home .att .item { flex: 0 0 auto; display: flex; }
  .home .art { display: block; width: 52px; height: 52px; border-radius: 12px; flex: 0 0 auto; overflow: hidden; background: var(--chip); }
  .home .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .home .meta { flex: 1; min-width: 0; }
  .home .t1 { display: block; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .home .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; overflow: hidden;
              text-overflow: ellipsis; white-space: nowrap; }
  .home .play { width: 44px; height: 44px; flex: 0 0 auto; margin: 0; padding: 0; border: 0; border-radius: 50%;
                background: var(--chip); color: var(--fg); display: flex; align-items: center; justify-content: center;
                cursor: pointer; }
  .home .play:disabled, .home .all-off:disabled { opacity: .55; cursor: default; }
  .home .sec { display: flex; justify-content: space-between; align-items: center; margin: 18px 4px 8px;
               font-size: 13px; font-weight: 600; }
  .home .sec .all { min-width: 44px; min-height: 44px; margin: -12px -4px; padding: 0 4px; text-align: right; border: 0; background: none;
                    font: inherit; font-size: 13px; font-weight: 400; color: var(--mut); cursor: pointer; }
  .home .quick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .home .all-off, .home .rc { box-sizing: border-box; min-height: 64px; margin: 0; padding: 12px; text-align: left;
                              font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
                              border-radius: 18px; cursor: pointer; }
  .home .all-off .ic { width: 30px; height: 30px; border-radius: 50%; background: var(--chip); margin-bottom: 8px;
                       display: flex; align-items: center; justify-content: center; color: var(--mut);
                       --mdc-icon-size: 18px; }
  .home .strip { margin-bottom: 0; }
  .home .rc { flex: 0 0 138px; }
  .home .rc .t2 .muted { opacity: .55; }
  .home button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

const allLights = (config) => [...new Set(config.rooms.flatMap(lightsOf))];

// The page's parts: built once, kept on the element for update().
export function render(ctx) {
  const root = el("section", "home");
  const rooms = ctx.config.rooms;
  const withLights = rooms.filter((room) => lightsOf(room).length > 0);
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="top"><b></b> <span class="date"></span></div>
    <div class="att" role="list"></div>
    <div class="chips">
      <div class="chip" data-chip="inside"><span class="v"></span> <small></small></div>
      <div class="chip" data-chip="outside"><span class="v"></span> <small></small></div>
      <div class="chip" data-chip="air"><span class="v"></span> <small></small></div>
      <div class="chip" data-chip="lights_on"><span class="v"></span> <small></small></div>
    </div>
    <div class="now" hidden>
      <button class="open" type="button">
        <span class="art"><img alt="" hidden></span>
        <span class="meta"><span class="t1"></span> <span class="t2"></span></span>
      </button>
      <button class="play" type="button"><ha-icon></ha-icon></button>
    </div>
    <div class="quick-sec">
      <div class="sec"><span class="quick-title"></span></div>
      <div class="quick"></div>
    </div>
    <div class="sec"><span class="rooms-title"></span><button class="all" type="button"></button></div>
    <div class="strip"></div>`;

  const parts = {
    title: root.querySelector(".top b"),
    date: root.querySelector(".top .date"),
    att: root.querySelector(".att"),
    chips: Object.fromEntries([...root.querySelectorAll(".chip")].map((chip) => [chip.dataset.chip, chip])),
    now: root.querySelector(".now"),
    quickSec: root.querySelector(".quick-sec"),
    quickTitle: root.querySelector(".quick-title"),
    roomsTitle: root.querySelector(".rooms-title"),
    allRooms: root.querySelector(".sec .all"),
    tiles: [],
    roomCards: [],
    pillsKey: null,
    ctx,
  };

  const now = parts.now;
  now.querySelector(".open").addEventListener("click", () => parts.ctx.navigate("#/media"));
  now.querySelector(".play").addEventListener("click", () => {
    const { hass, offline } = parts.ctx;
    const player = parts.player;
    if (offline || !player || !hass?.states?.[player] || GONE.has(hass.states[player].state)) return;
    call(root, hass, "media_player", "media_play_pause", { entity_id: player }, "card.pocket.error.media");
  });

  const quick = root.querySelector(".quick");
  for (const room of withLights) {
    const tile = document.createElement("pocket-light-tile");
    tile.t = ctx.t;
    tile.config = { name: room.name, entities: lightsOf(room) };
    parts.tiles.push(tile);
    quick.append(tile);
  }
  const allOff = el("button", "all-off",
    `<span class="ic"><ha-icon icon="mdi:lightbulb-off-outline"></ha-icon></span><span class="t1"></span> <span class="t2"></span>`);
  allOff.type = "button";
  allOff.addEventListener("click", () => {
    const { hass, offline, config } = parts.ctx;
    if (offline || !hass?.callService) return;
    call(root, hass, "light", "turn_off", { entity_id: allLights(config) }, "card.pocket.error.light");
  });
  parts.allOff = allOff;
  quick.append(allOff);
  parts.quickSec.hidden = withLights.length === 0;

  parts.allRooms.addEventListener("click", () => parts.ctx.navigate("#/rooms"));
  const strip = root.querySelector(".strip");
  for (const room of rooms) {
    const card = el("button", "rc", `<span class="t1"></span> <span class="t2"></span>`);
    card.type = "button";
    card.addEventListener("click", () => parts.ctx.navigate(`#/room/${room.id}`));
    parts.roomCards.push({ room, card });
    strip.append(card);
  }

  root._home = parts;
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._home;
  parts.ctx = ctx;
  setText(parts.title, ctx.t("card.pocket.home.title"));
  setText(parts.date, formatDate({ locale: { language: ctx.lang } }, new Date(),
    { weekday: "short", day: "numeric", month: "short" }));
  updatePills(parts, ctx);
  updateChips(parts, ctx);
  updateNow(parts, ctx);
  updateQuick(parts, ctx);
  updateRooms(parts, ctx);
}

function updatePills(parts, ctx) {
  const names = Object.fromEntries(ctx.config.rooms.map((room) => [room.id, room.name]));
  const pills = attention(ctx.hass, ctx.config).map((item) => {
    const key = item.side ? `${item.level}_${item.side}` : item.level;
    const message = ctx.t(`card.pocket.reading.${item.reading}.${key}`);
    return { ...item, text: ctx.t("card.pocket.home.pill", { room: names[item.room], message }) };
  });
  const key = JSON.stringify([ctx.t("card.pocket.home.all_good"), pills.map((p) => [p.level, p.text, p.target])]);
  if (key === parts.pillsKey) return;
  parts.pillsKey = key;
  if (pills.length === 0) {
    const pill = el("span", "pill", `<i class="dot good"></i><span></span>`);
    pill.lastChild.textContent = ctx.t("card.pocket.home.all_good");
    parts.att.replaceChildren(listItem(pill));
    return;
  }
  parts.att.replaceChildren(...pills.map((item) => {
    const pill = el("button", "pill", `<i class="dot ${item.level}"></i><span></span>`);
    pill.type = "button";
    pill.lastChild.textContent = item.text;
    pill.addEventListener("click", () => parts.ctx.navigate(item.target));
    return listItem(pill);
  }));
}

// A list item around a pill: the button keeps its own role.
function listItem(pill) {
  const item = el("span", "item");
  item.setAttribute("role", "listitem");
  item.append(pill);
  return item;
}

function updateChips(parts, ctx) {
  const { hass, config } = ctx;
  const set = (name, shown, value) => {
    const chip = parts.chips[name];
    chip.hidden = !shown;
    if (!shown) return;
    setText(chip.querySelector(".v"), value);
    setText(chip.querySelector("small"), ctx.t(`card.pocket.home.chip.${name}`));
  };

  const sensors = config.rooms.map((room) => room.climate?.temperature).filter(Boolean);
  const temps = sensors.map((id) => numberOf(hass, id)).filter((v) => v != null);
  let inside = ctx.t("card.pocket.format.none");
  if (temps.length) {
    const [min, max] = [Math.min(...temps), Math.max(...temps)];
    inside = number(ctx, min, 1) === number(ctx, max, 1) ? temperature(ctx, min)
      : ctx.t("card.pocket.format.temperature_range", { min: number(ctx, min, 1), max: number(ctx, max, 1) });
  }
  set("inside", sensors.length > 0, inside);

  const outside = config.outside?.temperature;
  set("outside", !!outside, temperature(ctx, numberOf(hass, outside)));

  const scoreId = config.rooms.find((room) => room.air?.score)?.air.score;
  const score = numberOf(hass, scoreId);
  set("air", !!scoreId, score == null ? ctx.t("card.pocket.format.none") : number(ctx, score, 0));

  set("lights_on", allLights(config).length > 0, String(lightsOnIn(hass, config.rooms)));
}

function updateNow(parts, ctx) {
  const now = parts.now;
  const room = ctx.config.rooms.find((r) => r.media);
  const player = room ? [room.media].flat()[0] : undefined;
  const state = player ? ctx.hass?.states?.[player] : undefined;
  parts.player = player;
  now.hidden = !state;
  if (!state) return;
  const gone = GONE.has(state.state);
  const a = gone ? {} : state.attributes ?? {};
  const playing = state.state === "playing";
  // An unavailable player: a dash and the muted style (spec 6.5), not "nothing playing".
  const title = gone ? ctx.t("card.pocket.format.none") : a.media_title || ctx.t("card.pocket.home.nothing_playing");
  now.classList.toggle("muted", gone);
  setText(now.querySelector(".t1"), title);
  setText(now.querySelector(".t2"), a.media_artist || a.media_album_artist || room.name);
  const img = now.querySelector(".art img");
  if (a.entity_picture) setAttr(img, "src", a.entity_picture);
  img.hidden = !a.entity_picture;
  const play = now.querySelector(".play");
  const label = ctx.t(playing ? "card.pocket.home.pause" : "card.pocket.home.play");
  setAttr(play, "aria-label", label);
  setAttr(play.querySelector("ha-icon"), "icon", playing ? "mdi:pause" : "mdi:play");
  play.disabled = ctx.offline || gone;
  setAttr(now.querySelector(".open"), "aria-label", title);
}

function updateQuick(parts, ctx) {
  setText(parts.quickTitle, ctx.t("card.pocket.home.quick"));
  for (const tile of parts.tiles) {
    tile.t = ctx.t;
    tile.offline = ctx.offline;
    tile.hass = ctx.hass;
  }
  const on = lightsOnIn(ctx.hass, ctx.config.rooms);
  setText(parts.allOff.querySelector(".t1"), ctx.t("card.pocket.home.all_off"));
  setText(parts.allOff.querySelector(".t2"),
    on > 0 ? ctx.t("card.pocket.home.on_now", { count: on }) : ctx.t("card.pocket.home.none_on"));
  parts.allOff.disabled = !!ctx.offline;
}

function updateRooms(parts, ctx) {
  const { hass } = ctx;
  setText(parts.roomsTitle, ctx.t("card.pocket.home.rooms"));
  setText(parts.allRooms, ctx.t("card.pocket.home.all_rooms"));
  for (const { room, card } of parts.roomCards) {
    // A reading the room names but cannot read now: a muted dash.
    const bits = [];
    if (room.climate?.temperature) {
      const value = numberOf(hass, room.climate.temperature);
      bits.push({ text: temperature(ctx, value), muted: value == null });
    }
    const on = lightsOn(hass, room);
    if (on > 0) bits.push({ text: ctx.t("card.pocket.home.room_lights_on", { count: on }) });
    else if (room.climate?.humidity) {
      const value = numberOf(hass, room.climate.humidity);
      bits.push({ text: percent(ctx, value), muted: value == null });
    }
    if (playing(hass, room)) bits.push({ text: ctx.t("card.pocket.home.playing") });
    setText(card.querySelector(".t1"), room.name);
    setLine(card.querySelector(".t2"), bits);
  }
}
