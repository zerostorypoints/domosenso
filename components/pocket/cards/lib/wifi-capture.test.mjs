import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMethod, newCode, savePending, loadPending, clearPending, resumeRoute, markReturn, saveOutcome, loadOutcome,
  RETURN_MS, shortcutUrl, parseScans,
  readingFromSensor, callbackResult, phoneEntities, androidCollector, PENDING_MS } from "./wifi-capture.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1";

test("detectMethod: the Companion app on Android, on iOS, an iPhone's Safari, else none", () => {
  assert.equal(detectMethod({ externalApp: {}, navigator: { userAgent: "" } }), "companion");
  assert.equal(detectMethod({ externalAppV2: {}, navigator: { userAgent: "" } }), "companion");
  assert.equal(detectMethod({ webkit: { messageHandlers: { externalBus: {} } }, navigator: { userAgent: IPHONE } }), "shortcut-event");
  assert.equal(detectMethod({ navigator: { userAgent: IPHONE } }), "shortcut-callback");
  assert.equal(detectMethod({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } }), null);
});

test("newCode: 12 base32 characters", () => {
  const code = newCode();
  assert.match(code, /^[a-z2-7]{12}$/);
  assert.notEqual(newCode(), code);
  assert.equal(newCode((a) => a.fill(0)), "aaaaaaaaaaaa");
});

test("pending: kept in storage, gone after 120 s; resumeRoute reopens the survey while one waits", () => {
  const storage = memory();
  const p = { code: "abc", floor_id: "ground", x: 1, y: 2, at: 1_000_000, method: "shortcut-event", phone: "ios" };
  savePending(storage, p);
  assert.deepEqual(loadPending(storage, 1_000_000 + PENDING_MS), p);
  assert.equal(resumeRoute(storage, 1_000_000 + 5000), "#/wifi-survey");
  assert.equal(loadPending(storage, 1_000_000 + 121_000), null);
  assert.equal(resumeRoute(storage, 1_000_000 + 121_000), null);
  savePending(storage, p);
  clearPending(storage);
  assert.equal(loadPending(storage, 1_000_000), null);
  storage.setItem("pocket.wifi.pending", "{not json");
  assert.equal(loadPending(storage, 1_000_000), null);
  assert.equal(loadPending({ getItem: () => { throw new Error("blocked"); } }, 0), null, "blocked storage is no pending");
});

test("shortcutUrl: the event route runs the Shortcut with its input; the callback route returns to the page", () => {
  const ret = "homeassistant://navigate/dashboard-pocket";
  const ev = new URL(shortcutUrl({ code: "abc", n: 5, mode: "event", returnUrl: ret }));
  assert.equal(ev.protocol, "shortcuts:");
  assert.equal(ev.href.startsWith("shortcuts://run-shortcut?"), true);
  assert.equal(ev.searchParams.get("name"), "Domosenso Wi-Fi");
  assert.ok(ev.href.includes("name=Domosenso%20Wi-Fi&"), "a space is %20: Shortcuts reads + as a plus");
  assert.ok(!ev.href.includes("+"), ev.href);
  assert.equal(ev.searchParams.get("input"), "text");
  assert.deepEqual(JSON.parse(ev.searchParams.get("text")), { code: "abc", n: 5, mode: "event", return: ret });
  const cb = shortcutUrl({ code: "abc", n: 5, mode: "callback", returnUrl: "https://ha.example/dashboard-pocket" });
  assert.ok(cb.startsWith("shortcuts://x-callback-url/run-shortcut?"));
  assert.equal(new URL(cb).searchParams.get("x-success"), "https://ha.example/dashboard-pocket");
});

