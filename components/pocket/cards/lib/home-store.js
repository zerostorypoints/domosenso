// Pocket's home store (SPEC-038 §3.6): what the home chose about its areas that Home Assistant has no
// field for (an area's type, its air device, its other main sensors), kept in Home Assistant's
// frontend system data under KEY: one value for the whole home, read by every user, written by
// administrators only, pushed to every open Pocket when it changes. A person's own settings stay in
// lib/settings.js (frontend user data). Plain ES module: no DOM.
//
//   watchHome(hass, listener) -> stop()   subscribes (frontend/subscribe_system_data); listener(value)
//       with the stored value (EMPTY merged under it) at once and on every change; a refused or
//       failed subscription gives EMPTY once and is not retried until watchHome is called again
//   saveArea(hass, areaId, patch) -> Promise<value>   merges patch into areas.<areaId> (a field set
//       to undefined is removed) and writes the whole value (frontend/set_system_data, admin only);
//       rejects when the call fails, and writes nothing then
//   markPicked(hass, areaId, kind, choice?) -> Promise<value>   records that the one-time automatic
//       choice of kind was made for the area (§3.5), with the choice itself for a store kind
//   normalize(value) -> {areas: {}, picked: {}}
//
// Shape: {areas: {<area id>: {type?: "inside"|"outside", <kind>?: <device or entity id>|"none",
//         air_readings?: {<reading>: entity id}}}, picked: {<area id>: [kind]}}

export const KEY = "domosenso-pocket-home";
export const TYPES = Object.freeze(["inside", "outside"]);
export const EMPTY = Object.freeze({ areas: Object.freeze({}), picked: Object.freeze({}) });

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

export function normalize(value) {
  const v = isObject(value) ? value : {};
  const areas = {};
  for (const [id, area] of Object.entries(isObject(v.areas) ? v.areas : {})) {
    if (!isObject(area)) continue;
    const copy = { ...area };
    if (!TYPES.includes(copy.type)) delete copy.type;
    areas[id] = copy;
  }
  const picked = {};
  for (const [id, kinds] of Object.entries(isObject(v.picked) ? v.picked : {})) {
    if (Array.isArray(kinds)) picked[id] = kinds.filter((k) => typeof k === "string");
  }
  return { areas, picked };
}

export function watchHome(hass, listener) {
  const connection = hass?.connection;
  if (typeof connection?.subscribeMessage !== "function") {
    listener(EMPTY);
    return () => {};
  }
  let stopped = false;
  let unsub = null;
  connection.subscribeMessage((event) => { if (!stopped) listener(normalize(event?.value)); },
    { type: "frontend/subscribe_system_data", key: KEY })
    .then((stop) => { unsub = stop; if (stopped) stop(); }, () => { if (!stopped) listener(EMPTY); });
  return () => { stopped = true; unsub?.(); };
}

async function current(hass) {
  const answer = await hass.callWS({ type: "frontend/get_system_data", key: KEY });
  return normalize(answer?.value);
}

async function write(hass, value) {
  await hass.callWS({ type: "frontend/set_system_data", key: KEY, value });
  return value;
}

export async function saveArea(hass, areaId, patch) {
  if (typeof hass?.callWS !== "function") throw new Error("pocket home store: no connection");
  const value = await current(hass);
  const area = { ...(value.areas[areaId] ?? {}) };
  for (const [key, field] of Object.entries(patch ?? {})) {
    if (field === undefined) delete area[key];
    else area[key] = field;
  }
  value.areas[areaId] = area;
  return write(hass, value);
}

export async function markPicked(hass, areaId, kind, choice) {
  if (typeof hass?.callWS !== "function") throw new Error("pocket home store: no connection");
  const value = await current(hass);
  const kinds = new Set(value.picked[areaId] ?? []);
  if (kinds.has(kind)) return value;
  kinds.add(kind);
  value.picked[areaId] = [...kinds];
  if (choice !== undefined) value.areas[areaId] = { ...(value.areas[areaId] ?? {}), [kind]: choice };
  return write(hass, value);
}
