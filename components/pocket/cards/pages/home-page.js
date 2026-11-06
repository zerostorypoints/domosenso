// The Home page (spec 6.2, mockup home-a-themes.html), on the page contract of pages/index.js, in
// two views switched by a segmented control under the title (#/ Overview, #/systems Systems; a
// switch replaces the history entry, so Back leaves Home rather than walking the views):
//   Overview: what is happening now and the quick actions (the pills, the widgets, the weather, now
//     playing, Quick); Systems: the pills and a tile per aspect (lib/sections.js), each opening its
//     page: from the high level down to the details.
//   - the title and today's date;
//   - attention pills (lib/attention.js), poor first; one green "all good" pill when nothing is
//     fair or poor; a pill and "all good" open the checks sheet (lib/detail-sheets.js): every
//     reading that was checked, per area, the Outside included, problems first;
//   - metric chips: inside and outside (SPEC-038 §3.9: the areas of that type, lib/areas.js typed:
//     the range of their main temperatures; "No areas assigned" when no area has the type, opening
//     Settings → Areas; "Main sensor not set" when none of its areas has one), the home's air score
//     (lib/climate.js homeAir: the lowest room's), the number of lights on, the power now and the
//     plants (their Systems summary, lib/sections.js). Every widget opens a sheet, never a page
//     (lib/detail-sheets.js: an aggregate list or one sensor's trend): power the meters behind
//     the sum, plants every plant; a chip whose entity the config does not
//     name is left out, one whose reading is unavailable shows a dash. Each value in its level's
//     colour (inside and outside the worst of their areas against each one's comfort range: below
//     it --cold, above it --warm), a trend arrow on inside or outside when one sensor makes it, and on
//     air (lib/trend.js). Inside and outside open the sheet of their areas (lib/detail-sheets.js
//     typed), air the trend sheet (ctx.openSheet, lib/trend-sheet.js) of its reading, lights on the
//     sheet of the lights that are on;
//   - Systems (lib/sections.js): a tile per page this home has, the bar's or not, each with its
//     headline, its status and a dot when it is worth a look (fair or poor, its border too); a tap
//     opens the page, so every page is reachable from Home while the bar is a quick switch;
//   - the weather, when the config names a weather entity (lib/weather.js): one row under the
//     chips, the current condition with today's high / low and chance of rain, opening the
//     forecast sheet;
//   - now playing, for the first room with media: artwork, title, artist, play/pause in place,
//     a tap elsewhere opens Media with that room's player (#/media/<room id>); no card while the
//     player is missing from Home Assistant;
//   - Quick (SPEC-038 §3.11, lib/quick.js): the person's own Quick actions, else the home's default
//     (Pocket's input quick_actions), else each area's lights and All off, in that order. A light or
//     an area's lights is a <pocket-light-tile>; a switch, fan or toggle helper a tile that toggles;
//     a scene, script or button a tile that runs it; All off turns every light off. "Edit" beside the
//     title opens Settings → Quick actions (this feature's UX choice, DESIGN.md decisions log).
// Every control sends through ctx.optimistic (lib/optimistic.js): All off shows every light off at
// once (the tiles and the lights-on chip too), play/pause its new state, before Home Assistant
// reports them. render() builds every element once; update() only patches text and attributes (the pills are
// rebuilt only when the list of items changes), so a scroll or a drag survives hass updates.

import { attention, roomLevels } from "../lib/attention.js";
import { issuesOf } from "../lib/safety.js";
import { labelOf } from "../lib/controls.js";
import { toneOf } from "../lib/level.js";
import { trendNow } from "../lib/trend.js";
import { checksSpec, lightsSpec, plantsSpec, typedSpec } from "../lib/detail-sheets.js";
import { powerSpec } from "./power-page.js";
import { formatDate } from "../lib/i18n.js";
import { typed } from "../lib/areas.js";
import { trendSpec } from "../lib/trend-sheet.js";
import { forecastSpec } from "../lib/weather.js";
import { homeAir } from "../lib/climate.js";
import { sectionsOf } from "../lib/sections.js";
import { todayNow } from "../lib/energy.js";
import { HOME_VIEWS } from "../lib/router.js";
import { playersOf } from "../lib/media.js";
import {
  GONE, operable, el, setArt, setText, setAttr, setArrow, coalesce, setLine, number, temperature, percent, lightsOf, lightsOn, lightsOnIn,
  playing,
} from "../lib/page-kit.js";
import "../lib/light-tile.js";
import { quickOf, itemOf, nameOf, areaNameOf } from "../lib/quick.js";

