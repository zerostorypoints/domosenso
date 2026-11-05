// The pocket's pages by id, the only thing the shell (pocket-app.js) imports from pages/.
//
// The page contract: a page module exports
//   render(ctx) -> HTMLElement   builds the page once, when its route is entered
//   update(el, ctx)              refreshes that element on every hass update
// with ctx = {hass, optimistic, config, t, navigate, lang, offline, routeId, settings, saveSettings,
//            openSheet}:
//   hass      Home Assistant's object, with the states the controls just sent shown over the
//             reported ones (lib/optimistic.js view)
//   optimistic  the store every control sends through: store.send(el, ctx.hass, {domain,
//             service, data, errorKey, expect}); store.pending(id)
//   config    the card config (rooms, outside, weather, thresholds)
//   t(key, vars)   the translation of card.pocket.* in the dashboard's language
//   navigate(route)  goes to a route ("#/areas", "#/area/<id>") without a reload
//   lang      the dashboard's language
//   offline   true while Home Assistant is not connected: controls are disabled
//   routeId   the <id> of #/area/<id> (a room's id or "outside", lib/areas.js), else undefined
//   settings  the person's settings (lib/settings.js), the defaults until they are read
//   saveSettings(patch) -> Promise  saves a change of them; the shell then shows it (the bar)
//   openSheet(spec, {stack?})  opens the shell's bottom sheet (lib/sheet.js) of spec.kind, over
//             the page: {kind: "trend", entity, title, ...} (lib/trend-sheet.js trendSpec builds
//             one), "checks", "air", "lights" (lib/detail-sheets.js); stack: on top of the open
//             sheet, Back returns to it
// The shell keeps the page's element until the route changes, so a page may hold its own state
// in it between updates.

import * as home from "./home-page.js";
import * as placeholder from "./placeholder.js";
import * as areas from "./areas-page.js";
import * as area from "./area-page.js";
import * as settings from "./settings-page.js";

// Pages not built yet say so (placeholder.js) until their task builds them.
export const pages = {
  home,
  areas,
  area,
  climate: placeholder,
  media: placeholder,
  power: placeholder,
  plants: placeholder,
  settings,
  floorplan: placeholder,
};
