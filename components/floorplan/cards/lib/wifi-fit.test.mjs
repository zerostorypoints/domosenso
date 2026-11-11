import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrate, residualAt, calibratedCoverage, confidenceOf, calibratedLevelGrid } from "./wifi-fit.js";
import { contextFor, priorParams, predict, coverage, wallSegments, levelGrid } from "./wifi.js";
import table from "./materials.json" with { type: "json" };

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const room = (x, y, w, h, id) => ({ area_id: id, polygon: sq(x, y, w, h) });
const ap = (id) => ({ device_id: id, bands: ["2.4", "5", "6"] });
const pt = (id, x, y) => ({ device_id: id, x, y, placed: true });
const near = (a, b, e) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b} (±${e})`);
const clone = (v) => JSON.parse(JSON.stringify(v));

// One open room 12 × 8 m, the access point in a corner: no wall on any path.
const openDoc = () => ({ schema: 1, floors: [{ floor_id: "f0", rooms: [room(0, 0, 12, 8, "alex")],
  points: [pt("node", 1, 1)], access_points: [ap("node")] }] });
// Three rooms in a row, brick between them, the access point in the first.
const rowDoc = () => ({ schema: 1, floors: [{ floor_id: "f0",
  rooms: [room(0, 0, 4, 4, "alex"), room(4, 0, 4, 4, "sam"), room(8, 0, 4, 4, "kim")],
  walls: [{ at: [4, 2], material: "brick" }, { at: [8, 2], material: "brick" }],
  points: [pt("node", 1, 2)], access_points: [ap("node")] }] });

const priors = (doc) => priorParams(table, doc.floors.flatMap((f) => f.access_points));
const ctxOf = (doc, params) => contextFor(doc, "f0", {}, table, params ?? priors(doc));

// Readings the truth would give at the points from access point `ap`: one device each.
function observe(doc, truth, points, band, extra = {}, ap = "node") {
  const ctx = ctxOf(doc, truth);
  return points.map(([x, y], i) => ({ floorId: "f0", x, y, band, ap, dbm: predict(ctx, ap, band, [x, y]),
    weight: 1, source: "device", device: `dev${i}`, ...extra }));
}
const grid = (xs, ys) => xs.flatMap((x) => ys.map((y) => [x, y]));
const inRow = grid([0.5, 1.8, 2.6, 3.4, 4.6, 5.5, 6.4, 7.5, 8.5, 9.6, 10.5, 11.5], [0.7, 3.3]);

test("recovers a +5 dB transmit offset within 1 dB", () => {
  // Each device hears both access points: the one at its prior tells its offset from the shifted one.
  const doc = openDoc();
  doc.floors[0].points.push(pt("far", 11, 7));
  doc.floors[0].access_points.push(ap("far"));
  const truth = clone(priors(doc));
  truth.tx.node["5"] = 28;
  const at = grid([2, 4, 6, 8, 10, 11.5], [1.5, 3, 4.5, 6, 7.5]);
  const obs = [...observe(doc, truth, at, "5"), ...observe(doc, truth, at, "5", {}, "far")];
  const fit = calibrate(ctxOf(doc), obs, table);
  near(fit.params.tx.node["5"], 28, 1);
  near(fit.params.tx.far["5"], 23, 1);
  assert.equal(fit.moved.tx, true);
  assert.equal(fit.params.tx.node["2.4"], 20, "an unobserved band keeps its prior");
});

test("recovers a 12 dB brick wall (prior 10 ± 3) within 1 dB from ≥ 5 observations in ≥ 3 rooms", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 12;
  const fit = calibrate(ctxOf(doc), observe(doc, truth, inRow, "5"), table);
  near(fit.params.loss.brick["5"], 12, 1);
  assert.deepEqual(fit.moved, { tx: true, loss: true, n: true });
  assert.equal(fit.residuals.length, inRow.length);
  for (const { r } of fit.residuals) near(r, 0, 1.5);
});

test("with 4 observations only the transmit power moves", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.tx.node["5"] = 26;
  const fit = calibrate(ctxOf(doc), observe(doc, truth, [[1, 1], [5, 1], [9, 1], [10, 3]], "5"), table);
  assert.deepEqual(fit.moved, { tx: true, loss: false, n: false });
  assert.deepEqual(fit.params.loss, priors(doc).loss);
  assert.equal(fit.params.n, 2);
  assert.ok(fit.params.tx.node["5"] > 23);
  for (const v of Object.values(fit.params.device)) assert.equal(v, 0, "offsets stay at their prior");
});

test("observations all in one room keep the materials at their priors", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 15;
  const fit = calibrate(ctxOf(doc), observe(doc, truth, grid([8.5, 9.5, 10.5, 11.5], [0.5, 2, 3.5]), "5"), table);
  assert.equal(fit.moved.loss, false);
  assert.equal(fit.moved.n, true);
  assert.deepEqual(fit.params.loss, priors(doc).loss);
});

test("a 2.4 GHz-only set moves the 5 and 6 GHz loss by the prior ratio at a third of the weight", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["2.4"] = 10;                             // prior 7
  const fit = calibrate(ctxOf(doc), observe(doc, truth, inRow, "2.4"), table);
  const b = fit.params.loss.brick;
  assert.ok(b["2.4"] > 8, `2.4 GHz moved: ${b["2.4"]}`);
  const rel = b["2.4"] / 7 - 1;
  near(b["5"], 10 * (1 + rel / 3), 1e-9);
  near(b["6"], 11 * (1 + rel / 3), 1e-9);
  assert.deepEqual(fit.params.loss.interior, table.materials.interior.loss, "a material no path crosses keeps its prior");
  assert.equal(fit.params.tx.node["5"], 23);
});

test("an observation of an unknown access point is compared with the strongest on its band", () => {
  const doc = openDoc();
  doc.floors[0].points.push(pt("far", 11, 7));
  doc.floors[0].access_points.push(ap("far"));
  const ctx = ctxOf(doc);
  const at = [10.5, 6.5];
  const obs = [{ floorId: "f0", x: at[0], y: at[1], band: "5", ap: null, dbm: predict(ctx, "far", "5", at),
    weight: 0.5, source: "device", device: "dev0" }];
  const fit = calibrate(ctx, obs, table);
  near(fit.residuals[0].r, 0, 1e-9);
  assert.equal(fit.residuals[0].obs, obs[0]);
});

test("survey and manual readings share one offset per source", () => {
  const doc = openDoc();
  const truth = priors(doc);
  const survey = observe(doc, truth, grid([3, 6, 9], [2, 5]), "5", { source: "survey", device: undefined, weight: 1 })
    .map((o) => ({ ...o, dbm: o.dbm - 3 }));
  const fit = calibrate(ctxOf(doc), survey, table);
  assert.deepEqual(Object.keys(fit.params.device), ["survey"]);
  assert.ok(fit.params.device.survey < 0, "the shift is partly the offset");
});

test("two phones with offsets +5 and -5 dB each get their own offset and leave the brick loss unbiased (SPEC-045)", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 12;
  const phone = (id, shift) => observe(doc, truth, inRow, "5", { source: "phone", device: id })
    .map((o) => ({ ...o, dbm: o.dbm + shift }));
  const fit = calibrate(ctxOf(doc), [...phone("phone-a", 5), ...phone("phone-b", -5)], table);
  assert.deepEqual(Object.keys(fit.params.device).sort(), ["phone:phone-a", "phone:phone-b"]);
  near(fit.params.device["phone:phone-a"], 5, 1);
  near(fit.params.device["phone:phone-b"], -5, 1);
  near(fit.params.loss.brick["5"], 12, 1);
});

test("a phone's offset never shares a key with a placed device of the same id", () => {
  const doc = openDoc();
  const truth = priors(doc);
  const at = grid([3, 6, 9], [2, 5]);
  const obs = [...observe(doc, truth, at, "5", { device: "same" }), ...observe(doc, truth, at, "5", { source: "phone", device: "same" })];
  assert.deepEqual(Object.keys(calibrate(ctxOf(doc), obs, table).params.device).sort(), ["phone:same", "same"]);
});

test("the same input gives the same parameters", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 12;
  truth.tx.node["5"] = 25;
  const obs = observe(doc, truth, inRow, "5");
  const a = calibrate(ctxOf(doc), obs, table);
  const b = calibrate(ctxOf(doc), clone(obs), table);
  assert.deepEqual(a.params, b.params);
  assert.deepEqual(a.residuals.map((x) => x.r), b.residuals.map((x) => x.r));
});

test("readings on a sparse band move only that band's transmit power, not n or the offsets", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 12;
  const rich = observe(doc, truth, inRow, "5");
  const shifted = observe(doc, truth, [[1, 1], [5, 1], [9, 1], [10, 3]], "2.4").map((o) => ({ ...o, dbm: o.dbm + 10 }));
  const alone = calibrate(ctxOf(doc), rich, table);
  const both = calibrate(ctxOf(doc), [...rich, ...shifted], table);
  near(both.params.n, alone.params.n, 1e-9);
  for (const [k, v] of Object.entries(alone.params.device)) near(both.params.device[k], v, 1e-9);
  near(both.params.loss.brick["5"], alone.params.loss.brick["5"], 1e-9);
  assert.ok(both.params.tx.node["2.4"] > 22, `the sparse band's tx moved: ${both.params.tx.node["2.4"]}`);
});

