import { test } from "node:test";
import assert from "node:assert/strict";
import { accessPointCandidates, normMac } from "./wifi-sources.js";
import rules from "./wifi-rules.json" with { type: "json" };

const hass = {
  devices: { "dev-office": { id: "dev-office" }, "dev-hall": { id: "dev-hall" }, "dev-phone": { id: "dev-phone" }, "dev-atom": { id: "dev-atom" } },
  entities: {
    "device_tracker.alex_office_deco": { entity_id: "device_tracker.alex_office_deco", device_id: "dev-office", platform: "tplink_deco" },
    "device_tracker.sam_hall_deco": { entity_id: "device_tracker.sam_hall_deco", device_id: "dev-hall", platform: "tplink_deco" },
    "device_tracker.sam_phone": { entity_id: "device_tracker.sam_phone", device_id: "dev-phone", platform: "tplink_deco" },
    "device_tracker.alex_laptop": { entity_id: "device_tracker.alex_laptop", platform: "tplink_deco" },
    "sensor.atom_wi_fi_signal": { entity_id: "sensor.atom_wi_fi_signal", device_id: "dev-atom", platform: "esphome" },
  },
  states: {
    "device_tracker.alex_office_deco": { state: "home", attributes: { device_type: "deco", master: false, bssid_band2_4: "02:00:00:00:00:01" } },
    "device_tracker.sam_hall_deco": { state: "home", attributes: { device_type: "deco", master: true } },
    "device_tracker.sam_phone": { state: "home", attributes: { device_type: "client" } },
    "device_tracker.alex_laptop": { state: "home", attributes: { device_type: "client" } },
    "sensor.atom_wi_fi_signal": { state: "-60", attributes: {} },
  },
};
const floor = (extra = {}) => ({
  points: [{ device_id: "dev-office" }, { device_id: "dev-hall", xy: [1, 1] }, { device_id: "dev-phone" },
    { device_id: "dev-atom" }, { entity_id: "device_tracker.alex_laptop" }],
  ...extra,
});

test("a Deco node point is a candidate, even unplaced; clients and other devices are not", () => {
  assert.deepEqual(accessPointCandidates(hass, floor(), rules), ["dev-office", "dev-hall"]);
});

test("a node already marked as access point is not offered again", () => {
  const f = floor({ access_points: [{ device_id: "dev-office" }] });
  assert.deepEqual(accessPointCandidates(hass, f, rules), ["dev-hall"]);
});

test("an entity point is matched by its own tracker", () => {
  const f = { points: [{ entity_id: "device_tracker.alex_office_deco" }] };
  assert.deepEqual(accessPointCandidates(hass, f, rules), ["device_tracker.alex_office_deco"]);
  const g = { points: [{ entity_id: "device_tracker.alex_office_deco" }], access_points: [{ entity_id: "device_tracker.alex_office_deco" }] };
  assert.deepEqual(accessPointCandidates(hass, g, rules), []);
});

test("no rules or no points give no candidates", () => {
  assert.deepEqual(accessPointCandidates(hass, floor(), { access_points: [] }), []);
  assert.deepEqual(accessPointCandidates(hass, { points: [] }, rules), []);
});

test("the rules name the Deco BSSID sensors", () => {
  assert.deepEqual(rules.access_points[0].bssid, { 2.4: "bssid_2_4_ghz", 5: "bssid_5_ghz" });
});

test("normMac", () => {
  assert.equal(normMac("02-00-00-AA-BB-01"), "02:00:00:aa:bb:01");
  assert.equal(normMac("02:00:00:AA:BB:01"), "02:00:00:aa:bb:01");
  assert.equal(normMac(null), null);
  assert.equal(normMac(undefined), null);
});

// ---- device observations (Task 9) ----
import { deviceObservations, signalEntities } from "./wifi-sources.js";

