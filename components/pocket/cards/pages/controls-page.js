// The Controls page (#/controls, #/controls/status), on the page contract of pages/index.js: the
// Ramka's controls and status screens for the phone, two views switched under the title (a switch
// replaces the history entry, as Home's):
//   Controls  what the person acts on, each section only when the home has something for it:
//     - Music: the player that plays (else the first area's, lib/media.js playersOf): artwork, title
//       and artist (a tap opens Media with it), previous / play-pause / next, volume down / up with
//       its level, power when the player has it;
//     - Covers: each cover (awnings, blinds) by area (lib/controls.js), its state or position, open /
//       stop / close (44 px, each only when the cover supports it); all open / all closed with two
//       or more;
//     - Timers: each timer the home names (config.timers), its time left (ticking while active), start or pause, cancel;
//     - Lights: a light tile per room with lights (as Quick) and All off.
//   Status    read-only, as the Ramka's status page: covers, doors and windows, lights per room and
//     locks, an equal tile each: icon, name, state; an active one (open, on, unlocked) in the accent.
//     A tile of something Controls acts on switches to Controls; a door or window opens the
//     timeline of its states (lib/sensor-list.js sensorSpec).
// Every control sends through ctx.optimistic: its new state at once, rolled back with a toast.

import { contactsOf, coverMoving, coversOf, groupedByArea, locksOf, timerLeft, timersOf } from "../lib/controls.js";
import { can, playersOf } from "../lib/media.js";
import { sensorSpec } from "../lib/sensor-list.js";
import { GONE, operable, el, lightsOf, lampsOf, number, setArt, setAttr, setText } from "../lib/page-kit.js";
import "../lib/light-tile.js";

const VIEWS = ["controls", "status"];
const COVER = { open: 1, close: 2, stop: 8 };   // cover supported_features

