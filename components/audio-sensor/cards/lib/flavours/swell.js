// Swell: the three waves keep their shape and drift; where a band is loud they grow in
// place and the line turns warm, fading back to neutral on both sides of a crest.

import { WAVES, wavePath, hGradient, lineWidthOf, at, capGain } from "../geometry.js";

// A wave must never pass MAX_AMP of the height (it would leave the strip), so a gain larger than what takes
// this wave to the cap is held at that cap. Only the long wave is affected by the default 0.8.
export const swellGain = (gain, A) => Math.min(gain, capGain(A));

// Also the base of veil, afterglow and the scalar swells: amplitude and colour follow one envelope
// along the width, given as samples or as a function of u.
export function swellWaves(ctx, w, h, t, env, palette, gain, options) {
  const eFn = typeof env === "function" ? env : (u) => at(env, u);
  ctx.lineWidth = lineWidthOf(options);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  WAVES.forEach(([, , A, alpha], k) => {
    const g = swellGain(gain, A);
    wavePath(ctx, w, k, t, (u) => h * A * (0.55 + g * eFn(u)), () => h / 2);
    ctx.strokeStyle = hGradient(ctx, w, eFn, (e) => alpha + (1 - alpha) * 0.55 * e, palette);
    ctx.stroke();
  });
}

export default {
  id: "swell",
  kinds: ["spectrum"],
  defaults: { gain: 0.8 },
  draw(ctx, w, h, t, frame, options) {
    swellWaves(ctx, w, h, t, frame.env, frame.palette, options.gain ?? this.defaults.gain, options);
  },
};