// R25: on a sparse band a reading also carries its frozen offset's uncertainty, and every band's rows
// are Huber-weighted at 1.5 sd, so one bad reading cannot drag a transmit power.
test("one reading 30 dB below its prediction moves the transmit power by less than 4 dB", () => {
  const doc = openDoc();
  const ctx = ctxOf(doc);
  const at = [6, 4];
  const obs = [{ floorId: "f0", x: at[0], y: at[1], band: "5", ap: "node", dbm: predict(ctx, "node", "5", at) - 30,
    weight: 1, source: "device", device: "dev0" }];
  const fit = calibrate(ctx, obs, table);
  assert.ok(Math.abs(fit.params.tx.node["5"] - 23) < 4, `tx ${fit.params.tx.node["5"]}`);
});

test("four readings with one 30 dB outlier move the transmit power by less than 2 dB", () => {
  const doc = openDoc();
  const obs = observe(doc, priors(doc), [[3, 2], [6, 4], [9, 6], [11, 2]], "5");
  obs[3].dbm -= 30;
  const fit = calibrate(ctxOf(doc), obs, table);
  assert.ok(Math.abs(fit.params.tx.node["5"] - 23) < 2, `tx ${fit.params.tx.node["5"]}`);
});

test("noisy readings (a fixed ±2 dB pattern) still recover a +5 dB transmit offset within 1.5 dB", () => {
  const doc = openDoc();
  doc.floors[0].points.push(pt("far", 11, 7));
  doc.floors[0].access_points.push(ap("far"));
  const truth = clone(priors(doc));
  truth.tx.node["5"] = 28;
  const at = grid([2, 4, 6, 8, 10, 11.5], [1.5, 3, 4.5, 6, 7.5]);
  const noise = [2, -2, 1, -1, 2, 0, -2, 1, -1, 0];
  const obs = [...observe(doc, truth, at, "5"), ...observe(doc, truth, at, "5", {}, "far")]
    .map((o, i) => ({ ...o, dbm: o.dbm + noise[i % noise.length] }));
  const fit = calibrate(ctxOf(doc), obs, table);
  near(fit.params.tx.node["5"], 28, 1.5);
});