const STYLE = `
  .controls .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 4px 8px; }
  .controls .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .controls .views { display: flex; gap: 2px; margin: 0 0 12px; padding: 3px; border-radius: 12px; background: var(--chip); }
  .controls .views button { flex: 1 1 0; min-height: 44px; margin: 0; padding: 0; border: 0; border-radius: 9px; background: none;
                            color: var(--fg); font: inherit; font-size: 14px; cursor: pointer; }
  .controls .views button[aria-selected="true"] { background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
  .controls h3 { margin: 18px 4px 8px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .controls h4 { margin: 10px 4px 6px; font-size: 12.5px; font-weight: 600; color: var(--mut); text-transform: uppercase; letter-spacing: .5px; }
  .controls [hidden] { display: none !important; }
  .controls .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 10px 12px; }
  .controls .music .open { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; margin: 0; padding: 0;
                           border: 0; background: none; color: var(--fg); font: inherit; text-align: left; cursor: pointer; }
  .controls .art { width: 56px; height: 56px; flex: 0 0 auto; border-radius: 12px; overflow: hidden; background: var(--chip);
                   display: flex; align-items: center; justify-content: center; color: var(--mut); --mdc-icon-size: 26px; }
  .controls .art img { width: 100%; height: 100%; object-fit: cover; }
  .controls .meta { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .controls .t1 { display: block; font-size: 15px; font-weight: 600; }
  .controls .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; }
  .controls .keys { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-top: 10px; }
  .controls .key { width: 44px; height: 44px; flex: 0 0 auto; margin: 0; padding: 0; border: 0; border-radius: 50%;
                   background: var(--chip); color: var(--fg); display: flex; align-items: center; justify-content: center;
                   cursor: pointer; --mdc-icon-size: 22px; }
  .controls .key.main { width: 52px; height: 52px; background: var(--fg); color: var(--bg); --mdc-icon-size: 28px; }
  .controls .key.on { color: var(--acc); }
  .controls .key:disabled { opacity: .4; cursor: default; }
  .controls .vol { min-width: 44px; text-align: center; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .controls .row { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 6px 0; border-top: 1px solid var(--line); }
  .controls .row:first-of-type { border-top: 0; }
  .controls .row .name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 15px; }
  .controls .row .name small { display: block; font-size: 12.5px; color: var(--mut); font-variant-numeric: tabular-nums; }
  .controls .row .keys { margin: 0; justify-content: flex-end; }
  .controls .all { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .controls .all button { min-height: 44px; margin: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--card);
                          color: var(--fg); font: inherit; font-size: 14px; display: flex; align-items: center; justify-content: center;
                          gap: 6px; cursor: pointer; --mdc-icon-size: 20px; }
  .controls .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr));
                    grid-auto-rows: 1fr; gap: 10px; }
  .controls .alloff { box-sizing: border-box; min-height: 64px; margin: 0; padding: 12px; text-align: left; font: inherit; color: var(--fg);
                      background: var(--card); border: 1px solid var(--line); border-radius: 18px; cursor: pointer; --mdc-icon-size: 18px; }
  .controls .st { box-sizing: border-box; min-height: 88px; margin: 0; padding: 12px; text-align: left; font: inherit; color: var(--fg);
                  background: var(--card); border: 1px solid var(--line); border-radius: 18px; display: flex; flex-direction: column;
                  gap: 4px; cursor: pointer; overflow-wrap: anywhere; --mdc-icon-size: 24px; }
  .controls .st ha-icon { color: var(--mut); }
  .controls .st .n { font-size: 13px; color: var(--mut); }
  .controls .st .v { font-size: 17px; font-weight: 600; }
  .controls .st.active { border-color: var(--acc); }
  .controls .st.active ha-icon, .controls .st.active .v { color: var(--acc); }
  .controls .st.gone { opacity: .55; }
  .controls .none { margin: 24px 8px; font-size: 15px; color: var(--mut); text-align: center; }
  .controls button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

const allLights = (config) => [...new Set((config.rooms ?? []).flatMap(lightsOf))];

export function render(ctx) {
  const root = el("section", "controls");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <div class="views" role="tablist">${VIEWS.map((v) => `<button type="button" role="tab" data-view="${v}"></button>`).join("")}</div>
    <div class="pane controls-pane">
      <section class="music"><h3></h3><div class="card">
        <button class="open" type="button"><span class="art"><img alt="" hidden><ha-icon icon="mdi:music"></ha-icon></span>
          <span class="meta"><span class="t1"></span><span class="t2"></span></span></button>
        <div class="keys">
          <button class="key" type="button" data-act="previous"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
          <button class="key main" type="button" data-act="play"><ha-icon icon="mdi:play"></ha-icon></button>
          <button class="key" type="button" data-act="next"><ha-icon icon="mdi:skip-next"></ha-icon></button>
          <button class="key" type="button" data-act="down"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
          <span class="vol"></span>
          <button class="key" type="button" data-act="up"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
          <button class="key" type="button" data-act="power"><ha-icon icon="mdi:power"></ha-icon></button>
        </div></div></section>
      <section class="covers"><h3></h3><div class="list"></div><div class="all">
        <button type="button" data-all="open"><ha-icon icon="mdi:arrow-up"></ha-icon><span></span></button>
        <button type="button" data-all="close"><ha-icon icon="mdi:arrow-down"></ha-icon><span></span></button></div></section>
      <section class="timers"><h3></h3><div class="card list"></div></section>
      <section class="lights"><h3></h3><div class="grid"></div></section>
    </div>
    <div class="pane status-pane"><div class="groups"></div></div>
    <p class="none" hidden></p>`;
  const parts = { ctx, view: ctx.routeId === "status" ? "status" : "controls", keys: {}, ticker: null };
  root._controls = parts;

  for (const button of root.querySelectorAll(".views button")) {
    button.addEventListener("click", () => {
      if (button.dataset.view !== parts.view) {
        parts.ctx.navigate(button.dataset.view === "status" ? "#/controls/status" : "#/controls", { replace: true });
      }
    });
  }
  root.querySelector(".music .open").addEventListener("click", () => {
    const room = parts.player?.room;
    parts.ctx.navigate(room ? `#/media/${encodeURIComponent(room.id)}` : "#/media");
  });
  for (const key of root.querySelectorAll(".music .key")) key.addEventListener("click", () => musicKey(root, key.dataset.act));
  for (const button of root.querySelectorAll(".covers .all button")) {
    button.addEventListener("click", () => {
      const ids = coversOf(parts.ctx.hass).filter((id) => operable(parts.ctx.hass.states[id]));
      if (ids.length) coverCall(root, ids, button.dataset.all);
    });
  }

  // Lights: a tile per room with lights, then All off (as Quick).
  const grid = root.querySelector(".lights .grid");
  parts.tiles = [];
  for (const room of (ctx.config.rooms ?? []).filter((r) => lightsOf(r).length)) {
    const tile = document.createElement("pocket-light-tile");
    tile.config = { name: room.name, entities: lightsOf(room) };
    parts.tiles.push(tile);
    grid.append(tile);
  }
  const allOff = el("button", "alloff", `<ha-icon icon="mdi:lightbulb-off-outline"></ha-icon><span class="t1"></span>`);
  allOff.type = "button";
  allOff.addEventListener("click", () => {
    const { hass, offline, config, optimistic } = parts.ctx;
    if (offline || !hass?.callService) return;
    const lights = allLights(config);
    optimistic.send(root, hass, { domain: "light", service: "turn_off", data: { entity_id: lights },
      errorKey: "card.pocket.error.light", expect: Object.fromEntries(lights.map((id) => [id, { state: "off" }])) });
  });
  parts.allOff = allOff;
  if (parts.tiles.length) grid.append(allOff);

  update(root, ctx);
  return root;
}

