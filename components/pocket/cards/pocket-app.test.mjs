import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import "./pocket-app.js";
import { pages } from "./pages/index.js";

const config = (lang = "en") => ({
  type: "custom:pocket-app",
  lang,
  rooms: [{ id: "kitchen", name: "Kitchen" }],
  thresholds: { rooms: {}, air: {} },
});
const hassOf = (extra = {}) => ({ locale: { language: "en" }, states: {}, connected: true, themes: { darkMode: false }, ...extra });

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function goTo(hash) {
  window.location.hash = hash;
  await tick();
}

function mount({ lang = "en", hass = hassOf() } = {}) {
  const card = document.createElement("pocket-app");
  card.setConfig(config(lang));
  document.body.appendChild(card);
  card.hass = hass;
  return card;
}

const $ = (card, sel) => card.shadowRoot.querySelector(sel);
const $$ = (card, sel) => [...card.shadowRoot.querySelectorAll(sel)];
const labels = (card) => $$(card, "nav .tab .label").map((el) => el.textContent);
const active = (card) => $$(card, "nav .tab").filter((el) => el.classList.contains("active")).map((el) => el.dataset.page);

beforeEach(async () => {
  document.body.innerHTML = "";
  await goTo("#/");
});

test("the bar has the default five translated labels", () => {
  assert.deepEqual(labels(mount({ lang: "en" })), ["Home", "Areas", "Climate", "Media", "Settings"]);
  assert.deepEqual(labels(mount({ lang: "pl" })), ["Dom", "Obszary", "Klimat", "Media", "Ustawienia"]);
  assert.deepEqual(labels(mount({ lang: "de" })), ["Zuhause", "Bereiche", "Klima", "Medien", "Einstellungen"]);
});

test("the config's language wins over Home Assistant's", () => {
  const card = mount({ lang: "pl", hass: hassOf({ locale: { language: "en" } }) });
  assert.equal(labels(card)[0], "Dom");
});

