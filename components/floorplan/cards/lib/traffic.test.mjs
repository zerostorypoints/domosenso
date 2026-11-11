import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, nodeRates, toMbps, trafficRules, heatCells, apTotals, HEAT_SIGMA_M, HEAT_CUT_M,
  ringPosition, lineWidth, dotRadius, IDLE_KEY, LINK_COLOURS } from "./traffic.js";
import { pointInPolygon } from "./geometry.js";
import rules from "./wifi-rules.json" with { type: "json" };

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ago = (s) => new Date(NOW - s * 1000).toISOString();
const OFFICE = "02:00:00:00:00:01"; // Alex's office node
const HALL = "02:00:00:00:00:02";   // Sam's hall node
const ent = (entity_id, device_id, platform = "tplink_deco") => ({ entity_id, device_id, platform });
const doc = {
  floors: [{
    floor_id: "ground",
    points: [{ device_id: "dev-office", x: 1, y: 1 }, { device_id: "dev-hall", x: 5, y: 1 }],
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
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points, { device_id: "dev-tv" }, { device_id: "dev-tv2", mac: M(20), x: 2, y: 2 }] }] };
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
  let c = byMac(clients(h, onPlan([{ device_id: "dev-router-client", x: 3, y: 3 }]), rules, NOW).list, M(21));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["registry", null, "dev-tv"]); // dev-tv is not on this plan
  c = byMac(clients(h, onPlan([{ device_id: "dev-tv", x: 3, y: 3 }]), rules, NOW).list, M(21));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["registry", { floorId: "ground", key: "dev-tv" }, "dev-tv"]);
});

test("a point's also device matches by registry", () => {
  const h = build([{ id: "sam_tv", mac: M(22) }], { devices: { "dev-cast": {}, "dev-upnp": { connections: [["mac", M(22)]] } } });
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points, { device_id: "dev-cast", also: ["dev-upnp"], x: 3, y: 3 }] }] };
  const c = byMac(clients(h, d, rules, NOW).list, M(22));
  assert.deepEqual([c.matched_by, c.point, c.device_id], ["registry", { floorId: "ground", key: "dev-cast" }, "dev-upnp"]);
});

test("a registry device not on the plan is the matched device, unplaced", () => {
  const h = build([{ id: "tv", mac: M(24) }], { devices: { "dev-tv": { connections: [["mac", M(24)]] } } });
  const c = byMac(clients(h, doc, rules, NOW).list, M(24));
  assert.deepEqual([c.device_id, c.point, c.matched_by], ["dev-tv", null, "registry"]);
});

test("a registry device whose point is not yet dragged (placed: false) is matched, unplaced", () => {
  const h = build([{ id: "sam_streamer", mac: M(25) }], { devices: { "dev-streamer": { connections: [["mac", M(25)]] } } });
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points, { device_id: "dev-streamer", x: 3, y: 3, placed: false }] }] };
  const c = byMac(clients(h, d, rules, NOW).list, M(25));
  assert.deepEqual([c.device_id, c.point, c.matched_by], ["dev-streamer", null, "registry"]);
});

test("a mac link on a point not yet dragged, or without x and y, gives no point", () => {
  const h = build([{ id: "alex_tv", mac: M(26) }, { id: "sam_tv", mac: M(27) }]);
  const d = { floors: [{ ...doc.floors[0], points: [...doc.floors[0].points,
    { device_id: "dev-tv", mac: M(26), x: 3, y: 3, placed: false }, { device_id: "dev-tv2", mac: M(27) }] }] };
  const { list } = clients(h, d, rules, NOW);
  assert.deepEqual([byMac(list, M(26)).point, byMac(list, M(26)).matched_by, byMac(list, M(26)).device_id], [null, "link", "dev-tv"]);
  assert.deepEqual([byMac(list, M(27)).point, byMac(list, M(27)).matched_by], [null, "link"]);
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
    { device_id: "dev-a", mac: M(40), x: 2, y: 2 }, { device_id: "dev-b", x: 3, y: 3 }] }] };
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

