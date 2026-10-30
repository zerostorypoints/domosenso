// The engine turns pushed readings into the numbers a flavour draws. It owns smoothing, the
// afterglow, the 40 s history and the three clocks; flavours only read `frame`.
//
// FrameState (one object, mutated in place, buffers allocated once):
//   kind          "spectrum" | "scalar"
//   palette       the palette of the current step
//   raw           spectrum: last pushed values (NaN where not a number), source units
//   smooth, peak  spectrum: Float64Array per band, smoothed value and its afterglow, source units
//   env, peakEnv  spectrum: Float32Array(WIDTH_POINTS), excess 0..1 along the width (tilt applied)
//   value         last pushed scalar, or for a spectrum its broadband level (energy sum of bands)
//   smoothValue   `value` after rise/fall smoothing (neutral while stale)
//   excess        palette excess of smoothValue
//   history       Float32Array(historyS * HISTORY_RATE), excess of smoothValue, oldest first
//   historyValues Float64Array, same, in source units
//   clocks        [excess of windows[0], [1], [2]]: exponential averages of `value`
//   showFrom, showTo  band indices of source.show (inclusive), as passed to the last step; flavours
//                 that map the width to bands (voices, bars) read them instead of assuming a range
//   stale         no reading yet, or (spectrum) no push for 5 s, or (scalar) the last push was NaN
//                 (entity unavailable): targets are neutral

import { THIRD_OCTAVE } from "./sources.js";

export const WIDTH_POINTS = 160;
export const HISTORY_RATE = 4; // samples per s
// Only the spectrum times out: it streams 5 times a second. A scalar reaches the frontend only when
// its value changes (state_changed; the frontend never sees last_reported), so a quiet scalar is an
// unchanged one, and it goes stale only through the card's NaN push for unavailable.
const SPECTRUM_STALE_MS = 5000;
const ENERGY_UNITS = new Set(["dB", "dBFS", "dBA"]);

// The console and the editor allow rise and fall of 0: a 1 ms floor turns that into a jump instead
// of 0/0 = NaN, which would stick in the smoothing until reload.
const MIN_TIME_S = 1e-3;
export const approach = (cur, target, dt, riseS, fallS) =>
  target + (cur - target) * Math.exp(-dt / (Math.max(MIN_TIME_S, target > cur ? riseS : fallS) / 2.3));

// Soft maximum (p-norm of Gaussian-weighted bells): a lone loud band keeps its full height
// instead of being averaged away by its quiet neighbours. The p-norm also sums hot neighbours
// (1.15 with every band at 1), so it is held at 1: the flavours' amplitude cap assumes excess <= 1.
export function spread(excess, out, from, to, sigma = 1.4, p = 4) {
  const n = excess.length;
  const N = out.length;
  for (let k = 0; k < N; k++) {
    const bi = from + (k / (N - 1)) * (to - from);
    let s = 0;
    for (let i = Math.max(0, Math.floor(bi - 5)); i <= Math.min(n - 1, Math.ceil(bi + 5)); i++) {
      s += (excess[i] * Math.exp(-((i - bi) ** 2) / (2 * sigma * sigma))) ** p;
    }
    out[k] = Math.min(1, s ** (1 / p));
  }
}

// Ear-weighting nudge in dB: gentle lift above 250 Hz, steeper below 60 Hz.
const tiltDb = (f) => (f > 250 ? 2.5 * Math.log2(f / 250) : f < 60 ? 6 * Math.log2(60 / f) : 0);
const TILT = THIRD_OCTAVE.map(tiltDb);

export class Engine {
  constructor(kind) {
    this.kind = kind;
    const nb = THIRD_OCTAVE.length;
    this._bands = kind === "spectrum" ? nb : 0;
    this._exc = new Float64Array(nb);
    this._lastPush = -Infinity;
    this._seeded = false;
    this._avg = [NaN, NaN, NaN];
    this._histAcc = 0;
    this._holdLeft = new Float64Array(nb);
    this._f = {
      kind, palette: null,
      raw: new Array(this._bands).fill(NaN),
      smooth: new Float64Array(this._bands), peak: new Float64Array(this._bands),
      env: new Float32Array(WIDTH_POINTS), peakEnv: new Float32Array(WIDTH_POINTS),
      value: NaN, smoothValue: NaN, excess: 0,
      history: new Float32Array(40 * HISTORY_RATE), historyValues: new Float64Array(40 * HISTORY_RATE),
      clocks: [0, 0, 0], showFrom: 0, showTo: nb - 1, stale: true,
    };
    this._histReady = false;
  }

  get frame() { return this._f; }