function send(root, call) {
  const { hass, offline, optimistic } = root._controls.ctx;
  if (offline || !hass?.callService) return;
  optimistic.send(root, hass, call);
}

function musicKey(root, act) {
  const player = root._controls.player;
  const state = player ? root._controls.ctx.hass?.states?.[player.id] : null;
  if (!operable(state)) return;
  const id = player.id;
  const base = { domain: "media_player", data: { entity_id: id }, errorKey: "card.pocket.error.media" };
  const volume = Number(state.attributes?.volume_level);
  if (act === "play") {
    send(root, { ...base, service: "media_play_pause", expect: { [id]: { state: state.state === "playing" ? "paused" : "playing" } } });
  } else if (act === "previous" || act === "next") {
    send(root, { ...base, service: act === "previous" ? "media_previous_track" : "media_next_track", expect: { [id]: { changed: true } } });
  } else if (act === "down" || act === "up") {
    const next = Number.isFinite(volume) ? Math.min(1, Math.max(0, Math.round((volume + (act === "up" ? 0.02 : -0.02)) * 100) / 100)) : null;
    send(root, { ...base, service: act === "up" ? "volume_up" : "volume_down",
      expect: { [id]: next == null ? { changed: true } : { attributes: { volume_level: next } } } });
  } else if (act === "power") {
    const off = state.state === "off";
    send(root, { ...base, service: off ? "turn_on" : "turn_off", expect: { [id]: off ? { changed: true } : { state: "off" } } });
  }
}

function coverCall(root, ids, act) {
  const service = { open: "open_cover", close: "close_cover", stop: "stop_cover" }[act];
  const expect = Object.fromEntries(ids.map((id) => [id, act === "stop" ? { changed: true } : { state: act === "open" ? "opening" : "closing" }]));
  send(root, { domain: "cover", service, data: { entity_id: ids.length === 1 ? ids[0] : ids }, errorKey: "card.pocket.error.cover", expect });
}

function timerCall(root, id, act) {
  const service = { start: "start", pause: "pause", cancel: "cancel" }[act];
  const state = { start: "active", pause: "paused", cancel: "idle" }[act];
  send(root, { domain: "timer", service, data: { entity_id: id }, errorKey: "card.pocket.error.timer", expect: { [id]: { state } } });
}

