import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutLabels, labelBox, boxCrossesWalls } from "./labels.js";

const PX = 0.01; // 100 screen pixels per metre
const room = [[0, 0], [5, 0], [5, 4], [0, 4]];
const next = [[5, 0], [8, 0], [8, 4], [5, 4]];
const rooms = [room, next];

const crosses = (box) => boxCrossesWalls(box, rooms);
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test("a label in open space sits just below its dot, with no leader", () => {
  const [l] = layoutLabels([{ key: "a", at: [2, 1], lines: ["21.5 °C", "48 %"] }], { rooms, px: PX });
  assert.ok(l.box.y0 > 1 && l.box.y0 - 1 < 0.2, JSON.stringify(l.box));
  assert.ok(Math.abs((l.box.x0 + l.box.x1) / 2 - 2) < 1e-9, "centred under the dot");
  assert.equal(l.leader, false);
});

test("a label that would cross a wall goes where it does not", () => {
  // A dot 5 cm above the bottom wall: below would cross it.
  const [low] = layoutLabels([{ key: "a", at: [2, 3.95], lines: ["21.5 °C", "48 %"] }], { rooms, px: PX });
  assert.ok(!crosses(low.box), JSON.stringify(low.box));
  // A dot by the wall between the rooms, with a wide four-line label.
  const [side] = layoutLabels([{ key: "b", at: [4.95, 2], lines: ["21.59 °C", "34.23 %", "648 ppm", "2.7 µg/m³"] }],
    { rooms, px: PX });
  assert.ok(!crosses(side.box), JSON.stringify(side.box));
  assert.ok(side.box.x1 <= 5 + 1e-9, "stays in the dot's own room");
});

test("labels of dots close together do not cover each other or the dots", () => {
  const items = [
    { key: "a", at: [2, 2], lines: ["21.5 °C", "48 %"] },
    { key: "b", at: [2.2, 2], lines: ["19.0 °C", "52 %"] },
    { key: "c", at: [2.1, 2.2], lines: ["600 ppm"] },
  ];
  const out = layoutLabels(items, { rooms, px: PX });
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i].box, out[j].box), `${out[i].key} / ${out[j].key}`);
    for (const it of items) {
      const r = 8 * PX;
      const dot = { x0: it.at[0] - r, y0: it.at[1] - r, x1: it.at[0] + r, y1: it.at[1] + r };
      assert.ok(!overlap(out[i].box, dot), `${out[i].key} covers dot ${it.key}`);
    }
  }
});

test("a label moved away from its dot gets a leader", () => {
  // Crowded: a ring of dots round the one whose label must find room farther out.
  const ring = [[2, 1.85], [2, 2.15], [1.85, 2], [2.15, 2], [1.88, 1.88], [2.12, 2.12], [1.88, 2.12], [2.12, 1.88]];
  const items = [{ key: "centre", at: [2, 2], lines: ["21.5 °C", "48 %"] },
    ...ring.map((at, i) => ({ key: `r${i}`, at, lines: [] }))];
  const [centre] = layoutLabels(items, { rooms, px: PX });
  assert.equal(centre.leader, true);
});

test("labelBox sizes a label from its longest line and line count", () => {
  const box = labelBox([0, 0], ["1234567890", "1"], PX);
  assert.ok(box.x1 - box.x0 > 0.6 && box.x1 - box.x0 < 0.8, `width ${box.x1 - box.x0}`);
  assert.ok(Math.abs(box.y1 - box.y0 - 0.3) < 1e-9, "15 px a line");
});
