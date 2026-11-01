// The sound maps of the Audio and media layer: the music over the room an audio sensor stands in,
// live from its 31-band spectrum. Pure: no DOM, so `node --test` covers it.
//
// The sensor only samples the room's response; the speakers are the sources. Each band's spatial
// pattern comes from a model of the room driven by the speakers, and the sensor's live reading sets
// that band's level. Below the transition the pattern is the room's modes in a rectangular box
// fitted to the room, both speakers driving them in phase (the bass of most music is mono), so the
// bass's peaks and nulls show. Above it, each speaker's direct sound, beaming forward more the
// higher the band, plus the reverberant field (Hopkins–Stryker). Between 160 and 400 Hz the two
// blend. Rooms of one open space are one acoustic room: one field, one box around them all.
// Furniture, doorways to other rooms and the space's shape beyond its box are not in the model.

import { pointInPolygon } from "./geometry.js";

export const THIRD_OCTAVE = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

// IEC 61672 A-weighting at the band centres, dB.
const A_WEIGHT = [-50.5, -44.7, -39.4, -34.6, -30.2, -26.2, -22.5, -19.1, -16.1, -13.4, -10.9, -8.6, -6.6, -4.8,
  -3.2, -1.9, -0.8, 0, 0.6, 1.0, 1.2, 1.3, 1.2, 1.0, 0.5, -0.1, -1.1, -2.5, -4.3, -6.6, -9.3];
const ZERO = THIRD_OCTAVE.map(() => 0);
const DIVERGING = ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"];

