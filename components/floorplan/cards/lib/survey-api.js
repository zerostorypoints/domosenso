// The floorplan card's survey API for a host that measures elsewhere (SPEC-045: Pocket's Wi-Fi survey with a
// phone): a reading's access point and band, and the plan's samples added or taken out. Pure functions of the
// plan, `hass` and the rules (wifi-rules.json); the card's methods call them.

import { BANDS, apKeyOf } from "./wifi.js";
import { apOfBssid, apOfClient } from "./wifi-sources.js";

const MAX_SAMPLES = 2000;
const bandsOf = (ap) => ap.bands ?? BANDS;
const accessPoints = (doc) => (doc.floors || []).flatMap((f) => f.access_points || []);

// The band of a reading from its frequency in MHz, else its channel. 6 GHz channels are 1, 5, 9, …, 233
// (≡ 1 mod 4), so a number is ambiguous where another band uses it too: 2.4 GHz 1, 5, 9, 13 and 5 GHz
// 149–177. Those are the other band's when no access point serves 6 GHz (`six` false), else null (unclear).
// 5 GHz 36–144 are multiples of 4, so 37–145 are 6 GHz.
export function bandOf({ mhz, channel } = {}, six) {
  if (Number.isFinite(mhz)) {
    if (mhz >= 2400 && mhz <= 2500) return "2.4";
    if (mhz >= 5150 && mhz <= 5895) return "5";
    if (mhz >= 5925 && mhz <= 7125) return "6";
    return null;
  }
  if (!Number.isInteger(channel) || channel < 1 || channel > 233) return null;
  const sixNumber = channel % 4 === 1;
  if (channel <= 14) return sixNumber && six ? null : "2.4";
  if (channel >= 149 && channel <= 177) return six ? null : "5";
  if (channel >= 36 && channel <= 144) return sixNumber ? "6" : "5";
  return sixNumber ? "6" : null;
}

// The access point (a key of the plan's access points, or null) and band of a reading
// {bssid, mac, mhz, channel}, and how they were found: the BSSID matched to an access point's BSSID sensor;
// else the router's client tracker for the phone's MAC; else the band from bandOf, no access point.
export function resolveReading(hass, doc, rules, reading, ix = null) {
  const aps = accessPoints(doc);
  const keys = aps.map(apKeyOf);
  const byBssid = reading.bssid ? apOfBssid(hass, keys, rules, reading.bssid, ix) : null;
  if (byBssid) return { ...byBssid, via: "bssid" };
  const byTracker = reading.mac ? apOfClient(hass, keys, rules, [reading.mac], ix) : null;
  if (byTracker) return { ...byTracker, via: "tracker" };
  const band = bandOf(reading, aps.some((a) => bandsOf(a).includes("6")));
  return { ap: null, band, via: band ? "channel" : null };
}

// The plan with `samples` added after its own; null when that would pass the 2000-sample cap.
export function appendSamples(doc, samples) {
  const have = doc.wifi?.samples || [];
  if (have.length + samples.length > MAX_SAMPLES) return null;
  return { ...doc, wifi: { ...doc.wifi, samples: [...have, ...samples] } };
}

// The plan without the samples taken at `t` by `phone`; the same plan when there is none.
export function removeSample(doc, t, phone) {
  const have = doc.wifi?.samples || [];
  const kept = have.filter((s) => !(s.t === t && s.phone === phone));
  return kept.length === have.length ? doc : { ...doc, wifi: { ...doc.wifi, samples: kept } };
}
