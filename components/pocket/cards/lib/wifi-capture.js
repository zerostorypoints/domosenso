// How the phone measures its Wi-Fi for the survey (SPEC-045): which method this phone uses, the one-time
// code of a Measure, the iPhone Shortcut's URL and its readings (from Pocket's sensor or the x-callback
// result), and the Android Companion app's Wi-Fi sensors. Plain ES module: the window, storage and
// location are arguments, so it runs in Node's tests.
//
//   detectMethod(win) -> "companion" | "shortcut-event" | "shortcut-callback" | null
//   newCode(fill?) -> 12 base32 characters
//   savePending / loadPending / clearPending / resumeRoute: the Measure waiting for its reading, kept in
//       localStorage (the Companion app reloads the page on the return; Amendment 1), for PENDING_MS
//   shortcutUrl({code, n, mode, returnUrl}) -> the shortcuts:// URL that runs "Domosenso Wi-Fi"
//   parseScans(raw) -> [Scan]: the Shortcut's scans (every value a string) as numbers
//   readingFromSensor(state, pending) -> {scans, user_id} | null: sensor.domosenso_wifi_reading's reading
//   callbackResult(location) -> the x-callback `result` text or null
//   phoneEntities(hass, deviceId) / androidCollector({n, startedAt, entities}): the Companion app's scans
//
// Scan = {t, ssid, bssid, mac, dbm, noise, channel, standard, rx, tx, mhz}: numbers or null, MACs in lower
// case with colons.

export const SHORTCUT = "Domosenso Wi-Fi";
export const PENDING_MS = 120_000;
export const ANDROID_TIMEOUT_MS = 20_000;
export const MIN_SCANS = 3;
const PENDING_KEY = "pocket.wifi.pending";
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const NOT_CONNECTED = "not connected";

export function detectMethod(win) {
  if (win?.externalApp || win?.externalAppV2) return "companion";
  if (win?.webkit?.messageHandlers?.externalBus) return "shortcut-event";
  if (/iPhone|iPad|iPod/.test(win?.navigator?.userAgent ?? "")) return "shortcut-callback";
  return null;
}

export function newCode(fill = (a) => globalThis.crypto.getRandomValues(a)) {
  return [...fill(new Uint8Array(12))].map((b) => BASE32[b % 32]).join("");
}

export function savePending(storage, pending) {
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // blocked storage: the Measure still works while the page stays open
  }
}

export function loadPending(storage, now) {
  try {
    const pending = JSON.parse(storage.getItem(PENDING_KEY) ?? "null");
    return pending && Number.isFinite(pending.at) && now - pending.at <= PENDING_MS ? pending : null;
  } catch {
    return null;
  }
}

export function clearPending(storage) {
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    // nothing kept
  }
}

// The route Pocket opens on start while a Measure waits for its reading: the Companion app returns to the
// dashboard's first page, not to the survey (Amendment 1).
export const resumeRoute = (storage, now) => (loadPending(storage, now) ? "#/wifi-survey" : null);

// Every value percent-encoded (a space as %20): Shortcuts reads a + in its URL as a plus, not a space.
const query = (params) => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

export function shortcutUrl({ code, n, mode, returnUrl }) {
  const q = query({ name: mode === "callback" ? `${SHORTCUT} Safari` : SHORTCUT, input: "text",
    text: JSON.stringify({ code, n, mode, return: returnUrl }) });
  if (mode === "callback") return `shortcuts://x-callback-url/run-shortcut?${q}&x-success=${encodeURIComponent(returnUrl)}`;
  return `shortcuts://run-shortcut?${q}`;
}

const text = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === NOT_CONNECTED ? null : s;
};
// A number from the Shortcut's text: "864 Mbps", "-61,5", "36".
const number = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(v ?? ""));
  return m ? Number(m[0].replace(",", ".")) : null;
};
const mac = (v) => {
  const s = text(v)?.replaceAll("-", ":").toLowerCase();
  return s && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s) ? s : null;
};

// The scans that were on Wi-Fi: a scan without a signal or saying "Not Connected" is dropped.
export function parseScans(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    if ([s.ssid, s.bssid].some((v) => String(v ?? "").trim().toLowerCase() === NOT_CONNECTED)) continue;
    const dbm = number(s.rssi ?? s.dbm);
    if (dbm === null) continue;
    const channel = number(s.channel);
    out.push({ t: text(s.t), ssid: text(s.ssid), bssid: mac(s.bssid), mac: mac(s.mac), dbm, noise: number(s.noise),
      channel: channel === null ? null : Math.round(channel), standard: text(s.standard), rx: number(s.rx), tx: number(s.tx),
      mhz: number(s.mhz) });
  }
  return out;
}

export function readingFromSensor(state, pending) {
  if (!state || !pending || state.state !== pending.code) return null;
  const at = Date.parse(state.attributes?.at ?? "");
  if (!Number.isFinite(at) || at < pending.at) return null;
  return { scans: parseScans(state.attributes?.scans), user_id: state.attributes?.user_id ?? null };
}

export function callbackResult(location) {
  const fromHash = (location?.hash ?? "").split("?")[1];
  for (const query of [location?.search ?? "", fromHash ?? ""]) {
    const value = new URLSearchParams(query.replace(/^\?/, "")).get("result");
    if (value !== null) return value;
  }
  return null;
}

const KEYS = { signal: "wifi_signal_strength", bssid: "wifi_bssid", frequency: "wifi_frequency", link: "wifi_link_speed",
  connection: "wifi_connection" };

// The Companion app's Wi-Fi sensors of a mobile_app device, by key; null without its signal sensor.
export function phoneEntities(hass, deviceId) {
  const mine = Object.values(hass?.entities || {}).filter((e) => e.device_id === deviceId && e.platform === "mobile_app");
  const out = {};
  for (const [key, suffix] of Object.entries(KEYS)) {
    out[key] = mine.find((e) => e.entity_id.startsWith("sensor.") && e.entity_id.endsWith(`_${suffix}`))?.entity_id ?? null;
  }
  return out.signal ? out : null;
}

// The scans of one Android Measure. The page offers it every hass update and sends the update command
// again whenever offer() took a scan: a scan is a signal update newer than the start and the last one.
// state(now): "done" with n scans, or after the timeout with MIN_SCANS; "failed" after it with fewer.
export function androidCollector({ n, startedAt, entities, timeoutMs = ANDROID_TIMEOUT_MS }) {
  const scans = [];
  let last = startedAt;
  const value = (hass, key) => (entities[key] ? hass.states?.[entities[key]]?.state : null);
  return {
    scans,
    offer(hass) {
      const signal = hass.states?.[entities.signal];
      const at = Date.parse(signal?.last_updated ?? "");
      if (!Number.isFinite(at) || at <= last || scans.length >= n) return false;
      const dbm = number(signal.state);
      if (dbm === null) return false;
      last = at;
      scans.push({ t: new Date(at).toISOString(), ssid: text(value(hass, "connection")), bssid: mac(value(hass, "bssid")), mac: null,
        dbm, noise: null, channel: null, standard: null, rx: number(value(hass, "link")), tx: null, mhz: number(value(hass, "frequency")) });
      return true;
    },
    state(now) {
      if (scans.length >= n) return "done";
      if (now - startedAt <= timeoutMs) return "collecting";
      return scans.length >= MIN_SCANS ? "done" : "failed";
    },
  };
}