test("rooms seen only on a sparse band do not free the materials", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 15;
  const rich = observe(doc, truth, grid([8.5, 9.5, 10.5, 11.5], [0.5, 2, 3.5]), "5");   // one room
  const sparse = observe(doc, truth, [[1, 1], [5, 1]], "2.4");                         // two more rooms
  const fit = calibrate(ctxOf(doc), [...rich, ...sparse], table);
  assert.equal(fit.moved.loss, false);
  assert.deepEqual(fit.params.loss, priors(doc).loss);
});

test("a fitted loss never goes below 0 and n stays within [1.5, 4]", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = -10;                              // walls that add signal: data a fit must not follow
  truth.n = 0.5;
  const fit = calibrate(ctxOf(doc), observe(doc, truth, inRow, "5"), table);
  assert.ok(fit.params.loss.brick["5"] >= 0, `brick ${fit.params.loss.brick["5"]}`);
  assert.ok(fit.params.n >= 1.5 && fit.params.n <= 4, `n ${fit.params.n}`);
});

// ---- residuals and confidence ----

const res = (x, y, r, extra = {}) => ({ obs: { floorId: "f0", band: "5", x, y, ...extra }, r });

const W0 = 1 / 1.5 ** 2;
const wOf = (d, walls = 0) => (1 - d / 3) ** 2 / (d * d + 0.05) * 0.5 ** walls;

