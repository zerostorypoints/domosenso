// The Wi-Fi survey page (SPEC-045), with a stand-in for the floorplan card's survey API.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import * as page from "./wifi-survey-page.js";
import { pages } from "./index.js";
import { parseRoute } from "../lib/router.js";
import { forgetPlan } from "../lib/plan-cache.js";
import { loadPending, savePending } from "../lib/wifi-capture.js";
import { config, hassOf, ctxOf, text } from "../testing/demo-home.mjs";

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const PLAN = { schema: 1, floors: [{ floor_id: "ground", points: [], access_points: [{ device_id: "dev-ap", bands: ["5"] }],
  rooms: [{ area_id: "living_room", polygon: sq(0, 0, 5, 4) }, { area_id: "kitchen", polygon: sq(5, 0, 3, 4) }] }] };
const SPOTS = [{ floor_id: "ground", x: 2, y: 1, why: "handover" }, { floor_id: "ground", x: 6, y: 3, why: "room" }];
let card;   // the last stand-in made

class FakePlan extends HTMLElement {
  constructor() {
    super();
    card = this;
    this.calls = { addSamples: [], removeSample: [], spot: [] };
    this.layerChips = [];
  }
  setConfig(c) { this.config = c; }
  set hass(h) { this._hass = h; }
  surveySpots() { return SPOTS; }
  setSurveySpot(s) { this.calls.spot.push(s); }
  focusRoom(id) { this.calls.focus = [...(this.calls.focus ?? []), id]; }
  surveySamples() { return this.samples ?? []; }
  resolveReading() { return { ap: "dev-ap", band: "5", via: "bssid" }; }
  predictionAt() { return -62; }
  async addSamples(s) { this.calls.addSamples.push(s); }
  async removeSample(t, phone) { this.calls.removeSample.push([t, phone]); }
}
customElements.define("floorplan-card", FakePlan);

const DASHBOARD = { views: [{ cards: [{ type: "custom:floorplan-card", plan: PLAN }] }] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const cfg = { ...config, floorplan: true, wifi_survey: true, wifi_scans: 5 };
const scansText = (n = 5, extra = {}) => Array.from({ length: n }, (_, i) => ({ t: new Date(Date.now() + 1000 * (i + 1)).toISOString(),
  ssid: "Home", bssid: "02:00:00:00:00:0b", rssi: "-61", noise: "-96", channel: "40", rx: "2401", tx: "1921", ...extra }));

function surveyHass({ admin = true, states = {} } = {}) {
  const hass = hassOf(states);
  hass.language = "en";
  hass.user = { id: "u1", is_admin: admin };
  hass.callWS = async (msg) => (msg.type === "lovelace/config" ? structuredClone(DASHBOARD) : null);
  hass.services = { notify: { mobile_app_sams_phone: {} } };
  hass.areas = { living_room: { area_id: "living_room", name: "Living room" }, kitchen: { area_id: "kitchen", name: "Kitchen" } };
  hass.served = [];
  hass.callService = async (domain, service, data) => { hass.served.push([domain, service, data]); };
  return hass;
}
const reading = (code, scans = scansText()) => ({ "sensor.domosenso_wifi_reading": { state: code,
  attributes: { scans, user_id: "u1", at: new Date(Date.now() + 500).toISOString() } } });

let opened;
beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  forgetPlan();
  opened = [];
  window.open = (url) => { opened.push(url); return null; };
  window.webkit = { messageHandlers: { externalBus: {} } };     // the iOS Companion app
  window.localStorage.setItem("pocket.wifi.installed", "1");
});

async function mount(ctx) {
  const el = page.render(ctx);
  document.body.appendChild(el);
  await settle();
  await settle();
  page.update(el, ctx);
  return el;
}
const $ = (el, sel) => el.querySelector(sel);
const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const tapPlan = (x, y) => card.dispatchEvent(new window.CustomEvent("floorplan-tap", { detail: { floor_id: "ground", x, y }, bubbles: true }));

test("the shell's route #/wifi-survey is this page", () => {
  assert.equal(pages["wifi-survey"], page);
  assert.deepEqual(parseRoute("#/wifi-survey"), { page: "wifi-survey" });
});

test("a non-administrator sees only that the survey is an administrator's", async () => {
  const el = await mount(ctxOf({ hass: surveyHass({ admin: false }), cfg }));
  assert.equal(text($(el, ".none")), "Only an administrator can survey Wi-Fi.");
  assert.ok($(el, ".panel").hidden);
});

