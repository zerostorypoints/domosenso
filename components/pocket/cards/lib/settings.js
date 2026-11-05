// Each person's pocket settings, kept in Home Assistant's frontend user data (the websocket
// commands frontend/get_user_data and frontend/set_user_data, key KEY): they follow the person
// to every phone and browser they sign in on, and nobody else sees them. Plain ES module: no DOM.
//
//   loadSettings(hass) -> Promise<settings>          DEFAULTS merged under what is stored
//   saveSettings(hass, patch) -> Promise<settings>   merges patch into the stored value, saves it
//
// Fields:
//   bar   the page ids on the bottom bar (lib/router.js barTabs: Home and Settings always)
//
// A call that fails (an old Home Assistant, a lost connection, a hass without callWS) gives the
// defaults on load (readSettings rejects instead); on save it rejects and writes nothing.

export const KEY = "domosenso-pocket";

export const DEFAULTS = Object.freeze({
  bar: Object.freeze(["home", "areas", "climate", "media", "settings"]),
});

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// DEFAULTS with the stored fields over them; a stored field of the wrong type is ignored.
export function withDefaults(stored) {
  const value = isObject(stored) ? stored : {};
  const result = { ...DEFAULTS, ...value, bar: [...DEFAULTS.bar] };
  if (Array.isArray(value.bar) && value.bar.every((id) => typeof id === "string")) result.bar = [...value.bar];
  return result;
}

// What is stored: {} when nothing is yet ({value: null}); a failed call rejects.
async function stored(hass) {
  const answer = await hass.callWS({ type: "frontend/get_user_data", key: KEY });
  return isObject(answer?.value) ? answer.value : {};
}

// As loadSettings, but a call that fails rejects, so the caller can tell a failure from defaults.
export async function readSettings(hass) {
  if (typeof hass?.callWS !== "function") return withDefaults({});
  return withDefaults(await stored(hass));
}

export async function loadSettings(hass) {
  try {
    return await readSettings(hass);
  } catch {
    return withDefaults({});
  }
}

// A read that fails rejects the save and writes nothing: writing the patch alone would wipe the
// other stored fields.
export async function saveSettings(hass, patch) {
  if (typeof hass?.callWS !== "function") throw new Error("pocket settings: no connection");
  const current = await stored(hass);
  const value = { ...current, ...(isObject(patch) ? patch : {}) };
  await hass.callWS({ type: "frontend/set_user_data", key: KEY, value });
  return withDefaults(value);
}
