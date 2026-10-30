// Clocks: each wave averages the level over its own window (the engine's `clocks`,
// long to short) and shows it as its own amplitude and colour, uniform along the width. The cap
// is capGain(A), so no wave passes MAX_AMP of the height.

import { WAVES, wavePath, lineWidthOf, capGain } from "../geometry.js";

export default {
  id: "clocks",
  kinds: ["scalar"],
  defaults: { windows: [30, 5, 1], energy: "auto" },
  draw(ctx, w, h, t, frame, options) {
    const { palette, clocks } = frame;
    ctx.lineWidth = lineWidthOf(options);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      const e = clocks[k];
      const amp = h * A * (0.55 + capGain(A) * 0.8 * e);
      wavePath(ctx, w, k, t, () => amp, () => h / 2);
      ctx.strokeStyle = palette.css(palette.neutral + e * (palette.hot - palette.neutral), alpha + (1 - alpha) * 0.5 * e);
      ctx.stroke();
    });
  },
};
