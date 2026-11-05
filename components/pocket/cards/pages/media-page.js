// The Media page (#/media, #/media/<area id>; mockup media-climate-settings.html, the left phone),
// on the page contract of pages/index.js:
//   - the title and the player picker top right: the shown player's area, opening the sheet of
//     every area's player (lib/player-sheet.js, the sheet kind "players"); a pick shows at once and
//     is remembered per person (settings field mediaPlayer). Which player shows: lib/media.js
//     chosenPlayer (the pick, the route's area, as Home's now playing opens it, the last choice,
//     one that plays, the first);
//   - with the config `sound` (audio-sensor in the home): a Media | Sound switch; Sound shows
//     audio-sensor's live meter and the averages (lib/sound-panel.js);
//   - large artwork (entity_picture, which Home Assistant serves through its own proxy; the music
//     icon while there is none or it fails to load), opening
//     Home Assistant's more-info dialog of the player; title, artist, album, wrapped, never cut;
//   - the progress (media_position, media_duration, media_position_updated_at), ticking each second
//     on the phone while it plays and the Media tab shows;
//   - a power button by the player's name when it can turn on or off (supported_features), lit
//     while the player is on; a tap turns it off, or on when it is off;
//   - the input (the player's source) as a button opening the input sheet (lib/source-sheet.js)
//     when the player can select a source and lists more than one; a pick selects it at once;
//   - previous / play-pause (64 px) / next, each hidden when the player's supported_features lack
//     it (play-pause shows for a player that reports no features at all);
//   - the volume: a strip of its own (44 px), a horizontal drag sets it from the finger's place
//     along the strip, shown while dragging and sent once on release (media_player.volume_set), a
//     tap sets that point, a vertical move is the page's scroll, arrow keys step it; mute beside
//     it; each only when supported;
//   - the source line: the player's app and source, and with `sound` the level now (opening its
//     trend).
// Every control sends through ctx.optimistic (lib/optimistic.js): the new state, volume or mute
// shows at once, a failure or 4 s of silence rolls it back with the toast. Offline or an
// unavailable player: controls disabled, a dash. render() builds every element once; update()
// patches them.

import { can, chosenPlayer, clock, playersOf, progressOf } from "../lib/media.js";
import { sourceSpec, sourcesOf } from "../lib/source-sheet.js";
import { playerSpec } from "../lib/player-sheet.js";
import { STYLE as SOUND_STYLE, renderSound } from "../lib/sound-panel.js";
import { reportError } from "../lib/report.js";
import { GONE, el, number, percent, setArt, setAttr, setLine, setText } from "../lib/page-kit.js";

const DIRECTION_PX = 8;   // movement before a gesture on the strip is a drag or a scroll
const KEY_STEP = 5;       // percent per arrow key
const TICK_MS = 1000;
const TABS = ["media", "sound"];

