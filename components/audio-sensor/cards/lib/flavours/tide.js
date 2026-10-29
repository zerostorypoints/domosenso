// Tide: all three waves grow with the level. Colour follows height, not time: the
// gradient runs across the canvas, so only a crest that climbs high turns warm and the middle
// stays neutral.

import { WAVES, wavePath, lineWidthOf } from "../geometry.js";
import { swellGain } from "./swell.js";

export default {
  id: "tide",
  kinds: ["scalar"],
  defaults: { gain: 0.8 },
  draw(ctx, w, h, t, frame, options) {
    const { palette, excess } = frame;
    const gain = options.gain ?? this.defaults.gain;
    const mid = h / 2;
    const top = h * 0.46;
    const g = ctx.createLinearGradient(0, mid - top, 0, mid + top);
    for (let k = 0; k <= 20; k++) {
      const d = Math.abs(k / 20 - 0.5) * 2; // 0 at the centre line, 1 at the edge
      const e = Math.max(0, (d - 0.4) / 0.6);
      g.addColorStop(k / 20, palette.css(palette.neutral + e * (palette.hot - palette.neutral)));
    }
    ctx.lineWidth = lineWidthOf(options);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      const amp = h * A * (0.55 + swellGain(gain, A) * excess);
      wavePath(ctx, w, k, t, () => amp, () => mid);
      ctx.strokeStyle = g;
      ctx.globalAlpha = alpha + (1 - alpha) * 0.5 * excess;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  },
};
