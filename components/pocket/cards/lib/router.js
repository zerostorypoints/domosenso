// The pocket's routes live in location.hash: Home Assistant's own router ignores the hash, so a
// change of page never reloads the dashboard and the browser's back button walks the pages.
//   #/ home   #/areas  areas   #/area/<id>  one area   #/climate   #/media   #/media/<id>  Media
//   with that area's player   #/power   #/plants   #/settings   #/floorplan
// Anything else is home, so a stale or mistyped link still lands somewhere useful. The routes of
// the first version (#/rooms, #/room/<id>) are redirected: legacyRoute() names their new hash.

// Every page the bar can show, in the bar's order. `page` names the page module (pages/index.js)
// and the translation card.pocket.nav.<page>.
export const TABS = [
  { page: "home", route: "#/", icon: "mdi:home-outline" },
  { page: "areas", route: "#/areas", icon: "mdi:view-grid-outline" },
  { page: "climate", route: "#/climate", icon: "mdi:thermometer" },
  { page: "media", route: "#/media", icon: "mdi:music" },
  { page: "power", route: "#/power", icon: "mdi:flash-outline" },
  { page: "plants", route: "#/plants", icon: "mdi:sprout-outline" },
  { page: "floorplan", route: "#/floorplan", icon: "mdi:floor-plan" },
  { page: "settings", route: "#/settings", icon: "mdi:cog-outline" },
];

// Pages only a home with their component has (the floor plan: the floorplan component, config
// `floorplan`): the bar and Settings offer them only then (optionalPages).
export const OPTIONAL_TABS = ["floorplan"];
export const optionalPages = (config) => OPTIONAL_TABS.filter((page) => !config?.[page]);

// Home and Settings are always on the bar (Settings is where the bar is changed); the others are
// each person's choice (lib/settings.js), at most MAX_TABS in all.
export const FIXED_TABS = ["home", "settings"];
export const MAX_TABS = 5;

const SINGLE = new Set(["areas", "climate", "media", "power", "plants", "settings", "floorplan"]);
const HOME = Object.freeze({ page: "home" });

export function parseRoute(hash) {
  const text = typeof hash === "string" ? hash : "";
  if (!text.startsWith("#/")) return { ...HOME };
  const parts = text.slice(2).split("/");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 1 && SINGLE.has(parts[0])) return { page: parts[0] };
  if (parts.length === 2 && (parts[0] === "area" || parts[0] === "media") && parts[1]) {
    try {
      return { page: parts[0], id: decodeURIComponent(parts[1]) };
    } catch {
      return { ...HOME };
    }
  }
  return { ...HOME };
}

// The new hash of a route of the first version, or null: #/rooms is #/areas, #/room/<id> is
// #/area/<id> (the id kept as written).
export function legacyRoute(hash) {
  const text = typeof hash === "string" ? hash : "";
  if (/^#\/rooms\/?$/.test(text)) return "#/areas";
  const room = text.match(/^#\/room\/([^/]+)\/?$/);
  return room ? `#/area/${room[1]}` : null;
}

// The tab a page belongs to: an area is reached from Areas, and so is the floor plan when the bar
// has no tab of its own for it (`tabs`: the bar's page ids).
export function tabOf(page, tabs = []) {
  if (page === "floorplan") return tabs.includes("floorplan") ? "floorplan" : "areas";
  return page === "area" ? "areas" : page;
}

// The bar's tabs for a list of chosen page ids: Home first and Settings last always, the chosen
// others in the bar's order, unknown ids, repeats and the pages in `without` (optionalPages: the
// home lacks their component) ignored, at most MAX_TABS in all.
export function barTabs(chosen, { without = [] } = {}) {
  const wanted = new Set((Array.isArray(chosen) ? chosen : []).filter((page) => !without.includes(page)));
  const room = MAX_TABS - FIXED_TABS.length;
  const picked = TABS.filter((tab) => !FIXED_TABS.includes(tab.page) && wanted.has(tab.page)).slice(0, room);
  return [TABS[0], ...picked, TABS[TABS.length - 1]];
}