const STYLE = `
  .home .top { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 4px 4px; }
  .home .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .home .top .date { font-size: 12px; color: var(--mut); }
  .home .att, .home .strip { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
                             margin: 4px -16px 14px; padding: 0 16px; }
  .home .att::-webkit-scrollbar, .home .strip::-webkit-scrollbar { display: none; }
  /* Equal cells, two per row: four in one row are too narrow for the inside range (21.0–22.0°). */
  .home .chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr)); gap: 8px; margin: 4px 0 14px; }
  .home .pill { flex: 0 0 auto; box-sizing: border-box; min-width: 44px; min-height: 44px; margin: 0; padding: 8px 12px;
                display: flex; gap: 7px; align-items: center; font: inherit; font-size: 12.5px; color: var(--fg);
                background: var(--card); border: 1px solid var(--line); border-radius: 999px; }
  .home button.pill { cursor: pointer; }
  .home .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--ok); }
  .home .dot.fair { background: var(--warn); }
  .home .dot.poor { background: var(--bad); }
  .home .chip { min-width: 0; padding: 9px 12px; overflow-wrap: anywhere; font-size: 16px; font-weight: 600;
                background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
  .home button.chip { box-sizing: border-box; min-height: 44px; margin: 0; font-family: inherit; line-height: inherit;
                       color: var(--fg); text-align: left; cursor: pointer; }
  .home .chip.note .v { font-size: 14px; font-weight: 600; color: var(--mut); }
  .home .chip small { display: block; font-size: 11.5px; color: var(--mut); font-weight: 400; margin-top: 1px; }
  .home .chip .arrow { margin-left: 3px; font-size: 13px; font-weight: 400; color: var(--mut); }
  .home .chip .arrow[hidden] { display: none; }
  .home .chip .v.lv-good { color: var(--ok); }
  .home .chip .v.lv-fair { color: var(--warn); }
  .home .chip .v.lv-poor { color: var(--bad); }
  .home .chip .v.lv-cold { color: var(--cold); }
  .home .chip .v.lv-warm { color: var(--warm); }
  .home .chip[hidden], .home .now[hidden], .home .art img[hidden], .home .art ha-icon[hidden], .home .quick-sec[hidden] { display: none; }
  .home .views { display: flex; gap: 2px; margin: 0 0 12px; padding: 3px; border-radius: 12px; background: var(--chip); }
  .home .views button { flex: 1 1 0; min-height: 44px; margin: 0; padding: 0; border: 0; border-radius: 9px; background: none;
                        color: var(--fg); font: inherit; font-size: 14px; cursor: pointer; }
  .home .views button[aria-selected="true"] { background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
  .home .chips[hidden], .home .sections[hidden] { display: none; }
  .home .sections { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr));
                    grid-auto-rows: 1fr; gap: 8px; margin: -4px 0 14px; }
  .home .sect { box-sizing: border-box; min-width: 0; min-height: 44px; margin: 0; padding: 10px 12px; text-align: left;
                font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 16px;
                display: flex; flex-direction: column; gap: 2px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .home .sect.fair { border-color: var(--warn); }
  .home .sect.poor { border-color: var(--bad); }
  .home .sect .nm { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mut); --mdc-icon-size: 18px; }
  .home .sect .nm .dot { margin-left: auto; }
  .home .sect .nm .dot[hidden] { display: none; }
  .home .sect .hd { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .home .sect .st { font-size: 12.5px; color: var(--mut); overflow-wrap: anywhere; }
  .home .wx { box-sizing: border-box; width: 100%; min-height: 52px; margin: -4px 0 14px; padding: 10px 12px;
              display: flex; align-items: center; gap: 8px; text-align: left; font: inherit; color: var(--fg);
              background: var(--card); border: 1px solid var(--line); border-radius: 16px; cursor: pointer; }
  .home .wx pocket-forecast { flex: 1; min-width: 0; }
  .home .wx .chev { flex: 0 0 auto; color: var(--mut); font-size: 18px; }
  .home .wx[hidden] { display: none; }
  .home .now { display: flex; align-items: center; gap: 12px; padding: 12px;
               background: var(--card); border: 1px solid var(--line); border-radius: 20px; }
  .home .now .open { flex: 1; min-width: 0; min-height: 52px; margin: 0; padding: 0; border: 0; background: none;
                     display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: var(--fg);
                     cursor: pointer; }
  .home .now.muted .open { opacity: .55; }
  .home .att .item { flex: 0 0 auto; display: flex; }
  .home .art { display: block; width: 52px; height: 52px; border-radius: 12px; flex: 0 0 auto; overflow: hidden; background: var(--chip); }
  .home .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .home .art ha-icon { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;
                       color: var(--mut); --mdc-icon-size: 26px; }
  .home .meta { flex: 1; min-width: 0; }
  .home .t1 { display: block; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .home .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; overflow-wrap: anywhere; }
  .home .play { width: 44px; height: 44px; flex: 0 0 auto; margin: 0; padding: 0; border: 0; border-radius: 50%;
                background: var(--chip); color: var(--fg); display: flex; align-items: center; justify-content: center;
                cursor: pointer; }
  .home .play:disabled, .home .all-off:disabled { opacity: .55; cursor: default; }
  .home .sec { display: flex; justify-content: space-between; align-items: center; margin: 18px 4px 8px;
               font-size: 13px; font-weight: 600; }
  .home .sec .all { min-width: 44px; min-height: 44px; margin: -12px -4px; padding: 0 4px; text-align: right; border: 0; background: none;
                    font: inherit; font-size: 13px; font-weight: 400; color: var(--mut); cursor: pointer; }
  .home .quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr)); grid-auto-rows: 1fr; gap: 10px; }
  .home .all-off, .home .rc { box-sizing: border-box; min-height: 64px; margin: 0; padding: 12px; text-align: left;
                              font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
                              border-radius: 18px; cursor: pointer; }
  .home .act.on, .home .act.done { border-color: var(--acc); }
  .home .act.on .ic, .home .act.done .ic { color: var(--acc); }
  .home .act .t1 { overflow-wrap: break-word; }
  .home .quick-edit { min-height: 44px; margin: 0 0 0 auto; padding: 0 4px; border: 0; background: none; color: var(--acc);
                      font: inherit; font-size: 13px; cursor: pointer; }
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
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="top"><b></b> <span class="date"></span></div>
    <div class="views" role="tablist">${HOME_VIEWS.map((view) => `<button type="button" role="tab" data-view="${view}"></button>`).join("")}</div>
    <div class="att" role="list"></div>
    <div class="chips">
      ${["inside", "outside", "air", "lights_on", "power", "plants"].map((name) => `<button class="chip" type="button" data-chip="${name}"><span class="v"></span><span class="arrow" hidden></span> <small></small></button>`).join("\n      ")}
    </div>
    <div class="sections"></div>
    <button class="wx" type="button" hidden><pocket-forecast mode="row"></pocket-forecast><span class="chev">›</span></button>
    <div class="now" hidden>
      <button class="open" type="button">
        <span class="art"><img alt="" hidden><ha-icon icon="mdi:music"></ha-icon></span>
        <span class="meta"><span class="t1"></span> <span class="t2"></span></span>
      </button>
      <button class="play" type="button"><ha-icon></ha-icon></button>
    </div>
    <div class="quick-sec">
      <div class="sec"><span class="quick-title"></span><button class="quick-edit" type="button"></button></div>
      <div class="quick"></div>
    </div>
`;

  const parts = {
    title: root.querySelector(".top b"),
    date: root.querySelector(".top .date"),
    att: root.querySelector(".att"),
    chips: Object.fromEntries([...root.querySelectorAll(".chip")].map((chip) => [chip.dataset.chip, chip])),
    now: root.querySelector(".now"),
    wx: root.querySelector(".wx"),
    quickSec: root.querySelector(".quick-sec"),
    quickTitle: root.querySelector(".quick-title"),
    view: ctx.routeId === "systems" ? "systems" : "overview",
    tiles: [],
    pillsKey: null,
    ctx,
  };

  for (const button of root.querySelectorAll(".views button")) {
    button.addEventListener("click", () => {
      if (button.dataset.view === parts.view) return;
      parts.ctx.navigate(button.dataset.view === "systems" ? "#/systems" : "#/", { replace: true });
    });
  }
  // One view at a time: the pills are in both.
  const systems = parts.view === "systems";
  root.querySelector(".chips").hidden = systems;
  root.querySelector(".sections").hidden = !systems;

  for (const [name, chip] of Object.entries(parts.chips)) {
    chip.addEventListener("click", () => {
      // No area of that type yet: where areas get their type.
      if ((name === "inside" || name === "outside") && !typed(parts.ctx.hass, parts.ctx.config, name).areas.length) {
        parts.ctx.navigate("#/settings/areas", { from: "home" });
        return;
      }
      const spec = chipSheet(parts.ctx, name);
      if (spec) parts.ctx.openSheet?.(spec);
    });
  }
  // Stable (lib/trend.js calls each waiting widget once); one redraw per frame for all answers.
  parts.onTrend = coalesce(() => { if (root.isConnected) updateChips(parts, parts.ctx); });

  parts.wx.addEventListener("click", () => parts.ctx.openSheet?.(forecastSpec(parts.ctx)));

  const now = parts.now;
  now.querySelector(".open").addEventListener("click", () =>
    parts.ctx.navigate(parts.mediaRoom ? `#/media/${encodeURIComponent(parts.mediaRoom.id)}` : "#/media"));
  now.querySelector(".play").addEventListener("click", () => {
    const { hass, offline, optimistic } = parts.ctx;
    const player = parts.player;
    const state = player ? hass?.states?.[player] : undefined;
    if (offline || !operable(state)) return;
    optimistic.send(root, hass, { domain: "media_player", service: "media_play_pause", data: { entity_id: player },
      errorKey: "card.pocket.error.media",
      expect: { [player]: { state: state.state === "playing" ? "paused" : "playing" } } });
  });

  parts.quick = root.querySelector(".quick");
  parts.quickKey = null;
  root.querySelector(".quick-edit").addEventListener("click", () => parts.ctx.navigate("#/settings/quick"));


  parts.root = root;
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
  updateSections(root, parts, ctx);
  parts.wx.hidden = !ctx.config.weather;
  if (ctx.config.weather) parts.wx.querySelector("pocket-forecast").ctx = ctx;
  updateNow(parts, ctx);
  updateQuick(parts, ctx);
  updateViews(root, parts, ctx);
}

