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

test("labels keep clear of other boxes given, such as room names", () => {
  const name = { x0: 1.5, x1: 2.5, y0: 1.95, y1: 2.35 };   // a room's name just under the dot
  const [l] = layoutLabels([{ key: "a", at: [2, 1.8], lines: ["20.2 °C", "41 %"] }], { rooms, px: PX, obstacles: [name] });
  assert.ok(!overlap(l.box, name), JSON.stringify(l.box));
});

test("a crowded row of three-line labels along a wall finds room without covering each other", () => {
  // Four plants 25 cm apart, 5 cm under the room's top wall (a map's labels: light, temperature, soil).
  const items = [0.5, 0.75, 1.0, 1.25].map((x, i) => ({ key: `p${i}`, at: [x, 0.05], lines: ["122 lx", "20.5 °C", "23 %"] }));
  const out = layoutLabels(items, { rooms, px: PX });
  for (let i = 0; i < out.length; i++) {
    assert.ok(!crosses(out[i].box), `${out[i].key} crosses a wall`);
    for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i].box, out[j].box), `${out[i].key} / ${out[j].key}`);
  }
});

test("a dot in a room's corner, its neighbour's label beside it, gets a spot of its own", () => {
  // Measured on a real plan: the corner dot's centred spots cross the side wall and the spots to
  // its right sit on the neighbour's label.
  const corner = [[0, 0.3], [5.4, 0.3], [5.4, 7], [0, 7]];
  const items = [
    { key: "near", at: [1.6, 0.53], lines: ["113 lx", "21.3 °C", "20 %"] },
    { key: "corner", at: [0.18, 0.45], lines: ["122 lx", "20.5 °C", "23 %"] },
  ];
  const [a, b] = layoutLabels(items, { rooms: [corner], px: 0.0196 });
  assert.ok(!overlap(a.box, b.box), `${JSON.stringify(a.box)} / ${JSON.stringify(b.box)}`);
  assert.ok(!boxCrossesWalls(b.box, [corner]));
});