const features = (state) => Number(state?.attributes?.supported_features) || 0;

export function update(root, ctx) {
  const parts = root._controls;
  parts.ctx = ctx;
  const { hass, config } = ctx;
  const $ = (sel) => root.querySelector(sel);
  setText($(".top b"), ctx.t("card.pocket.controls.title"));
  for (const button of root.querySelectorAll(".views button")) {
    setText(button, ctx.t(`card.pocket.controls.view.${button.dataset.view}`));
    setAttr(button, "aria-selected", String(button.dataset.view === parts.view));
  }
  setAttr($(".views"), "aria-label", ctx.t("card.pocket.controls.view.label"));
  const status = parts.view === "status";
  $(".controls-pane").hidden = status;
  $(".status-pane").hidden = !status;

  let any = false;
  if (status) any = updateStatus(root, parts, ctx);
  else {
    any = updateMusic(root, parts, ctx) | updateCovers(root, parts, ctx) | updateTimers(root, parts, ctx);
    const lights = $(".lights");
    lights.hidden = parts.tiles.length === 0;
    any = any || parts.tiles.length > 0;
    setText(lights.querySelector("h3"), ctx.t("card.pocket.controls.lights"));
    for (const tile of parts.tiles) {
      tile.t = ctx.t;
      tile.optimistic = ctx.optimistic;
      tile.offline = ctx.offline;
      tile.hass = hass;
    }
    setText(parts.allOff.querySelector(".t1"), ctx.t("card.pocket.home.all_off"));
    parts.allOff.disabled = !!ctx.offline || allLights(config).length === 0;
  }
  const none = $(".none");
  none.hidden = any;
  setText(none, ctx.t("card.pocket.controls.none"));
}

function updateMusic(root, parts, ctx) {
  const section = root.querySelector(".music");
  const players = playersOf(ctx.config, ctx.hass);
  const states = ctx.hass?.states ?? {};
  const player = players.find((p) => states[p.id]?.state === "playing") ?? players.find((p) => states[p.id]) ?? null;
  parts.player = player;
  section.hidden = !player;
  if (!player) return false;
  const state = states[player.id];
  const gone = GONE.has(state.state);
  const a = gone ? {} : state.attributes ?? {};
  setText(section.querySelector("h3"), ctx.t("card.pocket.controls.music"));
  setText(section.querySelector(".t1"), gone ? ctx.t("card.pocket.format.none") : a.media_title || ctx.t("card.pocket.home.nothing_playing"));
  setText(section.querySelector(".t2"), [a.friendly_name || player.room.name, a.media_artist].filter(Boolean).join(" · "));
  setArt(section.querySelector(".art img"), section.querySelector(".art ha-icon"), a.entity_picture);
  const playingNow = state.state === "playing";
  const key = (act) => section.querySelector(`[data-act="${act}"]`);
  const play = key("play");
  setAttr(play.querySelector("ha-icon"), "icon", playingNow ? "mdi:pause" : "mdi:play");
  setAttr(play, "aria-label", ctx.t(playingNow ? "card.pocket.home.pause" : "card.pocket.home.play"));
  const off = state.state === "off";
  const blocked = !operable(state);
  play.disabled = blocked || off || !(can(state, "play") || can(state, "pause"));
  key("previous").disabled = blocked || off || !can(state, "previous");
  key("next").disabled = blocked || off || !can(state, "next");
  setAttr(key("previous"), "aria-label", ctx.t("card.pocket.media.previous"));
  setAttr(key("next"), "aria-label", ctx.t("card.pocket.media.next"));
  const volume = Number(a.volume_level);
  const hasVolume = can(state, "volume_set") && !off;
  key("down").hidden = !hasVolume;
  key("up").hidden = !hasVolume;
  const vol = section.querySelector(".vol");
  vol.hidden = !hasVolume;
  setText(vol, Number.isFinite(volume) ? `${Math.round(volume * 100)}` : "");
  setAttr(key("down"), "aria-label", ctx.t("card.pocket.controls.volume_down"));
  setAttr(key("up"), "aria-label", ctx.t("card.pocket.controls.volume_up"));
  const power = key("power");
  power.hidden = !(can(state, "turn_on") || can(state, "turn_off"));
  power.classList.toggle("on", !off && !gone);
  setAttr(power, "aria-label", ctx.t(off ? "card.pocket.media.power_on" : "card.pocket.media.power_off"));
  for (const k of section.querySelectorAll(".key")) if (ctx.offline) k.disabled = true;
  return true;
}

