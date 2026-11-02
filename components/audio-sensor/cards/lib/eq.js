// A six-range EQ over the 31 third-octave bands: each range sets the gain at its centre and the
// bands between two centres follow a straight line on log2(f), so a cut on one range never leaves
// a step. Beyond the outer centres the outer value holds.

import { THIRD_OCTAVE } from "./sources.js";

export const EQ_KEYS = ["sub", "bass", "low_mid", "mid", "presence", "air"];
export const EQ_CENTRES = [31.5, 80, 315, 1000, 4000, 12500];
export const EQ_RANGE = [-18, 12];

const LOG_CENTRES = EQ_CENTRES.map(Math.log2);
const LOG_BANDS = THIRD_OCTAVE.map(Math.log2);

const clamp = (v) => Math.min(EQ_RANGE[1], Math.max(EQ_RANGE[0], v));
// A missing or foreign value is a flat range, not NaN in every band above it.
const read = (v) => (typeof v === "number" && Number.isFinite(v) ? clamp(v) : 0);

export function eqCurve(eq) {
  const g = EQ_KEYS.map((k) => read(eq?.[k]));
  const out = new Float32Array(THIRD_OCTAVE.length);
  const last = g.length - 1;
  for (let i = 0; i < out.length; i++) {
    const x = LOG_BANDS[i];
    if (x <= LOG_CENTRES[0]) out[i] = g[0];
    else if (x >= LOG_CENTRES[last]) out[i] = g[last];
    else {
      let k = 0;
      while (x > LOG_CENTRES[k + 1]) k++;
      const t = (x - LOG_CENTRES[k]) / (LOG_CENTRES[k + 1] - LOG_CENTRES[k]);
      out[i] = g[k] + (g[k + 1] - g[k]) * t;
    }
  }
  return out;
}
