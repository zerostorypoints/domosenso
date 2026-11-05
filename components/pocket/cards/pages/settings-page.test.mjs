import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as settingsPage from "./settings-page.js";
import { pages } from "./index.js";
import { config, st, baseStates, hassOf, ctxOf, text, texts } from "../testing/demo-home.mjs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// A ctx with the person's settings and a saveSettings that records each patch; `fail` rejects it.
function settingsCtx({ settings = { bar: ["home", "areas", "climate", "media", "settings"], theme: "system" },
  fail = false, ...rest } = {}) {
  const ctx = ctxOf(rest);
  ctx.settings = settings;
  ctx.saves = [];
  ctx.saveSettings = (patch) => {
    ctx.saves.push(patch);
    if (fail) return Promise.reject(new Error("no"));
    ctx.settings = { ...ctx.settings, ...patch };
    return Promise.resolve(ctx.settings);
  };
  return ctx;
}

function mount(ctx = settingsCtx()) {
  const el = settingsPage.render(ctx);
  document.body.appendChild(el);
  return el;
}

const switches = (el) => [...el.querySelectorAll(".bar .switch")];
const modes = (el) => [...el.querySelectorAll(".seg button")];

beforeEach(() => { document.body.innerHTML = ""; });

test("the shell's settings entry is this page", () => {
  assert.equal(pages.settings, settingsPage);
});

test("the groups, translated", () => {
  const el = mount();
  assert.equal(text(el.querySelector(".top b")), "Settings");
  assert.deepEqual(texts(el, ".group h3"), ["Appearance", "This device", "Bottom bar", "Comfort ranges", "About"]);
  settingsPage.update(el, settingsCtx({ lang: "pl" }));
  assert.deepEqual(texts(el, ".group h3"), ["Wygląd", "To urządzenie", "Dolny pasek", "Zakresy komfortu", "O aplikacji"]);
  settingsPage.update(el, settingsCtx({ lang: "de" }));
  assert.equal(text(el.querySelector(".top b")), "Einstellungen");
});

test("Appearance: three choices, the person's checked; a tap saves it and shows it at once", async () => {
  const ctx = settingsCtx();
  const el = mount(ctx);
  assert.deepEqual(modes(el).map(text), ["System", "Light", "Dark"]);
  assert.deepEqual(modes(el).map((b) => b.getAttribute("aria-checked")), ["true", "false", "false"]);
  modes(el)[2].click();
  assert.deepEqual(modes(el).map((b) => b.getAttribute("aria-checked")), ["false", "false", "true"]);
  await tick();
  assert.deepEqual(ctx.saves, [{ theme: "dark" }]);
  assert.equal(modes(el)[2].getAttribute("aria-checked"), "true");
  modes(el)[2].click();
  await tick();
  assert.equal(ctx.saves.length, 1, "the chosen one again saves nothing");
});

test("a failed save puts back what was shown and toasts", async () => {
  const ctx = settingsCtx({ fail: true });
  const el = mount(ctx);
  const errors = [];
  document.body.addEventListener("pocket-error", (e) => errors.push(e.detail.key));
  modes(el)[1].click();
  assert.equal(modes(el)[1].getAttribute("aria-checked"), "true");
  await tick();
  assert.equal(modes(el)[0].getAttribute("aria-checked"), "true");
  assert.deepEqual(errors, ["card.pocket.settings.error"]);
});

