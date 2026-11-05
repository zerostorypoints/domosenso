// The home's scenes for the Scenes page: every scene.* entity Home Assistant has, grouped by the
// area it stands in (the registries, as the area page finds sensors), and the ones a person chose to
// show. Plain ES module: no DOM.
//
//   allScenes(hass, config, t) -> [{key, name, scenes: [id]}]   every listed scene (not hidden or
//       disabled), grouped: the pocket's areas first in their order (by their HA area, and the
//       scenes the home inputs name for a room), then the other HA areas by name, then the scenes
//       in no area; scenes by name within a group
//   chosenScenes(settings, config) -> [id]   the person's choice (settings.scenes), else the scenes
//       the home inputs name for the rooms (empty when they name none)
//   sceneName(hass, id, groupName) -> text    the friendly name without the area's name in front
//                                              ("Living room Relax" in the living room is "Relax")

import { areasOf } from "./areas.js";
import { entityArea, haAreaOf, shownEntity } from "./sensors.js";

export function chosenScenes(settings, config) {
  if (Array.isArray(settings?.scenes)) return settings.scenes;
  return [...new Set((config?.rooms ?? []).flatMap((room) => [room.scenes ?? []].flat()).filter(Boolean))];
}

export function sceneName(hass, id, groupName) {
  const name = hass?.states?.[id]?.attributes?.friendly_name || id.split(".").pop().replace(/_/g, " ");
  if (!groupName || !name.toLowerCase().startsWith(`${groupName.toLowerCase()} `)) return name;
  const own = name.slice(groupName.length).trim();
  return own ? own.charAt(0).toUpperCase() + own.slice(1) : name;
}

export function allScenes(hass, config, t) {
  const states = hass?.states ?? {};
  const ids = Object.keys(states).filter((id) => id.startsWith("scene.")
    && (!hass.entities?.[id] || shownEntity(hass.entities[id])));
  const areas = areasOf(config, t).filter((area) => !area.outside);
  const byHaArea = new Map(areas.map((area) => [haAreaOf(config, area), area]));
  const named = new Map();
  for (const area of areas) for (const id of [area.scenes ?? []].flat()) if (!named.has(id)) named.set(id, area);
  const groups = new Map();
  const add = (key, name, order, id) => {
    if (!groups.has(key)) groups.set(key, { key, name, order, scenes: [] });
    groups.get(key).scenes.push(id);
  };
  for (const id of ids) {
    const reg = hass.entities?.[id];
    const haArea = reg ? entityArea(hass, reg) : null;
    const area = named.get(id) ?? (haArea ? byHaArea.get(haArea) : null);
    if (area) add(`area:${area.id}`, area.name, areas.indexOf(area), id);
    else if (haArea) add(`ha:${haArea}`, hass.areas?.[haArea]?.name || haArea, areas.length, id);
    else add("none", "", areas.length + 1, id);
  }
  const list = [...groups.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  for (const group of list) {
    group.scenes.sort((a, b) => sceneName(hass, a, group.name).localeCompare(sceneName(hass, b, group.name)) || (a < b ? -1 : 1));
    delete group.order;
  }
  return list;
}
