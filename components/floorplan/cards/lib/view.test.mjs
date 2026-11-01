import { test } from "node:test";
import assert from "node:assert/strict";
import { GRID_M, SNAP_CORNER, snapGrid, snapCorner, gridOnWall, nearestWall } from "./view.js";

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const floorOf = (...rooms) => ({ floor_id: "ground", rooms, points: [] });

test("GRID_M and SNAP_CORNER", () => {
  assert.equal(GRID_M, 0.05);
  assert.equal(SNAP_CORNER, 0.05);
});

test("snapGrid rounds to the 0.05 m grid, kept to a millimetre", () => {
  assert.deepEqual(snapGrid([1.234, 2.976]), [1.25, 3]);
  assert.deepEqual(snapGrid([1.024, -0.026]), [1, -0.05]);
  assert.deepEqual(snapGrid([0.15, 0.35]), [0.15, 0.35]);
});

test("snapCorner: a corner with nothing near goes onto the grid", () => {
  const floor = floorOf({ area_id: "living_room", polygon: sq(0, 0, 5, 4) });
  assert.deepEqual(snapCorner(floor, "living_room", [5.43, 0.01]), [5.45, 0]);
});

test("snapCorner: another room's corner or wall wins over the grid", () => {
  const floor = floorOf(
    { area_id: "living_room", polygon: sq(0, 0, 5, 4) },
    { area_id: "kitchen", polygon: sq(5.02, 0, 3, 4) },
  );
  assert.deepEqual(snapCorner(floor, "living_room", [5.01, 0.01]), [5.02, 0], "the kitchen's corner, off the grid");
  const onWall = snapCorner(floor, "living_room", [5.01, 3.91]);
  assert.ok(Math.abs(onWall[0] - 5.02) < 1e-9 && Math.abs(onWall[1] - 3.91) < 1e-9, String(onWall));
});

test("gridOnWall: along a straight wall to the grid, else unchanged", () => {
  const poly = [[0, 0], [5, 0], [5, 4.02], [0, 4.02]];
  assert.deepEqual(gridOnWall(poly, 0, [1.234, 0]), [1.25, 0]);
  assert.deepEqual(gridOnWall(poly, 2, [2.01, 4.02]), [2, 4.02], "keeps the wall off the grid, rounds along it");
  assert.deepEqual(gridOnWall(poly, 1, [5, 4.01]), [5, 4], "the grid point is still on the wall");
  const short = [[1.02, 0], [1.04, 0], [1.04, 1], [1.02, 1]];
  assert.deepEqual(gridOnWall(short, 0, [1.03, 0]), [1.03, 0], "every grid point is off the wall's interior");
  const diag = [[0, 0], [3, 1], [0, 2]];
  assert.deepEqual(gridOnWall(diag, 0, [1.5, 0.5]), [1.5, 0.5], "a slanted wall: no grid point on it nearby");
});

test("nearestWall: the closest wall point within the tolerance, on the grid along its wall", () => {
  const floor = floorOf({ area_id: "living_room", polygon: sq(0, 0, 5, 4) }, { area_id: "kitchen", polygon: sq(5, 0, 3, 4) });
  assert.deepEqual(nearestWall(floor, [2.52, 0.03], 0.1), [2.5, 0]);
  assert.deepEqual(nearestWall(floor, [5.04, 1.23], 0.1), [5, 1.25]);
  assert.equal(nearestWall(floor, [2.5, 2], 0.1), null);
});
