import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, nodeRates, toMbps, trafficRules } from "./traffic.js";
import rules from "./wifi-rules.json" with { type: "json" };

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ago = (s) => new Date(NOW - s * 1000).toISOString();
const OFFICE = "02:00:00:00:00:01"; // Alex's office node
const HALL = "02:00:00:00:00:02";   // Sam's hall node
const ent = (entity_id, device_id, platform = "tplink_deco") => ({ entity_id, device_id, platform });
const doc = {
  floors: [{
    floor_id: "ground",
    points: [{ device_id: "dev-office", xy: [1, 1] }, { device_id: "dev-hall", xy: [5, 1] }],
    access_points: [{ device_id: "dev-office" }, { device_id: "dev-hall" }],
  }],
};

// A hass with the two nodes, the router's freshness sensor and polling switch, and `extra` trackers.
function build(extra = [], { updatedAge = 5, polling = "on", devices = {}, entities = {}, states = {} } = {}) {
  const h = {
    devices: { "dev-office": {}, "dev-hall": {}, ...devices },
    entities: {
      "device_tracker.alex_office": ent("device_tracker.alex_office", "dev-office"),
      "device_tracker.sam_hall": ent("device_tracker.sam_hall", "dev-hall"),
      "sensor.sam_hall_client_last_successful_update": ent("sensor.sam_hall_client_last_successful_update", "dev-hall"),
      "switch.sam_hall_polling": ent("switch.sam_hall_polling", "dev-hall"),
      ...entities,
    },
    states: {
      "device_tracker.alex_office": { state: "home", attributes: { device_type: "deco", mac: OFFICE } },
      "device_tracker.sam_hall": { state: "home", attributes: { device_type: "deco", mac: HALL } },
      "sensor.sam_hall_client_last_successful_update": { state: ago(updatedAge), attributes: {} },
      "switch.sam_hall_polling": { state: polling, attributes: {} },
      ...states,
    },
  };
  for (const t of extra) {
    const id = `device_tracker.${t.id}`;
    h.entities[id] = ent(id, t.device_id);
    h.states[id] = {
      state: t.state ?? "home", last_updated: ago(t.age ?? 5), ...(t.reported != null ? { last_reported: ago(t.reported) } : {}),
      attributes: { device_type: "client", friendly_name: t.name ?? t.id, mac: t.mac, deco_mac: "deco" in t ? t.deco : OFFICE,
        connection_type: t.link ?? "wired", down_kilobytes_per_s: t.down ?? 0, up_kilobytes_per_s: t.up ?? 0 },
    };
  }
  return h;
}
const byMac = (list, mac) => list.find((c) => c.mac === mac);
const M = (n) => `02:00:00:00:00:${String(n).padStart(2, "0")}`;

test("rates in Mbit/s, down plus up", () => {
  const h = build([{ id: "alex_pc", mac: M(10), down: 196, up: 0.75 }]);
  const c = byMac(clients(h, doc, rules, NOW).list, M(10));
  assert.deepEqual([c.down, c.up, c.total, c.link], [1.57, 0.01, 1.57, "wired"]);
});

test("each connection_type maps to its link; undefined and not_home are skipped", () => {
  const h = build([
    { id: "a", mac: M(11), link: "band2_4" }, { id: "b", mac: M(12), link: "band5" }, { id: "c", mac: M(13), link: "band6" },
    { id: "d", mac: M(14), link: "undefined" }, { id: "e", mac: M(15), link: "band5", state: "not_home" },
  ]);
  const list = clients(h, doc, rules, NOW).list;
  assert.deepEqual(list.map((c) => [c.mac, c.link]).sort(), [[M(11), "2.4"], [M(12), "5"], [M(13), "6"]]);
});

test("the client's ap is the plan node with its deco_mac; a node not on the plan gives null", () => {
  const h = build([{ id: "a", mac: M(11), deco: HALL }, { id: "b", mac: M(12), deco: "02:00:00:00:00:77" }]);
  const list = clients(h, doc, rules, NOW).list;
  assert.equal(byMac(list, M(11)).ap, "dev-hall");
  assert.equal(byMac(list, M(12)).ap, null);
});

