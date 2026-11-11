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

const PLAN = { schema: 1, floors: [{ floor_id: "ground", rooms: [], points: [], access_points: [{ device_id: "dev-ap", bands: ["5"] }] }] };
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
  click($(el, ".keep"));
  await settle();
  assert.equal(card.calls.addSamples.length, 1);
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
  assert.ok(text($(el, ".checks")).includes("Too few readings"), text($(el, ".checks")));
  click($(el, ".retry"));
  card.resolveReading = () => ({ ap: null, band: null, via: null });
  click($(el, ".measure"));
  const second = loadPending(window.localStorage, Date.now()).code;
  ctx.hass = surveyHass({ states: reading(second) });
  page.update(el, ctx);
  assert.ok(!$(el, ".bands").hidden);
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
  assert.ok($(install, "a").getAttribute("href").endsWith("/shortcuts/domosenso-wifi.shortcut"));
  assert.ok(text(install).includes("Server"), text(install));
  click($(install, ".done"));
  assert.ok(install.hidden);
  assert.equal(window.localStorage.getItem("pocket.wifi.installed"), "1");
});