// --- heat cells ---
const cl = (o) => ({ mac: "02:00:00:00:00:10", name: "Alex phone", ap: "office", link: "5", down: 0, up: 0, total: 2, device_id: null, point: null, ...o });
const floor = { floor_id: "ground", rooms: [{ polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] }] };
const serve = [0, 1].flatMap((x) => [0, 1].map((y) => ({ x, y, room: 0, dbm: -50, ap: "office", second: null })));
const pointAt = (p) => (p.floorId === "ground" ? [p.key === "a" ? 1.4 : 0.2, 0.3] : null);
const apAt = (k) => ({ office: { x: 0.5, y: 1.5, floorId: "ground", roomIndex: 0 }, up: { x: 0, y: 0, floorId: "first", roomIndex: 0 } })[k] ?? null;
const heat = (list, serving = { 5: serve }) => heatCells(list, floor, serving, pointAt, apAt, 1);

const near = (a, b) => Math.abs(a - b) < 1e-6;
const cellOf = (h, x, y) => h.find((c) => near(c.x, x) && near(c.y, y));
test("a placed client's own cell holds its total; a cell 1 m away total x e^-0.5; nothing beyond 3 m", () => {
  const c = cl({ point: { floorId: "ground", key: "a" } });
  const h = heatCells([c], floor, {}, () => [10.5, 10.5], apAt, 1);
  assert.ok(near(cellOf(h, 10, 10).value, 2));
  assert.ok(near(cellOf(h, 11, 10).value, 2 * Math.exp(-0.5)));
  assert.equal([HEAT_SIGMA_M, HEAT_CUT_M].join(), "1,3");
  assert.ok(h.every((x) => Math.hypot(x.x + 0.5 - 10.5, x.y + 0.5 - 10.5) <= 3 + 1e-9));
  assert.equal(cellOf(h, 14, 10), undefined);
});
test("a placed client on another floor paints nothing", () => {
  assert.deepEqual(heat([cl({ point: { floorId: "first", key: "a" } })]), []);
});
test("an unplaced Wi-Fi client paints its full total on every serving cell of its access point and band", () => {
  const h = heat([cl()]);
  assert.equal(h.length, 4);
  assert.ok(h.every((c) => c.value === 2));
});
test("no serving cells for that band: the access point's room on this floor takes its full total", () => {
  const h = heat([cl({ link: "6" })]);
  assert.deepEqual(h.map((c) => [c.x, c.y, c.value]), [[0, 0, 2], [0, 1, 2], [1, 0, 2], [1, 1, 2]]);
});
test("the access point serves another floor only: nothing on this floor", () => {
  assert.deepEqual(heat([cl({ ap: "up", link: "6" })]), []);
});
test("an unplaced wired client paints at its access point, with the fall-off", () => {
  const h = heat([cl({ link: "wired" })]);
  assert.ok(near(cellOf(h, 0, 1).value, 2 * Math.exp(-0.0 / 2)));
  assert.ok(cellOf(h, 2, 1).value < cellOf(h, 0, 1).value);
});
test("ap null: left out", () => {
  assert.deepEqual(heat([cl({ ap: null })]), []);
});
test("cells sum their clients", () => {
  const one = cellOf(heat([cl({ point: { floorId: "ground", key: "b" } })]), 0, 0).value;
  const both = cellOf(heat([cl({ point: { floorId: "ground", key: "b" } }), cl({ point: { floorId: "ground", key: "b" }, total: 3 })]), 0, 0).value;
  assert.ok(near(both, one * 2.5));
});
test("apTotals sums total and counts clients per access point", () => {
  const t = apTotals([cl({ total: 1 }), cl({ total: 2.5 }), cl({ ap: "hall", total: 4 }), cl({ ap: null })]);
  assert.deepEqual([...t], [["office", { total: 3.5, count: 2 }], ["hall", { total: 4, count: 1 }]]);
});

