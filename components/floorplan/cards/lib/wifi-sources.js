// Wi-Fi sources on the plan (SPEC-044): which devices are access points and which entities report signal.
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

// ---- signal observations from devices (SPEC-044 S2) ----

const BAND_OF_CONNECTION = { band2_4: "2.4", band5: "5", band6: "6" };
const UNKNOWN_WEIGHT = 0.5;

const deviceOf = (hass, entityId) => hass.entities?.[entityId]?.device_id ?? null;
const entitiesOfDevice = (hass, deviceId) =>
  Object.values(hass.entities || {}).filter((e) => e.device_id === deviceId).map((e) => e.entity_id);
const objectId = (entityId) => entityId.slice(entityId.indexOf(".") + 1);
const macsOf = (hass, deviceId) =>
  (hass.devices?.[deviceId]?.connections || []).filter(([type]) => type === "mac").map(([, v]) => normMac(v));

// A Wi-Fi signal entity: dBm signal strength, from an integration that reports Wi-Fi or named like it,
// and not from a radio the rules exclude (Bluetooth, Zigbee).
function isSignalEntity(hass, entityId, rules) {
  const reg = hass.entities?.[entityId];
  const attrs = hass.states?.[entityId]?.attributes;
  if (!reg || !attrs || attrs.device_class !== "signal_strength" || attrs.unit_of_measurement !== "dBm") return false;
  const exclude = rules?.exclude || {};
  if ((exclude.integrations || []).includes(reg.platform)) return false;
  const deviceId = reg.device_id;
  const conns = deviceId ? hass.devices?.[deviceId]?.connections || [] : [];
  if (conns.some(([type]) => (exclude.connections || []).includes(type))) return false;
  const signal = rules?.signal || {};
  return (signal.integrations || []).includes(reg.platform) || (signal.object_id || []).some((w) => objectId(entityId).includes(w));
}

// Entities whose 24 h means the card fetches.
export function signalEntities(hass, rules) {
  return Object.keys(hass.entities || {}).filter((id) => isSignalEntity(hass, id, rules));
}

// The BSSID entities of an access point: its band and the BSSID the integration reports for it.
function apBssids(hass, apKey, rules) {
  const deviceId = hass.entities?.[apKey] ? deviceOf(hass, apKey) : apKey;
  const out = [];
  if (!deviceId) return out;
  for (const rule of rules?.access_points || []) {
    for (const [band, suffix] of Object.entries(rule.bssid || {})) {
      for (const id of entitiesOfDevice(hass, deviceId)) {
        if (hass.entities[id].platform !== rule.integration || !id.endsWith(`_${suffix}`)) continue;
        const mac = normMac(hass.states?.[id]?.state);
        if (mac) out.push({ band, mac });
      }
    }
  }
  return out;
}

// The access point (by key) and band the device's own BSSID sensor points to, among the marked access points.
function byBssid(hass, deviceId, aps, rules) {
  const words = rules?.signal?.bssid_object_id || [];
  const mine = entitiesOfDevice(hass, deviceId)
    .filter((id) => words.some((w) => objectId(id).includes(w)))
    .map((id) => normMac(hass.states?.[id]?.state))
    .filter((m) => m && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(m));
  for (const mac of mine) {
    for (const ap of aps) {
      const hit = apBssids(hass, ap, rules).find((b) => b.mac === mac);
      if (hit) return { ap, band: hit.band };
    }
  }
  return null;
}

// The router's client tracker for one of the device's MACs: the access point is the node whose own
// tracker has the client's `deco_mac`, the band comes from `connection_type`.
function byTracker(hass, deviceId, aps, rules) {
  const macs = macsOf(hass, deviceId);
  if (!macs.length) return null;
  for (const rule of rules?.access_points || []) {
    for (const [id, reg] of Object.entries(hass.entities || {})) {
      if (reg.platform !== rule.integration || !id.startsWith("device_tracker.")) continue;
      const attrs = hass.states?.[id]?.attributes || {};
      if (!macs.includes(normMac(attrs.mac))) continue;
      const band = BAND_OF_CONNECTION[attrs.connection_type];
      if (!band) continue; // wired / undefined: this tracker says nothing
      const node = normMac(attrs.deco_mac);
      const ap = node && aps.find((key) => nodeMacs(hass, key, rule).includes(node));
      return { ap: ap ?? null, band };
    }
  }
  return null;
}

