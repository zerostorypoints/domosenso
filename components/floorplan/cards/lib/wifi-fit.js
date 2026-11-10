// Wi-Fi coverage (SPEC-044 S2): the prediction model calibrated from observations. A regularised
// least-squares (maximum a posteriori) fit: every observation is a residual row, every free parameter
// a row pulling it towards its prior by its uncertainty. Pure and deterministic: sorted unknowns,
// a fixed number of Gauss-Newton iterations, no randomness.

import { BANDS, priorParams, predict, rayTerms, coverage, crossings } from "./wifi.js";
import { pointInPolygon } from "./geometry.js";

const ITERATIONS = 10;
const OBS_SD = 4;                      // dB: one reading at weight 1
const TX_SD = 4;
const N_SD = 0.3;
const OFFSET_SD = { device: 6, survey: 3, manual: 5 };
const MIN_BAND_OBS = 5;                // fewer on a band: only that band's transmit powers move
const MIN_ROOMS = 3;                   // fewer rooms observed: materials keep their priors
const CROSS_BAND = 1 / 3;
const N_RANGE = [1.5, 4];              // a fit outside this is the data's fault, not the building's

// A device's offset is its own; survey and manual readings share one offset per source.
const offsetKey = (o) => (o.source === "device" ? o.device ?? o.entity ?? "device" : o.source);

const serves = (pos, band) => !pos.bands || pos.bands.includes(band);

// Observations the model can predict, each with its candidate access points (the named one, or every
// placed one serving the band when unknown, sorted) and their ray terms, which do not change in the fit.
function usable(ctx, observations) {
  const out = [];
  for (const obs of observations ?? []) {
    if (!BANDS.includes(obs.band) || !(obs.source in OFFSET_SD) || !Number.isFinite(obs.dbm)) continue;
    if (!(obs.weight > 0) || !ctx.floors.some((f) => f.floor_id === obs.floorId)) continue;
    const keys = obs.ap ? (ctx.apPos[obs.ap] ? [obs.ap] : [])
      : Object.keys(ctx.apPos).filter((k) => serves(ctx.apPos[k], obs.band)).sort();
    if (!keys.length) continue;
    const octx = { ...ctx, floorId: obs.floorId };
    const p = [obs.x, obs.y];
    const rooms = ctx.doc.floors.find((f) => f.floor_id === obs.floorId)?.rooms ?? [];
    const room = rooms.findIndex((r) => pointInPolygon(p, r.polygon));
    out.push({ obs, octx, p, room: room < 0 ? null : `${obs.floorId}|${room}`, offset: offsetKey(obs),
      cands: keys.map((key) => ({ key, terms: rayTerms(octx, key, obs.band, p) })) });
  }
  return out;
}

// The losses a ray pays: walls by their oblique factor, each slab once.
function lossTerms(terms) {
  const k = {};
  for (const c of terms.crossings) k[c.material] = (k[c.material] ?? 0) + c.k;
  for (const m of terms.slabs) k[m] = (k[m] ?? 0) + 1;
  return k;
}

// Solve A x = b for a symmetric positive definite A (every unknown has a prior row): Cholesky.
function solve(A, b) {
  const n = b.length;
  const L = A.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
    }
  }
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

