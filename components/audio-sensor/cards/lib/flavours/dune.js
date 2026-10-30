// Dune: amplitude stays put; the centre line rises under loud bands, so the spectrum
// shows as a slow landscape the waves ride on.

import { WAVES, wavePath, hGradient, lineWidthOf, at } from "../geometry.js";

export default {
  id: "dune",
  kinds: ["spectrum"],
  defaults: { lift: 0.34 },
  draw(ctx, w, h, t, frame, options) {
    const { palette, env } = frame;
    const lift = options.lift ?? this.defaults.lift;
    const eFn = (u) => at(env, u);
    ctx.lineWidth = lineWidthOf(options);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      wavePath(ctx, w, k, t, () => h * A * 0.6, (u) => h * 0.62 - eFn(u) * h * lift);
      ctx.strokeStyle = hGradient(ctx, w, eFn, (e) => alpha + (1 - alpha) * 0.55 * e, palette);
      ctx.stroke();
    });
  },
};
