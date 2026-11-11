// Network traffic on the plan (SPEC-047): the router's clients as records, from the access point rules'
// `traffic` block. Pure functions of the frontend's `hass` registries, the plan document and the rules.
import { normMac, nodeMacs } from "./wifi-sources.js";
import { accessPoints } from "./maps.js";
import { keysOf } from "./plan.js";
import { pointInPolygon } from "./geometry.js";

const round2 = (n) => Math.round(n * 100) / 100;
const objectId = (entityId) => entityId.slice(entityId.indexOf(".") + 1);
const keyOf = (point) => point.device_id ?? point.entity_id;
const PER_SECOND_TO_MBIT = { "kB/s": 8 / 1000, "B/s": 8 / 1e6, "MB/s": 8, "kbit/s": 1 / 1000, "Mbit/s": 1 };

// The access point rules that report traffic; a rule without a `traffic` block gives none.
export const trafficRules = (rules) => (rules?.access_points || []).filter((r) => r.traffic);

// A reading in Mbit/s, unrounded. A string is parsed; null, "unknown" and the like read as 0.
export function toMbps(value, unit) {
  const n = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value);
  return Number.isFinite(n) ? n * (PER_SECOND_TO_MBIT[unit] ?? PER_SECOND_TO_MBIT["kB/s"]) : 0;
}

const timeOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };

// Freshness (SPEC-047): the router's `updated` sensor and `polling` switch are entities of the
// integration, found by object id suffix among all of them: they need not sit on a node's device.
function freshness(hass, rule, now) {
  const f = rule.traffic.freshness || {};
  const own = Object.keys(hass.entities || {}).filter((id) => hass.entities[id].platform === rule.integration);
  const find = (domain, suffix) => suffix && own.find((id) => id.startsWith(`${domain}.`) && objectId(id).endsWith(suffix));
  const sensor = find("sensor", f.updated);
  const polling = find("switch", f.polling);
  const st = sensor ? hass.states?.[sensor] : null;
  const updatedMs = st ? timeOf(st.state) ?? timeOf(st.last_updated) : null;
  const limit = 3 * (f.interval_s ?? 30) * 1000;
  let reason = null;
  if (!sensor || updatedMs == null || now - updatedMs >= limit) reason = "stale";
  else if (polling && hass.states?.[polling]?.state !== "on") reason = "polling_off";
  return { reason, updated: updatedMs == null ? null : new Date(updatedMs) };
}

// The plan points with their registry keys, to match a client to one: [{floorId, key, keys, mac}].
// `placed`: dragged onto the plan with a place; an auto-placed point (`placed: false`) stands for its room, not a spot.
const planPoints = (doc) => (doc?.floors || []).flatMap((f) => (f.points || []).map((p) => ({
  floorId: f.floor_id, key: keyOf(p), keys: keysOf(p), mac: normMac(p.mac), device_id: p.device_id ?? null, entity_id: p.entity_id ?? null,
  placed: p.placed !== false && Number.isFinite(p.x) && Number.isFinite(p.y),
})));
// A matched point as the record's `point`: null while it is not placed (the client is then unplaced, still matched).
const pointOf = (p) => (p.placed ? { floorId: p.floorId, key: p.key } : null);

function match(hass, mac, ownDevice, points) {
  // 1. A point's mac link; the registry only decides when no point links this MAC.
  const linked = points.find((p) => p.mac === mac);
  if (linked) {
    const device_id = linked.device_id ?? hass.entities?.[linked.entity_id]?.device_id ?? null;
    return { device_id, point: pointOf(linked), matched_by: "link" };
  }
  // 2. A device with this MAC, other than the router integration's own device for the tracker.
  // A device on the plan wins; one that is not on it still is the matched device, unplaced.
  const devices = Object.entries(hass.devices || {}).filter(([id, dev]) => id !== ownDevice
    && (dev.connections || []).some(([type, v]) => type === "mac" && normMac(v) === mac)).map(([id]) => id);
  const onPlan = devices.flatMap((id) => points.filter((q) => q.keys.includes(id)).map((p) => ({ id, p })));
  const hit = onPlan.find(({ p }) => p.placed) ?? onPlan[0];
  if (hit) return { device_id: hit.id, point: pointOf(hit.p), matched_by: "registry" };
  if (devices.length) return { device_id: devices[0], point: null, matched_by: "registry" };
  return { device_id: null, point: null, matched_by: null };
}

