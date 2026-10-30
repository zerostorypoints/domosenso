// Halo: the shape barely changes; loud bands light a soft glow around the line.

import { WAVES, MAX_AMP, wavePath, hGradient, lineWidthOf, at } from "../geometry.js";

export default {
  id: "halo",
  kinds: ["spectrum"],
  defaults: { glow: 0.4 },
  draw(ctx, w, h, t, frame, options) {
    const { palette, env } = frame;
    const glow = options.glow ?? this.defaults.glow;
    const eFn = (u) => at(env, u);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    WAVES.forEach(([, , A, alpha], k) => {
      // The long wave at full excess would reach 0.442 h: held at the spec's cap.
      wavePath(ctx, w, k, t, (u) => h * Math.min(MAX_AMP, A * (1 + 0.3 * eFn(u))), () => h / 2);
      // The same path twice: wide and faint for the glow (squared so quiet bands stay dark), then the line.
      ctx.lineWidth = lineWidthOf(options) * 5;
      ctx.strokeStyle = hGradient(ctx, w, eFn, (e) => glow * e * e, palette);
      ctx.stroke();
      ctx.lineWidth = lineWidthOf(options);
      ctx.strokeStyle = hGradient(ctx, w, eFn, (e) => alpha + (1 - alpha) * 0.5 * e, palette);
      ctx.stroke();
    });
  },
};
