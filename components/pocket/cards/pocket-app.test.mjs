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

test("every page follows the contract; each one is built", async () => {
  assert.deepEqual(Object.keys(pages).sort(),
    ["area", "areas", "climate", "controls", "floorplan", "home", "media", "plants", "power", "scenes", "settings", "system"]);
  for (const [id, page] of Object.entries(pages)) {
    assert.equal(typeof page.render, "function", id);
    assert.equal(typeof page.update, "function", id);
  }
  const card = mount();
  assert.ok($(card, "main .home"));
  await goTo("#/power");
  assert.ok($(card, "main .power"), "Power is built");
  await goTo("#/plants");
  assert.ok($(card, "main .plants"), "Plants is built");
  await goTo("#/media");
  assert.ok($(card, "main .media"), "Media is built");
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

// A matchMedia whose prefers-color-scheme answer the test sets; set(dark) fires its change event.
function fakeScheme(dark = false) {
  const listeners = new Set();
  const media = { matches: dark, addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn) };
  const original = window.matchMedia;
  window.matchMedia = () => media;
  return { media, listeners, set: (value) => { media.matches = value; for (const fn of listeners) fn(); },
    restore: () => { window.matchMedia = original; } };
}

test("System follows the phone, not HA's darkMode; HA's own variables when its theme is the same", () => {
  const scheme = fakeScheme(false);
  try {
    const card = mount();
    const app = $(card, ".app");
    assert.equal(app.dataset.theme, "light");
    assert.equal(app.style.getPropertyValue("--bg"), "var(--primary-background-color, #f6f7f9)");
    assert.equal(app.style.getPropertyValue("--acc"), "var(--primary-color, #2f7cf6)");
    assert.equal(app.style.getPropertyValue("--ok"), "#10b981");
    // HA turns dark, the phone stays light: the pocket's own light values (HA's are dark ones now).
    card.hass = hassOf({ themes: { darkMode: true } });
    assert.equal(app.dataset.theme, "light");
    assert.equal(app.style.getPropertyValue("--bg"), "#f6f7f9");
    // The phone turns dark: repainted at once, with HA's dark variables.
    scheme.set(true);
    assert.equal(app.dataset.theme, "dark");
    assert.equal(app.style.getPropertyValue("--bg"), "var(--primary-background-color, #0f1115)");
    assert.equal(app.style.getPropertyValue("--cold"), "#60a5fa");
    card.remove();
    assert.equal(scheme.listeners.size, 0);
  } finally {
    scheme.restore();
  }
});

test("a saved Light or Dark forces that variant", async () => {
  const scheme = fakeScheme(true);
  try {
    let stored = { theme: "light" };
    const card = mount({ hass: hassOf({ themes: { darkMode: true }, callWS: async (msg) => {
      if (msg.type === "frontend/get_user_data") return { value: stored };
      stored = msg.value;
      return null;
    } }) });
    await tick();
    const app = $(card, ".app");
    assert.equal(app.dataset.theme, "light");
    assert.equal(app.style.getPropertyValue("--fg"), "#1c1f24");
    await card._ctx().saveSettings({ theme: "dark" });
    assert.equal(app.dataset.theme, "dark");
    assert.equal(app.style.getPropertyValue("--fg"), "var(--primary-text-color, #eef0f3)");
  } finally {
    scheme.restore();
  }
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
  // Over the card's own box (beside HA's sidebar in landscape), full width until measured.
  assert.match(css, /nav \{[^}]*left: var\(--bar-left, 0px\); width: var\(--bar-width, 100%\); bottom: 0/);
  assert.match(css, /nav \{[^}]*padding-left: env\(safe-area-inset-left, 0px\)/);
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
  const scheme = fakeScheme(true);
  try {
    card.remove();
    document.body.appendChild(card);
    assert.equal($(card, ".app").style.getPropertyValue("--on-warn"), "#0f1115");
  } finally {
    scheme.restore();
  }
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
  assert.match(css, /min-height: 100vh;[^}]*min-height: calc\(100dvh - var\(--kiosk-header-height, var\(--header-height, 56px\)\) - env\(safe-area-inset-top, 0px\)\)/);
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

test("Power and Plants with nothing in Home Assistant: their empty states", async () => {
  const card = mount();
  await goTo("#/power");
  assert.match($(card, "main .power .empty").textContent, /No power, energy, current or voltage sensors/);
  await goTo("#/plants");
  assert.match($(card, "main .plants .empty").textContent, /No plants/);
});

test("the Power page's Now opens the meters sheet (kind power)", async () => {
  const card = mount();
  await goTo("#/power");
  assert.equal(card._ctx().openSheet({ kind: "power", title: "Now" }), true);
  assert.ok($(card, ".power-sheet"));
});

test("the floor plan without the floorplan component says there is none, under Areas", async () => {
  const card = mount();
  await goTo("#/floorplan");
  assert.match($(card, "main").textContent, /no floor plan/);
  assert.deepEqual(active(card), ["areas"], "the floor plan belongs to Areas");
});

test("the floor plan on the bar only with the floorplan component, its own tab when it is there", async () => {
  const without = mount({ hass: hassWithData({ bar: ["areas", "floorplan"] }) });
  await tick();
  assert.deepEqual($$(without, "nav .tab").map((el) => el.dataset.page), ["home", "areas", "settings"]);
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config(), floorplan: true });
  document.body.appendChild(card);
  card.hass = hassWithData({ bar: ["areas", "floorplan"] });
  await tick();
  assert.deepEqual($$(card, "nav .tab").map((el) => el.dataset.page), ["home", "areas", "floorplan", "settings"]);
  assert.deepEqual(labels(card), ["Home", "Areas", "Floor plan", "Settings"]);
  await goTo("#/floorplan");
  assert.deepEqual(active(card), ["floorplan"]);
});