test("Bottom bar: a switch per page besides Home and Settings; at most three on, the others disabled with a hint", async () => {
  const ctx = settingsCtx();
  const el = mount(ctx);
  assert.deepEqual(switches(el).map((b) => b.dataset.page), ["areas", "climate", "media", "power", "plants", "scenes"]);
  assert.deepEqual(texts(el, ".bar .row .label"), ["Areas", "Climate", "Media", "Power", "Plants", "Scenes"]);
  assert.deepEqual(switches(el).map((b) => b.getAttribute("aria-checked")), ["true", "true", "true", "false", "false", "false"]);
  assert.deepEqual(switches(el).map((b) => b.disabled), [false, false, false, true, true, true]);
  assert.equal(el.querySelector(".bar .full").hidden, false);
  assert.match(text(el.querySelector(".bar .full")), /3 pages are on the bar/);
  switches(el)[3].click();
  await tick();
  assert.equal(ctx.saves.length, 0, "a disabled switch saves nothing");

  switches(el)[1].click();      // Climate off
  assert.equal(el.querySelector(".bar .full").hidden, true);
  assert.deepEqual(switches(el).map((b) => b.disabled), [false, false, false, false, false, false]);
  switches(el)[4].click();      // Plants on, before the first save has landed
  await tick();
  assert.deepEqual(ctx.saves, [{ bar: ["home", "areas", "media", "settings"] },
    { bar: ["home", "areas", "media", "plants", "settings"] }]);
  assert.deepEqual(switches(el).map((b) => b.getAttribute("aria-checked")), ["true", "false", "true", "false", "true", "false"]);
});

test("controls are disabled while offline", () => {
  const el = mount(settingsCtx({ offline: true, settings: { bar: ["home", "settings"], theme: "system" } }));
  assert.ok(modes(el).every((b) => b.disabled));
  assert.ok(switches(el).every((b) => b.disabled));
});

test("Comfort ranges: each area with helpers, then the air limits; a value opens its helper's more-info", () => {
  const el = mount();
  assert.deepEqual(texts(el, ".comfort h4"), ["Living room", "Bedroom", "Air limits"]);
  const values = [...el.querySelectorAll(".comfort .value")];
  assert.deepEqual(values.map((b) => text(b.querySelector("span"))),
    ["20.0°", "24.0°", "35 %", "60 %", "18.0°", "22.0°", "35 %", "60 %", "80", "60", "800", "1200"]);
  assert.deepEqual(texts(el, ".comfort .area:last-child .row .label"), ["Air score", "CO₂"]);
  assert.equal(values[1].getAttribute("aria-label"), "Living room, Temperature to: 24.0°");
  assert.equal(values[11].getAttribute("aria-label"), "Air limits, CO₂ poor at: 1200");
  const opened = [];
  document.body.addEventListener("hass-more-info", (e) => opened.push(e.detail.entityId));
  values[1].click();
  values[11].click();
  assert.deepEqual(opened, ["input_number.lr_temp_high", "input_number.co2_poor"]);
});

test("a helper Home Assistant does not have: a dash, its button disabled", () => {
  const states = baseStates();
  delete states["input_number.br_temp_low"];
  const el = mount(settingsCtx({ hass: hassOf(states) }));
  const button = el.querySelectorAll(".comfort .value")[4];
  assert.equal(text(button.querySelector("span")), "—");
  assert.ok(button.disabled);
});

test("the Outside's range comes after the rooms; a home without helpers has no Comfort group", () => {
  const cfg = { ...config, outside: { temperature: "sensor.outside_temperature", area: "garden" },
    thresholds: { ...config.thresholds, outside: { temp_low: "input_number.out_low", temp_high: "input_number.out_high" } } };
  const states = { ...baseStates(), "input_number.out_low": st(-5), "input_number.out_high": st(28) };
  const el = mount(settingsCtx({ cfg, hass: hassOf(states) }));
  assert.deepEqual(texts(el, ".comfort h4"), ["Living room", "Bedroom", "Outside", "Air limits"]);
  const bare = mount(settingsCtx({ cfg: { ...config, thresholds: { rooms: {}, air: {} } } }));
  assert.ok(bare.querySelector(".comfort").hidden);
});

const inventory = (components) => ({ "sensor.domosenso_components": st(components.length, { components }) });