test("each tab is a button of at least 44 px, the bar 64 px over the safe area", () => {
  const card = mount();
  const tabs = $$(card, "nav .tab");
  assert.equal(tabs.length, 5);
  for (const tab of tabs) assert.equal(tab.tagName, "BUTTON");
  const css = $(card, "style").textContent;
  assert.match(css, /--bar:\s*64px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
});

test("bar labels are at least 11.5 px", () => {
  const css = $(mount(), "style").textContent;
  const size = Number(css.match(/\.tab \{[^}]*font-size:\s*([\d.]+)px/)[1]);
  assert.ok(size >= 11.5, `tab label ${size} px`);
});

test("the active item follows location.hash", async () => {
  const card = mount();
  assert.deepEqual(active(card), ["home"]);
  await goTo("#/settings");
  assert.deepEqual(active(card), ["settings"]);
  await goTo("#/area/kitchen");
  assert.deepEqual(active(card), ["areas"]);
  assert.equal($(card, "nav .tab.active").getAttribute("aria-current"), "page");
});

test("a card opened on a route shows that route", async () => {
  await goTo("#/media");
  assert.deepEqual(active(mount()), ["media"]);
});

test("navigate updates the hash and the page without re-creating the shell", async () => {
  const card = mount();
  const nav = $(card, "nav");
  const page = $(card, "main").firstElementChild;
  card._ctx().navigate("#/areas");
  assert.equal(window.location.hash, "#/areas");
  assert.deepEqual(active(card), ["areas"]);
  assert.equal($(card, "nav"), nav);
  assert.notEqual($(card, "main").firstElementChild, page);
  await tick();
  assert.deepEqual(active(card), ["areas"]);
});

test("a tap on a tab navigates", () => {
  const card = mount();
  $$(card, "nav .tab")[4].click();
  assert.equal(window.location.hash, "#/settings");
  assert.deepEqual(active(card), ["settings"]);
});

test("back (hashchange) returns to the page before", async () => {
  const card = mount();
  card._ctx().navigate("#/areas");
  await tick();
  await goTo("#/");
  assert.deepEqual(active(card), ["home"]);
});

test("a hass update updates the page, it does not re-render it", () => {
  const card = mount();
  const page = $(card, "main").firstElementChild;
  card.hass = hassOf({ states: { "light.x": { state: "on", attributes: {} } } });
  assert.equal($(card, "main").firstElementChild, page);
});

test("the page gets the contract's ctx", async () => {
  const card = mount({ lang: "pl" });
  await goTo("#/area/kitchen");
  const ctx = card._ctx();
  assert.equal(ctx.lang, "pl");
  assert.equal(ctx.routeId, "kitchen");
  assert.equal(ctx.offline, false);
  assert.equal(ctx.config.rooms[0].id, "kitchen");
  assert.equal(typeof ctx.hass, "object");
  assert.equal(ctx.t("card.pocket.nav.home"), "Dom");
  assert.equal(typeof ctx.navigate, "function");
  await goTo("#/areas");
  assert.equal(card._ctx().routeId, undefined);
});

test("every page follows the contract; Home is built, a page not built yet says so", async () => {
  assert.deepEqual(Object.keys(pages).sort(),
    ["area", "areas", "climate", "floorplan", "home", "media", "plants", "power", "settings"]);
  for (const [id, page] of Object.entries(pages)) {
    assert.equal(typeof page.render, "function", id);
    assert.equal(typeof page.update, "function", id);
  }
  const card = mount();
  assert.ok($(card, "main .home"));
  await goTo("#/media");
  assert.match($(card, "main").textContent, /Coming next/);
});

test("offline: a banner and ctx.offline; back online it goes", () => {
  const card = mount();
  assert.equal($(card, ".offline").hidden, true);
  card.hass = hassOf({ connected: false });
  assert.equal($(card, ".offline").hidden, false);
  assert.match($(card, ".offline").textContent, /\S/);
  assert.equal(card._ctx().offline, true);
  card.hass = hassOf();
  assert.equal($(card, ".offline").hidden, true);
  assert.equal(card._ctx().offline, false);
});

test("light tokens by default, dark with hass.themes.darkMode", () => {
  const card = mount();
  const app = $(card, ".app");
  assert.equal(app.style.getPropertyValue("--bg"), "#f6f7f9");
  assert.equal(app.style.getPropertyValue("--acc"), "#2f7cf6");
  card.hass = hassOf({ themes: { darkMode: true } });
  assert.equal(app.style.getPropertyValue("--bg"), "#0f1115");
  assert.equal(app.style.getPropertyValue("--acc"), "#5b9bff");
  assert.equal(app.dataset.theme, "dark");
});

test("a removed card stops listening to hashchange", async () => {
  const card = mount();
  card.remove();
  await goTo("#/settings");
  assert.deepEqual(active(card), ["home"]);
});

test("the bar is fixed to the bottom of the screen, its background down over the safe area", () => {
  const card = mount();
  const nav = $(card, "nav");
  const style = getComputedStyle(nav);
  assert.equal(style.position, "fixed");
  assert.equal(style.bottom, "0px");
  const css = $(card, "style").textContent;
  assert.doesNotMatch(css, /position:\s*sticky/);
  // Full width, or beside HA's open sidebar on a wide screen.
  assert.match(css, /nav \{[^}]*left: var\(--mdc-drawer-width, 0px\); right: 0; bottom: 0/);
  // The safe area is padding inside the bar: its background reaches the screen's edge.
  assert.match(css, /nav \{[^}]*height:\s*calc\(var\(--bar\) \+ var\(--safe\)\)/);
  assert.match(css, /nav \{[^}]*padding-bottom:\s*var\(--safe\)/);
  // The page ends above the bar.
  assert.match(css, /main \{[^}]*padding: 12px 16px calc\(var\(--bar\) \+ var\(--safe\) \+ 16px\)/);
});

test("no page drift: nothing scrolls sideways, overscroll stays in the app, HA's scroller is left alone", () => {
  const css = $(mount(), "style").textContent;
  assert.match(css, /\.app \{[^}]*overflow-x: clip; overscroll-behavior: none/);
  assert.match(css, /\.app \* \{ overscroll-behavior-x: none; \}/);
  assert.match(css, /main \{[^}]*touch-action: pan-y/);
  assert.match(css, /nav \{[^}]*touch-action: none/);
  // Not overflow-x: hidden, which would make the app a scroll container of its own; and nothing
  // on :host, so HA's own scroller (pull to refresh from the top) keeps its behaviour.
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
  assert.match(css, /:host \{ display: block; \}/);
});

test("an unknown area goes to Areas, replacing the entry; pages never see its id", async () => {
  const card = mount();
  const before = window.history.length;
  await goTo("#/area/nowhere");
  assert.equal(window.location.hash, "#/areas");
  assert.deepEqual(active(card), ["areas"]);
  assert.equal(card._ctx().routeId, undefined);
  card._ctx().navigate("#/area/nowhere");
  assert.equal(window.location.hash, "#/areas");
  assert.equal(card._ctx().routeId, undefined);
  assert.ok(window.history.length <= before + 1, "at most the one entry of the hash set by the test");
  card._ctx().navigate("#/area/kitchen");
  assert.equal(card._ctx().routeId, "kitchen");
});

test("a card opened on an unknown area shows Areas", async () => {
  await goTo("#/area/nowhere");
  const card = mount();
  assert.equal(window.location.hash, "#/areas");
  assert.deepEqual(active(card), ["areas"]);
});

test("the bar's labels follow a change of language without a change of route", () => {
  const card = mount({ lang: null, hass: hassOf({ locale: { language: "en" } }) });
  assert.equal(labels(card)[1], "Areas");
  card.hass = hassOf({ locale: { language: "pl" } });
  assert.equal(labels(card)[1], "Obszary");
  card.setConfig({ ...config("de") });
  assert.equal(labels(card)[1], "Bereiche");
});

test("the offline banner's text colour is a token of both themes", () => {
  const card = mount({ hass: hassOf({ connected: false }) });
  assert.match($(card, "style").textContent, /\.offline \{[^}]*color:\s*var\(--on-warn\)/);
  assert.equal($(card, ".app").style.getPropertyValue("--on-warn"), "#1c1f24");
  card.hass = hassOf({ connected: false, themes: { darkMode: true } });
  assert.equal($(card, ".app").style.getPropertyValue("--on-warn"), "#0f1115");
});

test("a failed action shows a translated toast above the bar for a short time; the tile stays as it was", async () => {
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config("pl"), rooms: [{ id: "kitchen", name: "Kitchen", lights: "light.k" }] });
  document.body.appendChild(card);
  card.toastMs = 30;
  card.hass = hassOf({ states: { "light.k": { state: "off", attributes: {} } },
    callService: () => Promise.reject(new Error("no")) });
  const toast = $(card, ".toast");
  assert.ok(!toast.classList.contains("show"));
  assert.equal(toast.getAttribute("role"), "alert");
  const tile = $(card, "pocket-light-tile");
  tile.click();
  await tick();
  assert.ok(toast.classList.contains("show"));
  assert.equal(toast.textContent, "Światło nie odpowiedziało. Spróbuj ponownie.");
  assert.ok(!tile.shadowRoot.querySelector(".tile").classList.contains("on"));
  const css = $(card, "style").textContent;
  assert.match(css, /\.toast \{[^}]*font-size: 16px/);
  assert.equal(toast.parentElement, $(card, "nav"), "above the bar, on it");
  assert.match(css, /\.toast \{[^}]*bottom: calc\(100% \+ 8px\)/);
  assert.match(css, /\.toast:not\(\.show\) \{[^}]*opacity: 0/);
  assert.doesNotMatch(css, /\.toast\[hidden\]/, "never display:none, so screen readers announce it");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!toast.classList.contains("show"));
});