function coverWords(ctx, state) {
  if (!state || GONE.has(state.state)) return ctx.t("card.pocket.format.none");
  const position = Number(state.attributes?.current_position);
  const word = ctx.t(`card.pocket.controls.cover.${state.state}`);
  return Number.isFinite(position) && !coverMoving(state) && state.state === "open" && position < 100
    ? ctx.t("card.pocket.controls.cover.position", { value: position }) : word;
}

function updateCovers(root, parts, ctx) {
  const section = root.querySelector(".covers");
  const { hass } = ctx;
  const groups = groupedByArea(hass, ctx.config, ctx.t, coversOf(hass));
  section.hidden = groups.length === 0;
  if (!groups.length) return false;
  setText(section.querySelector("h3"), ctx.t("card.pocket.controls.covers"));
  const key = JSON.stringify(groups.map((g) => [g.key, g.ids]));
  if (key !== parts.keys.covers) {
    parts.keys.covers = key;
    const nodes = [];
    for (const group of groups) {
      if (group.name && groups.length > 1) nodes.push(Object.assign(el("h4"), { textContent: group.name }));
      const card = el("div", "card");
      for (const id of group.ids) {
        const row = el("div", "row", `<span class="name"><span class="n"></span><small></small></span><span class="keys">
          <button class="key" type="button" data-act="open"><ha-icon></ha-icon></button>
          <button class="key" type="button" data-act="stop"><ha-icon icon="mdi:stop"></ha-icon></button>
          <button class="key" type="button" data-act="close"><ha-icon></ha-icon></button></span>`);
        row.dataset.entity = id;
        for (const button of row.querySelectorAll(".key")) button.addEventListener("click", () => coverCall(root, [id], button.dataset.act));
        card.append(row);
      }
      nodes.push(card);
    }
    section.querySelector(".list").replaceChildren(...nodes);
  }
  for (const row of section.querySelectorAll(".row")) {
    const state = hass.states[row.dataset.entity];
    const bits = features(state);
    // An awning moves sideways; a blind, a shutter or a garage door up and down.
    const sideways = state?.attributes?.device_class === "awning";
    setText(row.querySelector(".n"), state?.attributes?.friendly_name || row.dataset.entity);
    setText(row.querySelector("small"), coverWords(ctx, state));
    for (const [act, flag, icon] of [["open", COVER.open, sideways ? "mdi:arrow-expand-horizontal" : "mdi:arrow-up"],
      ["stop", COVER.stop, "mdi:stop"], ["close", COVER.close, sideways ? "mdi:arrow-collapse-horizontal" : "mdi:arrow-down"]]) {
      const button = row.querySelector(`[data-act="${act}"]`);
      button.hidden = !(bits & flag);
      button.disabled = !operable(state) || !!ctx.offline;
      setAttr(button.querySelector("ha-icon"), "icon", icon);
      setAttr(button, "aria-label", ctx.t(`card.pocket.controls.cover_act.${act}`, { name: row.querySelector(".n").textContent }));
    }
  }
  const all = section.querySelector(".all");
  all.hidden = coversOf(hass).length < 2;
  setText(all.querySelector('[data-all="open"] span'), ctx.t("card.pocket.controls.all_open"));
  setText(all.querySelector('[data-all="close"] span'), ctx.t("card.pocket.controls.all_close"));
  return true;
}