// The switch of the views, and what each shows (the pills are in both).
function updateViews(root, parts, ctx) {
  const systems = parts.view === "systems";
  for (const button of root.querySelectorAll(".views button")) {
    setText(button, ctx.t(`card.pocket.home.view.${button.dataset.view}`));
    setAttr(button, "aria-selected", String(button.dataset.view === parts.view));
  }
  setAttr(root.querySelector(".views"), "aria-label", ctx.t("card.pocket.home.view.label"));
  if (systems) {
    parts.wx.hidden = true;
    parts.now.hidden = true;
    parts.quickSec.hidden = true;
  }
}

function updatePills(parts, ctx) {
  const names = Object.fromEntries(ctx.config.rooms.map((room) => [room.id, room.name]));
  const pills = attention(ctx.hass, ctx.config).map((item) => {
    const key = item.side ? `${item.level}_${item.side}` : item.level;
    const message = ctx.t(`card.pocket.reading.${item.reading}.${key}`);
    return { ...item, text: ctx.t("card.pocket.home.pill", { room: names[item.room], message }) };
  });
  // Safety's issues (lib/safety.js) come first: an alarm, a siren, an open door, an unlocked lock
  // matter before a reading. Each opens the Safety page.
  const safety = issuesOf(ctx.hass, ctx.config).map((issue) => ({ level: "poor", safety: true, target: "#/safety",
    text: ctx.t(`card.pocket.safety.issue.${issue.kind}`, { name: labelOf(ctx.hass, ctx.config, issue.id) }) }));
  pills.unshift(...safety);
  const key = JSON.stringify([ctx.t("card.pocket.home.all_good"), pills.map((p) => [p.level, p.text, p.target])]);
  if (key === parts.pillsKey) return;
  parts.pillsKey = key;
  const pill = (level, text, safety = false) => {
    const button = el("button", "pill", `<i class="dot ${level}"></i><span></span>`);
    button.type = "button";
    button.lastChild.textContent = text;
    button.addEventListener("click", () => (safety ? parts.ctx.navigate("#/safety")
      : parts.ctx.openSheet?.(checksSpec(parts.ctx))));
    return listItem(button);
  };
  if (pills.length === 0) {
    parts.att.replaceChildren(pill("good", ctx.t("card.pocket.home.all_good")));
    return;
  }
  parts.att.replaceChildren(...pills.map((item) => pill(item.level, item.text, item.safety)));
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
  const set = (name, shown, value, { result, entity, reading } = {}) => {
    const chip = parts.chips[name];
    chip.hidden = !shown;
    if (!shown) return;
    const v = chip.querySelector(".v");
    setText(v, value);
    const tone = toneOf(result);
    const className = tone ? `v lv-${tone}` : "v";
    if (v.className !== className) v.className = className;
    setArrow(chip.querySelector(".arrow"), ctx, entity ? trendNow(hass, entity, reading, parts.onTrend) : null);
    setText(chip.querySelector("small"), ctx.t(`card.pocket.home.chip.${name}`));
  };
  const levelIn = (area, reading) =>
    area ? roomLevels(hass, area, config.thresholds).find((found) => found.reading === reading)?.result : null;

  // Inside and outside: the areas of that type (SPEC-038 §3.9), in the colour of the worst one.
  const RANK = { poor: 0, fair: 1, good: 2 };
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
    const worst = group.measured.map(({ area }) => levelIn(area, "temperature")).filter(Boolean)
      .sort((a, b) => RANK[a.level] - RANK[b.level])[0];
    set(type, true, value, { result: worst, entity: group.entity, reading: "temperature" });
    parts.chips[type].classList.toggle("note", !group.measured.length);
  }

  const air = homeAir(hass, config);
  set("air", !!air, air?.value == null ? ctx.t("card.pocket.format.none") : number(ctx, air.value, 0), {
    result: air?.result, entity: air?.entity, reading: "score" });

  set("lights_on", allLights(config).length > 0, String(lightsOnIn(hass, config.rooms)));

  // Power and plants say what their Systems tiles say, in their tone.
  if (parts.view === "systems") return;
  const sections = Object.fromEntries(sectionsOf(ctx, { pages: ["power", "plants"] }).map((section) => [section.page, section]));
  for (const name of ["power", "plants"]) {
    const section = sections[name];
    set(name, !!section, section?.head ?? "", { result: section?.tone ? { level: section.tone } : null });
  }
}

