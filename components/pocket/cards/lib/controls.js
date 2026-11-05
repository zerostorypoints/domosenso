// What the Controls page acts on and its Status view shows, as the Ramka's controls and status
// screens: covers (awnings, blinds), timers, doors and windows, locks, found the way the area page
// finds sensors (Home Assistant's registries, by HA area; hidden, disabled, diagnostic and
// configuration entities left out); the lights are the home inputs' rooms' (as Quick and the
// Lights sheet). Plain ES module: no DOM.
//
//   groupedByArea(hass, config, t, ids) -> [{key, name, ids}]   the pocket's areas in order (by
//       their HA area), then HA's other areas by name, then no area (name ""); ids by name
//   coversOf(hass), contactsOf(hass), locksOf(hass) -> [id]   the listed ones
//   timersOf(hass, config) -> [id]   the timers a list in the inputs names (config.timers, legacy or
//       manual) that Home Assistant has; without one, every listed timer.* the timers component marks
//       timer_role: user_countdown, by name; never every timer.*, so a component's own stays out
//   CONTACT_CLASSES                    the binary_sensor device classes that are a door or window
//   timerLeft(state, now?) -> seconds | null   an active timer's time left (finishes_at), a paused
//       one's `remaining`, an idle one's `duration`
//   coverMoving(state) -> boolean

import { areasOf } from "./areas.js";
import { entityArea, haAreaOf, shownEntity } from "./sensors.js";

export const CONTACT_CLASSES = ["door", "window", "garage_door", "opening"];
const GONE = new Set(["unavailable", "unknown"]);

const listed = (hass, id) => {
  const reg = hass?.entities?.[id];
  return !reg || shownEntity(reg);
};

const ofDomain = (hass, domain, extra = () => true) => Object.keys(hass?.states ?? {})
  .filter((id) => id.startsWith(`${domain}.`) && listed(hass, id) && extra(hass.states[id]));

export const coversOf = (hass) => ofDomain(hass, "cover");
// Decision D4 (docs/2026-11-05-shared-home-decisions.md): the timers component marks the timers it
// makes for people (timer_role: user_countdown); a component's internal timer carries no role.
export const USER_TIMER_ROLE = "user_countdown";
export function timersOf(hass, config) {
  const named = [config?.timers ?? []].flat().filter((id) => typeof id === "string" && id.startsWith("timer."));
  if (named.length) return named.filter((id) => hass?.states?.[id]);
  return ofDomain(hass, "timer", (state) => state.attributes?.timer_role === USER_TIMER_ROLE)
    .sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)) || (a < b ? -1 : 1));
}
export const locksOf = (hass) => ofDomain(hass, "lock");
export const contactsOf = (hass) => ofDomain(hass, "binary_sensor",
  (state) => CONTACT_CLASSES.includes(state.attributes?.device_class));

const nameOf = (hass, id) => hass?.states?.[id]?.attributes?.friendly_name || id;

export function groupedByArea(hass, config, t, ids) {
  const areas = areasOf(config, t);
  const byHaArea = new Map(areas.map((area) => [haAreaOf(config, area), area]));
  const groups = new Map();
  for (const id of ids) {
    const reg = hass?.entities?.[id];
    const haArea = reg ? entityArea(hass, reg) : null;
    const area = haArea ? byHaArea.get(haArea) : null;
    let key = "none";
    let name = "";
    let order = areas.length + 1;
    if (area) {
      key = `area:${area.id}`;
      name = area.outside ? (t ? t("card.pocket.area.outside") : area.name) : area.name;
      order = areas.indexOf(area);
    } else if (haArea) {
      key = `ha:${haArea}`;
      name = hass.areas?.[haArea]?.name || haArea;
      order = areas.length;
    }
    if (!groups.has(key)) groups.set(key, { key, name, order, ids: [] });
    groups.get(key).ids.push(id);
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(({ key, name, ids: list }) => ({ key, name,
      ids: list.sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)) || (a < b ? -1 : 1)) }));
}

// "1:02:03" or "0:05:00" in seconds.
const seconds = (text) => {
  if (typeof text !== "string") return null;
  const parts = text.split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((sum, n) => sum * 60 + n, 0);
};

export function timerLeft(state, now = Date.now()) {
  if (!state || GONE.has(state.state)) return null;
  const a = state.attributes ?? {};
  if (state.state === "active") {
    const end = Date.parse(a.finishes_at);
    if (Number.isFinite(end)) return Math.max(0, Math.round((end - now) / 1000));
    return seconds(a.remaining);
  }
  if (state.state === "paused") return seconds(a.remaining);
  return seconds(a.duration);
}

export const coverMoving = (state) => state?.state === "opening" || state?.state === "closing";
