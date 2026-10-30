// Centre: one gentle swell in the middle rises with the level and takes its colour;
// the edges stay calm and neutral.

import { swellWaves } from "./swell.js";

export default {
  id: "centre",
  kinds: ["scalar"],
  defaults: { width: 0.2 },
  draw(ctx, w, h, t, frame, options) {
    const sigma = options.width ?? this.defaults.width;
    const e = frame.excess;
    swellWaves(ctx, w, h, t, (u) => e * Math.exp(-(((u - 0.5) / sigma) ** 2) / 2), frame.palette, 0.8, options);
  },
};