// Per map: the band weights (dB) and the fixed scale, so two evenings compare. `relative`: each spot
// against the room's average level instead of absolute.
export const SOUND = {
  spl: { weights: ZERO, lo: 30, hi: 90, unit: "dB",
    ramp: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"] },
  loudness: { weights: A_WEIGHT, lo: 20, hi: 85, unit: "dB(A)",
    ramp: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"] },
  effect: { weights: ZERO, lo: -6, hi: 6, unit: "dB", relative: true, ramp: DIVERGING },
  // The bass alone (to 160 Hz): where the room's modes pile it up and where they cancel it.
  bass: { weights: THIRD_OCTAVE.map((f) => (f <= 160 ? 0 : -200)), lo: -10, hi: 10, unit: "dB", relative: true,
    ramp: DIVERGING },
};

export const SOUND_STEP_M = 0.15;    // the field's cell
const C = 343;                       // speed of sound, m/s, at about 20 °C
const NEAREST_M = 0.3;               // closer than this the point-source term would run away
const EAR_M = 1.1;                   // the map is a slice at a seated listener's ears
const SPEAKER_Z_M = 0.9;             // the speakers' acoustic centre
const SENSOR_Z_M = 0.8;              // an audio sensor on a rack or shelf
const MODAL_TOP_HZ = 400;            // above this band the modes are left to the statistical model
const MODAL_ONLY_HZ = 160;           // up to this band the modes alone
const SENSOR_FLOOR = 0.1;            // a sensor in a null reads no less than a tenth of the room's mean
const SPL_ESTIMATE = 95;             // dB SPL at 0 dBFS when a board has no offset yet (the README's estimate)

// Reverberation time per band relative to the mid band: a furnished living room rings longer in
// the bass. Scaled by the configured mid-band RT60.
const RT_SHAPE = THIRD_OCTAVE.map((f) => (f < 100 ? 1.35 : f < 200 ? 1.2 : f < 400 ? 1.08 : f < 3000 ? 1 : 0.9));

// A spectrum state: 31 numbers, else null.
export function parseSpectrum(state) {
  if (typeof state !== "string") return null;
  const parts = state.split(",");
  if (parts.length !== THIRD_OCTAVE.length) return null;
  const out = parts.map(Number.parseFloat);
  return out.every(Number.isFinite) ? out : null;
}

// The audio sensors among the placed points: a point whose device (or a device joined to it) has a
// 31-band spectrum sensor. The offset (dB SPL = dBFS + offset) is the audio-sensor package's offset
// sensor of the device's area; without one, the README's estimate.
export function soundSensors(hass, points) {
  const byDevice = new Map();
  for (const [id, entry] of Object.entries(hass.entities || {})) {
    if (entry.device_id && id.startsWith("sensor.") && id.endsWith("_spectrum")) byDevice.set(entry.device_id, id);
  }
  const offsets = new Map();
  for (const [id, st] of Object.entries(hass.states || {})) {
    if (st?.attributes?.component === "audio-sensor" && id.endsWith("_spl_offset") && st.attributes.area) {
      offsets.set(st.attributes.area, id);
    }
  }
  const out = [];
  for (const p of points) {
    if (!p.placed) continue;
    const did = [p.device_id, ...(p.also || [])].find((d) => d && byDevice.has(d));
    if (!did) continue;
    const area = hass.areas?.[hass.devices?.[did]?.area_id]?.name;
    out.push({ at: [p.x, p.y], spectrum: byDevice.get(did), offset: (area && offsets.get(area)) || null });
  }
  return out;
}

// A sensor's spectrum in dB SPL and whether its offset was measured; null without a reading.
export function readSensor(hass, sensor) {
  const bands = parseSpectrum(hass.states?.[sensor.spectrum]?.state);
  if (!bands) return null;
  const st = sensor.offset && hass.states?.[sensor.offset];
  const v = Number.parseFloat(st?.state);
  const measured = Number.isFinite(v) && v > 0;
  const offset = measured ? v : SPL_ESTIMATE;
  const calibrated = measured && String(st.attributes?.calibrated) === "True";
  return { bands: bands.map((b) => b + offset), calibrated };
}

const polygonArea = (poly) => Math.abs(poly.reduce((s, [x, y], i) => {
  const [x2, y2] = poly[(i + 1) % poly.length];
  return s + x * y2 - x2 * y;
}, 0)) / 2;
const perimeter = (poly) => poly.reduce((s, [x, y], i) => {
  const [x2, y2] = poly[(i + 1) % poly.length];
  return s + Math.hypot(x2 - x, y2 - y);
}, 0);

// Each band's reverberation time from the mid-band RT60.
export const bandRt = (rt60) => RT_SHAPE.map((k) => rt60 * k);

// Each band's room constant R = S·ᾱ/(1 − ᾱ), ᾱ from Sabine's A = 0.161·V/T over the space's
// surface. An open space's walls are taken as its box's: the walls between its rooms are open.
export function roomConstants(polys, { height = 2.6, rt60 = 0.45 } = {}) {
  const floor = polys.reduce((s, p) => s + polygonArea(p), 0);
  const volume = floor * height;
  const box = polys.length > 1 ? roomBox(polys) : null;
  const surface = 2 * floor + (box ? 2 * (box.Lx + box.Ly) : perimeter(polys[0])) * height;
  return bandRt(rt60).map((t) => {
    const alpha = Math.min(0.9, (0.161 * volume) / t / surface);
    return (surface * alpha) / (1 - alpha);
  });
}

// The box the modes live in: x along the space's longest wall, y across it, as far as its rooms
// reach. `local` turns a plan point into box coordinates.
export function roomBox(polys) {
  let best = null;
  for (const poly of polys) {
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!best || len > best.len) best = { len, ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len };
    });
  }
  const { ux, uy } = best;
  const turn = ([x, y]) => [x * ux + y * uy, -x * uy + y * ux];
  const loc = polys.flat().map(turn);
  const x0 = Math.min(...loc.map((p) => p[0]));
  const y0 = Math.min(...loc.map((p) => p[1]));
  return {
    Lx: Math.max(...loc.map((p) => p[0])) - x0,
    Ly: Math.max(...loc.map((p) => p[1])) - y0,
    local: (p) => {
      const [u, v] = turn(p);
      return [u - x0, v - y0];
    },
  };
}