const STYLE = `
  .media .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 4px 8px; }
  .media .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .media .pick { min-width: 44px; min-height: 44px; margin: 0; padding: 0 10px; border: 0; border-radius: 12px;
                 background: none; color: var(--mut); font: inherit; font-size: 13px; text-align: right;
                 display: flex; align-items: center; gap: 2px; cursor: pointer; overflow-wrap: anywhere; --mdc-icon-size: 18px; }
  .media .ends { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .media .power { flex: 0 0 auto; width: 44px; height: 44px; margin: 0; padding: 0; border: 1px solid var(--line);
                  border-radius: 50%; background: var(--card); color: var(--mut); cursor: pointer;
                  display: flex; align-items: center; justify-content: center; --mdc-icon-size: 22px; }
  .media .power[aria-pressed="true"] { color: var(--acc); border-color: var(--acc); }
  .media .power[hidden] { display: none; }
  .media .power:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .media .pick.single { cursor: default; }
  .media .pick.single ha-icon { display: none; }
  .media .seg { display: flex; gap: 2px; margin: 0 0 14px; padding: 3px; border-radius: 12px; background: var(--chip); }
  .media .seg button { flex: 1; min-width: 44px; min-height: 44px; margin: 0; padding: 0 4px; border: 0; border-radius: 9px;
                       background: none; color: var(--fg); font: inherit; font-size: 13px; cursor: pointer; }
  .media .seg button[aria-pressed="true"] { background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .1); }
  .media .player { padding: 0 6px; }
  .media .player.muted .art, .media .player.muted .meta { opacity: .55; }
  /* The artwork gives way to the controls: on a phone every common control (transport, volume,
     mute) stays on the first screen; it is as wide as the column only where the height allows it
     (470 px: the rows under it, the bar and the margins), never under 160 px. */
  .media .art { box-sizing: border-box; display: block; aspect-ratio: 1; margin: 0 auto;
                width: min(100%, 420px, max(160px, calc(100dvh - var(--kiosk-header-height, var(--header-height, 56px)) - 470px)));
                padding: 0; border: 0; border-radius: 20px; overflow: hidden; position: relative; cursor: pointer;
                background: var(--chip); color: var(--mut); box-shadow: 0 10px 30px rgba(0, 0, 0, .2); --mdc-icon-size: 72px; }
  .media .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .media .art ha-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .media .meta { margin-top: 14px; display: flex; align-items: flex-start; gap: 10px; }
  .media .meta .info { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  /* A short, wide screen (a phone in landscape): the artwork on the left, no taller than the room
     between the header and the bar, the rest beside it. */
  @media (orientation: landscape) and (max-height: 560px) {
    .media .player { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 20px; align-items: start; }
    .media .player > * { grid-column: 2; }
    .media .player > .art { grid-column: 1; grid-row: 1 / span 8; width: min(40vw, calc(100dvh - 200px)); max-width: none; }
    .media .player > .meta { margin-top: 0; }
  }
  .media .title { font-size: 19px; font-weight: 600; }
  .media .artist { font-size: 14px; color: var(--mut); margin-top: 2px; }
  .media .album { font-size: 12.5px; color: var(--mut); margin-top: 2px; }
  .media .prog { margin-top: 12px; }
  .media .prog .bar { display: block; height: 5px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .media .prog .bar i { display: block; height: 100%; width: 0; background: var(--fg); border-radius: 3px; }
  .media .prog .times { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11.5px; color: var(--mut);
                        font-variant-numeric: tabular-nums; }
  .media .transport { display: flex; justify-content: space-around; align-items: center; margin: 12px 0 8px; }
  .media .cb { width: 52px; height: 52px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: none;
               color: var(--fg); display: flex; align-items: center; justify-content: center; cursor: pointer; --mdc-icon-size: 30px; }
  .media .cb.play { width: 64px; height: 64px; background: var(--fg); color: var(--bg); --mdc-icon-size: 34px; }
  .media .cb:disabled, .media .mute:disabled { opacity: .4; cursor: default; }
  .media .volume { display: flex; align-items: center; gap: 8px; }
  .media .vol { position: relative; flex: 1; min-width: 0; height: 44px; border-radius: 12px; background: var(--chip);
                overflow: hidden; cursor: ew-resize; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .media .vol i { display: block; height: 100%; width: 0; background: var(--acc);
                  background: color-mix(in srgb, var(--acc) 55%, var(--card)); }
  .media .vol span { position: absolute; left: 12px; top: 0; bottom: 0; display: flex; align-items: center;
                     font-size: 13px; font-weight: 600; }
  .media .vol[aria-disabled="true"] { opacity: .5; cursor: default; }
  .media .vol:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .media .mute { flex: 0 0 auto; width: 44px; height: 44px; margin: 0; padding: 0; border: 0; border-radius: 12px;
                 background: var(--chip); color: var(--fg); display: flex; align-items: center; justify-content: center;
                 cursor: pointer; --mdc-icon-size: 22px; }
  /* The input, beside what plays: a compact chip, its label said by aria-label. */
  .media .input { box-sizing: border-box; flex: 0 1 auto; max-width: 48%; min-height: 44px; margin: 0; padding: 0 8px 0 10px;
                  display: flex; align-items: center; gap: 4px; border: 1px solid var(--line); border-radius: 22px;
                  background: var(--card); color: var(--fg); font: inherit; font-size: 13px; text-align: left;
                  cursor: pointer; --mdc-icon-size: 18px; }
  .media .input .k { display: none; }
  .media .input .v { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
  .media .input ha-icon { flex: 0 0 auto; color: var(--mut); }
  .media .src { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px 12px;
                margin-top: 6px; font-size: 12.5px; color: var(--mut); overflow-wrap: anywhere; }
  .media .src .line { min-width: 0; }
  .media .level { min-width: 44px; min-height: 44px; margin: 0; padding: 0 4px; border: 0; background: none;
                  color: var(--mut); font: inherit; font-size: 12.5px; cursor: pointer; }
  .media .none { color: var(--mut); font-size: 15px; margin: 32px 0; text-align: center; }
  .media [hidden] { display: none; }
  .media button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
${SOUND_STYLE}
`;