const A = "02:00:00:00:00:0A"; // Alex's 2.4 GHz BSSID
const B = "02:00:00:00:00:0B"; // Alex's 5 GHz BSSID
const ent = (entity_id, device_id, platform) => ({ entity_id, device_id, platform });
const dbm = { device_class: "signal_strength", unit_of_measurement: "dBm", state_class: "measurement" };
const obsHass = {
  devices: {
    "dev-ap": { id: "dev-ap" },
    "dev-ap2": { id: "dev-ap2" },
    "dev-esp": { id: "dev-esp", connections: [["mac", "02:00:00:00:00:99"]] },
    "dev-plug": { id: "dev-plug", connections: [["mac", "02:00:00:00:00:98"]] },
    "dev-ruuvi": { id: "dev-ruuvi", connections: [["bluetooth", "02:00:00:00:00:97"]] },
    "dev-tapo": { id: "dev-tapo" },
  },
  entities: {
    "device_tracker.alex_deco": ent("device_tracker.alex_deco", "dev-ap", "tplink_deco"),
    "sensor.alex_deco_bssid_2_4_ghz": ent("sensor.alex_deco_bssid_2_4_ghz", "dev-ap", "tplink_deco"),
    "sensor.alex_deco_bssid_5_ghz": ent("sensor.alex_deco_bssid_5_ghz", "dev-ap", "tplink_deco"),
    "device_tracker.sam_deco": ent("device_tracker.sam_deco", "dev-ap2", "tplink_deco"),
    "sensor.sam_deco_bssid_2_4_ghz": ent("sensor.sam_deco_bssid_2_4_ghz", "dev-ap2", "tplink_deco"),
    "sensor.esp_wi_fi_signal": ent("sensor.esp_wi_fi_signal", "dev-esp", "esphome"),
    "sensor.esp_connected_ap_bssid": ent("sensor.esp_connected_ap_bssid", "dev-esp", "esphome"),
    "sensor.plug_wi_fi_signal": ent("sensor.plug_wi_fi_signal", "dev-plug", "shelly"),
    "device_tracker.plug": ent("device_tracker.plug", null, "tplink_deco"),
    "sensor.ruuvi_signal_strength": ent("sensor.ruuvi_signal_strength", "dev-ruuvi", "bluetooth"),
    "sensor.tapo_signal_level": ent("sensor.tapo_signal_level", "dev-tapo", "tplink"),
  },
  states: {
    "device_tracker.alex_deco": { state: "home", attributes: { device_type: "deco", mac: "02-00-00-00-00-01" } },
    "sensor.alex_deco_bssid_2_4_ghz": { state: A, attributes: {} },
    "sensor.alex_deco_bssid_5_ghz": { state: B, attributes: {} },
    "device_tracker.sam_deco": { state: "home", attributes: { device_type: "deco", mac: "02-00-00-00-00-02" } },
    "sensor.sam_deco_bssid_2_4_ghz": { state: "02:00:00:00:00:1A", attributes: {} },
    "sensor.esp_wi_fi_signal": { state: "-52.0", attributes: dbm },
    "sensor.esp_connected_ap_bssid": { state: A, attributes: {} },
    "sensor.plug_wi_fi_signal": { state: "-70", attributes: dbm },
    "device_tracker.plug": { state: "home", attributes: { device_type: "client", mac: "02-00-00-00-00-98", deco_mac: "02-00-00-00-00-02", connection_type: "band5" } },
    "sensor.ruuvi_signal_strength": { state: "-80", attributes: dbm },
    "sensor.tapo_signal_level": { state: "2", attributes: {} },
  },
};
const obsDoc = (points, aps = [{ device_id: "dev-ap" }, { device_id: "dev-ap2" }]) => ({
  floors: [{ floor_id: "f1", points, access_points: aps }, { floor_id: "f2", points: [{ device_id: "dev-esp", x: 9, y: 9 }] }],
});
const espPt = { device_id: "dev-esp", x: 3, y: 4 };

test("an ESPHome Wi-Fi sensor with a BSSID of a marked access point's 2.4 GHz", () => {
  const out = deviceObservations(obsHass, obsDoc([espPt]), "f1", rules, {});
  assert.deepEqual(out, [{ floorId: "f1", x: 3, y: 4, band: "2.4", ap: "dev-ap", dbm: -52, weight: 1, source: "device", device: "dev-esp", entity: "sensor.esp_wi_fi_signal" }]);
});

test("the BSSID matches in lower case or with dashes", () => {
  for (const s of [A.toLowerCase(), A.replaceAll(":", "-")]) {
    const h = { ...obsHass, states: { ...obsHass.states, "sensor.esp_connected_ap_bssid": { state: s, attributes: {} } } };
    const [o] = deviceObservations(h, obsDoc([espPt]), "f1", rules, {});
    assert.equal(o.ap, "dev-ap");
  }
});

test("the 5 GHz BSSID gives band 5", () => {
  const h = { ...obsHass, states: { ...obsHass.states, "sensor.esp_connected_ap_bssid": { state: B, attributes: {} } } };
  assert.equal(deviceObservations(h, obsDoc([espPt]), "f1", rules, {})[0].band, "5");
});

test("values override the state; a missing value falls back to the state", () => {
  const [o] = deviceObservations(obsHass, obsDoc([espPt]), "f1", rules, { "sensor.esp_wi_fi_signal": -61.5 });
  assert.equal(o.dbm, -61.5);
});

test("without a BSSID the client tracker's mac (dashes) gives the access point by deco_mac and the band", () => {
  const pt = { device_id: "dev-plug", x: 1, y: 2 };
  const [o] = deviceObservations(obsHass, obsDoc([pt]), "f1", rules, {});
  assert.equal(o.ap, "dev-ap2");
  assert.equal(o.band, "5");
  assert.equal(o.weight, 1);
});