// The box's modes up to `fmax`, lowest first; `eps` their normalisation (2 per non-zero index).
export function roomModes(Lx, Ly, Lz, fmax) {
  const out = [];
  for (let nx = 0; (nx * C) / (2 * Lx) <= fmax; nx++) {
    for (let ny = 0; (ny * C) / (2 * Ly) <= fmax; ny++) {
      for (let nz = 0; (nz * C) / (2 * Lz) <= fmax; nz++) {
        const f = (C / 2) * Math.hypot(nx / Lx, ny / Ly, nz / Lz);
        if (f > fmax) continue;
        out.push({ nx, ny, nz, f, eps: (nx ? 2 : 1) * (ny ? 2 : 1) * (nz ? 2 : 1) });
      }
    }
  }
  return out.sort((a, b) => a.f - b.f);
}

const cosTable = (n, pos, len) => Array.from({ length: n + 1 }, (_, k) => Math.cos((k * Math.PI * pos) / len));

// The mean of |p|² over each modal band at each receiver ([x, y] in box coordinates, at height z):
// the sum of the modes, each driven by the speakers in phase and damped by the band's decay
// (δ = 6.91/T), at five frequencies across the band. Returns one Float64Array per band of `bands`.
function modalResponse(box, Lz, modes, speakers, receivers, z, bands, rts) {
  const N = { x: 0, y: 0, z: 0 };
  for (const m of modes) {
    N.x = Math.max(N.x, m.nx);
    N.y = Math.max(N.y, m.ny);
    N.z = Math.max(N.z, m.nz);
  }
  const shapeAt = ([x, y], h) => {
    const cx = cosTable(N.x, x, box.Lx);
    const cy = cosTable(N.y, y, box.Ly);
    const cz = cosTable(N.z, h, Lz);
    return modes.map((m) => cx[m.nx] * cy[m.ny] * cz[m.nz]);
  };
  const drive = new Float64Array(modes.length);
  for (const s of speakers) shapeAt(s, SPEAKER_Z_M).forEach((v, k) => (drive[k] += v));
  const out = bands.map(() => new Float64Array(receivers.length));
  // Per band and frequency, each mode's complex coefficient; a receiver is then a dot product.
  const coefs = bands.map((b, i) => {
    const delta = 6.91 / rts[i];
    const top = THIRD_OCTAVE[b] * 2 ** (1 / 6) * 1.25;
    const count = modes.findIndex((m) => m.f > top);
    const used = count < 0 ? modes.length : count;
    return [-2, -1, 0, 1, 2].map((k) => {
      const w = 2 * Math.PI * THIRD_OCTAVE[b] * 2 ** (k / 12);
      const re = new Float64Array(used);
      const im = new Float64Array(used);
      for (let m = 0; m < used; m++) {
        const wm = 2 * Math.PI * modes[m].f;
        const a = wm * wm - w * w;
        const c = 2 * delta * w;
        const g = (modes[m].eps * drive[m]) / (a * a + c * c);
        re[m] = g * a;
        im[m] = -g * c;
      }
      return { re, im, used };
    });
  });
  receivers.forEach((r, j) => {
    const psi = shapeAt(r, z);
    coefs.forEach((freqs, i) => {
      let sum = 0;
      for (const { re, im, used } of freqs) {
        let pr = 0;
        let pi = 0;
        for (let m = 0; m < used; m++) {
          pr += re[m] * psi[m];
          pi += im[m] * psi[m];
        }
        sum += pr * pr + pi * pi;
      }
      out[i][j] = sum / freqs.length;
    });
  });
  return out;
}

// How strongly a speaker beams forward in a band: none in the bass, most of a cardioid in the treble.
const beaming = (f) => 0.85 * Math.min(1, Math.max(0, Math.log2(f / 200) / Math.log2(4000 / 200)));

// The statistical energy factor of band `b` at a plan point: each speaker's direct sound (half the
// power each, its directivity towards the point) plus the reverberant field.
function statistical(at, z, speakers, facing, R, b) {
  const a = beaming(THIRD_OCTAVE[b]);
  let direct = 0;
  for (const s of speakers) {
    const dx = at[0] - s[0];
    const dy = at[1] - s[1];
    const flat = Math.hypot(dx, dy);
    const r = Math.max(NEAREST_M, Math.hypot(flat, z - SPEAKER_Z_M));
    const cos = flat > 1e-6 ? (dx * facing[0] + dy * facing[1]) / flat : 1;
    const q = 1 - a + a * 3 * ((1 + cos) / 2) ** 2;      // a cardioid's power pattern averages 1/3
    direct += q / (4 * Math.PI * r * r) / speakers.length;
  }
  return direct + 4 / R[b];
}