test("the plan is the floorplan card in phone survey mode; a tap near a suggested spot snaps to it", async () => {
  const el = await mount(ctxOf({ hass: surveyHass(), cfg }));
  assert.equal(card.config.survey, "phone");
  assert.equal(card.config.edit, false);
  assert.ok($(el, ".measure").disabled, "no spot yet");
  tapPlan(2.4, 1.3);
  page.update(el, ctxOf({ hass: surveyHass(), cfg }));
  assert.deepEqual(card.calls.spot.at(-1), { floor_id: "ground", x: 2, y: 1 });
  assert.ok(text($(el, ".why")).startsWith("Handover"), text($(el, ".why")));
  assert.ok(!$(el, ".measure").disabled);
  tapPlan(4, 3.5);
  assert.deepEqual(card.calls.spot.at(-1), { floor_id: "ground", x: 4, y: 3.5 }, "far from every spot: where tapped");
});

test("Measure on an iPhone opens the Shortcut and waits; the sensor's reading is checked and Keep saves it once", async () => {
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  tapPlan(2, 1);
  click($(el, ".measure"));
  assert.equal(opened.length, 1);
  assert.ok(opened[0].startsWith("shortcuts://run-shortcut?"), opened[0]);
  const pending = loadPending(window.localStorage, Date.now());
  assert.equal(pending.floor_id, "ground");
  assert.ok(JSON.parse(new URL(opened[0]).searchParams.get("text")).code === pending.code);
  ctx.hass = surveyHass({ states: reading(pending.code) });
  page.update(el, ctx);
  assert.ok(!$(el, ".result").hidden);
  assert.ok(text($(el, ".result")).includes("−61 dBm"), text($(el, ".result")));
  assert.ok(text($(el, ".result")).includes("−62 dBm"), "the model beside it");
  await settle();
  assert.equal(card.calls.addSamples.length, 1, "a reading every check passes is kept at once");
  assert.ok($(el, ".status").classList.contains("ok"), $(el, ".status").className);
  assert.ok(text($(el, ".status")).includes("Kept"), text($(el, ".status")));
  assert.ok($(el, ".keep").hidden, "nothing to choose");
  const [sample] = card.calls.addSamples[0];
  assert.equal(sample.source, "phone");
  assert.equal(sample.dbm, -61);
  assert.equal(loadPending(window.localStorage, Date.now()), null);
  page.update(el, ctx);
  assert.equal(card.calls.addSamples.length, 1, "the same reading is not kept twice");
  click($(el, ".undo"));
  await settle();
  assert.deepEqual(card.calls.removeSample, [[sample.t, sample.phone]]);
});

test("after a reload the pending Measure's reading still arrives; an old reading on the sensor is ignored", async () => {
  savePending(window.localStorage, { code: "abc", floor_id: "ground", x: 2, y: 1, at: Date.now() - 3000, method: "shortcut-event", phone: "ios" });
  const ctx = ctxOf({ hass: surveyHass({ states: reading("old") }), cfg });
  const el = await mount(ctx);
  assert.ok($(el, ".result").hidden, "yesterday's code shows nothing");
  assert.ok(text($(el, ".progress")).length > 0, "still waiting");
  ctx.hass = surveyHass({ states: reading("abc") });
  page.update(el, ctx);
  assert.ok(!$(el, ".result").hidden);
});

test("a hard failure offers only Retry; an unclear band offers 2.4 and 6 GHz", async () => {
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  tapPlan(2, 1);
  click($(el, ".measure"));
  const { code } = loadPending(window.localStorage, Date.now());
  ctx.hass = surveyHass({ states: reading(code, scansText(2)) });
  page.update(el, ctx);
  assert.ok($(el, ".keep").hidden);
  assert.ok(!$(el, ".retry").hidden);
  assert.ok($(el, ".status").classList.contains("bad"), "a red dot: not kept");
  assert.equal(card.calls.addSamples.length, 0);
  assert.ok(text($(el, ".checks")).includes("Too few readings"), text($(el, ".checks")));
  click($(el, ".retry"));
  card.resolveReading = () => ({ ap: null, band: null, via: null });
  click($(el, ".measure"));
  const second = loadPending(window.localStorage, Date.now()).code;
  ctx.hass = surveyHass({ states: reading(second) });
  page.update(el, ctx);
  assert.ok(!$(el, ".bands").hidden);
  assert.ok($(el, ".status").classList.contains("warn"), "an amber dot: the person decides");
  assert.equal(card.calls.addSamples.length, 0, "not kept before the choice");
  click($(el, '.bands [data-band="6"]'));
  await settle();
  assert.equal(card.calls.addSamples[0][0].band, "6");
});