test("About: the pocket's version and every component the home runs, from the inventory", () => {
  const states = { ...baseStates(), ...inventory([
    { id: "climate-air", version: "0.2.0", dev: false },
    { id: "pocket", version: "0.1.0", dev: true },
    { id: "ramka", version: "0.4.1", dev: false },
  ]) };
  const el = mount(settingsCtx({ hass: hassOf(states) }));
  assert.equal(text(el.querySelector(".about .version")), "Pocket 0.1.0 (development)");
  assert.deepEqual(texts(el, ".about .components .row"),
    ["climate-air0.2.0", "pocket0.1.0 (development)", "ramka0.4.1"]);
  assert.ok(el.querySelector(".about .missing").hidden);
});

test("About without the inventory: says so", () => {
  const el = mount();
  assert.equal(el.querySelectorAll(".about .components .row").length, 0);
  assert.equal(el.querySelector(".about .missing").hidden, false);
  assert.match(text(el.querySelector(".about .missing")), /sensor\.domosenso_components/);
  assert.match(text(el.querySelector(".about .version")), /^Pocket /);
});

test("About: the HA area each area reads, linked to HA's area page; the catalog's links", () => {
  const cfg = { ...config, rooms: config.rooms.map((r) => (r.id === "office" ? { ...r, area: "study" } : r)),
    weather: "weather.home" };
  const hass = { ...hassOf(), user: { is_admin: true }, areas: { living_room: { area_id: "living_room", name: "Lounge" },
    study: { area_id: "study", name: "Study" } } };
  const el = mount(settingsCtx({ cfg, hass }));
  const links = [...el.querySelectorAll(".about .area-map a")];
  assert.deepEqual(links.map((a) => text(a.querySelector(".name"))), ["Living room", "Bedroom", "Office", "Hall", "Outside"]);
  assert.deepEqual(links.map((a) => text(a.querySelector("small"))), [
    "Home Assistant area: Lounge", "Home Assistant area bedroom: not found", "Home Assistant area: Study",
    "Home Assistant area hall: not found", "From the outside sensors and the weather"]);
  assert.equal(links[2].getAttribute("href"), "/config/areas/area/study");
  assert.equal(links[4].hasAttribute("href"), false);
  assert.equal(el.querySelector(".about .catalog").getAttribute("href"), "https://domosenso.org/");
  assert.equal(text(el.querySelector(".about .catalog")), "Domosenso catalog");
  assert.match(el.querySelector(".about .repo").getAttribute("href"), /^https:\/\/github\.com\//);
});

test("tap targets of at least 44 px, text of at least 11.5 px", () => {
  const css = mount().querySelector("style").textContent;
  for (const sel of [".seg button", ".switch", ".value", ".links a"]) {
    assert.match(css, new RegExp(`\\.settings ${sel.replace(".", "\\.")} \\{[^}]*min-height: 44px`), sel);
  }
  for (const m of css.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(m[1]) >= 11.5, m[0]);
});

test("an administrator's area link opens HA's area page without a reload", () => {
  const hass = { ...hassOf(), user: { is_admin: true }, areas: { living_room: { name: "Lounge" } } };
  const el = mount(settingsCtx({ hass }));
  const link = el.querySelector(".about .area-map a");
  const changes = [];
  const onChange = (e) => changes.push([window.location.pathname, e.detail]);
  window.addEventListener("location-changed", onChange);
  const before = window.location.pathname;
  try {
    const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    assert.ok(event.defaultPrevented, "no page load");
    assert.deepEqual(changes, [["/config/areas/area/living_room", { replace: false }]]);
  } finally {
    window.removeEventListener("location-changed", onChange);
    window.history.pushState(null, "", before);
  }
});

test("a person who is not an administrator sees the HA area's name without a link", () => {
  for (const user of [{ is_admin: false }, undefined]) {
    const hass = { ...hassOf(), user, areas: { living_room: { name: "Lounge" } } };
    const el = mount(settingsCtx({ hass }));
    const link = el.querySelector(".about .area-map a");
    assert.equal(link.hasAttribute("href"), false);
    assert.ok(link.querySelector(".go").hidden);
    assert.equal(text(link.querySelector("small")), "Home Assistant area: Lounge");
    let changed = false;
    const onChange = () => { changed = true; };
    window.addEventListener("location-changed", onChange);
    link.click();
    window.removeEventListener("location-changed", onChange);
    assert.equal(changed, false);
  }
});

test("Bottom bar: the floor plan is a choice only in a home with the floorplan component, off by default", async () => {
  assert.ok(!texts(mount(), ".bar .row .label").includes("Floor plan"));
  const ctx = settingsCtx({ cfg: { ...config, floorplan: true }, settings: { bar: ["home", "areas", "settings"], theme: "system" } });
  const el = mount(ctx);
  assert.deepEqual(texts(el, ".bar .row .label"), ["Areas", "Climate", "Media", "Power", "Plants", "Scenes", "Floor plan"]);
  const plan = switches(el).find((s) => s.dataset.page === "floorplan");
  assert.equal(plan.getAttribute("aria-checked"), "false");
  plan.click();
  await tick();
  assert.deepEqual(ctx.saves, [{ bar: ["home", "areas", "floorplan", "settings"] }]);
});

test("two levels: Settings holds Appearance, the bar and a row per panel; each panel is its own page with a Back", () => {
  const top = mount(settingsCtx());
  const shownGroups = (el) => [...el.querySelectorAll(".group")].filter((g) => !g.hidden).map((g) => g.classList[1]);
  assert.deepEqual(shownGroups(top), ["appearance", "device", "bar", "menu"], "the home's values are a step away");
  assert.deepEqual(texts(top, ".menu .row .name"), ["Comfort ranges", "About"]);
  assert.equal(text(top.querySelector(".menu [data-panel=comfort] small")), "2 areas · Air limits");
  assert.match(text(top.querySelector(".menu [data-panel=about] small")), /^Pocket /);
  assert.equal(top.querySelector(".back").hidden, true);
  top.querySelector(".menu [data-panel=comfort]").click();
  top.querySelector(".menu [data-panel=about]").click();
  const ctx = settingsCtx({ routeId: "comfort" });
  const comfort = mount(ctx);
  assert.deepEqual(shownGroups(comfort), ["comfort"]);
  assert.equal(comfort.querySelector(".top > b").hidden, true);
  assert.equal(text(comfort.querySelector(".back")), "Comfort ranges");
  assert.equal(comfort.querySelector(".back").getAttribute("aria-label"), "Back to Settings");
  comfort.querySelector(".back").click();
  assert.deepEqual(ctx.routes, ["#/settings"]);
  assert.deepEqual(shownGroups(mount(settingsCtx({ routeId: "about" }))), ["about"]);
});

test("a home without comfort helpers has no Comfort ranges row", () => {
  const el = mount(settingsCtx({ cfg: { ...config, thresholds: {} } }));
  assert.equal(el.querySelector(".menu [data-panel=comfort]").hidden, true);
  assert.equal(el.querySelector(".menu [data-panel=about]").hidden, false);
});

test("This device: open Pocket at the app's start, here only; off again restores HA's start", () => {
  window.history.replaceState(null, "", "/dashboard-pocket/home#/settings");
  const el = mount();
  const start = el.querySelector(".device .start");
  assert.equal(start.getAttribute("aria-checked"), "false");
  start.click();
  assert.equal(window.localStorage.getItem("domosenso-pocket-start"), "/dashboard-pocket");
  assert.equal(start.getAttribute("aria-checked"), "true");
  assert.match(text(el.querySelector(".device small")), /opens here/);
  start.click();
  assert.equal(window.localStorage.getItem("domosenso-pocket-start"), null);
  assert.equal(start.getAttribute("aria-checked"), "false");
});
