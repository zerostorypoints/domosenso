import { test } from "node:test";
import assert from "node:assert/strict";
import { bandOf, resolveReading, appendSamples, removeSample } from "./survey-api.js";
import rules from "./wifi-rules.json" with { type: "json" };

const A24 = "02:00:00:00:00:0a"; // Alex's node, 2.4 GHz
const A5 = "02:00:00:00:00:0b";  // Alex's node, 5 GHz
const ent = (entity_id, device_id, platform) => ({ entity_id, device_id, platform });
const hass = {
  devices: { "dev-ap": { id: "dev-ap" }, "dev-ap2": { id: "dev-ap2" } },
  entities: {
    "device_tracker.alex_deco": ent("device_tracker.alex_deco", "dev-ap", "tplink_deco"),
    "sensor.alex_deco_bssid_2_4_ghz": ent("sensor.alex_deco_bssid_2_4_ghz", "dev-ap", "tplink_deco"),
    "sensor.alex_deco_bssid_5_ghz": ent("sensor.alex_deco_bssid_5_ghz", "dev-ap", "tplink_deco"),
    "device_tracker.sam_deco": ent("device_tracker.sam_deco", "dev-ap2", "tplink_deco"),
    "device_tracker.alex_phone": ent("device_tracker.alex_phone", null, "tplink_deco"),
  },
  states: {
    "device_tracker.alex_deco": { state: "home", attributes: { device_type: "deco", mac: "02-00-00-00-00-01" } },
    "sensor.alex_deco_bssid_2_4_ghz": { state: A24.toUpperCase(), attributes: {} },
    "sensor.alex_deco_bssid_5_ghz": { state: A5, attributes: {} },
    "device_tracker.sam_deco": { state: "home", attributes: { device_type: "deco", mac: "02-00-00-00-00-02" } },
    "device_tracker.alex_phone": { state: "home", attributes: { device_type: "client", mac: "02-00-00-00-00-AA",
      deco_mac: "02-00-00-00-00-02", connection_type: "band6" } },
  },
};
const doc = (sixToo = false) => ({ schema: 1, floors: [{ floor_id: "ground", rooms: [], points: [],
  access_points: [{ device_id: "dev-ap", bands: ["2.4", "5"] }, { device_id: "dev-ap2", bands: sixToo ? ["2.4", "5", "6"] : ["2.4", "5"] }] }] });

test("bandOf: the frequency decides; the channel alone where it is not ambiguous", () => {
  assert.equal(bandOf({ mhz: 2437 }, false), "2.4");
  assert.equal(bandOf({ mhz: 5180 }, false), "5");
  assert.equal(bandOf({ mhz: 6115 }, true), "6");
  assert.equal(bandOf({ channel: 36 }, false), "5");
  assert.equal(bandOf({ channel: 44 }, true), "5");
  assert.equal(bandOf({ channel: 149 }, false), "5", "no 6 GHz access point: 149 is 5 GHz");
  assert.equal(bandOf({ channel: 177 }, true), null, "a 6 GHz access point: 149–177 is 5 or 6");
  assert.equal(bandOf({ channel: 6 }, true), "2.4", "6 is no 6 GHz channel number");
  assert.equal(bandOf({ channel: 1 }, false), "2.4", "no 6 GHz access point: channel 1 is 2.4 GHz");
  assert.equal(bandOf({ channel: 13 }, true), null, "a 6 GHz access point: channel 13 is 2.4 or 6");
  assert.equal(bandOf({ channel: 37 }, true), "6");
  assert.equal(bandOf({ channel: 233 }, false), "6");
  assert.equal(bandOf({}, true), null);
});

test("resolveReading: the BSSID matched to an access point's BSSID sensor gives its access point and band", () => {
  assert.deepEqual(resolveReading(hass, doc(), rules, { bssid: "02:00:00:00:00:0A", channel: 1 }),
    { ap: "dev-ap", band: "2.4", via: "bssid" });
  assert.deepEqual(resolveReading(hass, doc(), rules, { bssid: A5, channel: 40 }), { ap: "dev-ap", band: "5", via: "bssid" });
});

test("resolveReading: without a BSSID match, the router's client tracker for the phone's MAC (dashes and case normalised)", () => {
  assert.deepEqual(resolveReading(hass, doc(true), rules, { bssid: "02:00:00:00:00:77", mac: "02:00:00:00:00:aa", channel: 5 }),
    { ap: "dev-ap2", band: "6", via: "tracker" });
});

test("resolveReading: else the band from the channel and no access point; unclear stays null", () => {
  assert.deepEqual(resolveReading(hass, doc(), rules, { bssid: "02:00:00:00:00:77", mac: "02:00:00:00:00:bb", channel: 44 }),
    { ap: null, band: "5", via: "channel" });
  assert.deepEqual(resolveReading(hass, doc(true), rules, { channel: 5 }), { ap: null, band: null, via: null });
});

const sample = (t, phone = "ios") => ({ floor_id: "ground", x: 1, y: 1, t, band: "5", dbm: -60, source: "phone", phone,
  method: "shortcut", spread: 1, scans: [{ t, dbm: -60 }] });

test("appendSamples: appended to the plan's samples, refused beyond 2000", () => {
  const d = appendSamples(doc(), [sample("2026-11-11T18:00:00Z")]);
  assert.equal(d.wifi.samples.length, 1);
  assert.equal(appendSamples(d, [sample("2026-11-11T18:01:00Z")]).wifi.samples.length, 2);
  const full = { ...doc(), wifi: { samples: Array.from({ length: 2000 }, (_, i) => sample(`t${i}`)) } };
  assert.equal(appendSamples(full, [sample("x")]), null);
});

test("removeSample: by its time and phone only", () => {
  const d = appendSamples(doc(), [sample("2026-11-11T18:00:00Z"), sample("2026-11-11T18:00:00Z", "phone-sam"), sample("2026-11-11T18:01:00Z")]);
  const out = removeSample(d, "2026-11-11T18:00:00Z", "ios");
  assert.deepEqual(out.wifi.samples.map((s) => [s.t, s.phone]), [["2026-11-11T18:00:00Z", "phone-sam"], ["2026-11-11T18:01:00Z", "ios"]]);
  assert.equal(removeSample(d, "nope", "ios"), d, "nothing matched: the same plan");
});
