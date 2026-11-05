// The part of the floor plan's library other components copy verbatim (the pocket groups an area's
// sensors by the same categories and reads the same plan): the scan form a device's category is
// worked out from (SPEC-010, Amendment 5), which entities count for it, and the plan in the
// `floorplan` dashboard's config. No imports, no DOM. tools/category_index.py writes the copies
// (components/pocket/cards/lib/) and fails its --check when one differs; plan.js re-exports these.

// Integrations whose entities are computed from other entities: they carry a point device_class
// but are not a sensor in a room, and listed they made the tray too long to use.
export const DERIVED_PLATFORMS = ["template", "statistics", "min_max", "derivative", "integration",
  "utility_meter", "filter", "trend", "threshold", "compensation", "group"];
export const CARD_TYPE = "custom:floorplan-card";

// An entity that may count for a device's category: not computed from others (Amendment 3), not a
// diagnostic or configuration entity, not a group (an entity_id list, e.g. a Hue room or zone).
export function usable(hass, id, reg) {
  if (id.startsWith("plant.")) return true;
  if (DERIVED_PLATFORMS.includes(reg.platform) || reg.entity_category || reg.hidden) return false;
  if (id.startsWith("group.")) return false;
  return !Array.isArray(hass.states?.[id]?.attributes?.entity_id);
}

// SPEC-010's scan form of a device or of an entity without one (categories.js). `entryDomains`:
// config entry id -> integration domain (`config_entries/get`, no admin needed); without it the
// platforms of a device's entities stand in.
export function scanForm(hass, ids, device, isHub, entryDomains) {
  const platforms = ids.map((id) => (id.startsWith("plant.") ? "plant" : hass.entities?.[id]?.platform)).filter(Boolean);
  const fromEntries = (device?.config_entries || []).map((e) => entryDomains[e]).filter(Boolean);
  return {
    integrations: [...new Set([...fromEntries, ...platforms])],
    manufacturer: device?.manufacturer ?? null, model: device?.model ?? null, model_id: device?.model_id ?? null,
    entity_domains: [...new Set(ids.map((id) => id.split(".")[0]))],
    device_classes: [...new Set(ids.map((id) => hass.states?.[id]?.attributes?.device_class).filter(Boolean))],
    entity_names: ids.map((id) => hass.entities?.[id]?.original_name).filter(Boolean),
    is_hub: isHub,
  };
}

// The plan of the dashboard's floor plan card, or null (floorplan_doc.extract).
export function extract(config) {
  for (const view of config?.views || []) {
    for (const card of view?.cards || []) {
      if (card?.type === CARD_TYPE) return card.plan && typeof card.plan === "object" ? card.plan : null;
    }
  }
  return null;
}