test("the shell is at least a viewport tall under the header, with a vh fallback; the bar has a plain background first", () => {
  const css = $(mount(), "style").textContent;
  assert.match(css, /min-height: 100vh;[^}]*min-height: calc\(100dvh - var\(--header-height, 56px\) - env\(safe-area-inset-top, 0px\)\)/);
  assert.match(css, /background: var\(--card\);\s*background: color-mix/);
});

test("navigate with replace swaps the history entry: Back returns past it", async () => {
  const card = mount();
  card._ctx().navigate("#/areas");
  card._ctx().navigate("#/area/kitchen", { replace: true });
  assert.equal(window.location.hash, "#/area/kitchen");
  assert.equal(card._ctx().routeId, "kitchen");
  assert.deepEqual(active(card), ["areas"]);
  const length = window.history.length;
  card._ctx().navigate("#/areas", { replace: true });
  assert.equal(window.history.length, length, "no entry added");
});

test("a link of the first version lands on its new route, in place of the old entry", async () => {
  const card = mount();
  const length = window.history.length;
  await goTo("#/rooms");
  assert.equal(window.location.hash, "#/areas");
  assert.deepEqual(active(card), ["areas"]);
  await goTo("#/room/kitchen");
  assert.equal(window.location.hash, "#/area/kitchen");
  assert.equal(card._ctx().routeId, "kitchen");
  card._ctx().navigate("#/rooms");
  assert.equal(window.location.hash, "#/areas");
  assert.ok(window.history.length <= length + 3, "only the entries the test set");
});

