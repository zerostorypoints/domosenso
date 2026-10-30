// Voices: each wave owns a range of the axis: the long wave the bass, the middle one
// the mids, the short one the treble. A kick lifts only the long wave.

import { WAVES, wavePath, hGradient, lineWidthOf, at, capGain } from "../geometry.js";

// The card maps the shown bands (source.show) to the width, so u runs from band `from` to band
// `to` (default 2..29, 31.5 Hz .. 16 kHz); the band index of f is 17 + 3·log2(f / 1 kHz).
const uAt = (from, to) => (hz) => (17 + 3 * Math.log2(hz / 1000) - from) / (to - from);

const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// The crossover is two bands wide on each side of the split frequency (160..400 Hz for 250 Hz).
const SPAN = 2 ** (2 / 3);

export function masks([lowSplit, highSplit], from = 2, to = 29) {
  const uOf = uAt(from, to);
  const lo = (u) => 1 - smooth01((u - uOf(lowSplit / SPAN)) / (uOf(lowSplit * SPAN) - uOf(lowSplit / SPAN)));
  const hi = (u) => smooth01((u - uOf(highSplit / SPAN)) / (uOf(highSplit * SPAN) - uOf(highSplit / SPAN)));
  return [lo, (u) => Math.max(0, 1 - lo(u) - hi(u)), hi];
}

export default {
  id: "voices",
  kinds: ["spectrum"],
  defaults: { split: [250, 2500] },
  draw(ctx, w, h, t, frame, options) {
    const { palette, env } = frame;
    const m = masks(options.split ?? this.defaults.split, frame.showFrom, frame.showTo);
    ctx.lineWidth = lineWidthOf(options);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      const eFn = (u) => at(env, u) * m[k](u);
      wavePath(ctx, w, k, t, (u) => h * A * (0.55 + capGain(A) * eFn(u)), () => h / 2);
      ctx.strokeStyle = hGradient(ctx, w, eFn, (e) => alpha + (1 - alpha) * 0.6 * e, palette);
      ctx.stroke();
    });
  },
};