test("parseScans: strings as the Shortcut gives them, units and decimal commas read; a scan without Wi-Fi dropped", () => {
  const scans = parseScans([
    { t: "2026-11-11T18:05:27+01:00", ssid: "Home", bssid: "02-00-00-00-00-0A", rssi: "-61", noise: "-96", channel: "36",
      standard: "802.11ax", rx: "864 Mbps", tx: "720", mac: "02:00:00:00:00:AA" },
    { t: "2026-11-11T18:05:28+01:00", ssid: "Home", bssid: "02:00:00:00:00:0a", rssi: "-61,5", noise: "", channel: "36", rx: "2401" },
    { t: "2026-11-11T18:05:29+01:00", ssid: "Not Connected", bssid: "Not Connected", rssi: "" },
    { t: "2026-11-11T18:05:30+01:00", ssid: "Home", bssid: "02:00:00:00:00:0a" },
  ]);
  assert.deepEqual(scans, [
    { t: "2026-11-11T18:05:27+01:00", ssid: "Home", bssid: "02:00:00:00:00:0a", mac: "02:00:00:00:00:aa", dbm: -61, noise: -96,
      channel: 36, standard: "802.11ax", rx: 864, tx: 720, mhz: null },
    { t: "2026-11-11T18:05:28+01:00", ssid: "Home", bssid: "02:00:00:00:00:0a", mac: null, dbm: -61.5, noise: null,
      channel: 36, standard: null, rx: 2401, tx: null, mhz: null },
  ]);
  assert.deepEqual(parseScans("nonsense"), []);
  assert.deepEqual(parseScans(JSON.stringify([{ t: "x", rssi: "-70" }])).map((s) => s.dbm), [-70], "a JSON text of the list");
});

const sensor = (code, at, scans = [{ t: "x", rssi: "-60", bssid: "02:00:00:00:00:0a" }]) =>
  ({ state: code, attributes: { scans, user_id: "u1", at: new Date(at).toISOString() } });

test("readingFromSensor: the pending code's reading, not another code's or an older one", () => {
  const pending = { code: "abc", at: Date.parse("2026-11-11T17:05:00Z") };
  const got = readingFromSensor(sensor("abc", "2026-11-11T17:05:10Z"), pending);
  assert.equal(got.user_id, "u1");
  assert.deepEqual(got.scans.map((s) => s.dbm), [-60]);
  assert.equal(readingFromSensor(sensor("old", "2026-11-11T17:05:10Z"), pending), null);
  assert.ok(readingFromSensor(sensor("abc", "2026-11-11T17:04:00Z"), pending),
    "the single-use code proves the reading fresh: Home Assistant's clock behind the phone's does not drop it");
  assert.equal(readingFromSensor(undefined, pending), null);
  assert.equal(readingFromSensor(sensor("abc", "2026-11-11T17:05:10Z"), null), null);
});

test("callbackResult: the Shortcut's result from the query or after the fragment", () => {
  const json = JSON.stringify({ code: "abc", scans: [] });
  assert.equal(callbackResult({ search: `?result=${encodeURIComponent(json)}`, hash: "#/wifi-survey" }), json);
  assert.equal(callbackResult({ search: "", hash: `#/wifi-survey?result=${encodeURIComponent(json)}` }), json);
  assert.equal(callbackResult({ search: "", hash: "#/wifi-survey" }), null);
});

// An Android phone of the Companion app with its Wi-Fi sensors.
const androidHass = (t, { dbm = "-63", bssid = "02:00:00:00:00:0b", mhz = "5180" } = {}) => ({
  entities: Object.fromEntries(["wifi_signal_strength", "wifi_bssid", "wifi_frequency", "wifi_link_speed", "wifi_connection"]
    .map((k) => [`sensor.sams_phone_${k}`, { entity_id: `sensor.sams_phone_${k}`, device_id: "dev-sam", platform: "mobile_app" }])),
  states: {
    "sensor.sams_phone_wifi_signal_strength": { state: dbm, last_updated: new Date(t).toISOString(), attributes: {} },
    "sensor.sams_phone_wifi_bssid": { state: bssid, last_updated: new Date(t).toISOString(), attributes: {} },
    "sensor.sams_phone_wifi_frequency": { state: mhz, attributes: {} },
    "sensor.sams_phone_wifi_link_speed": { state: "866", attributes: {} },
    "sensor.sams_phone_wifi_connection": { state: "Home", attributes: {} },
  },
});

