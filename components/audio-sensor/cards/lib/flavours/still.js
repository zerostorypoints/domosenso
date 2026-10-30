// Still: the three drifting sines in the neutral colour, at the classic wave's amplitude. It ignores
// the data, so it is also what every flavour falls back to (active off, flavour not registered).

import { WAVES, wavePath, lineWidthOf } from "../geometry.js";

export default {
  id: "still",
  kinds: ["spectrum", "scalar"],
  defaults: {},
  draw(ctx, w, h, t, frame, options) {
    const { palette } = frame;
    const colour = palette.css(palette.neutral);
    const mid = () => h / 2;
    ctx.lineWidth = lineWidthOf(options);
    ctx.lineCap = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      wavePath(ctx, w, k, t, () => A * h, mid);
      ctx.strokeStyle = colour;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  },
};