// The calibrated parameters, which kinds moved, and what the fit leaves at each usable observation
// (pred − dbm). Observations the model cannot predict (an unplaced access point, an unknown band or
// source) are left out.
export function calibrate(ctx, observations, table) {
  const prior = priorParams(table, ctx.doc.floors.flatMap((f) => f.access_points ?? []));
  const rows = usable(ctx, observations);

  // The guards decide which parameters are free.
  const perBand = {};
  for (const r of rows) perBand[r.obs.band] = (perBand[r.obs.band] ?? 0) + 1;
  const rich = (band) => (perBand[band] ?? 0) >= MIN_BAND_OBS;
  const anyRich = BANDS.some(rich);
  const roomsOk = new Set(rows.map((r) => r.room).filter((x) => x !== null)).size >= MIN_ROOMS;

  const params = { tx: structuredClone(prior.tx), n: prior.n, loss: structuredClone(prior.loss), device: {} };
  for (const r of rows) params.device[r.offset] = 0;
  const spec = {};                     // key -> {get, set, prior, sd}
  const free = (key, get, set, p, sd) => { spec[key] ??= { get, set, prior: p, sd }; };
  for (const r of rows) {
    const band = r.obs.band;
    for (const c of r.cands) {
      free(`tx|${c.key}|${band}`, () => params.tx[c.key][band], (v) => { params.tx[c.key][band] = v; },
        prior.tx[c.key][band], TX_SD);
      if (!roomsOk || !rich(band)) continue;
      for (const m of Object.keys(lossTerms(c.terms))) {
        if (!table.materials[m]) continue;
        free(`loss|${m}|${band}`, () => params.loss[m][band], (v) => { params.loss[m][band] = v; },
          prior.loss[m][band], table.materials[m].sd);
      }
    }
    if (rich(band)) free(`off|${r.offset}`, () => params.device[r.offset], (v) => { params.device[r.offset] = v; },
      0, OFFSET_SD[r.obs.source]);
  }
  if (anyRich) free("n", () => params.n, (v) => { params.n = v; }, prior.n, N_SD);
  const keys = Object.keys(spec).sort();
  const index = Object.fromEntries(keys.map((k, i) => [k, i]));

  // Cross-band, as an explicit rule: a material's loss on a band the fit does not move follows the
  // mean relative move of its fitted bands at a third of it, so the prior's ratio between bands
  // carries the evidence over with a third of the weight (brick 7 -> 10 dB at 2.4 GHz, +43 %, takes
  // 5 GHz from 10 to 11.4 dB).
  const crossBand = () => {
    for (const m of Object.keys(params.loss)) {
      const fitted = BANDS.filter((b) => `loss|${m}|${b}` in index && prior.loss[m][b]);
      if (!fitted.length) continue;
      const rel = fitted.reduce((t, b) => t + params.loss[m][b] / prior.loss[m][b] - 1, 0) / fitted.length;
      for (const b of BANDS) {
        if (`loss|${m}|${b}` in index || prior.loss[m][b] === undefined) continue;
        params.loss[m][b] = prior.loss[m][b] * (1 + CROSS_BAND * rel);
      }
    }
  };

  const pctx = (r) => ({ ...r.octx, params });
  // The strongest candidate at the current parameters (the first of equals, in sorted order).
  const choose = (r) => {
    let best = r.cands[0], bestV = -Infinity;
    for (const c of r.cands) {
      const v = predict(pctx(r), c.key, r.obs.band, r.p);
      if (v > bestV) { best = c; bestV = v; }
    }
    return { c: best, pred: bestV + params.device[r.offset] };
  };

  const n = keys.length;
  for (let it = 0; it < ITERATIONS && n; it++) {
    const A = keys.map(() => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    const add = (entries, res) => {
      for (const [i, a] of entries) {
        g[i] += a * res;
        for (const [j, b] of entries) A[i][j] += a * b;
      }
    };
    for (const r of rows) {
      const { c, pred } = choose(r);
      const w = r.obs.weight / OBS_SD;
      const band = r.obs.band;
      const entries = [];
      const put = (key, v) => { if (key in index) entries.push([index[key], v * w]); };
      put(`tx|${c.key}|${band}`, 1);
      // a sparse band's readings move only its transmit powers, not what other bands share
      if (rich(band)) {
        put("n", -10 * c.terms.logd);
        for (const [m, k] of Object.entries(lossTerms(c.terms))) put(`loss|${m}|${band}`, -k);
        put(`off|${r.offset}`, 1);
      }
      add(entries, (pred - r.obs.dbm) * w);
    }
    keys.forEach((key, i) => {
      const s = spec[key];
      add([[i, 1 / s.sd]], (s.get() - s.prior) / s.sd);
    });
    const step = solve(A, g.map((v) => -v));
    keys.forEach((key, i) => spec[key].set(spec[key].get() + step[i]));
    // A negative loss would draw a wall that adds signal; n beyond its range is no building.
    for (const key of keys) if (key.startsWith("loss|")) spec[key].set(Math.max(0, spec[key].get()));
    params.n = Math.min(N_RANGE[1], Math.max(N_RANGE[0], params.n));
    crossBand();
  }

  // ap: the access point the fit assigned the reading to (the named one, or the strongest candidate).
  const residuals = rows.map((r) => { const { c, pred } = choose(r); return { obs: r.obs, r: pred - r.obs.dbm, ap: c.key }; });
  const kind = (k) => keys.some((key) => key === k || key.startsWith(`${k}|`));
  return { params, moved: { tx: kind("tx"), loss: kind("loss"), n: kind("n") }, residuals, prior };
}

// ---- residuals and confidence (SPEC-044 S2) ----

const RESIDUAL_RANGE_M = 3;
const BACKGROUND_W = 1 / 1.5 ** 2;     // weight of the zero-residual background in residualAt
const NEAR_M = 2;                      // m: "high" confidence within this of a reading of the serving access point
const MOVED_DB = 0.5;                  // a parameter counts as changed by the fit beyond this

// What the fit leaves near p. Each residual is {obs, r}, r = prediction − reading, so the correction
// to ADD to a prediction is −residualAt(...): a reading 8 dB above its prediction has r = −8 and raises
// the map by about 8. Value = Σ wᵢ·rᵢ / (Σ wᵢ + w₀) with wᵢ = 1/(d²+0.05) · (1 − d/3)² · 0.5^walls (0 at and
// beyond 3 m; walls = closed segments between the reading and p) and w₀ = 1/1.5², a zero-residual
// background: a lone reading corrects fully beside it and fades smoothly to nothing, and a wall weakens it.
// The caller passes the residuals of one floor and one band, and that floor's wall segments.
export function residualAt(residuals, segments, p) {
  return residualIndex(residuals, segments)(p);
}

// residualAt for many points: the residuals are bucketed in 3 m squares once, so a point looks at nine
// buckets, not at every reading.
function residualIndex(residuals, segments) {
  const R = RESIDUAL_RANGE_M;
  const buckets = new Map();
  for (const e of residuals) {
    const key = Math.floor(e.obs.x / R) * 65536 + Math.floor(e.obs.y / R);
    (buckets.get(key) ?? buckets.set(key, []).get(key)).push(e);
  }
  const q = [0, 0];
  return (p) => {
    let sum = 0, wsum = BACKGROUND_W;
    const bx = Math.floor(p[0] / R), by = Math.floor(p[1] / R);
    for (let i = bx - 1; i <= bx + 1; i++) {
      for (let j = by - 1; j <= by + 1; j++) {
        const list = buckets.get(i * 65536 + j);
        if (!list) continue;
        for (const { obs, r } of list) {
          const dx = obs.x - p[0], dy = obs.y - p[1];
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          const f = 1 - Math.sqrt(d2) / R;
          let w = f * f / (d2 + 0.05);
          if (segments.length) {
            q[0] = obs.x; q[1] = obs.y;
            const walls = crossings(segments, q, p).length;
            if (walls) w *= 0.5 ** walls;
          }
          sum += w * r;
          wsum += w;
        }
      }
    }
    return sum / wsum;
  };
}

// The cell's centre (coverage() reports a cell by its corner); step 0 takes x, y as the point.
const centreOf = (cell, step) => [cell.x + step / 2, cell.y + step / 2];

// "high" within 2 m of a reading of the cell's serving access point and band (a reading without a
// named access point counts as the one the fit assigned it to); "medium" where the path from the serving
// access point crosses a material the fit changed (fit.moved.loss and more than 0.5 dB from its prior)
// or that access point's transmit power was changed by more than 0.5 dB; else "low".
// band and step are the map's (the cell carries neither).
export function confidenceOf(cell, observations, fit, ctx, band, step = 0) {
  const c = centreOf(cell, step);
  for (const obs of observations ?? []) {
    if (obs.band !== band || obs.floorId !== ctx.floorId) continue;
    if ((obs.x - c[0]) ** 2 + (obs.y - c[1]) ** 2 > NEAR_M ** 2) continue;
    // only a reading in range without a named access point is looked up (rare)
    if ((obs.ap ?? fit.residuals.find((e) => e.obs === obs)?.ap) === cell.ap) return "high";
  }
  const { params, prior } = fit;
  if (Math.abs((params.tx[cell.ap]?.[band] ?? 0) - (prior.tx[cell.ap]?.[band] ?? 0)) > MOVED_DB) return "medium";
  if (fit.moved.loss && ctx.apPos[cell.ap]) {
    const terms = rayTerms(ctx, cell.ap, band, c);
    const changed = (m) => Math.abs((params.loss[m]?.[band] ?? 0) - (prior.loss[m]?.[band] ?? 0)) > MOVED_DB;
    if (terms.crossings.some((x) => changed(x.material)) || terms.slabs.some(changed)) return "medium";
  }
  return "low";
}

// coverage() with the fit's residuals added: the prediction for a map calibrated by `fit`, plus the
// correction −residualAt at each cell, applied to dbm and second alike (so handover stays consistent),
// and cell.conf. The caller passes a ctx already built with fit.params (contextFor(..., fit.params));
// this function does not rebuild it. (ctx must be built from fit.params.)
export function calibratedCoverage(ctx, band, step, fit) {
  const map = coverage(ctx, band, step);
  const segs = ctx.segmentsByFloor[ctx.floorId] ?? [];
  const here = fit.residuals.filter((e) => e.obs.band === band && e.obs.floorId === ctx.floorId);
  const observations = here.map((e) => e.obs);
  const at = residualIndex(here, segs);
  const c = [0, 0];
  for (const cell of map.cells) {
    c[0] = cell.x + step / 2;
    c[1] = cell.y + step / 2;
    const add = -at(c);
    cell.dbm += add;
    if (cell.second !== null) cell.second += add;
    cell.conf = confidenceOf(cell, observations, fit, ctx, band, step);
  }
  return map;
}