test("the Outside is an area when the home has one; a route to it without one goes to Areas", async () => {
  mount();
  await goTo("#/area/outside");
  assert.equal(window.location.hash, "#/areas");
  document.body.innerHTML = "";
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config(), outside: { temperature: "sensor.outside_temperature" } });
  document.body.appendChild(card);
  card.hass = hassOf();
  await goTo("#/area/outside");
  assert.equal(window.location.hash, "#/area/outside");
  assert.equal(card._ctx().routeId, "outside");
  assert.deepEqual(active(card), ["areas"]);
});

test("pages not built yet say so: climate, power, plants, the floor plan", async () => {
  const card = mount();
  for (const hash of ["#/climate", "#/power", "#/plants", "#/floorplan"]) {
    await goTo(hash);
    assert.match($(card, "main").textContent, /Coming next/, hash);
  }
  assert.deepEqual(active(card), ["areas"], "the floor plan belongs to Areas");
});

// A hass whose frontend user data holds `stored` under the pocket's key.
const hassWithData = (stored, calls = []) => hassOf({
  callWS: async (msg) => {
    calls.push(msg);
    if (msg.type === "frontend/get_user_data") return { value: stored };
    if (msg.type === "frontend/set_user_data") { stored = msg.value; return null; }
    throw new Error("unknown command");
  },
});

test("the bar shows the person's pages from their settings, read once", async () => {
  const calls = [];
  const card = mount({ hass: hassWithData({ bar: ["power", "plants"] }, calls) });
  await tick();
  assert.deepEqual($$(card, "nav .tab").map((el) => el.dataset.page), ["home", "power", "plants", "settings"]);
  assert.deepEqual(labels(card), ["Home", "Power", "Plants", "Settings"]);
  card.hass = hassWithData({ bar: [] }, calls);
  await tick();
  assert.equal(calls.filter((c) => c.type === "frontend/get_user_data").length, 1);
  assert.deepEqual(card._ctx().settings.bar, ["power", "plants"]);
  // The toast stays on the bar after it is rebuilt.
  assert.equal($(card, ".toast").parentElement, $(card, "nav"));
});

test("settings that cannot be read: the default bar", async () => {
  const card = mount({ hass: hassOf({ callWS: () => Promise.reject(new Error("unknown command")) }) });
  await tick();
  assert.deepEqual(labels(card), ["Home", "Areas", "Climate", "Media", "Settings"]);
});

