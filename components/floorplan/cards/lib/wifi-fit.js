// Wi-Fi coverage (SPEC-044 S2): the prediction model calibrated from observations. A regularised
// least-squares (maximum a posteriori) fit: every observation is a residual row, every free parameter
// a row pulling it towards its prior by its uncertainty. Pure and deterministic: sorted unknowns,
// a fixed number of Gauss-Newton iterations, no randomness.

import { BANDS, priorParams, predict, rayTerms } from "./wifi.js";
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

  const residuals = rows.map((r) => ({ obs: r.obs, r: choose(r).pred - r.obs.dbm }));
  const kind = (k) => keys.some((key) => key === k || key.startsWith(`${k}|`));
  return { params, moved: { tx: kind("tx"), loss: kind("loss"), n: kind("n") }, residuals };
}