// The share of the modal model in a band: all of it up to MODAL_ONLY_HZ, none from MODAL_TOP_HZ.
const modalShare = (f) => (f <= MODAL_ONLY_HZ ? 1 : f >= MODAL_TOP_HZ ? 0
  : Math.log(MODAL_TOP_HZ / f) / Math.log(MODAL_TOP_HZ / MODAL_ONLY_HZ));

// The field's geometry for one space (its rooms' polygons): its cells and, per cell and band, the factor that carries the
// sensors' energy there (the model's value at the cell over its value at the sensors). Computed
// once per room, speakers and sensors; a frame is then a weighted sum. Without speakers the sensors
// stand in for them.
export function soundGrid(polys, speakers, sensorsAt, opts = {}, step = SOUND_STEP_M) {
  const height = opts.height ?? 2.6;
  const rt60 = opts.rt60 ?? 0.45;
  const sources = speakers.length ? speakers : sensorsAt;
  const R = roomConstants(polys, { height, rt60 });
  const rts = bandRt(rt60);
  const nb = THIRD_OCTAVE.length;
  const all = polys.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const cols = Math.max(1, Math.ceil((Math.max(...xs) - x0) / step));
  const rows = Math.max(1, Math.ceil((Math.max(...ys) - y0) / step));
  const inside = new Uint8Array(cols * rows);
  const cells = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = [x0 + (i + 0.5) * step, y0 + (j + 0.5) * step];
      inside[j * cols + i] = polys.some((poly) => pointInPolygon(c, poly)) ? 1 : 0;
      cells.push(c);
    }
  }
  // The speakers face the room: from their middle towards the centre of the room they stand in.
  const mid = [0, 1].map((k) => sources.reduce((s, p) => s + p[k], 0) / sources.length);
  const home = polys.find((poly) => pointInPolygon(mid, poly)) ?? polys[0];
  const centre = [0, 1].map((k) => home.reduce((s, p) => s + p[k], 0) / home.length);
  const len = Math.hypot(centre[0] - mid[0], centre[1] - mid[1]) || 1;
  const facing = [(centre[0] - mid[0]) / len, (centre[1] - mid[1]) / len];

  const modalBands = THIRD_OCTAVE.map((f, b) => b).filter((b) => modalShare(THIRD_OCTAVE[b]) > 0);
  const box = roomBox(polys);
  const top = THIRD_OCTAVE[modalBands[modalBands.length - 1]] * 2 ** (1 / 6) * 1.25;
  const modes = roomModes(box.Lx, box.Ly, height, top);
  const src = sources.map(box.local);
  const modalRts = modalBands.map((b) => rts[b]);
  const modalCells = modalResponse(box, height, modes, src, cells.map(box.local), EAR_M, modalBands, modalRts);
  const modalSensors = modalResponse(box, height, modes, src, sensorsAt.map(box.local), SENSOR_Z_M, modalBands, modalRts);

  const factors = new Float32Array(cols * rows * nb);
  const meanInside = (vals) => {
    let s = 0;
    let n = 0;
    for (let k = 0; k < vals.length; k++) if (inside[k]) (s += vals[k]), n++;
    return n ? s / n : 1;
  };
  for (let b = 0; b < nb; b++) {
    const share = modalShare(THIRD_OCTAVE[b]);
    const cellsB = new Float64Array(cells.length);
    let atSensors = 0;
    if (share < 1) {
      const stat = cells.map((c) => statistical(c, EAR_M, sources, facing, R, b));
      const mean = meanInside(stat);
      stat.forEach((v, k) => (cellsB[k] += ((1 - share) * v) / mean));
      for (const s of sensorsAt) atSensors += ((1 - share) * statistical(s, SENSOR_Z_M, sources, facing, R, b)) / mean / sensorsAt.length;
    }
    if (share > 0) {
      const i = modalBands.indexOf(b);
      const mean = meanInside(modalCells[i]) || 1;
      modalCells[i].forEach((v, k) => (cellsB[k] += (share * v) / mean));
      atSensors += modalSensors[i].reduce((s, v) => s + v, 0) / sensorsAt.length * share / mean;
    }
    const at = Math.max(SENSOR_FLOOR, atSensors);
    for (let k = 0; k < cells.length; k++) factors[k * nb + b] = cellsB[k] / at;
  }
  return { x0, y0, cols, rows, step, inside, factors };
}

