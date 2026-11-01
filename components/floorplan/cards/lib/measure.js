// What edit mode measures on the plan: a faint grid and the rooms' dimensions (floor area under every
// name, wall lengths of the room being worked on). Plan coordinates are metres, so the numbers are
// read straight off the polygons.

import { centroid, polygonArea, wallLengths, pointInPolygon } from "./geometry.js";
import { language } from "./i18n.js";

const MINOR_PX = 24;   // half-metre lines only once they are this far apart on screen

export function numberText(hass, value, digits) {
  return new Intl.NumberFormat(language(hass),
    { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(value);
}

// Lines across the view every metre, and every half metre (minor) when zoomed in far enough;
// `px` is metres per screen pixel. Counted in half metres, so every value is exact.
export function gridLines(view, px) {
  const minor = 0.5 / px >= MINOR_PX;
  const lines = [];
  const along = (from, to, line) => {
    for (let k = Math.ceil(from / 0.5); k <= Math.floor(to / 0.5); k++) {
      if (k % 2 === 0 || minor) lines.push({ ...line(k * 0.5), minor: k % 2 !== 0 });
    }
  };
  along(view.x, view.x + view.w, (v) => ({ x1: v, y1: view.y, x2: v, y2: view.y + view.h }));
  along(view.y, view.y + view.h, (v) => ({ x1: view.x, y1: v, x2: view.x + view.w, y2: v }));
  return lines;
}

export function drawGrid(svg, el, view, px) {
  for (const l of gridLines(view, px)) {
    el("line", { class: l.minor ? "grid minor" : "grid", x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }, svg);
  }
}

// `active`: the area whose wall lengths show (the selected room, or the one whose corner is dragged).
export function drawDims(svg, el, { hass, t, floor, px, active }) {
  const m = t(hass, "card.floorplan.units.m");
  const m2 = t(hass, "card.floorplan.units.m2");
  for (const room of floor.rooms) {
    const [cx, cy] = centroid(room.polygon);
    el("text", { class: "dim area", x: cx, y: cy + 16 * px, "font-size": 11 * px }, svg)
      .textContent = `${numberText(hass, polygonArea(room.polygon), 1)} ${m2}`;
  }
  const room = floor.rooms.find((r) => r.area_id === active);
  if (!room) return;
  const poly = room.polygon;
  wallLengths(poly).forEach((len, i) => {
    if (len < 1e-9) return;
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Inside the room, 10 px off the wall, and read along it, never upside down.
    let n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (!pointInPolygon([mid[0] + n[0] * px, mid[1] + n[1] * px], poly)) n = [-n[0], -n[1]];
    const x = mid[0] + n[0] * 10 * px;
    const y = mid[1] + n[1] * 10 * px;
    let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    else if (angle <= -90) angle += 180;
    el("text", { class: "dim wall", x, y, "font-size": 11 * px, transform: `rotate(${Math.round(angle * 10) / 10} ${x} ${y})` }, svg)
      .textContent = `${numberText(hass, len, 2)} ${m}`;
  });
}

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// How far a point is from its room's walls straight left, right, up and down: each the nearest wall
// the ray meets, with where it meets it; a direction with no wall is left out.
export function wallDistances(poly, [x, y]) {
  const out = [];
  for (const [dx, dy] of DIRECTIONS) {
    let best = Infinity;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const [u0, u1, v0, v1, along, across] = dx
        ? [a[1], b[1], a[0], b[0], x, y]      // horizontal ray: crosses walls that span y
        : [a[0], b[0], a[1], b[1], y, x];     // vertical ray: crosses walls that span x
      if (u0 === u1 || across < Math.min(u0, u1) || across > Math.max(u0, u1)) return;
      const hit = v0 + ((across - u0) * (v1 - v0)) / (u1 - u0);
      const s = (hit - along) * (dx || dy);
      if (s > 1e-9 && s < best) best = s;
    });
    if (best < Infinity) out.push({ distance: best, to: [x + dx * best, y + dy * best] });
  }
  return out;
}

// The picked point's distances to its room's walls: a dashed line to each wall and its length.
export function drawWallDistances(svg, el, { hass, t, poly, pt, px }) {
  const m = t(hass, "card.floorplan.units.m");
  for (const { distance, to } of wallDistances(poly, pt)) {
    el("line", { class: "to-wall", x1: pt[0], y1: pt[1], x2: to[0], y2: to[1] }, svg);
    const horizontal = to[1] === pt[1];
    const x = (pt[0] + to[0]) / 2 + (horizontal ? 0 : 8 * px);
    const y = (pt[1] + to[1]) / 2 + (horizontal ? -8 * px : 0);
    el("text", { class: "dim to-wall", x, y, "font-size": 11 * px }, svg)
      .textContent = `${numberText(hass, distance, 2)} ${m}`;
  }
}