test("the shell opens the floor plan's layers sheet", () => {
  const card = mount();
  const chips = [{ id: "climate", name: "Climate", colour: "red", on: true }];
  assert.equal(card._ctx().openSheet({ kind: "layers", card: { layerChips: chips, pressLayer() {} }, title: "Layers" }), true);
  assert.match($(card, ".sheet-layer").textContent, /Climate/);
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

test("a home with plants: Plants in Media's place on the default bar; a person's own bar wins", async () => {
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config(), plants: true });
  document.body.appendChild(card);
  card.hass = hassWithData(null);
  await tick();
  assert.deepEqual($$(card, "nav .tab").map((el) => el.dataset.page), ["home", "areas", "climate", "plants", "settings"]);
  assert.deepEqual(card._ctx().settings.bar, ["home", "areas", "climate", "plants", "settings"]);
  const chosen = document.createElement("pocket-app");
  chosen.setConfig({ ...config(), plants: true });
  document.body.appendChild(chosen);
  chosen.hass = hassWithData({ bar: ["media"] });
  await tick();
  assert.deepEqual($$(chosen, "nav .tab").map((el) => el.dataset.page), ["home", "media", "settings"]);
  // A save of another field keeps the home's default bar (nothing stored for it).
  const saved = await card._ctx().saveSettings({ theme: "dark" });
  assert.deepEqual(saved.bar, ["home", "areas", "climate", "plants", "settings"]);
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
  assert.deepEqual(card._ctx().settings, { bar: ["areas"], theme: "dark", climateView: "temperature" });
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

// The area swipe on a real home, through the shell: each swipe replaces the page (a new element
// with its own listeners), and the next swipe must work on it, wherever it starts.
import { config as demoConfig, hassOf as demoHass, baseStates as demoStates } from "./testing/demo-home.mjs";

function swipeOn(target, [x0, y0], [x1, y1]) {
  const fire = (type, x, y) => target.dispatchEvent(new window.PointerEvent(type,
    { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true }));
  fire("pointerdown", x0, y0);
  fire("pointermove", (x0 + x1) / 2, (y0 + y1) / 2);
  fire("pointermove", x1, y1);
  fire("pointerup", x1, y1);
}

function mountDemo(hash, cfg = demoConfig) {
  window.history.replaceState(null, "", hash);
  const card = document.createElement("pocket-app");
  card.setConfig({ ...cfg, type: "custom:pocket-app" });
  document.body.appendChild(card);
  card.hass = demoHass(demoStates());
  return card;
}

const page = (card) => card.shadowRoot.querySelector("main > section");

test("area swipes work both ways after a swipe, also when they start on a light tile's body", () => {
  const card = mountDemo("#/area/living_room");
  const left = [[300, 200], [150, 205]];
  const right = [[100, 200], [250, 205]];
  swipeOn(page(card).querySelector(".squares"), ...left);
  assert.equal(window.location.hash, "#/area/bedroom");
  swipeOn(page(card).querySelector(".squares"), ...left);
  assert.equal(window.location.hash, "#/area/office", "a second swipe on the new page works");
  // The office is mostly its light tile: the swipe back starts on the tile's body. The page sees
  // the event on the tile itself (a browser retargets events out of a shadow root).
  const tile = page(card).querySelector("pocket-light-tile");
  swipeOn(tile, ...right);
  assert.equal(window.location.hash, "#/area/bedroom", "back from a page that is mostly a light tile");
  assert.deepEqual(card.hass.calls, [], "the swipe changed no light");
  swipeOn(page(card), ...right);
  assert.equal(window.location.hash, "#/area/living_room");
  swipeOn(page(card), ...right);
  assert.equal(window.location.hash, "#/area/living_room", "the first area stays: no wrap");
});

test("a swipe from inside a light tile's shadow root is the page's too; one on its strip is the tile's", () => {
  const card = mountDemo("#/area/office");
  const tile = () => page(card).querySelector("pocket-light-tile");
  swipeOn(tile().shadowRoot.querySelector(".t1"), [100, 200], [250, 205]);
  assert.equal(window.location.hash, "#/area/bedroom");
  swipeOn(page(card), [300, 200], [150, 205]);
  assert.equal(window.location.hash, "#/area/office");
  swipeOn(tile().shadowRoot.querySelector(".bar"), [100, 200], [250, 205]);
  assert.equal(window.location.hash, "#/area/office", "the strip's drag stays on the page");
  assert.equal(card.hass.calls.length, 1, "and sets the brightness");
});

test("snappy through the shell: a tap shows at once on every page's control, the report confirms it", () => {
  const card = mountDemo("#/");
  const officeTile = () => [...page(card).querySelectorAll(".quick pocket-light-tile")]
    .find((tile) => tile.config.entities[0] === "light.office");
  const lit = (tile) => tile.shadowRoot.querySelector(".tile").classList.contains("on");
  officeTile().click();
  assert.ok(lit(officeTile()), "on before Home Assistant answers");
  assert.equal(page(card).querySelector('[data-chip="lights_on"] .v').textContent, "2", "the chip agrees");
  assert.deepEqual(card.hass.calls, [["light", "turn_on", { entity_id: "light.office" }]]);
  const states = { ...card.hass.states, "light.office": { state: "on", attributes: { brightness: 255 } } };
  card.hass = { ...card.hass, states };
  assert.ok(lit(officeTile()));
  assert.ok(!card._optimistic.pending("light.office"));
});

test("a save updates the Settings page in place: the same element, the new choice shown", async () => {
  let stored = null;
  const card = mount({ hass: hassOf({ callWS: async (msg) => {
    if (msg.type === "frontend/get_user_data") return { value: stored };
    stored = msg.value;
    return null;
  } }) });
  await goTo("#/settings");
  await tick();
  const page = $(card, "main > section.settings");
  assert.ok(page);
  await card._ctx().saveSettings({ theme: "dark" });
  assert.equal($(card, "main > section.settings"), page);
  assert.equal(page.querySelector('.seg button[data-mode="dark"]').getAttribute("aria-checked"), "true");
  await card._ctx().saveSettings({ bar: ["home", "power", "settings"] });
  assert.equal($(card, "main > section.settings"), page);
  assert.deepEqual($$(card, "nav .tab").map((el) => el.dataset.page), ["home", "power", "settings"]);
});

// A home with one reading and a websocket for its history: the trend sheet through the shell.
function mountTrend() {
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config(), rooms: [{ id: "kitchen", name: "Kitchen", climate: { temperature: "sensor.kitchen_t" } }] });
  document.body.appendChild(card);
  const ws = [];
  const hassWith = (value) => hassOf({
    states: { "sensor.kitchen_t": { state: String(value), attributes: {} } },
    callWS: (msg) => {
      if (msg.type === "frontend/get_user_data") return Promise.resolve({ value: null });
      ws.push(msg);
      return Promise.resolve({ "sensor.kitchen_t": [{ s: "20", lu: Date.now() / 1000 - 600 }] });
    },
  });
  card.hass = hassWith(20.5);
  return { card, ws, hassWith };
}

