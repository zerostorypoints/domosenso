// Afterglow: swell, plus a dotted trace of each band's recent peak. The engine holds
// the peak for dynamics.hold, then sinks it at twice the fall time.

import { WAVES, hGradient, at, lineWidthOf } from "../geometry.js";
import { swellWaves, swellGain } from "./swell.js";

const GAIN = 0.8;

export default {
  id: "afterglow",
  kinds: ["spectrum"],
  defaults: {},
  draw(ctx, w, h, t, frame, options) {
    const { palette, env, peakEnv } = frame;
    const pFn = (u) => at(peakEnv, u);
    const A = WAVES[0][2];
    const g = swellGain(GAIN, A);
    const mid = h / 2;
    swellWaves(ctx, w, h, t, env, palette, GAIN, options);
    // Two traces, above and below the centre line, at the long wave's envelope of the peaks.
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = mid + sign * h * A * (0.55 + g * pFn(x / w));
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = lineWidthOf(options);
      ctx.lineCap = "round";
      ctx.strokeStyle = hGradient(ctx, w, pFn, (e) => 0.12 + 0.6 * e, palette);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },
};
