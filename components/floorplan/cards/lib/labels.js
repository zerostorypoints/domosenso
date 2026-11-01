// Where each marker's readings go (the maintainer: not over walls, not over each other; a line to
// the dot when there is no room beside it). Pure: plan coordinates in metres, `px` metres per
// screen pixel, so sizes are those the card draws (13 px text, 15 px a line).
//
// Each label tries spots round its dot, nearest first (below, above, right, left, the diagonals),
// then the same farther out; it takes the spot with the lowest cost: crossing a wall, leaving the
// dot's room, covering a label placed before it or any dot, then distance. A label that had to
// move out of the first ring gets a leader line to its dot.

import { pointInPolygon } from "./geometry.js";

const FONT_PX = 13;
const LINE_PX = 15;
export const CHAR_EM = 0.55;   // an average character's width, in em
const PAD_PX = 4;
const GAP_PX = 12;        // from the dot's centre to the label's near edge, in the first ring
const DOT_PX = 8;         // a dot's radius, as an obstacle
const RINGS = 4;
const COST = { wall: 1000, room: 500, label: 200, dot: 100, ring: 10 };

// The box of a label whose top edge is centred on `[cx, top]`.
export function labelBox([cx, top], lines, px) {
  const longest = Math.max(0, ...lines.map((l) => String(l).length));
  const w = (longest * CHAR_EM * FONT_PX + PAD_PX) * px;
  const h = lines.length * LINE_PX * px;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + h };
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Liang-Barsky: does segment a-b pass through the box's inside (touching an edge does not count)?
function segmentHits([ax, ay], [bx, by], box) {
  const e = 1e-9;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [[-dx, ax - box.x0 - e], [dx, box.x1 - e - ax], [-dy, ay - box.y0 - e], [dy, box.y1 - e - ay]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export function boxCrossesWalls(box, rooms) {
  return rooms.some((poly) => poly.some((a, i) => segmentHits(a, poly[(i + 1) % poly.length], box)));
}

const corners = (b) => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];

// The spots round a dot at `[x, y]` for a label `w` x `h`, ring by ring: [{cx, top, ring}].
function spots([x, y], w, h, px) {
  const out = [];
  for (let ring = 1; ring <= RINGS; ring++) {
    const g = GAP_PX * px * ring;
    out.push(
      { cx: x, top: y + g, ring },                     // below
      { cx: x, top: y - g - h, ring },                 // above
      { cx: x + g + w / 2, top: y - h / 2, ring },     // right
      { cx: x - g - w / 2, top: y - h / 2, ring },     // left
      { cx: x + g + w / 2, top: y + g * 0.5, ring },   // below right
      { cx: x - g - w / 2, top: y + g * 0.5, ring },   // below left
      { cx: x + g + w / 2, top: y - g * 0.5 - h, ring }, // above right
      { cx: x - g - w / 2, top: y - g * 0.5 - h, ring }, // above left
    );
  }
  return out;
}

// items: [{key, at: [x, y], lines: [string]}] (an item without lines is a dot to keep clear of);
// obstacles: other boxes to keep clear of, costed like a label (the rooms' names).
// Returns [{key, box, cx, top, leader}] for the items with lines, in their order.
export function layoutLabels(items, { rooms = [], px, obstacles = [] }) {
  const r = DOT_PX * px;
  const dots = items.map((it) => ({ x0: it.at[0] - r, y0: it.at[1] - r, x1: it.at[0] + r, y1: it.at[1] + r }));
  const placed = [...obstacles];
  const out = [];
  for (const it of items) {
    if (!it.lines?.length) continue;
    const own = rooms.find((poly) => pointInPolygon(it.at, poly));
    const probe = labelBox([0, 0], it.lines, px);
    const [w, h] = [probe.x1 - probe.x0, probe.y1 - probe.y0];
    let best = null;
    // Spots come nearest first and cost no less than the one before them, so the first spot with
    // nothing against it is the best: stop there.
    for (const [order, s] of spots(it.at, w, h, px).entries()) {
      const box = { x0: s.cx - w / 2, x1: s.cx + w / 2, y0: s.top, y1: s.top + h };
      const base = (s.ring - 1) * COST.ring + order * 0.01;
      let cost = base;
      if (boxCrossesWalls(box, rooms)) cost += COST.wall;
      if (own && !corners(box).every((c) => pointInPolygon(c, own))) cost += COST.room;
      cost += placed.filter((b) => overlaps(b, box)).length * COST.label;
      cost += dots.filter((d) => overlaps(d, box)).length * COST.dot;
      if (!best || cost < best.cost) best = { cost, box, cx: s.cx, top: s.top, ring: s.ring };
      if (cost === base) break;
    }
    placed.push(best.box);
    out.push({ key: it.key, box: best.box, cx: best.cx, top: best.top, leader: best.ring > 1 });
  }
  return out;
}