const clockText = (secs) => {
  if (secs == null) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(secs % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

function updateTimers(root, parts, ctx) {
  const section = root.querySelector(".timers");
  const { hass } = ctx;
  const ids = timersOf(hass, ctx.config);
  section.hidden = ids.length === 0;
  if (!ids.length) {
    clearInterval(parts.ticker);
    parts.ticker = null;
    return false;
  }
  setText(section.querySelector("h3"), ctx.t("card.pocket.controls.timers"));
  const key = ids.join(" ");
  if (key !== parts.keys.timers) {
    parts.keys.timers = key;
    section.querySelector(".list").replaceChildren(...ids.map((id) => {
      const row = el("div", "row", `<span class="name"><span class="n"></span><small></small></span><span class="keys">
        <button class="key" type="button" data-act="toggle"><ha-icon></ha-icon></button>
        <button class="key" type="button" data-act="cancel"><ha-icon icon="mdi:close"></ha-icon></button></span>`);
      row.dataset.entity = id;
      row.querySelector('[data-act="toggle"]').addEventListener("click", () => {
        const state = parts.ctx.hass.states[id];
        timerCall(root, id, state?.state === "active" ? "pause" : "start");
      });
      row.querySelector('[data-act="cancel"]').addEventListener("click", () => timerCall(root, id, "cancel"));
      return row;
    }));
  }
  const tick = () => {
    for (const row of section.querySelectorAll(".row")) {
      const state = parts.ctx.hass?.states?.[row.dataset.entity];
      const left = clockText(timerLeft(state));
      const word = state ? parts.ctx.t(`card.pocket.controls.timer.${state.state}`) : "";
      setText(row.querySelector("small"), [word, left].filter(Boolean).join(" · "));
    }
  };
  let active = false;
  for (const row of section.querySelectorAll(".row")) {
    const state = hass.states[row.dataset.entity];
    const running = state?.state === "active";
    active = active || running;
    setText(row.querySelector(".n"), state?.attributes?.friendly_name || row.dataset.entity);
    const toggle = row.querySelector('[data-act="toggle"]');
    setAttr(toggle.querySelector("ha-icon"), "icon", running ? "mdi:pause" : "mdi:play");
    setAttr(toggle, "aria-label", ctx.t(running ? "card.pocket.controls.timer_pause" : "card.pocket.controls.timer_start"));
    const cancel = row.querySelector('[data-act="cancel"]');
    cancel.disabled = !!ctx.offline || state?.state === "idle";
    setAttr(cancel, "aria-label", ctx.t("card.pocket.controls.timer_cancel"));
    toggle.disabled = !!ctx.offline || !operable(state);
  }
  tick();
  // A running timer counts down on the screen; the ticker stops with it or with the page.
  if (active && !parts.ticker) {
    parts.ticker = setInterval(() => {
      if (!root.isConnected) {
        clearInterval(parts.ticker);
        parts.ticker = null;
        return;
      }
      tick();
    }, 1000);
  } else if (!active && parts.ticker) {
    clearInterval(parts.ticker);
    parts.ticker = null;
  }
  return true;
}

// ---- Status -------------------------------------------------------------------------------------

const ACTIVE = {
  cover: (s) => ["open", "opening", "closing"].includes(s),
  binary_sensor: (s) => s === "on",
  light: (s) => s === "on",
  lock: (s) => s !== "locked",
};

function statusItems(ctx) {
  const { hass, config } = ctx;
  const sections = [];
  const covers = coversOf(hass);
  if (covers.length) sections.push({ kind: "covers", ids: covers });
  const contacts = contactsOf(hass);
  if (contacts.length) sections.push({ kind: "contacts", ids: contacts });
  const rooms = (config.rooms ?? []).filter((r) => lightsOf(r).length);
  if (rooms.length) sections.push({ kind: "lights", rooms });
  const locks = locksOf(hass);
  if (locks.length) sections.push({ kind: "locks", ids: locks });
  return sections;
}

function updateStatus(root, parts, ctx) {
  const { hass } = ctx;
  const host = root.querySelector(".status-pane .groups");
  const sections = statusItems(ctx);
  const key = JSON.stringify(sections.map((s) => [s.kind, s.ids ?? s.rooms.map((r) => r.id)]));
  if (key !== parts.keys.status) {
    parts.keys.status = key;
    const nodes = [];
    for (const section of sections) {
      const heading = el("h3");
      heading.dataset.kind = section.kind;
      nodes.push(heading);
      const grid = el("div", "grid");
      const items = section.rooms ? section.rooms.map((room) => ({ room })) : section.ids.map((id) => ({ id }));
      for (const item of items) {
        const tile = el("button", "st", `<ha-icon></ha-icon><span class="n"></span><span class="v"></span>`);
        tile.type = "button";
        if (item.id) tile.dataset.entity = item.id;
        if (item.room) tile.dataset.room = item.room.id;
        tile.dataset.kind = section.kind;
        tile.addEventListener("click", () => {
          if (section.kind === "contacts") {
            const name = tile.querySelector(".n").textContent;
            parts.ctx.openSheet?.(sensorSpec(parts.ctx, item.id, name, ""));
          } else parts.ctx.navigate("#/controls", { replace: true });
        });
        grid.append(tile);
      }
      nodes.push(grid);
    }
    host.replaceChildren(...nodes);
  }
  for (const heading of host.querySelectorAll("h3")) setText(heading, ctx.t(`card.pocket.controls.status.${heading.dataset.kind}`));
  for (const tile of host.querySelectorAll(".st")) {
    const kind = tile.dataset.kind;
    let name;
    let value;
    let active;
    let gone = false;
    let icon;
    if (kind === "lights") {
      const room = (ctx.config.rooms ?? []).find((r) => r.id === tile.dataset.room);
      const lamps = lampsOf(hass, room);
      const on = lamps.filter((id) => hass.states?.[id]?.state === "on");
      name = room.name;
      active = on.length > 0;
      const level = on.map((id) => Number(hass.states[id].attributes?.brightness)).filter(Number.isFinite);
      value = !active ? ctx.t("card.pocket.controls.light.off")
        : level.length ? ctx.t("card.pocket.controls.light.on_level", { value: number(ctx, Math.round(Math.max(...level) / 2.55), 0) })
          : ctx.t("card.pocket.controls.light.on");
      icon = active ? "mdi:lightbulb-on-outline" : "mdi:lightbulb-off-outline";
    } else {
      const id = tile.dataset.entity;
      const state = hass.states?.[id];
      const domain = id.split(".")[0];
      name = state?.attributes?.friendly_name || id;
      gone = !state || GONE.has(state.state);
      active = !gone && ACTIVE[domain](state.state);
      if (kind === "covers") {
        value = coverWords(ctx, state);
        icon = state?.attributes?.device_class === "awning" ? "mdi:awning-outline" : active ? "mdi:window-shutter-open" : "mdi:window-shutter";
      } else if (kind === "contacts") {
        value = gone ? ctx.t("card.pocket.format.none") : ctx.t(`card.pocket.controls.contact.${state.state === "on" ? "open" : "closed"}`);
        icon = state?.attributes?.device_class === "window" ? (active ? "mdi:window-open-variant" : "mdi:window-closed-variant")
          : active ? "mdi:door-open" : "mdi:door-closed";
      } else {
        value = gone ? ctx.t("card.pocket.format.none") : ctx.t(`card.pocket.controls.lock.${state.state}`);
        icon = active ? "mdi:lock-open-variant-outline" : "mdi:lock-outline";
      }
    }
    setText(tile.querySelector(".n"), name);
    setText(tile.querySelector(".v"), value);
    setAttr(tile.querySelector("ha-icon"), "icon", icon);
    const cls = ["st", active && "active", gone && "gone"].filter(Boolean).join(" ");
    if (tile.className !== cls) tile.className = cls;
    setAttr(tile, "aria-label", `${name}: ${value}`);
  }
  return sections.length > 0;
}
