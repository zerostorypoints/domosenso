// Home's Quick actions (SPEC-038 §3.11): what they can be (quick-actions.json, declared once), which
// ones a person sees, and every one that could be added. Plain ES module: no DOM.
//
// An item is a string: an entity id of a domain the table lists, `area:<area id>` (that area's
// lights, one tile) or `all_off` (every light off).
//
//   quickOf(settings, config, hass?) -> {ids: [id], source}   the list Home shows, in order: the
//       person's own (settings.quick, lib/settings.js; source "person"), else the home's default (the
//       card config's `quick`, from Pocket's input quick_actions; "inputs"), else each area with lights
//       and All off ("default"); an item that no longer resolves (a removed entity, a hidden area) is
//       left out
//   itemOf(id, config, hass) -> {id, control, entity?, entities?, area?, domain?, service?} | null
//       control: "light" (a light tile: tap toggles, drag dims), "toggle", "run" or "all_off"
//   candidatesOf(config, hass, without?) -> [{group, ids}]   everything that could be added, by the
//       table's groups in order (areas' lights, lights, scenes, scripts, switches, buttons), without
//       the ids given; entities hidden or disabled in Home Assistant are not offered
//   nameOf(id, config, hass, t) -> text      the area's name, "All lights off", or the entity's name
//   areaNameOf(id, config, hass) -> text|null   where an entity stands (its area's name), for a hint

import table from "./quick-actions.json" with { type: "json" };
import { areasOf } from "./areas.js";
import { lightsOf } from "./page-kit.js";

export const DOMAINS = Object.freeze(Object.fromEntries(table.domains.map((d) => [d.domain, Object.freeze(d)])));
export const GROUPS = Object.freeze([...table.groups]);
export const ALL_OFF = "all_off";
const AREA = "area:";

const shown = (reg) => !reg || (!reg.hidden && !reg.hidden_by && !reg.disabled_by && !reg.entity_category);

export function itemOf(id, config, hass) {
  if (id === ALL_OFF) return { id, control: "all_off" };
  if (typeof id !== "string") return null;
  if (id.startsWith(AREA)) {
    const area = areasOf(config).find((a) => a.id === id.slice(AREA.length));
    const entities = area ? lightsOf(area) : [];
    return entities.length ? { id, control: "light", area, entities } : null;
  }
  const domain = id.split(".")[0];
  const kind = DOMAINS[domain];
  if (!kind || !hass?.states?.[id]) return null;
  const item = { id, control: kind.control, domain, entity: id };
  if (kind.control === "light") item.entities = [id];
  if (kind.service) item.service = kind.service;
  return item;
}

function defaults(config) {
  return [...areasOf(config).filter((area) => lightsOf(area).length).map((area) => `${AREA}${area.id}`), ALL_OFF];
}

export function quickOf(settings, config, hass) {
  let ids;
  let source;
  if (Array.isArray(settings?.quick)) [ids, source] = [settings.quick, "person"];
  else if (Array.isArray(config?.quick) && config.quick.length) [ids, source] = [config.quick, "inputs"];
  else [ids, source] = [defaults(config), "default"];
  // Without states yet (the first frame), keep what cannot be checked rather than flicker.
  const check = hass?.states ? (id) => itemOf(id, config, hass) : () => true;
  return { ids: [...new Set(ids)].filter(check), source };
}

export function candidatesOf(config, hass, without = []) {
  const skip = new Set(without);
  const groups = new Map(GROUPS.map((g) => [g, []]));
  for (const area of areasOf(config)) {
    const id = `${AREA}${area.id}`;
    if (lightsOf(area).length && !skip.has(id)) groups.get("areas").push(id);
  }
  if (!skip.has(ALL_OFF)) groups.get("lights").push(ALL_OFF);
  for (const id of Object.keys(hass?.states ?? {}).sort()) {
    const kind = DOMAINS[id.split(".")[0]];
    if (!kind || skip.has(id) || !shown(hass.entities?.[id])) continue;
    groups.get(kind.group).push(id);
  }
  return GROUPS.map((group) => ({ group, ids: groups.get(group) })).filter((g) => g.ids.length);
}

export function nameOf(id, config, hass, t) {
  if (id === ALL_OFF) return t("card.pocket.quick.all_off");
  if (id.startsWith(AREA)) {
    const area = areasOf(config).find((a) => a.id === id.slice(AREA.length));
    return area?.name ?? id.slice(AREA.length);
  }
  const reg = hass?.entities?.[id];
  return hass?.states?.[id]?.attributes?.friendly_name || reg?.name || reg?.original_name || id;
}

export function areaNameOf(id, config, hass) {
  const reg = hass?.entities?.[id];
  if (!reg) return null;
  const device = reg.device_id ? hass.devices?.[reg.device_id] : null;
  const areaId = reg.area_id || device?.area_id;
  return areaId ? (hass.areas?.[areaId]?.name ?? null) : null;
}
