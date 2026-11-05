// The floor plan, read once per session: the `floorplan` dashboard's config (websocket
// lovelace/config, url path floorplan), its plan taken out by the floor plan's own extract()
// (lib/shared.js, a verbatim copy of floorplan's). Every floorplan-card the pocket shows gets it
// as its `plan:` config, so an area page or the floor plan view never reads the dashboard again.
// Plain ES module: no DOM.
//
//   loadPlan(hass) -> Promise<plan | null>   the same promise for every caller; null when the home
//       has no plan. A failed read (no dashboard, no connection) answers null and is forgotten, so
//       the next caller asks again.
//   forgetPlan()                              the shell calls it while Home Assistant is not
//       connected: after a reconnect the plan is read again (an edit saved meanwhile shows)

import { extract } from "./shared.js";

export const URL_PATH = "floorplan";

let cached = null;

export function loadPlan(hass) {
  if (cached) return cached;
  if (typeof hass?.callWS !== "function") return Promise.resolve(null);
  const asked = hass.callWS({ type: "lovelace/config", url_path: URL_PATH }).then(
    (config) => extract(config),
    () => {
      if (cached === asked) cached = null;
      return null;
    });
  cached = asked;
  return asked;
}

export function forgetPlan() {
  cached = null;
}