// The sheet behind a chip (null: nothing to show): inside and outside the areas of their type (with
// no such area, Settings → Areas instead), air the trend of its reading, lights on the lights.
function chipSheet(ctx, name) {
  if (name === "inside" || name === "outside") return typedSpec(ctx, name);
  if (name === "air") return trendSpec(ctx, homeAir(ctx.hass, ctx.config)?.room, "score");
  if (name === "lights_on") return lightsSpec(ctx);
  if (name === "power") return powerSpec(ctx);
  if (name === "plants") return plantsSpec(ctx);
  return null;
}

// The tiles are rebuilt only when the pages they stand for change; their words and tones are
// patched. Energy today is asked as the Power page asks it (at most every few minutes).
function updateSections(root, parts, ctx) {
  if (parts.view !== "systems") return;
  parts.onToday ??= () => { if (root.isConnected) updateSections(root, parts, parts.ctx); };
  const today = todayNow(ctx.hass, parts.onToday);
  const list = sectionsOf(ctx, { today });
  const host = root.querySelector(".sections");
  const key = list.map((s) => s.page).join(" ");
  if (parts.sectionsKey !== key) {
    parts.sectionsKey = key;
    parts.sections = {};
    host.replaceChildren(...list.map((section) => {
      const tile = el("button", "sect", `<span class="nm"><ha-icon></ha-icon><span class="n"></span><i class="dot" hidden></i></span><span class="hd"></span><span class="st"></span>`);
      tile.type = "button";
      tile.dataset.page = section.page;
      tile.querySelector("ha-icon").setAttribute("icon", section.icon);
      tile.addEventListener("click", () => parts.ctx.navigate(section.route, { from: "systems" }));
      parts.sections[section.page] = tile;
      return tile;
    }));
  }
  host.hidden = list.length === 0;
  for (const section of list) {
    const tile = parts.sections[section.page];
    const name = ctx.t(`card.pocket.nav.${section.page}`);
    setText(tile.querySelector(".n"), name);
    setText(tile.querySelector(".hd"), section.head);
    setText(tile.querySelector(".st"), section.status);
    const cls = ["sect", section.tone].filter(Boolean).join(" ");
    if (tile.className !== cls) tile.className = cls;
    const dot = tile.querySelector(".dot");
    dot.hidden = !section.tone;
    const dotCls = ["dot", section.tone].filter(Boolean).join(" ");
    if (dot.className !== dotCls) dot.className = dotCls;
    setAttr(tile, "aria-label", ctx.t("card.pocket.sections.label", { name, head: section.head, status: section.status }));
  }
}

