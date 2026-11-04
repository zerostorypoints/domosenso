// The pocket's routes live in location.hash: Home Assistant's own router ignores the hash, so a
// change of page never reloads the dashboard and the browser's back button walks the pages.
//   #/  home   #/rooms  rooms   #/room/<id>  one room   #/media  media   #/settings  settings
// Anything else is home, so a stale or mistyped link still lands somewhere useful.

// The bottom bar, in order. `page` names the page module (pages/index.js) and the translation
// card.pocket.nav.<page>.
export const TABS = [
  { page: "home", route: "#/", icon: "mdi:home-outline" },
  { page: "rooms", route: "#/rooms", icon: "mdi:view-grid-outline" },
  { page: "media", route: "#/media", icon: "mdi:music" },
  { page: "settings", route: "#/settings", icon: "mdi:cog-outline" },
];

const SINGLE = new Set(["rooms", "media", "settings"]);
const HOME = Object.freeze({ page: "home" });

export function parseRoute(hash) {
  const text = typeof hash === "string" ? hash : "";
  if (!text.startsWith("#/")) return { ...HOME };
  const parts = text.slice(2).split("/");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 1 && SINGLE.has(parts[0])) return { page: parts[0] };
  if (parts.length === 2 && parts[0] === "room" && parts[1]) {
    try {
      return { page: "room", id: decodeURIComponent(parts[1]) };
    } catch {
      return { ...HOME };
    }
  }
  return { ...HOME };
}

// The tab a page belongs to: a room is reached from Rooms.
export function tabOf(page) {
  return page === "room" ? "rooms" : page;
}
