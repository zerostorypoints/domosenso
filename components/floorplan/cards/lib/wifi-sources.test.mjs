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
