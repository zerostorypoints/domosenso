// The checks of a phone's Wi-Fi reading before it is kept (SPEC-045). A hard failure keeps nothing and asks
// for a retry; a soft one shows its reason and the person keeps the reading or retries. The model's
// prediction is never a check: a reading that disagrees with it is what calibration needs. Plain ES module.
//
//   checkReading(scans, ctx) -> {checks, sample | null, needsBand, rates: {rx, tx}}
//     scans: [Scan] (lib/wifi-capture.js); ctx: {pending, now, userId, readingUserId, ssid, resolve}
//       pending        the Measure: {code, floor_id, x, y, at, method, phone}
//       readingUserId  the user who fired the reading (iPhone, event route); null when unknown
//       ssid           the network name expected, or null (not checked)
//       resolve        the floorplan card's resolveReading({bssid, mac, mhz, channel}) -> {ap, band, via}
//     checks: [{id, ok, level: "hard" | "soft", reason}], reason the translation key card.pocket.wifi.check.<id>
//   sampleWithBand(sample, band) -> the sample with the band the person picked

import { PENDING_MS, MIN_SCANS } from "./wifi-capture.js";

export const STEADY_DB = 6;
const ORDER = ["fresh", "phone", "wifi", "network", "count", "known_ap", "steady", "band"];
const HARD = new Set(["fresh", "phone", "wifi", "network", "count"]);

const median = (values) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round(((v[mid - 1] + v[mid]) / 2) * 10) / 10;
};
// The most common value (the later one on a tie), or null.
const majority = (values) => {
  const counts = new Map();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n >= counts.get(best)) best = v;
  return best;
};
const utc = (t) => {
  const ms = Date.parse(t ?? "");
  return Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(0, 19)}Z` : null;
};

export function checkReading(scans, ctx) {
  const { pending, now } = ctx;
  const bssid = majority(scans.map((s) => s.bssid));
  const group = bssid ? scans.filter((s) => s.bssid === bssid) : scans;
  const dbms = group.map((s) => s.dbm);
  const spread = dbms.length ? Math.max(...dbms) - Math.min(...dbms) : 0;
  const last = group.at(-1) ?? {};
  const resolved = scans.length
    ? ctx.resolve({ bssid, mac: majority(scans.map((s) => s.mac)), mhz: majority(group.map((s) => s.mhz)),
      channel: majority(group.map((s) => s.channel)) })
    : { ap: null, band: null, via: null };
  const known = resolved.via === "bssid" || resolved.via === "tracker";
  const fail = {
    fresh: !pending || now - pending.at > PENDING_MS || scans.some((s) => Date.parse(s.t ?? "") < pending.at),
    phone: ctx.readingUserId != null && ctx.readingUserId !== ctx.userId,
    wifi: scans.length === 0,
    network: ctx.ssid != null && scans.length > 0 && majority(scans.map((s) => s.ssid)) !== ctx.ssid,
    count: scans.length < MIN_SCANS,
    known_ap: scans.length > 0 && !(known && resolved.ap),
    steady: spread > STEADY_DB || new Set(scans.map((s) => s.bssid).filter(Boolean)).size > 1,
    band: scans.length > 0 && !resolved.band,
  };
  const checks = ORDER.map((id) => ({ id, ok: !fail[id], level: HARD.has(id) ? "hard" : "soft", reason: `card.pocket.wifi.check.${id}` }));
  const rates = { rx: median(scans.map((s) => s.rx)), tx: median(scans.map((s) => s.tx)) };
  if (checks.some((c) => !c.ok && c.level === "hard")) return { checks, sample: null, needsBand: false, rates };
  const channel = majority(group.map((s) => s.channel));
  const noise = median(group.map((s) => s.noise));
  const ap = known ? resolved.ap : null;
  const sample = {
    floor_id: pending.floor_id, x: pending.x, y: pending.y, t: utc(last.t) ?? utc(new Date(now).toISOString()),
    ...(resolved.band ? { band: resolved.band } : {}), ...(channel != null ? { channel } : {}), dbm: median(dbms),
    ...(noise != null ? { noise } : {}), ...(ap ? { ap } : {}), ...(bssid ? { bssid } : {}), source: "phone",
    phone: pending.phone, method: pending.method === "companion" ? "companion" : "shortcut", spread, scans: scans.slice(0, 20),
  };
  return { checks, sample, needsBand: !resolved.band, rates };
}

export const sampleWithBand = (sample, band) => ({ ...sample, band });
