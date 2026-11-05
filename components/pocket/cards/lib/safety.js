// What the Safety page shows and what Home's attention row adds from it (P4, UC10 broadened): doors
// and windows, locks and covers (lib/controls.js: the home inputs' rooms list them first, the rest
// found by HA area), alarm sensors, sirens and who is home. Plain ES module: no DOM.
//
//   alarmsOf(hass) -> [id]     the listed binary_sensor.* of ALARM_CLASSES (smoke, gas, carbon
//                              monoxide, water leak, tamper), by name, never a component's own flag
//                              (attributes.component); an entity Home Assistant only
//                              restored (no integration provides it any more: attributes.restored) is
//                              left out, as hidden, disabled, diagnostic and configuration ones are
//   sirensOf(hass) -> [id]     the listed siren.*
//   peopleOf(hass) -> [id]     person.*, by name, never a kiosk's account (person_role: kiosk)
//   occupiedAreas(hass, config, t) -> [{key, name, ids}]   occupancy and presence sensors that sense
//                              someone now, grouped by area (lib/controls.js groupedByArea)
//   issuesOf(hass, config) -> [{kind, id}]   what needs a look, in this order: alarm (on), siren
//                              (on), open (a door or window), unlocked (a lock, also jammed or open),
//                              cover (open); empty: all quiet. A sensor that is not reporting is
//                              not an issue here: the page shows it as "not reporting".
//   reporting(state) -> boolean   a state with a value (not missing, unavailable or unknown)

import { contactsOf, coversOf, groupedByArea, locksOf } from "./controls.js";
import { entityArea, shownEntity } from "./sensors.js";

export const ALARM_CLASSES = ["smoke", "gas", "carbon_monoxide", "moisture", "tamper"];
const PRESENCE_CLASSES = ["occupancy", "presence"];
const GONE = new Set(["unavailable", "unknown"]);
const UNLOCKED = new Set(["unlocked", "unlocking", "open", "opening", "jammed"]);
const COVER_OPEN = new Set(["open", "opening", "closing"]);

const listed = (hass, id) => {
  const reg = hass?.entities?.[id];
  return (!reg || shownEntity(reg)) && hass?.states?.[id]?.attributes?.restored !== true;
};
const nameOf = (hass, id) => hass?.states?.[id]?.attributes?.friendly_name || id;
const byName = (hass) => (a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)) || (a < b ? -1 : 1);
const ofDomain = (hass, domain, extra = () => true) => Object.keys(hass?.states ?? {})
  .filter((id) => id.startsWith(`${domain}.`) && listed(hass, id) && extra(hass.states[id]))
  .sort(byName(hass));

export const reporting = (state) => !!state && !GONE.has(state.state);

// A component's own computed flag (attributes.component: climate-air's "bathroom humidity high" has
// the moisture class) is not a device's alarm.
export const alarmsOf = (hass) => ofDomain(hass, "binary_sensor",
  (state) => ALARM_CLASSES.includes(state.attributes?.device_class) && !state.attributes?.component);
export const sirensOf = (hass) => ofDomain(hass, "siren");
// A wall tablet's account (the Ramka marks its kiosk user's person person_role: kiosk) is no one
// who lives here.
export const peopleOf = (hass) => ofDomain(hass, "person", (state) => state.attributes?.person_role !== "kiosk");

export function occupiedAreas(hass, config, t) {
  const ids = ofDomain(hass, "binary_sensor", (state) => PRESENCE_CLASSES.includes(state.attributes?.device_class)
    && state.state === "on")
    .filter((id) => hass?.entities?.[id] && entityArea(hass, hass.entities[id]));
  return groupedByArea(hass, config, t, ids);
}

export function issuesOf(hass, config) {
  const on = (id) => hass?.states?.[id]?.state === "on";
  const state = (id) => hass?.states?.[id]?.state;
  return [
    ...alarmsOf(hass).filter(on).map((id) => ({ kind: "alarm", id })),
    ...sirensOf(hass).filter(on).map((id) => ({ kind: "siren", id })),
    ...contactsOf(hass, config).filter(on).map((id) => ({ kind: "open", id })),
    ...locksOf(hass, config).filter((id) => UNLOCKED.has(state(id))).map((id) => ({ kind: "unlocked", id })),
    ...coversOf(hass, config).filter((id) => COVER_OPEN.has(state(id))).map((id) => ({ kind: "cover", id })),
  ];
}