const GLYPH = { previous: "mdi:skip-previous", next: "mdi:skip-next" };

export function render(ctx) {
  const root = el("section", "media");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b><span class="ends"><button class="pick" type="button"><span class="name"></span><ha-icon icon="mdi:chevron-down"></ha-icon></button><button class="power" type="button" hidden><ha-icon icon="mdi:power"></ha-icon></button></span></div>
    <div class="seg" role="group" hidden>
      ${TABS.map((tab) => `<button type="button" data-tab="${tab}" aria-pressed="false"></button>`).join("")}
    </div>
    <div class="player">
      <button class="art" type="button"><ha-icon icon="mdi:music"></ha-icon><img alt="" hidden></button>
      <div class="meta"><div class="info"><div class="title"></div><div class="artist"></div><div class="album"></div></div><button class="input" type="button" hidden><ha-icon icon="mdi:import"></ha-icon><span class="k"></span><span class="v"></span><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>
      <div class="prog" hidden><span class="bar"><i></i></span><div class="times"><span class="pos"></span><span class="dur"></span></div></div>
      <div class="transport">
        <button class="cb previous" type="button" data-action="previous"><ha-icon icon="${GLYPH.previous}"></ha-icon></button>
        <button class="cb play" type="button" data-action="play"><ha-icon icon="mdi:play"></ha-icon></button>
        <button class="cb next" type="button" data-action="next"><ha-icon icon="${GLYPH.next}"></ha-icon></button>
      </div>
      <div class="volume">
        <button class="mute" type="button"><ha-icon icon="mdi:volume-high"></ha-icon></button>
        <div class="vol" role="slider" tabindex="0" data-drag aria-valuemin="0" aria-valuemax="100"><i></i><span></span></div>
      </div>
      <div class="src"><span class="line"></span><button class="level" type="button" hidden></button></div>
    </div>
    <p class="none" hidden></p>`;
  const q = (sel) => root.querySelector(sel);
  const parts = {
    ctx, picked: undefined, tab: "media", preview: null, gesture: null, now: () => Date.now(), timer: null,
    title: q(".top b"), pick: q(".pick"), power: q(".power"), seg: q(".seg"), player: q(".player"), none: q(".none"),
    art: q(".art"), img: q(".art img"), prog: q(".prog"), bar: q(".prog .bar i"), pos: q(".pos"), dur: q(".dur"),
    play: q(".play"), previous: q(".previous"), next: q(".next"), mute: q(".mute"), vol: q(".vol"),
    volume: q(".volume"), line: q(".src .line"), level: q(".level"), input: q(".input"),
  };
  root._media = parts;

  parts.pick.addEventListener("click", () => {
    const { ctx: now } = parts;
    if (playersOf(now.config, now.hass).length < 2) return;
    now.openSheet?.(playerSpec(now, playerOf(parts, now)?.id, (id) => pickPlayer(root, id)));
  });
  for (const button of parts.seg.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      parts.tab = button.dataset.tab;
      update(root, parts.ctx);
    });
  }
  parts.art.addEventListener("click", () => {
    const id = playerOf(parts, parts.ctx)?.id;
    if (!id) return;
    // As Home Assistant's own fireEvent: an Event with a detail property.
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    event.detail = { entityId: id };
    root.dispatchEvent(event);
  });
  for (const action of ["previous", "play", "next"]) parts[action].addEventListener("click", () => transport(root, action));
  parts.mute.addEventListener("click", () => toggleMute(root));
  parts.power.addEventListener("click", () => togglePower(root));
  parts.input.addEventListener("click", () => {
    const player = live(parts);
    if (!player || sourcesOf(player.state).length === 0) return;
    parts.ctx.openSheet?.(sourceSpec(parts.ctx, player.id, (source) => {
      parts.ctx.closeSheet?.();
      pickSource(root, source);
    }));
  });
  parts.level.addEventListener("click", () => {
    const sound = parts.ctx.config?.sound;
    if (sound?.level) parts.ctx.openSheet?.({ kind: "trend", entity: sound.level, title: parts.ctx.t("card.pocket.media.level"), digits: 1 });
  });
  wireVolume(root, parts);

  if (ctx.config?.sound) {
    parts.sound = renderSound(ctx);
    root.append(parts.sound.el);
  }

  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._media;
  parts.ctx = ctx;
  setText(parts.title, ctx.t("card.pocket.media.title"));
  const players = playersOf(ctx.config, ctx.hass);
  const chosen = playerOf(parts, ctx);
  parts.pick.hidden = !chosen;
  parts.pick.classList.toggle("single", players.length < 2);
  if (chosen) {
    // With one player its area names it; with several (an area may have more than one) its own name.
    const name = players.length < 2 ? chosen.room.name
      : ctx.hass?.states?.[chosen.id]?.attributes?.friendly_name || chosen.room.name;
    setText(parts.pick.querySelector(".name"), name);
    setAttr(parts.pick, "aria-label", players.length < 2 ? name : ctx.t("card.pocket.media.picker_of", { name }));
  }

  const sound = !!parts.sound;
  parts.seg.hidden = !sound;
  const tab = sound ? parts.tab : "media";
  setAttr(parts.seg, "aria-label", ctx.t("card.pocket.media.tab.label"));
  for (const button of parts.seg.querySelectorAll("button")) {
    setText(button, ctx.t(`card.pocket.media.tab.${button.dataset.tab}`));
    setAttr(button, "aria-pressed", String(button.dataset.tab === tab));
  }
  if (sound) {
    parts.sound.el.hidden = tab !== "sound";
    // The live meter follows Home Assistant only while it shows.
    if (tab === "sound") parts.sound.update(ctx);
  }

  parts.none.hidden = tab !== "media" || !!chosen;
  setText(parts.none, ctx.t("card.pocket.media.none"));
  parts.player.hidden = tab !== "media" || !chosen;
  if (chosen) updatePlayer(parts, ctx, chosen);
  syncTicker(root, parts);
}

// The progress ticks each second only while it can move: the page connected, the Media tab
// shown, the player playing with a duration. The shell keeps the page across a trip to another
// panel and updates it on the way back, so the next update starts the ticker again.
function ticking(root, parts) {
  if (!root.isConnected || (parts.sound && parts.tab !== "media")) return false;
  const chosen = playerOf(parts, parts.ctx);
  const state = chosen ? parts.ctx.hass?.states?.[chosen.id] : undefined;
  return state?.state === "playing" && !!progressOf(state, parts.now());
}

function syncTicker(root, parts) {
  const want = ticking(root, parts);
  if (want && !parts.timer) {
    parts.timer = setInterval(() => {
      if (ticking(root, parts)) updateProgress(parts, parts.ctx);
      else stopTicker(parts);
    }, TICK_MS);
    parts.timer?.unref?.();     // node (the tests): the tick does not hold the process
  } else if (!want && parts.timer) stopTicker(parts);
}

function stopTicker(parts) {
  clearInterval(parts.timer);
  parts.timer = null;
}

const playerOf = (parts, ctx) =>
  chosenPlayer({ config: ctx.config, settings: ctx.settings, routeId: ctx.routeId, picked: parts.picked, hass: ctx.hass });

// A pick in the sheet: shown at once, remembered for the person, the sheet closed. A save that
// fails says so and keeps the pick on this page.
function pickPlayer(root, id) {
  const parts = root._media;
  parts.picked = id;
  parts.ctx.closeSheet?.();
  update(root, parts.ctx);
  Promise.resolve(parts.ctx.saveSettings?.({ mediaPlayer: id }))
    .catch(() => reportError(root, "card.pocket.settings.error"));
}

// The player's state, or undefined while it cannot be controlled (missing, unavailable, offline).
function live(parts, ctx = parts.ctx) {
  const id = playerOf(parts, ctx)?.id;
  const state = id ? ctx.hass?.states?.[id] : undefined;
  if (ctx.offline || !state || GONE.has(state.state) || !ctx.hass?.callService) return undefined;
  return { id, state };
}

function send(root, player, service, data, expect) {
  const { hass, optimistic } = root._media.ctx;
  optimistic.send(root, hass, { domain: "media_player", service, data: { entity_id: player.id, ...data },
    errorKey: "card.pocket.error.media", expect: { [player.id]: expect } });
}

function transport(root, action) {
  const player = live(root._media);
  if (!player) return;
  if (action === "play") {
    send(root, player, "media_play_pause", {}, { state: player.state.state === "playing" ? "paused" : "playing" });
  } else {
    // What the next track is cannot be known: the call waits for any new state of the player.
    send(root, player, action === "next" ? "media_next_track" : "media_previous_track", {}, { changed: true });
  }
}

// Off turns on; any other state turns off. What "on" becomes (idle, on, playing) is the player's:
// turning on waits for any new state.
function togglePower(root) {
  const player = live(root._media);
  if (!player) return;
  if (player.state.state === "off") {
    if (can(player.state, "turn_on")) send(root, player, "turn_on", {}, { changed: true });
  } else if (can(player.state, "turn_off")) send(root, player, "turn_off", {}, { state: "off" });
}

function pickSource(root, source) {
  const player = live(root._media);
  if (!player || !sourcesOf(player.state).includes(source)) return;
  send(root, player, "select_source", { source }, { attributes: { source } });
}

function toggleMute(root) {
  const player = live(root._media);
  if (!player || !can(player.state, "volume_mute")) return;
  const muted = !player.state.attributes?.is_volume_muted;
  send(root, player, "volume_mute", { is_volume_muted: muted }, { attributes: { is_volume_muted: muted } });
}

function sendVolume(root, pct) {
  const player = live(root._media);
  if (!player || !can(player.state, "volume_set")) return;
  const level = Math.round(Math.min(100, Math.max(0, pct))) / 100;
  send(root, player, "volume_set", { volume_level: level }, { attributes: { volume_level: level } });
}

const volumeOf = (state) => {
  const level = Number(state?.attributes?.volume_level);
  return Number.isFinite(level) ? Math.round(level * 100) : null;
};

function percentAt(parts, x) {
  const rect = parts.vol.getBoundingClientRect();
  if (!rect.width) return volumeOf(live(parts)?.state) ?? 0;
  return Math.min(100, Math.max(0, Math.round((x - rect.left) / rect.width * 100)));
}

// The volume strip's own gesture: a horizontal drag previews the level and sends it on release,
// a tap sends that point, a vertical move is left to the page's scroll.
function wireVolume(root, parts) {
  const vol = parts.vol;
  const end = () => {
    parts.gesture = null;
    if (parts.preview != null) {
      parts.preview = null;
      updateVolume(parts, parts.ctx);
    }
  };
  vol.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    parts.gesture = live(parts) ? { x: e.clientX, y: e.clientY, mode: "pending", pointerId: e.pointerId } : null;
  });
  vol.addEventListener("pointermove", (e) => {
    const g = parts.gesture;
    if (!g || g.mode === "cancel") return;
    if (g.mode === "pending") {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) < DIRECTION_PX && Math.abs(dy) < DIRECTION_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        g.mode = "cancel";
        return;
      }
      g.mode = "drag";
      try { vol.setPointerCapture?.(g.pointerId); } catch { /* the pointer may already be gone */ }
    }
    parts.preview = percentAt(parts, e.clientX);
    updateVolume(parts, parts.ctx);
  });
  vol.addEventListener("pointerup", (e) => {
    const g = parts.gesture;
    if (g && g.mode !== "cancel") {
      const pct = percentAt(parts, e.clientX);
      parts.preview = null;
      sendVolume(root, pct);
    }
    end();
  });
  vol.addEventListener("pointercancel", end);
  vol.addEventListener("keydown", (e) => {
    const step = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[e.key];
    const player = live(parts);
    if (!step || !player) return;
    e.preventDefault();
    sendVolume(root, (volumeOf(player.state) ?? 0) + step);
  });
}

function updatePlayer(parts, ctx, chosen) {
  const state = ctx.hass?.states?.[chosen.id];
  const gone = !state || GONE.has(state.state);
  const a = gone ? {} : state.attributes ?? {};
  const disabled = gone || !!ctx.offline;
  parts.player.classList.toggle("muted", gone);

  setArt(parts.img, parts.art.querySelector("ha-icon"), a.entity_picture);
  setAttr(parts.art, "aria-label", ctx.t("card.pocket.media.details", { name: a.friendly_name || chosen.room.name }));
  setText(parts.player.querySelector(".title"),
    gone ? ctx.t("card.pocket.format.none") : a.media_title || ctx.t("card.pocket.home.nothing_playing"));
  setText(parts.player.querySelector(".artist"), a.media_artist || a.media_album_artist || "");
  setText(parts.player.querySelector(".album"), a.media_album_name || "");
  updateProgress(parts, ctx);

  const isPlaying = state?.state === "playing";
  // A player that reports no features at all still gets play-pause, as on Home.
  parts.play.hidden = a.supported_features != null && !can(state, "play") && !can(state, "pause");
  parts.previous.hidden = !can(state, "previous");
  parts.next.hidden = !can(state, "next");
  setAttr(parts.play, "aria-label", ctx.t(isPlaying ? "card.pocket.home.pause" : "card.pocket.home.play"));
  setAttr(parts.play.querySelector("ha-icon"), "icon", isPlaying ? "mdi:pause" : "mdi:play");
  setAttr(parts.previous, "aria-label", ctx.t("card.pocket.media.previous"));
  setAttr(parts.next, "aria-label", ctx.t("card.pocket.media.next"));
  for (const button of [parts.play, parts.previous, parts.next, parts.mute]) button.disabled = disabled;
  const isOff = state?.state === "off";
  parts.power.hidden = gone || !(isOff ? can(state, "turn_on") : can(state, "turn_off"));
  parts.power.disabled = !!ctx.offline;
  setAttr(parts.power, "aria-pressed", String(!isOff));
  setAttr(parts.power, "aria-label", ctx.t(isOff ? "card.pocket.media.power_on" : "card.pocket.media.power_off"));

  const muted = !!a.is_volume_muted;
  parts.mute.hidden = !can(state, "volume_mute");
  setAttr(parts.mute, "aria-label", ctx.t(muted ? "card.pocket.media.unmute" : "card.pocket.media.mute"));
  setAttr(parts.mute, "aria-pressed", String(muted));
  setAttr(parts.mute.querySelector("ha-icon"), "icon", muted ? "mdi:volume-off" : "mdi:volume-high");
  parts.vol.hidden = !can(state, "volume_set");
  parts.volume.hidden = parts.vol.hidden && parts.mute.hidden;
  setAttr(parts.vol, "aria-disabled", String(disabled));
  updateVolume(parts, ctx);

  const sources = gone ? [] : sourcesOf(state);
  parts.input.hidden = sources.length === 0;
  parts.input.disabled = disabled;
  setText(parts.input.querySelector(".k"), ctx.t("card.pocket.media.input"));
  setText(parts.input.querySelector(".v"), a.source || ctx.t("card.pocket.format.none"));
  setAttr(parts.input, "aria-label", ctx.t("card.pocket.media.input_of", { name: a.source || ctx.t("card.pocket.format.none") }));
  const line = [];
  if (a.app_name) line.push({ text: a.app_name });
  // The source is on the input button when there is one.
  if (a.source && a.source !== a.app_name && parts.input.hidden) line.push({ text: a.source });
  setLine(parts.line, line);
  const sound = ctx.config?.sound;
  const db = sound?.level ? parseFloat(ctx.hass?.states?.[sound.level]?.state) : NaN;
  parts.level.hidden = !Number.isFinite(db);
  if (Number.isFinite(db)) setText(parts.level, ctx.t("card.pocket.media.level_now", { value: number(ctx, db, 0) }));
}

function updateVolume(parts, ctx) {
  const chosen = playerOf(parts, ctx);
  const state = chosen ? ctx.hass?.states?.[chosen.id] : undefined;
  const value = parts.preview ?? volumeOf(state);
  parts.vol.querySelector("i").style.width = `${value ?? 0}%`;
  const label = ctx.t("card.pocket.media.volume_label");
  const shown = value == null ? ctx.t("card.pocket.format.none") : percent(ctx, value);
  setText(parts.vol.querySelector("span"), ctx.t("card.pocket.media.volume", { value: shown }));
  setAttr(parts.vol, "aria-label", label);
  setAttr(parts.vol, "aria-valuenow", String(value ?? 0));
  setAttr(parts.vol, "aria-valuetext", shown);
}

function updateProgress(parts, ctx) {
  const chosen = playerOf(parts, ctx);
  const state = chosen ? ctx.hass?.states?.[chosen.id] : undefined;
  const progress = state && !GONE.has(state.state) ? progressOf(state, parts.now()) : null;
  parts.prog.hidden = !progress;
  if (!progress) return;
  parts.bar.style.width = `${(progress.position / progress.duration) * 100}%`;
  setText(parts.pos, clock(progress.position));
  setText(parts.dur, clock(progress.duration));
}