test("a square opens the trend sheet over the page and the bar; hass updates patch it", async () => {
  await goTo("#/area/kitchen");
  const { card, ws, hassWith } = mountTrend();
  const layer = $(card, ".sheet-layer");
  assert.equal(layer.hidden, true);
  await tick();
  const before = ws.length;   // the square's trend arrow may have asked for the last hour
  $(card, ".sq.climate").click();
  assert.equal(layer.hidden, false);
  assert.equal($(card, ".sheet").getAttribute("aria-label"), "Temperature");
  await tick();
  assert.equal(ws.length, before + 1);
  assert.equal($(card, ".sheet .big").textContent, "20.5°");
  const big = $(card, ".sheet .big");
  card.hass = hassWith(21.2);
  assert.equal($(card, ".sheet .big"), big, "patched, not rebuilt");
  assert.equal(big.textContent, "21.2°");
  assert.equal(ws.length, before + 1);
});

test("Back closes the sheet and leaves the page where it was; a new route closes it too", async () => {
  await goTo("#/area/kitchen");
  const { card } = mountTrend();
  const page = $(card, "main > *");
  $(card, ".sq.climate").click();
  assert.ok(window.history.state?.pocketSheet, "an entry for Back to pop");
  window.history.replaceState(null, "", window.location.hash);
  window.dispatchEvent(new window.PopStateEvent("popstate", { state: null }));
  assert.equal($(card, ".sheet-layer").hidden, true);
  assert.equal($(card, "main > *"), page);
  assert.equal(window.location.hash, "#/area/kitchen");
  $(card, ".sq.climate").click();
  await goTo("#/");
  assert.equal($(card, ".sheet-layer").hidden, true);
});