function updateNow(parts, ctx) {
  const now = parts.now;
  // What plays anywhere (any player of lib/media.js playersOf: the home's and those HA places in an
  // area), else the first area's own player.
  const players = playersOf(ctx.config, ctx.hass);
  const pick = players.find((p) => ctx.hass?.states?.[p.id]?.state === "playing") ?? players[0];
  const room = pick?.room;
  const player = pick?.id;
  const state = player ? ctx.hass?.states?.[player] : undefined;
  parts.player = player;
  parts.mediaRoom = room;
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
  // A picture that fails to load (or none) shows the music icon, as Media and the area page do.
  setArt(now.querySelector(".art img"), now.querySelector(".art ha-icon"), a.entity_picture);
  const play = now.querySelector(".play");
  const label = ctx.t(playing ? "card.pocket.home.pause" : "card.pocket.home.play");
  setAttr(play, "aria-label", label);
  setAttr(play.querySelector("ha-icon"), "icon", playing ? "mdi:pause" : "mdi:play");
  play.disabled = ctx.offline || gone;
  setAttr(now.querySelector(".open"), "aria-label", title);
}

const RUN_ICONS = { scene: "mdi:palette-outline", script: "mdi:script-text-outline", button: "mdi:gesture-tap-button" };
const TOGGLE_ICONS = { switch: "mdi:toggle-switch-outline", fan: "mdi:fan", input_boolean: "mdi:toggle-switch-outline" };
const DONE_MS = 1500;