// One record per client tracker (state `home`, a known link) of the rules' integrations, newest tracker
// per MAC. `live` and `reason` say whether the router's data is current: if not, every client is stale.
export function clients(hass, doc, rules, now = Date.now(), ix = null) {
  const aps = accessPoints(doc).map((a) => a.key);
  const points = planPoints(doc);
  const byMacMap = new Map();
  let reason = null;
  let updated = null;
  for (const rule of trafficRules(rules)) {
    const c = rule.traffic.client;
    const fresh = freshness(hass, rule, now);
    const ids = Object.keys(hass.entities || {}).filter((id) => id.startsWith("device_tracker.") && hass.entities[id].platform === rule.integration);
    const nodes = ids.filter((id) => hass.states?.[id]?.state === "home"
      && Object.entries(rule.device_attr || {}).every(([k, v]) => hass.states[id].attributes?.[k] === v));
    if (!nodes.length) fresh.reason = "unavailable";
    reason ??= fresh.reason;
    updated ??= fresh.updated;
    for (const id of ids) {
      const st = hass.states?.[id];
      const a = st?.attributes || {};
      const link = c.link.values[a[c.link.attr]];
      const mac = normMac(a.mac);
      if (st?.state !== "home" || !link || !mac || !a[c.node_mac]) continue;
      const seenMs = timeOf(st.last_reported) ?? timeOf(st.last_updated) ?? now; // last_updated only moves on a change: an idle client would read stale
      if (byMacMap.has(mac) && byMacMap.get(mac).seenMs >= seenMs) continue;
      const node = normMac(a[c.node_mac]);
      const down = toMbps(a[c.down], c.unit);
      const up = toMbps(a[c.up], c.unit);
      byMacMap.set(mac, {
        seenMs,
        record: {
          mac, name: a.friendly_name ?? id, ap: aps.find((key) => nodeMacs(hass, key, rule, ix).includes(node)) ?? null, link,
          down: round2(down), up: round2(up), total: round2(down + up),
          ...match(hass, mac, hass.entities[id].device_id ?? null, points),
          stale: !!fresh.reason, updated: new Date(seenMs),
        },
      });
    }
  }
  return { list: [...byMacMap.values()].map((v) => v.record), live: reason === null, updated, reason };
}

// An access point's own throughput in Mbit/s, from its device's sensors (object id suffixes of the
// rule's `node` block); `exclude` drops the integration's whole-network sensors (`total_down`). Null
// when the device has none.
export function nodeRates(hass, rules, apKey) {
  const deviceId = hass.entities?.[apKey] ? hass.entities[apKey].device_id : apKey;
  for (const rule of trafficRules(rules)) {
    const n = rule.traffic.node;
    if (!n) continue;
    const mine = Object.values(hass.entities || {}).filter((e) => e.device_id === deviceId && e.platform === rule.integration
      && e.entity_id.startsWith("sensor.") && !(n.exclude && objectId(e.entity_id).includes(n.exclude)));
    const read = (suffix) => mine.find((e) => objectId(e.entity_id).endsWith(suffix));
    const d = read(n.down);
    const u = read(n.up);
    if (!d && !u) continue;
    const rate = (e) => (e ? round2(toMbps(hass.states?.[e.entity_id]?.state, n.unit)) : 0);
    return { down: rate(d), up: rate(u) };
  }
  return null;
}

// Throughput per access point: Map<apKey, {total, count}> over the clients that have one.
export function apTotals(list) {
  const out = new Map();
  for (const c of list) {
    if (!c.ap) continue;
    const t = out.get(c.ap) ?? { total: 0, count: 0 };
    t.total += c.total;
    t.count += 1;
    out.set(c.ap, t);
  }
  return out;
}

export const HEAT_SIGMA_M = 1; // m: a point's heat falls off as a Gaussian of this sigma...
export const HEAT_CUT_M = 3;    // ...and is cut at this distance