test("Android: Measure asks the phone to update its sensors and collects its Wi-Fi readings", async () => {
  delete window.webkit;
  window.externalApp = {};
  window.localStorage.setItem("pocket.wifi.phone", "dev-sam");
  try {
    const hass = surveyHass();
    hass.devices = { "dev-sam": { id: "dev-sam", name: "Sam's phone" } };
    hass.entities = { "sensor.sams_phone_wifi_signal_strength": { entity_id: "sensor.sams_phone_wifi_signal_strength", device_id: "dev-sam", platform: "mobile_app" } };
    const ctx = ctxOf({ hass, cfg });
    const el = await mount(ctx);
    tapPlan(2, 1);
    click($(el, ".measure"));
    assert.deepEqual(hass.served[0], ["notify", "mobile_app_sams_phone", { message: "command_update_sensors" }]);
    assert.equal(opened.length, 0);
  } finally {
    delete window.externalApp;
  }
});

test("first use on an iPhone: the install card with the Shortcut and the Server step", async () => {
  window.localStorage.removeItem("pocket.wifi.installed");
  const el = await mount(ctxOf({ hass: surveyHass(), cfg }));
  const install = $(el, ".install");
  assert.ok(!install.hidden);
  const href = $(install, "a.install-link").getAttribute("href");
  assert.ok(/\/shortcuts\/Domosenso%20Wi-Fi\.shortcut$/.test(href), "the file: Shortcuts refuses import-shortcut for it");
  assert.equal($(install, "a.install-link").getAttribute("download"), "Domosenso Wi-Fi.shortcut");
  assert.ok(text(install).includes("Server"), text(install));
  click($(install, ".done"));
  assert.ok(install.hidden);
  assert.equal(window.localStorage.getItem("pocket.wifi.installed"), "1");
});

