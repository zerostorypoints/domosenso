// The Settings page, on the page contract of pages/index.js. Four groups:
//   - Appearance: System / Light / Dark (lib/settings.js theme; lib/theme.js paints it);
//   - Bottom bar: a switch per page the bar can show besides Home and Settings (lib/router.js
//     TABS), at most MAX_TABS - 2 on; while that many are on, the others are disabled with a hint;
//   - Comfort ranges: per area with comfort helpers (lib/areas.js comfortOf: the rooms, then the
//     Outside), then the air limits; each value is a button that opens Home Assistant's more-info
//     of its helper (the hass-more-info event), so HA's own dialog changes it;
//   - About, read-only: the pocket's version, every component the home runs (the attribute
//     `components` of sensor.domosenso_components, which the domosenso command writes from the
//     lock), the HA area each pocket area reads, links to HA's area pages and to the catalog.
// A change of setting shows at once and is saved through ctx.saveSettings; a save that fails
// puts the shown value back and toasts (lib/report.js). render() builds the groups once (the
// comfort and area rows follow the config); update() patches text and state.

import { areasOf, comfortOf } from "../lib/areas.js";
import { FIXED_TABS, MAX_TABS, TABS } from "../lib/router.js";
import { MODES } from "../lib/theme.js";
import { reportError } from "../lib/report.js";
import { GONE, el, setText, setAttr, number, temperature, percent } from "../lib/page-kit.js";

export const INVENTORY = "sensor.domosenso_components";
export const CATALOG_URL = "https://domosenso.org/";
export const REPO_URL = "https://github.com/zerostorypoints/domosenso";
const AREA_URL = "/config/areas/area/";

const CHOICES = TABS.map((tab) => tab.page).filter((page) => !FIXED_TABS.includes(page));
const ROOM = MAX_TABS - FIXED_TABS.length;
const COMFORT = [["temperature", "temp_low", "temp_high"], ["humidity", "humidity_low", "humidity_high"]];