test("an unknown sheet kind opens nothing", async () => {
  await goTo("#/area/kitchen");
  const { card } = mountTrend();
  assert.equal(card._ctx().openSheet({ kind: "nope" }), false);
  assert.equal($(card, ".sheet-layer").hidden, true);
});

test("the detail sheets are the shell's: checks, air and lights open through ctx.openSheet", async () => {
  await goTo("#/area/kitchen");
  const { card } = mountTrend();
  for (const [spec, sel] of [[{ kind: "checks", title: "What was checked" }, ".detail.checks"],
    [{ kind: "air", area: "kitchen", title: "Air" }, ".detail.air"],
    [{ kind: "lights", title: "Lights on" }, ".detail.lights"]]) {
    assert.equal(card._ctx().openSheet(spec), true, spec.kind);
    assert.ok($(card, `.sheet ${sel}`), spec.kind);
    assert.equal($(card, ".sheet").getAttribute("aria-label"), spec.title);
  }
  // The checks sheet lists the kitchen's temperature; its row opens the trend on top of it.
  card._ctx().openSheet({ kind: "checks", title: "What was checked" });
  const row = $(card, ".sheet .drow");
  const listState = window.history.state;
  row.click();
  assert.ok($(card, ".sheet .trend"), "the row's trend sheet");
  assert.equal($(card, ".sheet .title").textContent, "Temperature");
  // Back: the list again, the same row, patched by the shell; Back again closes.
  window.history.replaceState(listState, "", window.location.hash);
  window.dispatchEvent(new window.PopStateEvent("popstate", { state: listState }));
  assert.equal($(card, ".sheet .drow"), row);
  assert.equal($(card, ".sheet").getAttribute("aria-label"), "What was checked");
  card.hass = card.hass;
  assert.equal($(card, ".sheet .drow .num").textContent, "20.5°");
  window.history.replaceState(null, "", window.location.hash);
  window.dispatchEvent(new window.PopStateEvent("popstate", { state: null }));
  assert.equal($(card, ".sheet-layer").hidden, true);
});

test("a route taken from an open sheet takes the sheet's history entry: Back goes to the page under it", async () => {
  await goTo("#/area/kitchen");
  const { card } = mountTrend();
  const length = window.history.length;
  $(card, ".sq.climate").click();
  assert.ok(window.history.state?.pocketSheet);
  assert.equal(window.history.length, length + 1);
  card._ctx().navigate("#/areas");
  assert.equal(window.location.hash, "#/areas");
  assert.equal($(card, ".sheet-layer").hidden, true);
  assert.equal(window.history.length, length + 1, "no entry added: the sheet's became the route");
  assert.equal(window.history.state?.pocketSheet, undefined, "no sheet state left behind");
});