test("phoneEntities: a mobile_app device's Wi-Fi sensors by their keys", () => {
  assert.deepEqual(phoneEntities(androidHass(0), "dev-sam"), {
    signal: "sensor.sams_phone_wifi_signal_strength", bssid: "sensor.sams_phone_wifi_bssid", frequency: "sensor.sams_phone_wifi_frequency",
    link: "sensor.sams_phone_wifi_link_speed", connection: "sensor.sams_phone_wifi_connection" });
  assert.equal(phoneEntities(androidHass(0), "dev-other"), null);
});

test("androidCollector: each new signal update after the start is a scan; n of them finish it", () => {
  const start = Date.parse("2026-11-11T17:00:00Z");
  const c = androidCollector({ n: 3, startedAt: start, entities: phoneEntities(androidHass(0), "dev-sam") });
  assert.equal(c.offer(androidHass(start - 1000)), false, "an update from before Measure is not a scan");
  assert.equal(c.offer(androidHass(start + 1000)), true);
  assert.equal(c.offer(androidHass(start + 1000)), false, "the same update twice is one scan");
  assert.equal(c.offer(androidHass(start + 3000, { dbm: "-64" })), true);
  assert.equal(c.state(start + 4000), "collecting");
  c.offer(androidHass(start + 5000, { dbm: "-62" }));
  assert.equal(c.state(start + 6000), "done");
  assert.deepEqual(c.scans.map((s) => [s.dbm, s.mhz, s.rx, s.ssid, s.bssid]), [[-63, 5180, 866, "Home", "02:00:00:00:00:0b"],
    [-64, 5180, 866, "Home", "02:00:00:00:00:0b"], [-62, 5180, 866, "Home", "02:00:00:00:00:0b"]]);
});

test("androidCollector: after 20 s, 3 scans or more are enough, fewer fail", () => {
  const start = 0;
  const c = androidCollector({ n: 5, startedAt: start, entities: phoneEntities(androidHass(0), "dev-sam") });
  c.offer(androidHass(1000));
  c.offer(androidHass(2000));
  assert.equal(c.state(19_000), "collecting");
  assert.equal(c.state(20_001), "failed");
  c.offer(androidHass(3000));
  assert.equal(c.state(20_001), "done");
});

test("a reading that just came back reopens the survey once, for RETURN_MS: the app's return comes after it", () => {
  const storage = memory();
  markReturn(storage, 1_000);
  assert.equal(resumeRoute(storage, 1_000 + 5_000), "#/wifi-survey");
  assert.equal(resumeRoute(storage, 1_000 + 6_000), null, "once");
  markReturn(storage, 1_000);
  assert.equal(resumeRoute(storage, 1_000 + RETURN_MS + 1), null, "too late: the person went on");
});

test("the outcome of the last Measure survives the page being built again, for RETURN_MS", () => {
  const storage = memory();
  saveOutcome(storage, { tone: "ok", dbm: -51, t: "2026-11-11T18:35:11Z", phone: "ios" }, 1_000);
  assert.deepEqual(loadOutcome(storage, 2_000), { tone: "ok", dbm: -51, t: "2026-11-11T18:35:11Z", phone: "ios" });
  assert.equal(loadOutcome(storage, 1_000 + RETURN_MS + 1), null);
});

test("parseScans: only scans the plan accepts — a time, a signal of -110..0; rates and frequency out of range dropped to null", () => {
  const ok = { t: "2026-11-11T18:05:27+01:00", bssid: "02:00:00:00:00:0a" };
  assert.deepEqual(parseScans([{ ...ok, rssi: "+5" }, { ...ok, rssi: "-127" }, { rssi: "-60" }]), [], "+5, -127, and no time");
  const [s] = parseScans([{ ...ok, rssi: "\u221261", rx: "2\u00a0401", tx: "20000", mhz: "1200" }]);
  assert.equal(s.dbm, -61, "a Unicode minus is a minus");
  assert.equal(s.rx, 2401, "a space between thousands");
  assert.equal(s.tx, null);
  assert.equal(s.mhz, null);
});

test("androidCollector: the app's invalid signal (-127) is no scan", () => {
  const start = 0;
  const c = androidCollector({ n: 3, startedAt: start, entities: phoneEntities(androidHass(0), "dev-sam") });
  assert.equal(c.offer(androidHass(1000, { dbm: "-127" })), false);
  assert.equal(c.scans.length, 0);
});