test("a room off the step lattice: placed and spread contributions share cells, no duplicate keys", () => {
  const f = { floor_id: "ground", rooms: [{ polygon: [[0.07, 0.11], [0.67, 0.11], [0.67, 0.71], [0.07, 0.71]] }] };
  const step = 0.15;
  // coverage-style cells: anchored at the room's bbox minimum
  const cells = [];
  for (let x = 0.07; x < 0.67; x += step) for (let y = 0.11; y < 0.71; y += step) cells.push({ x, y, room: 0, dbm: -50, ap: "office", second: null });
  const at = (p) => [0.2, 0.2];
  const h = heatCells([cl({ total: 1 }), cl({ total: 3, point: { floorId: "ground", key: "a" } })], f, { 5: cells }, at, apAt, step);
  const keys = h.map((c) => `${Math.round(c.x * 1e6)}|${Math.round(c.y * 1e6)}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(h.every((c) => Math.abs(c.x / step - Math.round(c.x / step)) < 1e-6));
  assert.ok(h.some((c) => c.value > 3), "the placed 3 and a spread 1 sum in one cell");
});
test("room fallback in an L-shaped room: every cell centre is inside the polygon", () => {
  const poly = [[0.07, 0.11], [1.07, 0.11], [1.07, 0.51], [0.47, 0.51], [0.47, 1.11], [0.07, 1.11]];
  const f = { floor_id: "ground", rooms: [{ polygon: poly }] };
  const step = 0.15;
  const h = heatCells([cl({ link: "6" })], f, {}, pointAt, () => ({ x: 0, y: 0, floorId: "ground", roomIndex: 0 }), step);
  assert.ok(h.length > 5);
  assert.ok(h.every((c) => pointInPolygon([c.x + step / 2, c.y + step / 2], poly)));
});
test("roomIndex out of range: nothing", () => {
  const h = heatCells([cl({ link: "6" })], floor, {}, pointAt, () => ({ x: 0, y: 0, floorId: "ground", roomIndex: 9 }), 1);
  assert.deepEqual(h, []);
});

test("ringPosition spaces n clients evenly around the access point, from the top, clockwise", () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const [x0, y0] = ringPosition([10, 5], 0, 4);
  assert.ok(near(x0, 10) && near(y0, 5 - 1.2), "the first one straight above (y grows downwards)");
  const [x1, y1] = ringPosition([10, 5], 1, 4);
  assert.ok(near(x1, 11.2) && near(y1, 5), "then clockwise: to the right");
  const [x2, y2] = ringPosition([10, 5], 2, 4, 2);
  assert.ok(near(x2, 10) && near(y2, 7), "a radius of 2");
  const ring = [0, 1, 2].map((i) => ringPosition([0, 0], i, 3));
  assert.ok(ring.every(([x, y]) => near(Math.hypot(x, y), 1.2)), "all on the ring");
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert.ok(near(d(ring[0], ring[1]), d(ring[1], ring[2])) && near(d(ring[1], ring[2]), d(ring[2], ring[0])), "evenly");
  assert.deepEqual(ringPosition([3, 4], 0, 1).map((v) => Math.round(v * 100) / 100), [3, 2.8], "one client: on top");
});

test("lineWidth and dotRadius grow with total and floor at idle", () => {
  for (const f of [lineWidth, dotRadius]) {
    assert.ok(f(0) > 0, "never zero");
    assert.equal(f(0), f(0.01), "idle is the minimum");
    assert.equal(f(0.001), f(0));
    assert.ok(f(0.1) > f(0.01) && f(1) > f(0.1) && f(10) > f(1) && f(100) > f(10) && f(1000) > f(100));
    assert.equal(f(1e6), f(1000), "capped at the scale's top");
    // monotonic in log10: equal steps per decade
    const step = (a, b) => f(b) - f(a);
    assert.ok(Math.abs(step(0.1, 1) - step(1, 10)) < 1e-9 && Math.abs(step(1, 10) - step(10, 100)) < 1e-9);
  }
});

test("link colours are four distinct categoricals; the idle key is namespaced", () => {
  assert.deepEqual(Object.keys(LINK_COLOURS).sort(), ["2.4", "5", "6", "wired"]);
  assert.equal(new Set(Object.values(LINK_COLOURS)).size, 4);
  assert.equal(IDLE_KEY, "domosenso.floorplan.traffic_idle");
});
