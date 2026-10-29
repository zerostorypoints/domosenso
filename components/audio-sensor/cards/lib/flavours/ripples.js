// Ripples: each reading starts in the centre and travels to both edges over `travel`
// seconds, fading as it goes. A point at distance d from the centre shows the reading that is
// d·travel seconds old.

import { swellWaves } from "./swell.js";
import { at } from "../geometry.js";
import { HISTORY_RATE } from "../engine.js";

export default {
  id: "ripples",
  kinds: ["scalar"],
  defaults: { travel: 12 },
  draw(ctx, w, h, t, frame, options) {
    const { history, palette } = frame;
    const travel = options.travel ?? this.defaults.travel;
    const n = history.length;
    swellWaves(ctx, w, h, t, (u) => {
      const d = Math.abs(u - 0.5) * 2;
      const age = d * travel * HISTORY_RATE; // in history samples
      return at(history, 1 - age / (n - 1)) * (1 - 0.45 * d);
    }, palette, 0.8, options);
  },
};