test("ctx.saveSettings stores the change and the bar follows it", async () => {
  const calls = [];
  const card = mount({ hass: hassWithData(null, calls) });
  await tick();
  const saved = await card._ctx().saveSettings({ bar: ["areas", "plants"] });
  assert.deepEqual(saved.bar, ["areas", "plants"]);
  assert.deepEqual(calls.at(-1),
    { type: "frontend/set_user_data", key: "domosenso-pocket", value: { bar: ["areas", "plants"] } });
  assert.deepEqual($$(card, "nav .tab").map((el) => el.dataset.page), ["home", "areas", "plants", "settings"]);
  await goTo("#/plants");
  assert.deepEqual(active(card), ["plants"]);
});

// A hass over a stored value whose first get_user_data waits until release() is called; every
// call after it answers on a later tick, so concurrent calls could interleave.
function slowFirstRead(initial) {
  let stored = initial;
  let release;
  const first = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  const later = () => new Promise((resolve) => setTimeout(resolve, 1));
  const hass = hassOf({
    callWS: async (msg) => {
      if (msg.type === "frontend/get_user_data") {
        const snapshot = stored;
        if (reads++ === 0) { await first; return { value: snapshot }; }
        await later();
        return { value: stored };
      }
      await later();
      stored = msg.value;
      return null;
    },
  });
  return { hass, release: () => release(), stored: () => stored };
}

test("a first read that lands after a save does not undo the save", async () => {
  const { hass, release } = slowFirstRead({ bar: ["power"] });
  const card = mount({ hass });
  await card._ctx().saveSettings({ bar: ["plants"] });
  assert.deepEqual(card._ctx().settings.bar, ["plants"]);
  release();
  await tick();
  assert.deepEqual(card._ctx().settings.bar, ["plants"]);
  assert.deepEqual($$(card, "nav .tab").map((el) => el.dataset.page), ["home", "plants", "settings"]);
});

test("two saves at once run one after the other: both fields are kept", async () => {
  const { hass, release, stored } = slowFirstRead(null);
  const card = mount({ hass });
  release();
  await tick();
  const ctx = card._ctx();
  await Promise.all([ctx.saveSettings({ bar: ["areas"] }), ctx.saveSettings({ theme: "dark" })]);
  assert.deepEqual(stored(), { bar: ["areas"], theme: "dark" });
  assert.deepEqual(card._ctx().settings, { bar: ["areas"], theme: "dark" });
});

test("a failed save does not stop the next one", async () => {
  let fail = true;
  let stored = null;
  const hass = hassOf({ callWS: async (msg) => {
    if (msg.type === "frontend/get_user_data") return { value: stored };
    if (fail) { fail = false; throw new Error("lost"); }
    stored = msg.value;
    return null;
  } });
  const card = mount({ hass });
  await tick();
  const ctx = card._ctx();
  const [first, second] = await Promise.allSettled(
    [ctx.saveSettings({ bar: ["power"] }), ctx.saveSettings({ bar: ["plants"] })]);
  assert.equal(first.status, "rejected");
  assert.equal(second.status, "fulfilled");
  assert.deepEqual(stored, { bar: ["plants"] });
});

test("a read that fails while offline is tried again once Home Assistant is connected", async () => {
  let reads = 0;
  const callWS = async () => {
    reads += 1;
    if (reads === 1) throw new Error("not connected");
    return { value: { bar: ["power"] } };
  };
  const card = mount({ hass: hassOf({ connected: false, callWS }) });
  await tick();
  assert.deepEqual(labels(card), ["Home", "Areas", "Climate", "Media", "Settings"]);
  card.hass = hassOf({ connected: false, callWS });
  await tick();
  assert.equal(reads, 1, "not while still offline");
  card.hass = hassOf({ connected: true, callWS });
  await tick();
  assert.equal(reads, 2);
  assert.deepEqual(labels(card), ["Home", "Power", "Settings"]);
  card.hass = hassOf({ connected: true, callWS });
  await tick();
  assert.equal(reads, 2, "read once it succeeded");
});

test("a read that fails while connected is not retried on every update", async () => {
  let reads = 0;
  const callWS = async () => { reads += 1; throw new Error("unknown command"); };
  const card = mount({ hass: hassOf({ callWS }) });
  await tick();
  card.hass = hassOf({ callWS });
  await tick();
  assert.equal(reads, 1);
});