// The version this file is served from (/local/domosenso/pocket/<version>/cards/pages/...), for a
// home whose inventory does not list the pocket.
const SERVED = import.meta.url.match(/\/pocket\/(\d+\.\d+\.\d+[^/]*)\/cards\//)?.[1] ?? null;

const STYLE = `
  .settings .top { padding: 4px 4px 8px; }
  .settings .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .settings .group { margin: 0 0 18px; padding: 4px 14px; background: var(--card); border: 1px solid var(--line);
                     border-radius: 18px; }
  .settings h3 { margin: 10px 0 4px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .settings h4 { margin: 10px 0 2px; font-size: 15px; font-weight: 600; }
  .settings .hint { margin: 2px 0 10px; font-size: 12.5px; line-height: 1.35; color: var(--mut); }
  .settings .hint[hidden], .settings .row[hidden], .settings .group[hidden] { display: none; }
  .settings .seg { display: flex; gap: 4px; margin: 6px 0 12px; padding: 4px; background: var(--chip); border-radius: 14px; }
  .settings .seg button { flex: 1 1 0; min-height: 44px; margin: 0; border: 0; border-radius: 10px; background: none;
                          font: inherit; font-size: 15px; color: var(--fg); cursor: pointer; }
  .settings .seg button[aria-checked="true"] { background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
  .settings .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 48px;
                   border-top: 1px solid var(--line); font-size: 15px; }
  .settings .row:first-of-type { border-top: 0; }
  .settings .row .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .settings .row .label small { display: block; font-size: 12.5px; color: var(--mut); }
  .settings .switch { box-sizing: border-box; flex: 0 0 auto; width: 56px; min-height: 44px; margin: 0; padding: 0 4px;
                      border: 0; background: none; cursor: pointer; display: flex; align-items: center; }
  .settings .switch i { position: relative; display: block; width: 46px; height: 28px; border-radius: 14px; background: var(--line); }
  .settings .switch i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px;
                               border-radius: 50%; background: var(--card); box-shadow: 0 1px 2px rgba(0, 0, 0, .25); }
  .settings .switch[aria-checked="true"] i { background: var(--acc); }
  .settings .switch[aria-checked="true"] i::after { left: 21px; }
  .settings .values { display: flex; gap: 6px; flex: 0 0 auto; }
  .settings .value { box-sizing: border-box; min-width: 64px; min-height: 44px; margin: 0; padding: 4px 10px;
                     border: 0; border-radius: 12px; background: var(--chip); color: var(--fg); font: inherit;
                     font-size: 15px; font-weight: 600; cursor: pointer; display: flex; flex-direction: column;
                     align-items: center; justify-content: center; }
  .settings .value small { font-size: 11.5px; font-weight: 400; color: var(--mut); }
  .settings button:disabled { opacity: .55; cursor: default; }
  .settings button:focus-visible, .settings a:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .settings .version { margin: 6px 0 4px; font-size: 15px; font-weight: 600; }
  .settings .muted { color: var(--mut); }
  .settings a.row { color: var(--fg); text-decoration: none; }
  .settings a.row .go { color: var(--acc); flex: 0 0 auto; }
  .settings .links { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 12px; }
  .settings .links a { box-sizing: border-box; min-height: 44px; padding: 0 14px; display: flex; align-items: center;
                       border-radius: 12px; background: var(--chip); color: var(--acc); font-size: 15px; text-decoration: none; }
`;

const has = (hass, id) => hass?.states?.[id] != null;

function valueOf(hass, id) {
  const state = hass?.states?.[id]?.state;
  if (state == null || GONE.has(state)) return null;
  const value = Number(state);
  return Number.isFinite(value) ? value : null;
}

// The settings shown: the person's with the changes not saved yet over them.
const shown = (parts) => ({ ...parts.ctx.settings, ...parts.pending });
const chosenOf = (settings) => CHOICES.filter((page) => (settings.bar ?? []).includes(page));

function moreInfo(button, entityId) {
  const event = new Event("hass-more-info", { bubbles: true, composed: true });
  event.detail = { entityId };
  button.dispatchEvent(event);
}

// Shows the change at once and saves it; a failed save puts back what was shown and toasts.
function change(root, patch) {
  const parts = root._settings;
  const token = {};
  for (const key of Object.keys(patch)) parts.tokens[key] = token;
  parts.pending = { ...parts.pending, ...patch };
  update(root, parts.ctx);
  const settle = (failed) => {
    for (const key of Object.keys(patch)) {
      if (parts.tokens[key] !== token) continue;   // a later change of the same field owns it
      delete parts.tokens[key];
      delete parts.pending[key];
    }
    if (failed) reportError(root, "card.pocket.settings.error");
    update(root, parts.ctx);
  };
  Promise.resolve()
    .then(() => parts.ctx.saveSettings(patch))
    .then((saved) => { if (saved) parts.ctx = { ...parts.ctx, settings: saved }; settle(false); },
      () => settle(true));
}

function valueButton(parts, entityId, kind) {
  const button = el("button", "value", "<span></span><small></small>");
  button.type = "button";
  button.addEventListener("click", () => moreInfo(button, entityId));
  const item = { button, entityId, kind };
  parts.values.push(item);
  return { button, item };
}

function comfortRows(parts, area, ids) {
  const block = el("div", "area");
  const name = el("h4");
  block.append(name);
  parts.areaNames.push({ area, name });
  for (const [reading, low, high] of COMFORT) {
    if (!ids?.[low] && !ids?.[high]) continue;
    const row = el("div", "row", `<span class="label"></span><span class="values"></span>`);
    parts.readingLabels.push({ el: row.querySelector(".label"), key: `card.pocket.settings.comfort.${reading}` });
    for (const [side, key] of [["low", low], ["high", high]]) {
      if (!ids[key]) continue;
      const { button, item } = valueButton(parts, ids[key], reading);
      item.side = `card.pocket.settings.comfort.${side}`;
      item.label = { area, reading };
      row.querySelector(".values").append(button);
    }
    block.append(row);
  }
  return block;
}

function airRows(parts, air) {
  const block = el("div", "area");
  const name = el("h4");
  block.append(name);
  parts.airName = name;
  for (const [reading, ids] of Object.entries(air ?? {})) {
    const row = el("div", "row", `<span class="label"></span><span class="values"></span>`);
    parts.readingLabels.push({ el: row.querySelector(".label"), key: `card.pocket.settings.air.${reading}` });
    for (const side of ["fair", "poor"]) {
      if (!ids?.[side]) continue;
      const { button, item } = valueButton(parts, ids[side], "air");
      item.side = `card.pocket.settings.air_side.${side}`;
      item.label = { reading };
      row.querySelector(".values").append(button);
    }
    block.append(row);
  }
  return block;
}

export function render(ctx) {
  const root = el("section", "settings");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <div class="group appearance"><h3></h3><div class="seg" role="radiogroup"></div></div>
    <div class="group bar"><h3></h3><p class="hint fixed"></p><div class="rows"></div><p class="hint full"></p></div>
    <div class="group comfort"><h3></h3><p class="hint"></p><div class="rows"></div></div>
    <div class="group about"><h3></h3>
      <p class="version"></p>
      <h4 class="components-title"></h4><div class="components"></div><p class="hint missing"></p>
      <h4 class="areas-title"></h4><div class="area-map"></div>
      <div class="links"><a class="catalog" target="_blank" rel="noopener"></a><a class="repo" target="_blank" rel="noopener"></a></div>
    </div>`;
  const $ = (sel) => root.querySelector(sel);
  const parts = { ctx, pending: {}, tokens: {}, modes: [], switches: [], values: [], areaNames: [], readingLabels: [],
    areaLinks: [], components: null };

  for (const mode of MODES) {
    const button = el("button");
    button.type = "button";
    setAttr(button, "role", "radio");
    button.dataset.mode = mode;
    button.addEventListener("click", () => { if (shown(parts).theme !== mode) change(root, { theme: mode }); });
    parts.modes.push(button);
    $(".seg").append(button);
  }

  for (const page of CHOICES) {
    const row = el("div", "row", `<span class="label"></span>`);
    const button = el("button", "switch", "<i></i>");
    button.type = "button";
    setAttr(button, "role", "switch");
    button.dataset.page = page;
    button.addEventListener("click", () => {
      const chosen = chosenOf(shown(parts));
      const on = chosen.includes(page);
      if (!on && chosen.length >= ROOM) return;
      const next = CHOICES.filter((p) => (p === page ? !on : chosen.includes(p)));
      change(root, { bar: [FIXED_TABS[0], ...next, FIXED_TABS[1]] });
    });
    row.append(button);
    parts.switches.push({ page, row, button });
    $(".bar .rows").append(row);
  }

  const comfort = $(".comfort .rows");
  for (const area of areasOf(ctx.config)) {
    const ids = comfortOf(ctx.config?.thresholds, area);
    if (ids && Object.keys(ids).length) comfort.append(comfortRows(parts, area, ids));
  }
  const air = ctx.config?.thresholds?.air;
  if (air && Object.keys(air).length) comfort.append(airRows(parts, air));
  $(".comfort").hidden = parts.values.length === 0;

  for (const area of areasOf(ctx.config)) {
    const link = el("a", "row", `<span class="label"><span class="name"></span><small></small></span><span class="go">›</span>`);
    parts.areaLinks.push({ area, link });
    $(".area-map").append(link);
  }

  root._settings = parts;
  update(root, ctx);
  return root;
}

// The HA area an area of the pocket reads: a room's `area` (its id when the home names none); the
// Outside's `outside.area` when the home names one.
const haAreaOf = (config, area) => (area.outside ? config?.outside?.area : area.area ?? area.id) || null;

function updateComponents(parts, root, ctx) {
  const list = ctx.hass?.states?.[INVENTORY]?.attributes?.components;
  const items = Array.isArray(list) ? list.filter((c) => c && typeof c.id === "string") : [];
  const own = items.find((c) => c.id === "pocket");
  const version = own?.version || SERVED;
  setText(root.querySelector(".version"), ctx.t("card.pocket.settings.about.version", {
    version: version ? (own?.dev ? ctx.t("card.pocket.settings.about.dev", { version }) : version)
      : ctx.t("card.pocket.format.none") }));
  const missing = root.querySelector(".missing");
  missing.hidden = items.length > 0;
  setText(missing, ctx.t("card.pocket.settings.about.missing"));
  const key = JSON.stringify(items.map((c) => [c.id, c.version, !!c.dev]).concat([ctx.lang]));
  if (parts.components === key) return;
  parts.components = key;
  root.querySelector(".components").replaceChildren(...items.map((c) => {
    const row = el("div", "row", `<span class="label"></span><span class="muted"></span>`);
    row.querySelector(".label").textContent = c.id;
    row.querySelector(".muted").textContent = c.dev
      ? ctx.t("card.pocket.settings.about.dev", { version: c.version }) : String(c.version ?? "");
    return row;
  }));
}

export function update(root, ctx) {
  const parts = root._settings;
  parts.ctx = ctx;
  const { hass } = ctx;
  const settings = shown(parts);
  const offline = ctx.offline === true;
  const $ = (sel) => root.querySelector(sel);

  setText($(".top b"), ctx.t("card.pocket.settings.title"));
  setText($(".appearance h3"), ctx.t("card.pocket.settings.appearance"));
  setAttr($(".seg"), "aria-label", ctx.t("card.pocket.settings.appearance"));
  for (const button of parts.modes) {
    setText(button, ctx.t(`card.pocket.settings.theme.${button.dataset.mode}`));
    setAttr(button, "aria-checked", String(settings.theme === button.dataset.mode));
    button.disabled = offline;
  }

  setText($(".bar h3"), ctx.t("card.pocket.settings.bar.title"));
  setText($(".bar .fixed"), ctx.t("card.pocket.settings.bar.fixed", { count: ROOM }));
  const chosen = chosenOf(settings);
  const full = chosen.length >= ROOM;
  for (const { page, row, button } of parts.switches) {
    const on = chosen.includes(page);
    const label = ctx.t(`card.pocket.nav.${page}`);
    setText(row.querySelector(".label"), label);
    setAttr(button, "aria-label", label);
    setAttr(button, "aria-checked", String(on));
    button.disabled = offline || (full && !on);
  }
  const hint = $(".bar .full");
  hint.hidden = !full;
  setText(hint, ctx.t("card.pocket.settings.bar.full", { count: ROOM }));

  setText($(".comfort h3"), ctx.t("card.pocket.settings.comfort.title"));
  setText($(".comfort .hint"), ctx.t("card.pocket.settings.comfort.hint"));
  for (const { area, name } of parts.areaNames) setText(name, area.outside ? ctx.t("card.pocket.area.outside") : area.name);
  if (parts.airName) setText(parts.airName, ctx.t("card.pocket.settings.air.title"));
  for (const { el: label, key } of parts.readingLabels) setText(label, ctx.t(key));
  for (const item of parts.values) {
    const value = valueOf(hass, item.entityId);
    const text = item.kind === "temperature" ? temperature(ctx, value)
      : item.kind === "humidity" ? percent(ctx, value)
        : value == null ? ctx.t("card.pocket.format.none") : number(ctx, value, 0, { grouping: false });
    setText(item.button.querySelector("span"), text);
    const side = ctx.t(item.side);
    setText(item.button.querySelector("small"), side);
    const what = item.label.reading && item.kind === "air"
      ? ctx.t(`card.pocket.settings.air.${item.label.reading}`) : ctx.t(`card.pocket.settings.comfort.${item.kind}`);
    const where = item.label.area
      ? (item.label.area.outside ? ctx.t("card.pocket.area.outside") : item.label.area.name)
      : ctx.t("card.pocket.settings.air.title");
    setAttr(item.button, "aria-label", ctx.t("card.pocket.settings.comfort.edit", { area: where, reading: what, side, value: text }));
    item.button.disabled = !has(hass, item.entityId);
  }

  setText($(".about h3"), ctx.t("card.pocket.settings.about.title"));
  setText($(".components-title"), ctx.t("card.pocket.settings.about.components"));
  updateComponents(parts, root, ctx);
  setText($(".areas-title"), ctx.t("card.pocket.settings.about.areas"));
  for (const { area, link } of parts.areaLinks) {
    const id = haAreaOf(ctx.config, area);
    const haName = id ? hass?.areas?.[id]?.name : null;
    setText(link.querySelector(".name"), area.outside ? ctx.t("card.pocket.area.outside") : area.name);
    setText(link.querySelector("small"), !id ? ctx.t("card.pocket.settings.about.no_area")
      : haName ? ctx.t("card.pocket.settings.about.ha_area", { name: haName })
        : ctx.t("card.pocket.settings.about.unknown_area", { id }));
    if (id) setAttr(link, "href", `${AREA_URL}${encodeURIComponent(id)}`);
    else link.removeAttribute("href");
    link.querySelector(".go").hidden = !id;
  }
  const catalog = $(".catalog");
  setAttr(catalog, "href", CATALOG_URL);
  setText(catalog, ctx.t("card.pocket.settings.about.catalog"));
  const repo = $(".repo");
  setAttr(repo, "href", REPO_URL);
  setText(repo, ctx.t("card.pocket.settings.about.repo"));
}
