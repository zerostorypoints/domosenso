// Veil: swell, with a faint coloured fill of the area the long wave sweeps.

import { WAVES, breathe, hGradient, at } from "../geometry.js";
import { swellWaves, swellGain } from "./swell.js";

const GAIN = 0.8;

export default {
  id: "veil",
  kinds: ["spectrum"],
  defaults: { opacity: 0.2 },
  draw(ctx, w, h, t, frame, options) {
    const { palette, env } = frame;
    const opacity = options.opacity ?? this.defaults.opacity;
    const eFn = (u) => at(env, u);
    const A = WAVES[0][2];
    const g = swellGain(GAIN, A);
    const mid = h / 2;
    const b = breathe(t);
    // The veil follows the long wave's envelope: upper edge left to right, lower edge back.
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, mid - h * A * (0.55 + g * eFn(x / w)) * b);
    for (let x = w; x >= 0; x -= 4) ctx.lineTo(x, mid + h * A * (0.55 + g * eFn(x / w)) * b);
    ctx.closePath();
    ctx.fillStyle = hGradient(ctx, w, eFn, (e) => 0.03 + opacity * e, palette);
    ctx.fill();
    swellWaves(ctx, w, h, t, env, palette, GAIN, options);
  },
};