test("a sheet's state left on the entry (a reload, a return to the dashboard) is cleared", async () => {
  await goTo("#/area/kitchen");
  window.history.replaceState({ pocketSheet: "s999" }, "", window.location.href);
  const { card } = mountTrend();
  assert.equal(window.history.state?.pocketSheet, undefined, "cleared when the card is built");
  card.remove();
  window.history.replaceState({ pocketSheet: "s998" }, "", window.location.href);
  document.body.append(card);
  assert.equal(window.history.state?.pocketSheet, undefined, "cleared when the card comes back");
  assert.equal(window.location.hash, "#/area/kitchen");
});

test("#/climate is the Climate & air page; the forecast sheet is the shell's, closed when the route changes", async () => {
  const card = document.createElement("pocket-app");
  card.setConfig({ ...config(), weather: "weather.home" });
  document.body.appendChild(card);
  card.hass = hassOf({ states: { "weather.home": { state: "sunny", attributes: {} } } });
  await goTo("#/climate");
  assert.equal($(card, "main .climate .top b").textContent, "Climate & air");
  assert.deepEqual(active(card), ["climate"]);
  $(card, "main .climate .wx").click();
  assert.ok($(card, ".sheet .forecast-sheet"));
  assert.equal($(card, ".sheet").getAttribute("aria-label"), "Weather");
  await goTo("#/");
  assert.equal($(card, ".sheet-layer").hidden, true);
});

test("the bar spans the card's measured box: beside HA's sidebar it starts where the sidebar ends", () => {
  const card = mount();
  card.getBoundingClientRect = () => ({ left: 256, top: 56, width: 676, height: 374, right: 932, bottom: 430, x: 256, y: 56 });
  card._placeBar();
  assert.equal(card.style.getPropertyValue("--bar-left"), "256px");
  assert.equal(card.style.getPropertyValue("--bar-width"), "676px");
  card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 });
  card._placeBar();
  assert.equal(card.style.getPropertyValue("--bar-left"), "256px", "an unmeasured box keeps the last place");
  window.dispatchEvent(new window.Event("resize"));
});

test("a menu button left of every page's title opens Home Assistant's sidebar", async () => {
  const app = document.createElement("pocket-app");
  app.setConfig({ type: "custom:pocket-app", lang: "en", rooms: [{ id: "living_room", name: "Living room" }] });
  document.body.append(app);
  app.hass = (await import("./testing/demo-home.mjs")).hassOf();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const button = app.shadowRoot.querySelector("main .top > .ha-menu");
  assert.ok(button, "on Home's title row");
  assert.equal(button.getAttribute("aria-label"), "Home Assistant menu");
  let toggled = 0;
  document.body.addEventListener("hass-toggle-menu", () => { toggled += 1; }, { once: true });
  button.click();
  assert.equal(toggled, 1);
  app.remove();
});

test("a page of Systems off the bar has a way back to Systems; the menu opens only from a menu button", async () => {
  const app = document.createElement("pocket-app");
  app.setConfig({ type: "custom:pocket-app", lang: "en", rooms: [{ id: "living_room", name: "Living room" }] });
  window.history.replaceState(null, "", "#/power");
  document.body.append(app);
  app.hass = (await import("./testing/demo-home.mjs")).hassOf();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const back = app.shadowRoot.querySelector("main .top > .ha-back");
  assert.ok(back, "Power is not on the default bar");
  assert.equal(back.getAttribute("aria-label"), "Back to Systems");
  back.click();
  assert.equal(window.location.hash, "#/systems");
  assert.equal(app.shadowRoot.querySelector("main .top > .ha-back"), null, "Home has none");

  let reached = 0;
  const listen = () => { reached += 1; };
  document.body.addEventListener("hass-toggle-menu", listen);
  document.body.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
  assert.equal(reached, 0, "a swipe's request is ignored here");
  app.shadowRoot.querySelector("main .top > .ha-menu").click();
  assert.equal(reached, 1, "the menu button's goes through");
  const haButton = document.createElement("ha-menu-button");
  document.body.append(haButton);
  haButton.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
  assert.equal(reached, 2, "HA's own header button too");
  document.body.removeEventListener("hass-toggle-menu", listen);
  app.remove();
  haButton.remove();
  window.history.replaceState(null, "", "#/");
});