function nodeMacs(hass, apKey, rule) {
  const ids = hass.entities?.[apKey] ? [apKey] : entitiesOfDevice(hass, apKey);
  return ids
    .filter((id) => id.startsWith("device_tracker.") && hass.entities[id]?.platform === rule.integration)
    .map((id) => normMac(hass.states?.[id]?.attributes?.mac))
    .filter(Boolean);
}

// One observation per Wi-Fi signal entity of a placed point on `floorId`. `values` holds the entities'
// 24 h means; an entity without one reports its state.
export function deviceObservations(hass, doc, floorId, rules, values) {
  const floor = (doc.floors || []).find((f) => f.floor_id === floorId);
  if (!floor) return [];
  const aps = (doc.floors || []).flatMap((f) => (f.access_points || []).map(keyOf));
  const out = [];
  for (const point of floor.points || []) {
    if (point.placed === false || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const deviceId = point.device_id ?? deviceOf(hass, point.entity_id);
    const ids = point.device_id ? entitiesOfDevice(hass, point.device_id) : [point.entity_id];
    for (const id of ids.filter((i) => isSignalEntity(hass, i, rules))) {
      const raw = values?.[id] ?? hass.states[id].state;
      const dbm = typeof raw === "number" ? raw : raw === "" || raw == null ? NaN : Number(raw);
      if (!Number.isFinite(dbm)) continue;
      const found = (deviceId && (byBssid(hass, deviceId, aps, rules) || byTracker(hass, deviceId, aps, rules))) || null;
      const ap = found?.ap ?? null;
      out.push({
        floorId, x: point.x, y: point.y, band: found?.band ?? "2.4", ap, dbm,
        weight: ap ? 1 : UNKNOWN_WEIGHT, source: "device", ...(deviceId ? { device: deviceId } : {}), entity: id,
      });
    }
  }
  return out;
}

// ---- disabled signal sources (SPEC-044 S2) ----

// Registry entries (config/entity_registry/list, an admin call) of switched-off sensors the rules would
// count as Wi-Fi signal: the owner can enable them. A disabled entity has no state, so its device class
// and unit come from the entry where it carries them (original_device_class, unit_of_measurement,
// capabilities); without either the integration and the object id decide alone, and then the object id
// must name a Wi-Fi signal (wi_fi + signal), not an SSID or a BSSID. `keys` (optional): only these
// devices' or entities' entries, the plan's points. [{entity_id, device_id}], sorted.
export function disabledSignalEntities(hass, entries, rules, keys) {
  const signal = rules?.signal || {};
  const exclude = rules?.exclude || {};
  const out = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e?.disabled_by || !String(e.entity_id).startsWith("sensor.")) continue;
    if (keys && !keys.has(e.entity_id) && !(e.device_id && keys.has(e.device_id))) continue;
    if ((exclude.integrations || []).includes(e.platform)) continue;
    const conns = e.device_id ? hass.devices?.[e.device_id]?.connections || [] : [];
    if (conns.some(([type]) => (exclude.connections || []).includes(type))) continue;
    const cls = e.original_device_class ?? e.device_class ?? null;
    const unit = e.unit_of_measurement ?? e.capabilities?.unit_of_measurement ?? null;
    if ((cls !== null && cls !== "signal_strength") || (unit !== null && unit !== "dBm")) continue;
    const oid = objectId(e.entity_id);
    const byIntegration = (signal.integrations || []).includes(e.platform);
    const byWord = (signal.object_id || []).some((w) => oid.includes(w));
    const counts = cls !== null || unit !== null ? byIntegration || byWord : byIntegration && byWord && oid.includes("signal");
    if (counts) out.push({ entity_id: e.entity_id, device_id: e.device_id ?? null });
  }
  return out.sort((a, b) => (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));
}
