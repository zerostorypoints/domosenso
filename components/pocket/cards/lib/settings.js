// Each person's pocket settings, kept in Home Assistant's frontend user data (the websocket
// commands frontend/get_user_data and frontend/set_user_data, key KEY): they follow the person
// to every phone and browser they sign in on, and nobody else sees them. Plain ES module: no DOM.
//
//   loadSettings(hass, bar?) -> Promise<settings>          DEFAULTS merged under what is stored
//   saveSettings(hass, patch, bar?) -> Promise<settings>   merges patch into the stored value, saves it
//   withDefaults(stored, bar?) -> settings
// bar: the home's default bar (lib/router.js defaultBar: Plants in a home with plants), used while
// the person has not chosen one; DEFAULTS.bar when not given.
//
// Fields:
//   bar     the page ids on the bottom bar (lib/router.js barTabs: Home and Settings always)
//   theme   the Appearance: "system" (the phone's), "light" or "dark" (lib/theme.js MODES)
//   language  the pocket's language: "auto" (the dashboard's `lang`, else Home Assistant's, as
//           before the setting existed) or one of lib/i18n.js SUPPORTED; one pocket dashboard
//           serves every language
//   climateView   the reading the Climate page shows: "temperature", "humidity" or "air"
//                 (lib/climate.js VIEWS), the switch's last choice
//   scenes        the scenes the Scenes page shows (scene entity ids, in the order chosen), the
//                 person's pick from every scene Home Assistant has; absent until they pick, when
//                 the page shows the scenes the home inputs name (lib/scenes.js chosenScenes)
//   mediaPlayer   the media player the Media page shows (an entity id of an area's `media`), the
//                 picker's last choice; absent until one is picked
//
// A call that fails (an old Home Assistant, a lost connection, a hass without callWS) gives the
// defaults on load (readSettings rejects instead); on save it rejects and writes nothing.

import { VIEWS } from "./climate.js";
import { SUPPORTED } from "./i18n.js";

export const KEY = "domosenso-pocket";

export const DEFAULTS = Object.freeze({
  bar: Object.freeze(["home", "areas", "climate", "media", "settings"]),
  theme: "system",
  language: "auto",
  climateView: "temperature",
});

const THEMES = ["system", "light", "dark"];
export const LANGUAGES = ["auto", ...SUPPORTED];

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// DEFAULTS with the stored fields over them; a stored field of the wrong type is ignored.
export function withDefaults(stored, bar = DEFAULTS.bar) {
  const value = isObject(stored) ? stored : {};
  const result = { ...DEFAULTS, ...value, bar: [...bar] };
  if (Array.isArray(value.bar) && value.bar.every((id) => typeof id === "string")) result.bar = [...value.bar];
  if (!THEMES.includes(value.theme)) result.theme = DEFAULTS.theme;
  if (!LANGUAGES.includes(value.language)) result.language = DEFAULTS.language;
  if (!VIEWS.includes(value.climateView)) result.climateView = DEFAULTS.climateView;
  if (typeof value.mediaPlayer !== "string") delete result.mediaPlayer;
  if (Array.isArray(value.scenes) && value.scenes.every((id) => typeof id === "string")) result.scenes = [...value.scenes];
  else delete result.scenes;
  return result;
}

// What is stored: {} when nothing is yet ({value: null}); a failed call rejects.
async function stored(hass) {
  const answer = await hass.callWS({ type: "frontend/get_user_data", key: KEY });
  return isObject(answer?.value) ? answer.value : {};
}

// As loadSettings, but a call that fails rejects, so the caller can tell a failure from defaults.
export async function readSettings(hass, bar) {
  if (typeof hass?.callWS !== "function") return withDefaults({}, bar);
  return withDefaults(await stored(hass), bar);
}

export async function loadSettings(hass, bar) {
  try {
    return await readSettings(hass, bar);
  } catch {
    return withDefaults({}, bar);
  }
}

// A read that fails rejects the save and writes nothing: writing the patch alone would wipe the
// other stored fields.
export async function saveSettings(hass, patch, bar) {
  if (typeof hass?.callWS !== "function") throw new Error("pocket settings: no connection");
  const current = await stored(hass);
  const value = { ...current, ...(isObject(patch) ? patch : {}) };
  await hass.callWS({ type: "frontend/set_user_data", key: KEY, value });
  return withDefaults(value, bar);
}