test("match by a point's mac link before the registry", () => {
  const h = build([{ id: "sam_tv", mac: M(20), device_id: "dev-tv" }], {
    devices: { "dev-tv": { connections: [["mac", M(20)]] }, "dev-tv2": {} },
  });
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points, { device_id: "dev-tv" }, { device_id: "dev-tv2", mac: M(20), xy: [2, 2] }] }] };
  const c = byMac(clients(h, d, rules, NOW).list, M(20));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["link", { floorId: "ground", key: "dev-tv2" }, "dev-tv2"]);
});

test("match by registry, the router's own tracker device excluded", () => {
  const h = build([{ id: "sam_tv", mac: M(21), device_id: "dev-router-client" }], {
    devices: {
      "dev-router-client": { connections: [["mac", M(21)]] }, // the integration's own device for the tracker
      "dev-tv": { connections: [["mac", M(21)]] },
    },
  });
  const onPlan = (keys) => ({ floors: [{ ...doc.floors[0], points: [...doc.floors[0].points, ...keys] }] });
  let c = byMac(clients(h, onPlan([{ device_id: "dev-router-client", xy: [3, 3] }]), rules, NOW).list, M(21));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["registry", null, "dev-tv"]); // dev-tv is not on this plan
  c = byMac(clients(h, onPlan([{ device_id: "dev-tv", xy: [3, 3] }]), rules, NOW).list, M(21));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["registry", { floorId: "ground", key: "dev-tv" }, "dev-tv"]);
});

test("a point's also device matches by registry", () => {
  const h = build([{ id: "sam_tv", mac: M(22) }], { devices: { "dev-cast": {}, "dev-upnp": { connections: [["mac", M(22)]] } } });
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points, { device_id: "dev-cast", also: ["dev-upnp"], xy: [3, 3] }] }] };
  const c = byMac(clients(h, d, rules, NOW).list, M(22));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["registry", { floorId: "ground", key: "dev-cast" }, "dev-upnp"]);
});

test("a registry device not on the plan is the matched device, unplaced", () => {
  const h = build([{ id: "tv", mac: M(24) }], { devices: { "dev-tv": { connections: [["mac", M(24)]] } } });
  const c = byMac(clients(h, doc, rules, NOW).list, M(24));
  assert.deepEqual([c.device_id, c.point, c.matched_by], ["dev-tv", null, "registry"]);
});

test("unmatched: device_id and point null, matched_by null", () => {
  const c = byMac(clients(build([{ id: "phone", mac: M(23) }]), doc, rules, NOW).list, M(23));
  assert.deepEqual([c.device_id, c.point, c.matched_by], [null, null, null]);
});

test("not live when the updated sensor is older than 90 s", () => {
  const r = clients(build([{ id: "a", mac: M(30) }], { updatedAge: 100 }), doc, rules, NOW);
  assert.deepEqual([r.live, r.reason, r.list.map((c) => c.stale)], [false, "stale", [true]]);
  assert.equal(r.updated.toISOString(), ago(100));
});

test("live when the sensor is younger than 90 s and the polling switch is on", () => {
  const r = clients(build([{ id: "a", mac: M(30) }], { updatedAge: 80 }), doc, rules, NOW);
  assert.deepEqual([r.live, r.reason, r.list[0].stale], [true, null, false]);
});

test("not live when the polling switch is off", () => {
  const r = clients(build([{ id: "a", mac: M(31) }], { polling: "off" }), doc, rules, NOW);
  assert.deepEqual([r.live, r.reason, r.list[0].stale], [false, "polling_off", true]);
});

test("freshness entities are found on any device of the integration, not only a node", () => {
  const h = build([], { entities: { "sensor.router_client_last_successful_update": ent("sensor.router_client_last_successful_update", "dev-router") } });
  delete h.entities["sensor.sam_hall_client_last_successful_update"];
  h.states["sensor.router_client_last_successful_update"] = { state: ago(5), attributes: {} };
  assert.equal(clients(h, doc, rules, NOW).live, true);
});