test("residualAt: a lone reading (r = -8, i.e. 8 dB above its prediction) corrects nearly fully beside it and fades to 0 at 3 m", () => {
  const rs = [res(5, 5, -8)];
  const beside = residualAt(rs, [], [5.1, 5]);
  near(beside, -8 * wOf(0.1) / (wOf(0.1) + W0), 1e-9);
  assert.ok(beside < -7.5, `${beside}`);
  near(residualAt([res(5, 5, 8)], [], [5.1, 5]), -beside, 1e-9);
  assert.equal(residualAt(rs, [], [8, 5]), 0, "nothing at 3 m");
  assert.equal(residualAt(rs, [], [8.1, 5]), 0);
  let last = Infinity;
  for (let d = 0.1; d <= 2.95; d += 0.05) {
    const v = Math.abs(residualAt(rs, [], [5 + d, 5]));
    assert.ok(v < last, `monotone at ${d}`);
    last = v;
  }
  assert.ok(Math.abs(residualAt(rs, [], [7.9, 5])) < 0.2, "no jump towards the edge");
});

test("residualAt: a closed wall between weakens a lone reading by the formula, an open opening does not", () => {
  const rs = [res(0, 0, 10)];
  const wall = { a: [0.5, -1], b: [0.5, 1], material: "brick", open: false };
  const clear = residualAt(rs, [], [1, 0]);
  const walled = residualAt(rs, [wall], [1, 0]);
  near(clear, 10 * wOf(1) / (wOf(1) + W0), 1e-9);
  near(walled, 10 * wOf(1, 1) / (wOf(1, 1) + W0), 1e-9);
  assert.ok(walled < clear * 0.8);
  near(residualAt(rs, [{ ...wall, open: true }], [1, 0]), clear, 1e-9);
});

test("residualAt: inverse distance squared between two readings", () => {
  const rs = [res(0, 0, 10), res(3.5, 0, -10)];
  near(residualAt(rs, [], [1, 0]), (10 * wOf(1) - 10 * wOf(2.5)) / (wOf(1) + wOf(2.5) + W0), 1e-9);
});

test("calibratedCoverage: +8 dB reading raises the cell beside it by about 8, nothing at 3.1 m", () => {
  const doc = openDoc();
  const ctx = ctxOf(doc);
  const base = coverage(ctx, "5", 1);
  const at = (m, x, y) => m.cells.find((c) => c.x === x && c.y === y);
  const obs = { floorId: "f0", x: 6.5, y: 4.5, band: "5", ap: "node", source: "device", device: "d", weight: 1,
    dbm: predict(ctx, "node", "5", [6.5, 4.5]) + 8 };
  // a fit that left exactly this residual: the priors, one reading
  const fit = { params: priors(doc), prior: priors(doc), moved: { tx: false, loss: false, n: false },
    residuals: [{ obs, r: -8, ap: "node" }] };
  const m = calibratedCoverage(ctx, "5", 1, fit);
  near(at(m, 6, 4).dbm - at(base, 6, 4).dbm, 8, 0.7);
  near(at(m, 6, 4).second ?? 0, at(base, 6, 4).second ?? 0, 1e-9, "no second access point here");
  assert.equal(at(m, 10, 4).dbm, at(base, 10, 4).dbm, "10.5 is 4 m from the reading");
  const lower = calibratedCoverage(ctx, "5", 1, { ...fit, residuals: [{ obs, r: 8, ap: "node" }] });
  near(at(lower, 6, 4).dbm - at(base, 6, 4).dbm, -8, 0.7);
});

test("calibratedCoverage: dbm and second move together", () => {
  const doc = openDoc();
  doc.floors[0].points.push(pt("far", 11, 7));
  doc.floors[0].access_points.push(ap("far"));
  const ctx = ctxOf(doc);
  const obs = { floorId: "f0", x: 6.5, y: 4.5, band: "5", ap: "node", source: "device", device: "d", weight: 1, dbm: -40 };
  const fit = { params: priors(doc), prior: priors(doc), moved: { tx: false, loss: false, n: false },
    residuals: [{ obs, r: 5, ap: "node" }] };
  const base = coverage(ctx, "5", 1).cells.find((c) => c.x === 6 && c.y === 4);
  const cal = calibratedCoverage(ctx, "5", 1, fit).cells.find((c) => c.x === 6 && c.y === 4);
  near(cal.dbm - cal.second, base.dbm - base.second, 1e-9);
  near(base.dbm - cal.dbm, 5, 0.5);
});

