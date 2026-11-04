// The pocket's pages by id, the only thing the shell (pocket-app.js) imports from pages/.
//
// The page contract: a page module exports
//   render(ctx) -> HTMLElement   builds the page once, when its route is entered
//   update(el, ctx)              refreshes that element on every hass update
// with ctx = {hass, config, t, navigate, lang, offline, routeId}:
//   hass      Home Assistant's object as the card gets it
//   config    the card config (rooms, outside, weather, thresholds)
//   t(key, vars)   the translation of card.pocket.* in the dashboard's language
//   navigate(route)  goes to a route ("#/rooms", "#/room/<id>") without a reload
//   lang      the dashboard's language
//   offline   true while Home Assistant is not connected: controls are disabled
//   routeId   the <id> of #/room/<id>, else undefined
// The shell keeps the page's element until the route changes, so a page may hold its own state
// in it between updates.

import * as home from "./home-page.js";
import * as placeholder from "./placeholder.js";

export const pages = {
  home,
  rooms: placeholder,
  room: placeholder,
  media: placeholder,
  settings: placeholder,
};
