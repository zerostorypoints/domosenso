// Tint: the classic wave's shape, untouched; only the colour (and a little opacity) follows
// the level.

import { WAVES, wavePath, lineWidthOf } from "../geometry.js";

export default {
  id: "tint",
  kinds: ["scalar"],
  defaults: {},
  draw(ctx, w, h, t, frame, options) {
    const { palette, excess } = frame;
    const colour = (alpha) => palette.css(palette.neutral + excess * (palette.hot - palette.neutral), alpha);
    ctx.lineWidth = lineWidthOf(options);
    ctx.lineCap = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      wavePath(ctx, w, k, t, () => A * h, () => h / 2);
      ctx.strokeStyle = colour(alpha + (1 - alpha) * 0.3 * excess);
      ctx.stroke();
    });
  },
};