// One tile of Quick, built once per item.
function quickTile(parts, id) {
  const ctx = parts.ctx;
  const item = itemOf(id, ctx.config, ctx.hass);
  if (!item) return null;
  if (item.control === "light") {
    const tile = document.createElement("pocket-light-tile");
    tile.t = ctx.t;
    tile.optimistic = ctx.optimistic;
    tile.config = { name: nameOf(id, ctx.config, ctx.hass, ctx.t), entities: item.entities };
    parts.tiles.push(tile);
    return tile;
  }
  const button = el("button", `all-off act ${item.control}`,
    `<span class="ic"><ha-icon></ha-icon></span><span class="t1"></span> <span class="t2"></span>`);
  button.type = "button";
  button.dataset.id = id;
  const icon = item.control === "all_off" ? "mdi:lightbulb-off-outline"
    : item.control === "run" ? RUN_ICONS[item.domain] : TOGGLE_ICONS[item.domain];
  button.querySelector("ha-icon").setAttribute("icon", icon ?? "mdi:gesture-tap");
  button.addEventListener("click", () => {
    const { hass, offline, config, optimistic } = parts.ctx;
    if (offline || !hass?.callService) return;
    if (item.control === "all_off") {
      const lights = allLights(config);
      optimistic.send(parts.root, hass, { domain: "light", service: "turn_off", data: { entity_id: lights },
        errorKey: "card.pocket.error.light", expect: Object.fromEntries(lights.map((l) => [l, { state: "off" }])) });
      return;
    }
    if (item.control === "toggle") {
      const on = hass.states?.[id]?.state === "on";
      optimistic.send(parts.root, hass, { domain: item.domain, service: "toggle", data: { entity_id: id },
        errorKey: "card.pocket.error.action", expect: { [id]: { state: on ? "off" : "on" } } });
      return;
    }
    optimistic.send(parts.root, hass, { domain: item.domain, service: item.service, data: { entity_id: id },
      errorKey: "card.pocket.error.action", expect: { [id]: { changed: true } } });
    button.classList.add("done");
    clearTimeout(button._done);
    button._done = setTimeout(() => button.classList.remove("done"), DONE_MS);
  });
  return button;
}