test("a wired or undefined tracker, or an unmarked access point, falls through to unknown", () => {
  const pt = { device_id: "dev-plug", x: 1, y: 2 };
  for (const ct of ["wired", "undefined"]) {
    const h = { ...obsHass, states: { ...obsHass.states, "device_tracker.plug": { state: "home", attributes: { ...obsHass.states["device_tracker.plug"].attributes, connection_type: ct } } } };
    const [o] = deviceObservations(h, obsDoc([pt]), "f1", rules, {});
    assert.deepEqual([o.ap, o.band, o.weight], [null, "2.4", 0.5]);
  }
  const [o] = deviceObservations(obsHass, obsDoc([pt], [{ device_id: "dev-ap" }]), "f1", rules, {});
  assert.deepEqual([o.ap, o.weight], [null, 0.5]);
});

test("a BSSID of no marked access point falls through to the tracker, then unknown", () => {
  const [o] = deviceObservations(obsHass, obsDoc([espPt], [{ device_id: "dev-ap2" }]), "f1", rules, {});
  assert.deepEqual([o.ap, o.band, o.weight], [null, "2.4", 0.5]);
});

test("a marked access point on another floor counts", () => {
  const doc = obsDoc([espPt], []);
  doc.floors[1].access_points = [{ device_id: "dev-ap" }];
  assert.equal(deviceObservations(obsHass, doc, "f1", rules, {})[0].ap, "dev-ap");
});

test("Bluetooth dBm, Tapo signal_level, unavailable and unplaced points give none", () => {
  const pts = [{ device_id: "dev-ruuvi", x: 1, y: 1 }, { device_id: "dev-tapo", x: 1, y: 1 }];
  assert.deepEqual(deviceObservations(obsHass, obsDoc(pts), "f1", rules, {}), []);
  const h = { ...obsHass, states: { ...obsHass.states, "sensor.esp_wi_fi_signal": { state: "unavailable", attributes: dbm } } };
  assert.deepEqual(deviceObservations(h, obsDoc([espPt]), "f1", rules, {}), []);
  assert.deepEqual(deviceObservations(obsHass, obsDoc([{ ...espPt, placed: false }]), "f1", rules, {}), []);
});

test("floorId selects the floor whose points are read", () => {
  const [o] = deviceObservations(obsHass, obsDoc([]), "f2", rules, {});
  assert.deepEqual([o.floorId, o.x, o.y], ["f2", 9, 9]);
});

test("signalEntities lists the Wi-Fi dBm entities only", () => {
  assert.deepEqual(signalEntities(obsHass, rules).sort(), ["sensor.esp_wi_fi_signal", "sensor.plug_wi_fi_signal"]);
});

// ---- disabled signal sources (Task 12) ----
import { disabledSignalEntities } from "./wifi-sources.js";

const reg = (entity_id, device_id, platform, extra = {}) => ({ entity_id, device_id, platform, disabled_by: "integration", ...extra });

test("disabled entities the rules would count: by the registry's device class and unit, else by integration and words", () => {
  const entries = [
    reg("sensor.esp2_wi_fi_signal", "dev-esp", "esphome"),                                         // no class: integration + words
    reg("sensor.plug_rssi", "dev-plug", "shelly", { original_device_class: "signal_strength", unit_of_measurement: "dBm" }),
    reg("sensor.esp2_wi_fi_ssid", "dev-esp", "esphome"),                                           // a Wi-Fi word, no signal
    reg("sensor.esp2_wifi_signal_pct", "dev-esp", "esphome", { unit_of_measurement: "%" }),       // not dBm
    reg("sensor.ruuvi_wifi_signal", "dev-ruuvi", "esphome", { original_device_class: "signal_strength" }),  // Bluetooth device
    reg("sensor.ble_signal_strength", "dev-esp", "bluetooth", { original_device_class: "signal_strength", unit_of_measurement: "dBm" }),
    reg("sensor.tapo_signal_level", "dev-tapo", "tplink"),                                         // no Wi-Fi word
    reg("sensor.other_wifi_signal", "dev-other", "hue"),                                           // not a Wi-Fi integration, no class
    { ...reg("sensor.esp_wi_fi_signal", "dev-esp", "esphome"), disabled_by: null },                // enabled
    reg("switch.esp_wifi_signal", "dev-esp", "esphome"),                                           // not a sensor
  ];
  assert.deepEqual(disabledSignalEntities(obsHass, entries, rules).map((e) => e.entity_id),
    ["sensor.esp2_wi_fi_signal", "sensor.plug_rssi"]);
});

test("disabled sources: only the plan's devices or entities when keys are given; no entries, none", () => {
  const entries = [reg("sensor.esp2_wi_fi_signal", "dev-esp", "esphome"), reg("sensor.lone_wifi_signal", null, "esphome"),
    reg("sensor.far_wifi_signal", "dev-far", "esphome")];
  assert.deepEqual(disabledSignalEntities(obsHass, entries, rules, new Set(["dev-esp", "sensor.lone_wifi_signal"])),
    [{ entity_id: "sensor.esp2_wi_fi_signal", device_id: "dev-esp" }, { entity_id: "sensor.lone_wifi_signal", device_id: null }]);
  assert.deepEqual(disabledSignalEntities(obsHass, null, rules), []);
});