// The level (dB) of every cell from the sensors' mean band energies and a map's weights; with
// `relative`, against the room's mean energy.
export function fieldLevels(grid, energy, weights, relative = false) {
  const nb = THIRD_OCTAVE.length;
  const w = weights.map((dB, b) => 10 ** (dB / 10) * energy[b]);
  const out = new Float32Array(grid.cols * grid.rows);
  let sum = 0;
  let n = 0;
  for (let k = 0; k < out.length; k++) {
    let e = 0;
    for (let b = 0; b < nb; b++) e += w[b] * grid.factors[k * nb + b];
    out[k] = e > 0 ? 10 * Math.log10(e) : -Infinity;
    if (grid.inside[k] && e > 0) (sum += e), n++;
  }
  if (relative && n) {
    const mean = 10 * Math.log10(sum / n);
    for (let k = 0; k < out.length; k++) out[k] -= mean;
  }
  return out;
}

// The weighted level at the sensors themselves (every factor there is 1 on average).
export function sensorLevel(energy, weights) {
  const e = weights.reduce((s, dB, b) => s + 10 ** (dB / 10) * energy[b], 0);
  return e > 0 ? 10 * Math.log10(e) : -Infinity;
}

const hex = (c) => [16, 8, 0].map((s) => (parseInt(c.slice(1), 16) >> s) & 255);

// 256 RGB entries along a map's ramp.
export function lut(ramp) {
  const stops = ramp.map(hex);
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const a = Math.min(stops.length - 2, Math.floor(t));
    const f = t - a;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(stops[a][k] * (1 - f) + stops[a + 1][k] * f);
  }
  return out;
}

// RGBA pixels of the field, transparent outside the room.
export function paint(grid, levels, scale, table, alpha = 220) {
  const px = new Uint8ClampedArray(grid.cols * grid.rows * 4);
  for (let k = 0; k < levels.length; k++) {
    if (!grid.inside[k]) continue;
    const t = Math.max(0, Math.min(1, (levels[k] - scale.lo) / (scale.hi - scale.lo)));
    const i = Math.round(t * 255) * 3;
    px.set([table[i], table[i + 1], table[i + 2], alpha], k * 4);
  }
  return px;
}

// Ballistics on band energies: a fast rise, a slower fall, so the field breathes with the music
// between the sensor's frames rather than stepping.
export function approach(current, target, dtMs, riseMs = 60, fallMs = 350) {
  for (let b = 0; b < target.length; b++) {
    const tau = target[b] > current[b] ? riseMs : fallMs;
    current[b] += (target[b] - current[b]) * (1 - Math.exp(-dtMs / tau));
  }
  return current;
}

// Mean band energies over the sensors' readings.
export function meanEnergy(readings) {
  const nb = THIRD_OCTAVE.length;
  const out = new Float64Array(nb);
  for (const r of readings) r.bands.forEach((dB, b) => (out[b] += 10 ** (dB / 10) / readings.length));
  return out;
}

// The spaces with an audio sensor: a room, or all rooms of the open space it belongs to (`groups`,
// lists of room indices). Each: {rooms: [index], sensors}.
export function soundSpaces(polygons, groups, sensors) {
  const groupOf = new Map(groups.flatMap((g) => g.map((i) => [i, g])));
  const out = new Map();
  for (const s of sensors) {
    const i = polygons.findIndex((poly) => pointInPolygon(s.at, poly));
    if (i < 0) continue;
    const rooms = groupOf.get(i) ?? [i];
    const key = rooms.join(",");
    if (!out.has(key)) out.set(key, { rooms, sensors: [] });
    out.get(key).sensors.push(s);
  }
  return [...out.values()];
}
