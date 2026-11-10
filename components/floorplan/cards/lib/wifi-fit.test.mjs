import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrate } from "./wifi-fit.js";
import { contextFor, priorParams, predict } from "./wifi.js";
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
