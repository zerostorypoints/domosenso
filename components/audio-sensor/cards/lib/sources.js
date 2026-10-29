// Reading the configured entity into plain numbers, and a simulated room for demo mode.

export const THIRD_OCTAVE = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

// Nearest band index of a frequency, on the log axis.
export function nearestBand(hz) {
  let best = 0;
  for (let i = 1; i < THIRD_OCTAVE.length; i++) {
    if (Math.abs(Math.log(THIRD_OCTAVE[i] / hz)) < Math.abs(Math.log(THIRD_OCTAVE[best] / hz))) best = i;
  }
  return best;
}

const EMPTY = new Set(["", "unavailable", "unknown"]);
// Number("") and Number(null) are 0; an empty entry must stay "no reading".
const num = (x) => (x === null || x === undefined || (typeof x === "string" && x.trim() === "") ? NaN : Number(x));

export function parseSpectrum(state) {
  if (state === undefined || state === null || EMPTY.has(String(state).trim())) return null;
  return String(state).split(",").map(num);
}

// Power sum of levels in dB; NaN entries do not count.
export function energySum(dbs) {
  let p = 0;
  for (const d of dbs) if (!Number.isNaN(d)) p += 10 ** (d / 10);
  return p > 0 ? 10 * Math.log10(p) : 0;
}

const shift = (v, offset) => (Number.isFinite(v) ? v + offset : v);

export function readSource(source, hass) {
  const entity = hass?.states?.[source?.entity];
  if (!entity) return null;
  const raw = source.attribute ? entity.attributes?.[source.attribute] : entity.state;
  const offset = Number.isFinite(source.offset) ? source.offset : 0;
  // The frontend's entity objects carry last_changed and last_updated only (no last_reported), and
  // an unchanged value sends no update at all: a new last_updated is a new reading.
  const updated = Date.parse(entity.last_updated);
  const unit = entity.attributes?.unit_of_measurement;

  if (source.kind === "scalar") {
    if (raw === undefined || raw === null || EMPTY.has(String(raw).trim())) return null;
    return { value: shift(num(raw), offset), updated, unit };
  }

  const list = Array.isArray(raw) ? raw.map(num) : parseSpectrum(raw);
  if (!list) return null;
  // The only axis (normaliseConfig refuses others): exactly the 31 bands.
  if (list.length !== THIRD_OCTAVE.length) {
    return { error: "count", count: list.length, updated, unit };
  }
  // The third-octave axis is levels in dB; the device's CSV sensor carries no unit of its own.
  return { values: list.map((v) => shift(v, offset)), updated, unit: unit ?? "dB" };
}

// ---- Demo room (simulated music scenarios; labels come from translations) ----
const lg = Math.log2;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const bump = (f, fc, w) => Math.exp(-(lg(f / fc) ** 2) / (2 * w * w));
const tilt = (f, L) => { let d = 0; if (f < 60) d = -6 * lg(60 / f); else if (f > 250) d = -2.5 * lg(f / 250); if (f > 8000) d -= 4 * lg(f / 8000); return L + d; };
const wob = (i, t) => 1.2 * Math.sin(t * 0.9 + i * 1.7) + 0.8 * Math.sin(t * 2.3 + i * 0.6);
const smooth01 = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

export const SCENARIOS = {
  electronic: (f, i, t) => {
    const ph = t % 0.5, bar = t % 16, hp = (t + 0.25) % 0.5;
    const drop = bar > 8 && bar < 12 ? Math.sin(Math.PI * (bar - 8) / 4) : 0;
    return tilt(f, 74) + wob(i, t) + 20 * Math.exp(-ph / 0.12) * bump(f, 55, 0.5) + 14 * drop * bump(f, 40, 0.6)
      + 7 * Math.exp(-hp / 0.07) * bump(f, 10000, 0.6) + 6 * (0.5 + 0.5 * Math.sin(t * 0.4)) * bump(f, 800, 1);
  },
  jazz: (f, i, t) => {
    const n = Math.floor(t / 0.6), m = Math.floor(t / 2.1);
    return tilt(f, 58) + wob(i, t) + 9 * Math.exp(-(t % 0.6) / 0.4) * bump(f, 70 + hash(n) * 80, 0.35)
      + 5 * (0.6 + 0.4 * Math.sin(t * 9)) * bump(f, 7000, 0.8) + 7 * Math.exp(-(t % 2.1) / 1.2) * bump(f, 300 + hash(m + 7) * 600, 0.8);
  },
  vocal: (f, i, t) => {
    const phrase = smooth01(Math.min((t % 5) / 0.4, (4.2 - (t % 5)) / 0.4));
    const m = Math.floor(t / 2.4);
    return tilt(f, 60) - (f < 100 ? 6 : 0) + wob(i, t) + 14 * phrase * bump(f, 500 + 200 * Math.sin(t * 1.3), 0.45)
      + 10 * phrase * bump(f, 2200 + 500 * Math.sin(t * 0.8), 0.3) + 6 * Math.exp(-(t % 2.4) / 1.4) * bump(f, 250 + hash(m) * 500, 0.7);
  },
  orchestra: (f, i, t) => {
    const c = t % 40;
    const L = c < 30 ? 48 + 38 * (c / 30) ** 1.6 : 48 + 38 * Math.exp(-(c - 30) / 1.2);
    const timp = c > 24 && c < 30 ? 14 * Math.exp(-(c % 0.75) / 0.25) * bump(f, 70, 0.4) : 0;
    return tilt(f, L) + wob(i, t) + 4 * bump(f, 1000, 1.5) + timp;
  },
  quiet: (f, i, t) => {
    const c = t % 14;
    const door = c > 6 ? 40 * Math.exp(-(c - 6) / 0.5) * bump(f, 120, 1.6) : 0;
    const voice = c > 8 && c < 11 ? 22 * smooth01(Math.min(c - 8, 11 - c) / 0.5) * bump(f, 700, 0.8) : 0;
    return 26 + wob(i, t) * 0.6 + 10 * bump(f, 50, 0.1) + 6 * bump(f, 100, 0.1) + door + voice;
  },
};

export class Demo {
  constructor(scenario) {
    this.fn = SCENARIOS[scenario] ?? SCENARIOS.electronic;
  }

  // Times before 0 are clamped: the orchestra's power curve is NaN for negative t.
  // Linear power of each band, averaged over the 200 ms ending at tS, as the on-device analyzer reports.
  #powers(tS) {
    return THIRD_OCTAVE.map((f, i) => {
      let p = 0;
      for (let k = 0; k < 4; k++) p += 10 ** (this.fn(f, i, Math.max(0, tS - 0.2 + 0.05 * k)) / 10);
      return p / 4;
    });
  }

  bands(tS) {
    return this.#powers(tS).map((p) => 10 * Math.log10(p));
  }

  // The 1 s level: energy mean of the last five band sums. Recomputed, not remembered, so it stays deterministic.
  level(tS) {
    let p = 0;
    for (let k = 0; k < 5; k++) p += this.#powers(tS - 0.2 * k).reduce((a, b) => a + b, 0);
    return 10 * Math.log10(p / 5);
  }
}
