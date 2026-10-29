// Timeline: the wave becomes the last `source.history` seconds. The newest reading
// sits at the right edge and drifts left; the engine's history is oldest first, so u = 1 is now.

import { swellWaves } from "./swell.js";

export default {
  id: "timeline",
  kinds: ["scalar"],
  defaults: {},
  draw(ctx, w, h, t, frame, options) {
    swellWaves(ctx, w, h, t, frame.history, frame.palette, 0.8, options);
  },
};
