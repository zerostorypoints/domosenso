// The pocket's pages by id, the only thing the shell (pocket-app.js) imports from pages/.
//
// The page contract: a page module exports
//   render(ctx) -> HTMLElement   builds the page once, when its route is entered
//   update(el, ctx)              refreshes that element on every hass update
// with ctx = {hass, optimistic, config, t, navigate, lang, offline, routeId, settings, saveSettings,
//            openSheet, closeSheet}:
//   hass      Home Assistant's object, with the states the controls just sent shown over the
//             reported ones (lib/optimistic.js view)
//   optimistic  the store every control sends through: store.send(el, ctx.hass, {domain,
//             service, data, errorKey, expect}); store.pending(id)
//   config    the card config (rooms, outside, weather, thresholds)
//   t(key, vars)   the translation of card.pocket.* in the dashboard's language
//   navigate(route)  goes to a route ("#/areas", "#/area/<id>") without a reload
//   lang      the dashboard's language
//   offline   true while Home Assistant is not connected: controls are disabled
//   routeId   the <id> of #/area/<id> (a room's id or "outside", lib/areas.js) or of #/media/<id>
//             (a room's id: Media with that room's player), else undefined
//   settings  the person's settings (lib/settings.js), the defaults until they are read
//   saveSettings(patch) -> Promise  saves a change of them; the shell then shows it (the bar)
//   openSheet(spec, {stack?})  opens the shell's bottom sheet (lib/sheet.js) of spec.kind, over
//             the page: {kind: "trend", entity, title, ...} (lib/trend-sheet.js trendSpec builds
//             one), "checks", "air", "lights" (lib/detail-sheets.js), "forecast"
//             (lib/weather.js forecastSpec), "power" (pages/power-page.js powerSpec: the meters the
//             Now square adds up), "layers" (lib/layer-sheet.js layerSpec), "players"
//             (lib/player-sheet.js playerSpec); stack: on top of the open sheet, Back returns to it
//   closeSheet()  closes the open sheet as the person would (a pick in the players sheet)
// The shell keeps the page's element until the route changes, so a page may hold its own state
// in it between updates.

import * as home from "./home-page.js";
import * as areas from "./areas-page.js";
import * as area from "./area-page.js";
import * as settings from "./settings-page.js";
import * as climate from "./climate-page.js";
import * as floorplan from "./floorplan-page.js";
import * as media from "./media-page.js";
import * as power from "./power-page.js";
import * as plants from "./plants-page.js";

export const pages = {
  home,
  areas,
  area,
  climate,
  media,
  power,
  plants,
  settings,
  floorplan,
};