  push(valuesOrValue, atMs) {
    const f = this._f;
    this._lastPush = atMs;
    if (this.kind === "spectrum") {
      for (let i = 0; i < this._bands; i++) {
        const v = valuesOrValue?.[i];
        f.raw[i] = typeof v === "number" && Number.isFinite(v) ? v : NaN;
      }
      let p = 0;
      let any = false;
      for (const v of f.raw) if (v === v) { p += 10 ** (v / 10); any = true; }
      f.value = any ? 10 * Math.log10(p) : NaN;
    } else {
      f.value = typeof valuesOrValue === "number" && Number.isFinite(valuesOrValue) ? valuesOrValue : NaN;
    }
  }

  step(dt, nowMs, palette, opts) {
    const f = this._f;
    f.palette = palette;
    f.showFrom = opts.showFrom ?? 0;
    f.showTo = opts.showTo ?? THIRD_OCTAVE.length - 1;
    const { neutral } = palette;
    const riseS = opts.rise / 1000;
    const fallS = opts.fall;
    f.stale = this.kind === "spectrum"
      ? nowMs - this._lastPush > SPECTRUM_STALE_MS
      : this._lastPush === -Infinity || !Number.isFinite(f.value);
    const target = (v) => (f.stale || !Number.isFinite(v) ? neutral : v);

    // First live data snaps the smoothing so a freshly loaded card does not climb from nothing.
    const snap = !this._seeded && !f.stale;
    if (snap) this._seeded = true;
    if (!this._seeded) {
      f.smooth.fill(neutral); f.peak.fill(neutral); f.smoothValue = neutral;
    }

    if (this.kind === "spectrum") {
      for (let i = 0; i < this._bands; i++) {
        const t = target(f.raw[i]);
        f.smooth[i] = snap ? t : approach(f.smooth[i], t, dt, riseS, fallS);
        // Afterglow: hold the highest smoothed value, then sink at twice the fall time.
        if (snap || f.smooth[i] >= f.peak[i]) { f.peak[i] = f.smooth[i]; this._holdLeft[i] = opts.hold; }
        else if ((this._holdLeft[i] -= dt) < 0) f.peak[i] = approach(f.peak[i], f.smooth[i], dt, riseS, fallS * 2);
      }
      const from = opts.showFrom ?? 0;
      const to = opts.showTo ?? this._bands - 1;
      const e = this._exc;
      for (const [src, dst] of [[f.smooth, f.env], [f.peak, f.peakEnv]]) {
        for (let i = 0; i < this._bands; i++) e[i] = palette.excess(src[i] + (opts.tilt ? TILT[i] : 0));
        spread(e, dst, from, to);
      }
    }

    const tv = target(f.value);
    f.smoothValue = snap || !Number.isFinite(f.smoothValue) ? tv : approach(f.smoothValue, tv, dt, riseS, fallS);
    f.excess = palette.excess(f.smoothValue);
    this._clocks(dt, tv, snap, palette, opts);
    this._history(dt, palette, opts);
  }

  _clocks(dt, v, snap, palette, opts) {
    const energy = ENERGY_UNITS.has(opts.unit);
    const x = energy ? 10 ** (v / 10) : v;
    const wins = opts.windows ?? [30, 5, 1];
    for (let i = 0; i < 3; i++) {
      const a = this._avg[i];
      this._avg[i] = snap || !Number.isFinite(a) ? x : a + (x - a) * (1 - Math.exp(-dt / wins[i]));
      const out = energy ? 10 * Math.log10(this._avg[i]) : this._avg[i];
      this._f.clocks[i] = palette.excess(out);
    }
  }

  _history(dt, palette, opts) {
    const f = this._f;
    const len = Math.round((opts.historyS ?? 40) * HISTORY_RATE);
    if (!this._histReady) {
      // Fresh buffers are zeros; a °C card would plot 0 °C. Start at neutral, in place so the
      // arrays stay the ones the card may already hold.
      f.history.fill(palette.excess(palette.neutral));
      f.historyValues.fill(palette.neutral);
      this._histReady = true;
    }
    if (len !== f.history.length) {
      // Only a changed setting reallocates; keep the newest samples.
      const h = new Float32Array(len).fill(palette.excess(palette.neutral));
      const hv = new Float64Array(len).fill(palette.neutral);
      const n = Math.min(len, f.history.length);
      h.set(f.history.subarray(f.history.length - n), len - n);
      hv.set(f.historyValues.subarray(f.historyValues.length - n), len - n);
      f.history = h; f.historyValues = hv;
    }
    this._histAcc += dt;
    const period = 1 / HISTORY_RATE;
    while (this._histAcc >= period) {
      this._histAcc -= period;
      f.history.copyWithin(0, 1);
      f.historyValues.copyWithin(0, 1);
      f.history[len - 1] = f.excess;
      f.historyValues[len - 1] = f.smoothValue;
    }
  }
}