function updateQuick(parts, ctx) {
  setText(parts.quickTitle, ctx.t("card.pocket.home.quick"));
  const edit = parts.quickSec.querySelector(".quick-edit");
  setText(edit, ctx.t("card.pocket.quick.edit"));
  setAttr(edit, "aria-label", ctx.t("card.pocket.quick.edit_label"));
  const { ids } = quickOf(ctx.settings, ctx.config, ctx.hass);
  const key = ids.join(" ");
  if (key !== parts.quickKey) {
    parts.quickKey = key;
    parts.tiles = [];
    parts.quick.replaceChildren(...ids.map((id) => quickTile(parts, id)).filter(Boolean));
  }
  parts.quickSec.hidden = ids.length === 0 || parts.view === "systems";
  for (const tile of parts.tiles) {
    tile.t = ctx.t;
    tile.optimistic = ctx.optimistic;
    tile.offline = ctx.offline;
    tile.hass = ctx.hass;
  }
  const on = lightsOnIn(ctx.hass, ctx.config.rooms);
  for (const button of parts.quick.querySelectorAll("button.act")) {
    const id = button.dataset.id;
    const t1 = button.querySelector(".t1");
    const t2 = button.querySelector(".t2");
    if (id === "all_off") {
      setText(t1, ctx.t("card.pocket.home.all_off"));
      setText(t2, on > 0 ? ctx.t("card.pocket.home.on_now", { count: on }) : ctx.t("card.pocket.home.none_on"));
    } else {
      setText(t1, nameOf(id, ctx.config, ctx.hass, ctx.t));
      const state = ctx.hass?.states?.[id]?.state;
      const toggle = button.classList.contains("toggle");
      setText(t2, toggle ? ctx.t(state === "on" ? "card.pocket.quick.on" : "card.pocket.quick.off")
        : areaNameOf(id, ctx.config, ctx.hass) ?? "");
      button.classList.toggle("on", toggle && state === "on");
    }
    button.disabled = !!ctx.offline;
  }
}