// The heat on this floor on one global `step` lattice: [{x, y, value}] sorted by x then y, x and y the cell's
// lower corner (SPEC-047 Amendment 2). Every contribution is keyed by the lattice cell holding its centre,
// because `coverage` anchors each room's cells at that room's own bounding box, so its cells and a point's
// would otherwise land on different lattices. A placed client, or a wired one at its access point, paints
// `total * exp(-d^2 / 2 sigma^2)` on each cell whose centre is within HEAT_CUT_M of the point; an unplaced
// Wi-Fi client paints its full total on each of its access point's serving cells of its band, or, with none,
// on each cell of the room the access point sits in. Cells sum. `pointAt(point) -> [x, y]|null` and
// `apAt(key) -> {x, y, floorId, roomIndex}|null` are the card's; another floor gives nothing here.
export function heatCells(list, floor, servingByBand, pointAt, apAt, step) {
  const q = (v) => Math.round(v * 1e6) / 1e6;
  const idx = (centre) => Math.floor(centre / step + 1e-9); // the epsilon keeps 0.45/0.15 on its own side
  const sums = new Map();
  const add = (i, j, v) => {
    const k = `${i}|${j}`;
    const e = sums.get(k);
    if (e) e.value += v; else sums.set(k, { x: q(i * step), y: q(j * step), value: v });
  };
  const paint = ([px, py], total) => {
    for (let i = idx(px - HEAT_CUT_M) - 1; (i + 0.5) * step <= px + HEAT_CUT_M; i++) {
      for (let j = idx(py - HEAT_CUT_M) - 1; (j + 0.5) * step <= py + HEAT_CUT_M; j++) {
        const d2 = ((i + 0.5) * step - px) ** 2 + ((j + 0.5) * step - py) ** 2;
        if (d2 <= HEAT_CUT_M ** 2) add(i, j, total * Math.exp(-d2 / (2 * HEAT_SIGMA_M ** 2)));
      }
    }
  };
  for (const c of list) {
    if (c.point) {
      const xy = pointAt(c.point);
      if (xy) paint(xy, c.total);
      continue;
    }
    if (!c.ap) continue;
    const ap = apAt(c.ap);
    if (c.link === "wired") {
      if (ap && ap.floorId === floor.floor_id) paint([ap.x, ap.y], c.total);
      continue;
    }
    let centres = (servingByBand[c.link] || []).filter((cell) => cell.ap === c.ap).map((cell) => [cell.x + step / 2, cell.y + step / 2]);
    if (!centres.length && ap && ap.floorId === floor.floor_id && ap.roomIndex != null) {
      centres = roomCentres(floor.rooms?.[ap.roomIndex]?.polygon, step);
    }
    // Two centres can fall in one lattice cell (rooms anchor their grids apart): a client paints a cell once.
    const cells = new Map(centres.map(([cx, cy]) => [`${idx(cx)}|${idx(cy)}`, [idx(cx), idx(cy)]]));
    for (const [i, j] of cells.values()) add(i, j, c.total);
  }
  return [...sums.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

// The centres of the global-lattice cells inside one room's polygon.
function roomCentres(poly, step) {
  if (!poly) return [];
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [px, py] of poly) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
  const out = [];
  for (let i = Math.floor(x0 / step); i * step < x1; i++) {
    for (let j = Math.floor(y0 / step); j * step < y1; j++) {
      const c = [(i + 0.5) * step, (j + 0.5) * step];
      if (pointInPolygon(c, poly)) out.push(c);
    }
  }
  return out;
}

// ---- Traffic links (SPEC-047) ----------------------------------------------------------------

export const IDLE_KEY = "domosenso.floorplan.traffic_idle"; // localStorage: false hides the idle clients (default: shown, small)
export const IDLE_MBPS = 0.01;                               // Mbit/s: a client under this is idle

// One colour per link: categorical and apart from the Serving map's (blue, orange, purple, cyan, pink...).
export const LINK_COLOURS = { wired: "#2ca02c", "2.4": "#d62728", 5: "#e6ab02", 6: "#c51b7d" };

// The i-th of n clients on a ring around `centre`, evenly spaced from the top, clockwise on the screen (y runs down).
export function ringPosition([cx, cy], i, n, radius = 1.2) {
  const a = (2 * Math.PI * i) / n;
  return [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];
}

// Size by the scale's decades: idle (0.01 Mbit/s and under) is the minimum, 1000 Mbit/s the maximum.
const decades = (total) => Math.max(0, Math.min(1, (Math.log10(Math.max(total, IDLE_MBPS)) - Math.log10(IDLE_MBPS)) / 5));
export const lineWidth = (total) => 1 + 4 * decades(total);   // screen px
export const dotRadius = (total) => 3 + 5 * decades(total);   // screen px