test("confidence: high near a reading of the serving access point, medium over a fitted wall, else low", () => {
  const doc = rowDoc();
  const truth = clone(priors(doc));
  truth.loss.brick["5"] = 12;
  const obs = observe(doc, truth, inRow, "5");
  const fit = calibrate(ctxOf(doc), obs, table);
  const ctx = contextFor(doc, "f0", {}, table, fit.params);
  const m = calibratedCoverage(ctx, "5", 1, fit, { confidence: true });
  const at = (x, y) => m.cells.find((c) => c.x === x && c.y === y);
  assert.equal(at(1, 2).conf, "high");                         // beside readings, same room as the node
  assert.equal(at(9, 1).conf, "high");
  // drop the readings near the third room: its cells are only "medium", through the fitted brick
  const far = obs.filter((o) => o.x < 6);
  const m2 = calibratedCoverage(ctx, "5", 1, { ...fit, residuals: fit.residuals.filter((e) => far.includes(e.obs)) },
    { confidence: true });
  assert.equal(m2.cells.find((c) => c.x === 9 && c.y === 1).conf, "medium");
  // nothing fitted, nothing near: low
  const none = { ...fit, moved: { tx: false, loss: false, n: false }, params: fit.prior, residuals: [] };
  assert.equal(calibratedCoverage(ctx, "5", 1, none, { confidence: true }).cells.find((c) => c.x === 9 && c.y === 1).conf, "low");
  // every cell agrees with confidenceOf over all the readings; a band map does not work it out
  for (const cell of m.cells) assert.equal(cell.conf, confidenceOf(cell, obs, fit, ctx, "5", 1), `${cell.x},${cell.y}`);
  const plain = calibratedCoverage(ctx, "5", 1, fit);
  assert.ok(plain.cells.every((c) => !("conf" in c)));
  assert.deepEqual(plain.cells.map((c) => c.dbm), m.cells.map((c) => c.dbm));
});

test("confidence: another band's or another access point's readings do not make it high", () => {
  const doc = openDoc();
  doc.floors[0].points.push(pt("far", 11, 7));
  doc.floors[0].access_points.push(ap("far"));
  const ctx = ctxOf(doc);
  const fit = { params: priors(doc), prior: priors(doc), moved: { tx: false, loss: false, n: false }, residuals: [] };
  const cell = { x: 1, y: 1, ap: "node", dbm: -50, second: null };
  const o = (extra) => ({ floorId: "f0", x: 1.5, y: 1.5, band: "5", source: "device", dbm: -50, weight: 1, ...extra });
  assert.equal(confidenceOf(cell, [o({ ap: "node" })], fit, ctx, "5", 1), "high");
  assert.equal(confidenceOf(cell, [o({ ap: "node", band: "2.4" })], fit, ctx, "5", 1), "low");
  assert.equal(confidenceOf(cell, [o({ ap: "far" })], fit, ctx, "5", 1), "low");
  assert.equal(confidenceOf(cell, [o({ ap: "node", x: 4 })], fit, ctx, "5", 1), "low");
  // ap: null counts as the access point the fit assigned
  const unnamed = o({ ap: null });
  assert.equal(confidenceOf(cell, [unnamed], { ...fit, residuals: [{ obs: unnamed, r: 0, ap: "node" }] }, ctx, "5", 1), "high");
  assert.equal(confidenceOf(cell, [unnamed], fit, ctx, "5", 1), "low");
  // a transmit power moved by more than 0.5 dB: medium
  const tx = clone(fit.params);
  tx.tx.node["5"] += 1;
  assert.equal(confidenceOf(cell, [], { ...fit, params: tx }, ctx, "5", 1), "medium");
});