test("an update never hides a shown part for a moment: the page keeps its height and its scroll", async () => {
  window.localStorage.removeItem("pocket.wifi.installed");
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  // A part shown before and after an update must not have been hidden in between.
  const parts = [...el.querySelectorAll("*")];
  const shownBefore = new Set(parts.filter((n) => !n.hidden));
  const touched = new Set();
  const watch = new window.MutationObserver((records) => { for (const r of records) touched.add(r.target); });
  watch.observe(el, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  page.update(el, ctx);
  page.update(el, ctx);
  await settle();
  watch.disconnect();
  const flips = [...touched].filter((n) => shownBefore.has(n) && !n.hidden).map((n) => n.className);
  assert.deepEqual(flips, []);
});

test("a Measure waiting for its reading can be cancelled; after 30 s a hint, after 2 min it is given up", async () => {
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  tapPlan(2, 1);
  click($(el, ".measure"));
  assert.ok($(el, ".measure").disabled);
  assert.ok(!$(el, ".cancel").hidden);
  click($(el, ".cancel"));
  assert.ok(!$(el, ".measure").disabled);
  assert.ok($(el, ".cancel").hidden);
  assert.equal(loadPending(window.localStorage, Date.now()), null);
  click($(el, ".measure"));
  el._survey.pending.at -= 31_000;
  page.update(el, ctx);
  assert.ok(text($(el, ".progress")).includes("Server"), text($(el, ".progress")));
  el._survey.pending.at -= 90_000;
  page.update(el, ctx);
  assert.ok(!$(el, ".measure").disabled, "given up after 2 min");
  assert.ok($(el, ".cancel").hidden);
  assert.ok(text($(el, ".progress")).includes("No reading arrived"), text($(el, ".progress")));
});

test("a room picker above the plan: the whole floor plan by default, a room zooms the plan to it", async () => {
  const el = await mount(ctxOf({ hass: surveyHass(), cfg }));
  const pick = $(el, "select.room-pick");
  assert.deepEqual([...pick.options].map((o) => [o.value, o.textContent]),
    [["", "Whole floor plan"], ["living_room", "Living room"], ["kitchen", "Kitchen"]]);
  assert.equal(pick.value, "");
  pick.value = "kitchen";
  pick.dispatchEvent(new window.Event("change", { bubbles: true }));
  pick.value = "";
  pick.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.deepEqual(card.calls.focus, ["kitchen", null]);
  assert.ok(pick.compareDocumentPosition($(el, ".box")) & window.Node.DOCUMENT_POSITION_FOLLOWING, "above the plan");
});

test("the readings kept: newest first with room, time and value; a tap shows the details and every scan", async () => {
  const sample = (t, x, dbm) => ({ floor_id: "ground", x, y: 1, t, band: "5", channel: 40, dbm, noise: -96, ap: "dev-ap",
    source: "phone", phone: "ios", method: "shortcut", spread: 1, scans: [{ t, dbm: dbm - 1 }, { t, dbm }] });
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = page.render(ctx);
  document.body.appendChild(el);
  await settle();
  card.samples = [sample("2026-11-11T18:30:00Z", 6, -55), sample("2026-11-11T18:26:28Z", 2, -48)];
  page.update(el, ctx);
  const rows = [...el.querySelectorAll(".readings .reading")];
  assert.equal(rows.length, 2);
  assert.ok(text(rows[0]).includes("Kitchen") && text(rows[0]).includes("−55 dBm"), text(rows[0]));
  assert.ok(text(rows[1]).includes("Living room") && text(rows[1]).includes("−48 dBm"), text(rows[1]));
  assert.ok(text($(el, ".readings h3")).includes("2"), text($(el, ".readings h3")));
  click(rows[1]);
  page.update(el, ctx);
  const details = $(el, ".readings .details");
  assert.ok(!details.hidden);
  assert.ok(text(details).includes("channel 40") && text(details).includes("−49") && text(details).includes("Spread 1 dB"), text(details));
  const pick = $(el, "select.room-pick");
  pick.value = "kitchen";
  pick.dispatchEvent(new window.Event("change", { bubbles: true }));
  page.update(el, ctx);
  assert.equal(el.querySelectorAll(".readings .reading").length, 1, "the picked room's readings");
});

test("the outcome survives the page being built again on the app's return: still a green Kept with Undo", async () => {
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  tapPlan(2, 1);
  click($(el, ".measure"));
  const { code } = loadPending(window.localStorage, Date.now());
  ctx.hass = surveyHass({ states: reading(code) });
  page.update(el, ctx);
  await settle();
  assert.ok($(el, ".status").classList.contains("ok"));
  document.body.innerHTML = "";
  const again = await mount(ctxOf({ hass: surveyHass({ states: reading(code) }), cfg }));
  assert.ok($(again, ".status").classList.contains("ok"), $(again, ".status").className);
  assert.ok(text($(again, ".status")).includes("Kept"), text($(again, ".status")));
  assert.ok(!$(again, ".undo").hidden);
  assert.equal(card.calls.addSamples.length, 0, "the new page keeps nothing twice");
});

test("the waiting line says to go back to Home Assistant; the picked room is kept on this phone", async () => {
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  tapPlan(2, 1);
  click($(el, ".measure"));
  assert.ok(text($(el, ".progress")).includes("go back to Home Assistant"), text($(el, ".progress")));
  const pick = $(el, "select.room-pick");
  pick.value = "kitchen";
  pick.dispatchEvent(new window.Event("change", { bubbles: true }));
  document.body.innerHTML = "";
  const again = await mount(ctxOf({ hass: surveyHass(), cfg }));
  assert.equal($(again, "select.room-pick").value, "kitchen");
  assert.deepEqual(card.calls.focus, ["kitchen"], "the new plan shows the room");
});

test("the Shortcut ran without Pocket's request (an empty reading after Measure): said at once, Measure free again", async () => {
  const ctx = ctxOf({ hass: surveyHass(), cfg });
  const el = await mount(ctx);
  tapPlan(2, 1);
  click($(el, ".measure"));
  ctx.hass = surveyHass({ states: reading("", []) });
  page.update(el, ctx);
  assert.ok(!$(el, ".measure").disabled);
  assert.ok($(el, ".cancel").hidden);
  assert.ok(text($(el, ".progress")).includes("without Pocket's request"), text($(el, ".progress")));
});