test("unavailable when no node tracker is home", () => {
  const h = build([{ id: "a", mac: M(32) }], { states: {
    "device_tracker.alex_office": { state: "not_home", attributes: { device_type: "deco", mac: OFFICE } },
    "device_tracker.sam_hall": { state: "unavailable", attributes: { device_type: "deco", mac: HALL } } } });
  const r = clients(h, doc, rules, NOW);
  assert.deepEqual([r.live, r.reason], [false, "unavailable"]);
});

test("an idle tracker is not stale while the router is live; updated keeps its old time", () => {
  // tplink_deco does not rewrite every tracker on each poll (SPEC-047 Amendment 1)
  const h = build([{ id: "a", mac: M(33), age: 2100, reported: 2100 }]);
  const r = clients(h, doc, rules, NOW);
  assert.equal(r.live, true);
  assert.deepEqual([r.list[0].stale, r.list[0].updated.toISOString()], [false, ago(2100)]);
});

test("missing mac or deco_mac: skipped", () => {
  const h = build([{ id: "a", mac: M(35) }, { id: "b", mac: undefined }, { id: "c", mac: M(36), deco: null }]);
  assert.deepEqual(clients(h, doc, rules, NOW).list.map((c) => c.mac), [M(35)]);
});

test("two trackers with one MAC: the newer wins", () => {
  const h = build([{ id: "old", mac: M(37), age: 60, down: 100 }, { id: "new", mac: M(37).toUpperCase(), age: 5, down: 200 }]);
  const list = clients(h, doc, rules, NOW).list;
  assert.equal(list.length, 1);
  assert.equal(list[0].down, 1.6);
});

test("a link and a registry match for different MACs both hold", () => {
  const h = build([{ id: "a", mac: M(40) }, { id: "b", mac: M(41) }], { devices: { "dev-b": { connections: [["mac", M(41)]] } } });
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points,
    { device_id: "dev-a", mac: M(40), xy: [2, 2] }, { device_id: "dev-b", xy: [3, 3] }] }] };
  const list = clients(h, d, rules, NOW).list;
  assert.equal(byMac(list, M(40)).matched_by, "link");
  assert.equal(byMac(list, M(41)).matched_by, "registry");
});

test("string, null and unknown rates read as 0", () => {
  const h = build([{ id: "a", mac: M(42), down: "12.5", up: null }, { id: "b", mac: M(43), down: "unknown", up: "unavailable" }]);
  const list = clients(h, doc, rules, NOW).list;
  assert.deepEqual([byMac(list, M(42)).down, byMac(list, M(42)).up, byMac(list, M(42)).total], [0.1, 0, 0.1]);
  assert.deepEqual(byMac(list, M(43)).total, 0);
});

test("node rates from the node's _down and _up sensors; total_ sensors are ignored", () => {
  const h = build([], { entities: {
    "sensor.alex_office_alex_office_down": ent("sensor.alex_office_alex_office_down", "dev-office"),
    "sensor.alex_office_alex_office_up": ent("sensor.alex_office_alex_office_up", "dev-office"),
    "sensor.alex_office_total_down": ent("sensor.alex_office_total_down", "dev-office"),
    "sensor.alex_office_total_up": ent("sensor.alex_office_total_up", "dev-office"),
  }, states: {
    "sensor.alex_office_alex_office_down": { state: "205", attributes: {} },
    "sensor.alex_office_alex_office_up": { state: "105", attributes: {} },
    "sensor.alex_office_total_down": { state: "99999", attributes: {} },
    "sensor.alex_office_total_up": { state: "99999", attributes: {} },
  } });
  assert.deepEqual(nodeRates(h, rules, "dev-office"), { down: 1.64, up: 0.84 });
  assert.equal(nodeRates(h, rules, "dev-hall"), null);
});

test("toMbps and trafficRules", () => {
  assert.equal(toMbps(125, "kB/s"), 1);
  assert.equal(toMbps("abc", "kB/s"), 0);
  assert.equal(trafficRules(rules).length, 1);
  assert.deepEqual(trafficRules({ access_points: [{ integration: "x" }] }), []);
});
