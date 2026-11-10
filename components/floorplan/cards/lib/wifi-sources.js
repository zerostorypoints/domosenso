// Wi-Fi sources on the plan (SPEC-044): which devices are access points, later which entities report signal.
// Pure functions of the frontend's `hass` registries and the rules in wifi-rules.json.

// A comparable form of a MAC address: colons, lower case. Null stays null.
export const normMac = (s) => (s == null ? null : String(s).replaceAll("-", ":").toLowerCase());

const keyOf = (point) => point.device_id ?? point.entity_id;

// An access point rule names a device by its integration's device_tracker whose state attributes carry
// `device_attr` (R7): a node's tracker says device_type "deco", a client's says "client".
function trackerMatches(hass, entityId, rule) {
  const reg = hass.entities?.[entityId];
  if (!reg || reg.platform !== rule.integration || !entityId.startsWith("device_tracker.")) return false;
  const attrs = hass.states?.[entityId]?.attributes || {};
  return Object.entries(rule.device_attr || {}).every(([k, v]) => attrs[k] === v);
}

function matchesRule(hass, key, rule) {
  if (hass.entities?.[key]) {
    if (trackerMatches(hass, key, rule)) return true;
    key = hass.entities[key].device_id;
    if (!key) return false;
  }
  return Object.values(hass.entities || {}).some((e) => e.device_id === key && trackerMatches(hass, e.entity_id, rule));
}

// Point keys of `floor` whose device is an access point by the rules and not yet in `floor.access_points`.
// Unplaced points count too: the owner may place them.
export function accessPointCandidates(hass, floor, rules) {
  const marked = new Set((floor.access_points || []).map(keyOf));
  const out = [];
  for (const point of floor.points || []) {
    const key = keyOf(point);
    if (!key || marked.has(key) || out.includes(key)) continue;
    if ((rules?.access_points || []).some((rule) => matchesRule(hass, key, rule))) out.push(key);
  }
  return out;
}