test("2000 observations and 200 m² on one band in under 2 s", () => {
  const doc = { schema: 1, floors: [{ floor_id: "f0", rooms: [room(0, 0, 20, 10, "alex")],
    walls: [{ at: [10, 5], material: "brick" }],
    points: [pt("node", 1, 1)], access_points: [ap("node")] }] };
  const ctx = ctxOf(doc);
  const residuals = Array.from({ length: 2000 }, (_, i) => ({ r: (i % 7) - 3, ap: "node",
    obs: { floorId: "f0", band: "5", ap: "node", x: (i * 7.3) % 20, y: (i * 3.1) % 10 } }));
  const fit = { params: priors(doc), prior: priors(doc), moved: { tx: false, loss: false, n: false }, residuals };
  calibratedCoverage(ctx, "5", 0.15, fit, { confidence: true });   // warm up
  // The best of three runs: a parallel test run (check-all) can stall any one of them.
  let m, ms = Infinity;
  for (let run = 0; run < 3; run++) {
    const t = performance.now();
    m = calibratedCoverage(ctx, "5", 0.15, fit, { confidence: true });   // the Confidence map's grid
    ms = Math.min(ms, performance.now() - t);
  }
  assert.equal(m.cells.length, coverage(ctx, "5", 0.15).cells.length);
  assert.ok(m.cells.length > 8800 && m.cells.length < 9000, `${m.cells.length} cells at 0.15 m`);
  // A guard against an order-of-magnitude regression (every point weighing every reading instead of
  // the nine 3 m buckets around it), not a benchmark: about 170 ms on a laptop, 750 ms on a shared CI runner.
  assert.ok(ms < 2000, `${ms} ms`);
});

test("calibratedLevelGrid: the Ranges grid moves with a reading exactly as the calibrated map's cell", () => {
  const doc = openDoc();
  const ctx = ctxOf(doc);
  const obs = { floorId: "f0", x: 6.5, y: 4.5, band: "5", ap: "node", source: "device", device: "d", weight: 1,
    dbm: predict(ctx, "node", "5", [6.5, 4.5]) + 8 };
  const fit = { params: priors(doc), prior: priors(doc), moved: { tx: false, loss: false, n: false },
    residuals: [{ obs, r: -8, ap: "node" }] };
  const cell = calibratedCoverage(ctx, "5", 1, fit).cells.find((c) => c.x === 6 && c.y === 4);
  // the map reads the same smoothed grid (its cells at 0.25 m for a 1 m map), so outline and map agree
  const g = calibratedLevelGrid(ctx, "5", 0.25, fit);
  const plain = levelGrid(ctx, "5", 0.25);
  const node = (gr) => gr.levels[0][Math.round((4.5 - gr.y0) / gr.step) * gr.nx + Math.round((6.5 - gr.x0) / gr.step)];
  near(node(g), cell.dbm, 1e-9);
  near(node(g) - node(plain), 8, 0.7);
  assert.equal(g.levels[0][0], plain.levels[0][0], "beyond the reading's reach nothing moves");
  const none = calibratedLevelGrid(ctx, "5", 0.25, { ...fit, residuals: [] });
  assert.deepEqual([...none.levels[0]], [...plain.levels[0]]);
});

test("calibratedLevelGrid: a reading of one access point moves that access point's outline alone", () => {
  const doc = openDoc();
  doc.floors[0].points.push(pt("far", 11, 7));
  doc.floors[0].access_points.push(ap("far"));
  const ctx = ctxOf(doc);
  const obs = { floorId: "f0", x: 6.5, y: 4.5, band: "5", ap: "node", source: "device", device: "d", weight: 1,
    dbm: predict(ctx, "node", "5", [6.5, 4.5]) + 8 };
  const fit = { params: priors(doc), prior: priors(doc), moved: { tx: false, loss: false, n: false },
    residuals: [{ obs, r: -8, ap: "node" }, { obs: { ...obs, ap: undefined, x: 2, y: 2 }, r: -5 }] };
  const g = calibratedLevelGrid(ctx, "5", 0.25, fit);
  const plain = levelGrid(ctx, "5", 0.25);
  assert.deepEqual(g.aps, ["node", "far"]);
  assert.deepEqual([...g.levels[1]], [...plain.levels[1]], "the second access point's grid unchanged");
  assert.notDeepEqual([...g.levels[0]], [...plain.levels[0]]);
  const i = Math.round((2 - g.y0) / g.step) * g.nx + Math.round((2 - g.x0) / g.step);
  near(g.levels[0][i], plain.levels[0][i], 1e-9, "a residual with no access point moves no outline");
});
