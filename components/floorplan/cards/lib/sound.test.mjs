import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOUND, THIRD_OCTAVE, parseSpectrum, soundSensors, readSensor, roomConstants, soundGrid, fieldLevels, sensorLevel,
  meanEnergy, approach, soundSpaces,
} from "./sound.js";

const ROOM = [[0, 0], [6, 0], [6, 5], [0, 5]];
const flat = (dB) => THIRD_OCTAVE.map(() => dB);
const csv = (dB) => flat(dB).join(",");

test("a spectrum is exactly 31 numbers", () => {
  assert.equal(parseSpectrum(csv(-40)).length, 31);
  assert.equal(parseSpectrum("1,2,3"), null);
  assert.equal(parseSpectrum(`${csv(-40).slice(0, -3)}x`), null);
  assert.equal(parseSpectrum(undefined), null);
});

const hass = {
  entities: {
    "sensor.board_spectrum": { device_id: "board" },
    "sensor.board_sound_level": { device_id: "board" },
    "sensor.other_temperature": { device_id: "other" },
  },
  devices: { board: { area_id: "living" } },
  areas: { living: { name: "Living room" } },
  states: {
    "sensor.board_spectrum": { state: csv(-50) },
    "sensor.living_room_spl_offset": { state: "95.0", attributes: { component: "audio-sensor", area: "Living room", calibrated: "False" } },
  },
};

test("an audio sensor is a placed point whose device has a spectrum, with its area's offset", () => {
  const points = [{ device_id: "board", x: 1, y: 1, placed: true }, { device_id: "other", x: 2, y: 2, placed: true },
    { device_id: "board", x: 3, y: 3, placed: false }];
  assert.deepEqual(soundSensors(hass, points), [{ at: [1, 1], spectrum: "sensor.board_spectrum", offset: "sensor.living_room_spl_offset" }]);
  // A device joined to the point counts too.
  assert.equal(soundSensors(hass, [{ device_id: "other", also: ["board"], x: 0, y: 0, placed: true }]).length, 1);
});

test("a reading adds the offset; a missing or zero offset falls back to the estimate", () => {
  const sensor = { spectrum: "sensor.board_spectrum", offset: "sensor.living_room_spl_offset" };
  const r = readSensor(hass, sensor);
  assert.equal(r.bands[0], 45);
  assert.equal(r.calibrated, false);
  assert.equal(readSensor(hass, { ...sensor, offset: null }).bands[0], 45);
  assert.equal(readSensor(hass, { spectrum: "sensor.none", offset: null }), null);
});

test("the bass reverberates longer: a smaller room constant than the treble", () => {
  const R = roomConstants([ROOM], { height: 2.5, rt60: 0.5 });
  assert.equal(R.length, 31);
  assert.ok(R[5] < R[17] && R[17] < R[28]);
});

const SPEAKERS = [[2, 1.2], [4, 1.2]];
const SENSOR = [3, 0.3];
const at = (grid, levels, x, y) => levels[Math.floor((y - grid.y0) / grid.step) * grid.cols + Math.floor((x - grid.x0) / grid.step)];

test("the speakers drive the field: the treble is loudest in front of them, not at the sensor behind", () => {
  const grid = soundGrid([ROOM], SPEAKERS, [SENSOR], { height: 2.5, rt60: 0.5 }, 0.25);
  const treble = meanEnergy([{ bands: THIRD_OCTAVE.map((f) => (f >= 2000 ? 70 : 0)) }]);
  const levels = fieldLevels(grid, treble, SOUND.spl.weights);
  assert.ok(at(grid, levels, 3, 2.5) > at(grid, levels, 3, 0.3));
  assert.ok(at(grid, levels, 3, 2.5) > at(grid, levels, 3, 4.8));
  // The reverberant field holds the far end up: a few dB down, not 20.
  assert.ok(at(grid, levels, 3, 2.5) - at(grid, levels, 3, 4.8) < 10);
});

test("the bass map has peaks and nulls around the room's average", () => {
  const grid = soundGrid([ROOM], SPEAKERS, [SENSOR], { height: 2.5 }, 0.25);
  const kick = meanEnergy([{ bands: THIRD_OCTAVE.map((f) => (f === 50 || f === 63 ? 80 : 40)) }]);
  const levels = [...fieldLevels(grid, kick, SOUND.bass.weights, true)].filter((v, k) => grid.inside[k]);
  assert.ok(Math.min(...levels) < -3 && Math.max(...levels) > 2);
  const mean = 10 * Math.log10(levels.reduce((s, v) => s + 10 ** (v / 10), 0) / levels.length);
  assert.ok(Math.abs(mean) < 0.01);
});

test("the A-weighted map falls off faster than the unweighted one when bass dominates", () => {
  const grid = soundGrid([ROOM], SPEAKERS, [SENSOR], {}, 0.25);
  const energy = meanEnergy([{ bands: THIRD_OCTAVE.map((f) => (f < 200 ? 80 : 60)) }]);
  const drop = (w) => {
    const l = fieldLevels(grid, energy, w);
    return at(grid, l, 3, 2) - at(grid, l, 3, 4.8);
  };
  assert.ok(drop(SOUND.loudness.weights) > drop(SOUND.spl.weights));
});

test("without speakers the sensors stand in", () => {
  const grid = soundGrid([ROOM], [], [SENSOR], {}, 0.5);
  assert.ok(grid.factors.every((v) => Number.isFinite(v) && v > 0));
});

test("ballistics rise fast and fall slowly", () => {
  const cur = Float64Array.from([1, 1]);
  approach(cur, [2, 0], 60);
  assert.ok(cur[0] - 1 > 1 - cur[1]);
});

test("a sensor's space is its room, or every room of its open space", () => {
  const polys = [ROOM, [[0, 5], [6, 5], [6, 7], [0, 7]], [[10, 0], [12, 0], [12, 2], [10, 2]]];
  assert.deepEqual(soundSpaces(polys, [], [{ at: [1, 1] }, { at: [20, 20] }]).map((s) => s.rooms), [[0]]);
  assert.deepEqual(soundSpaces(polys, [[0, 1]], [{ at: [1, 1] }]).map((s) => s.rooms), [[0, 1]]);
});

test("an open space is one field: the kitchen beyond the living room gets the music too", () => {
  const kitchen = [[0, 5], [6, 5], [6, 7], [0, 7]];
  const grid = soundGrid([ROOM, kitchen], SPEAKERS, [SENSOR], {}, 0.25);
  const levels = fieldLevels(grid, meanEnergy([{ bands: flat(70) }]), SOUND.spl.weights);
  const v = at(grid, levels, 3, 6.5);
  assert.ok(Number.isFinite(v) && v > 50);
});
