// Flavour registry. FLAVOUR_KINDS names every flavour and its kinds, so a config naming a flavour
// that is not drawn yet still validates; the card draws `still` for any id missing from FLAVOURS.
// A new flavour is one import and one entry in FLAVOURS.

import still from "./still.js";
import swell from "./swell.js";
import dune from "./dune.js";
import veil from "./veil.js";
import voices from "./voices.js";
import halo from "./halo.js";
import afterglow from "./afterglow.js";
import tide from "./tide.js";
import centre from "./centre.js";
import timeline from "./timeline.js";
import clocks from "./clocks.js";
import ripples from "./ripples.js";
import tint from "./tint.js";
import bars from "./bars.js";

export const FLAVOURS = Object.fromEntries(
  [still, swell, dune, veil, voices, halo, afterglow, tide, centre, timeline, clocks, ripples, tint, bars].map((f) => [f.id, f]),
);

const SPECTRUM = ["still", "swell", "dune", "veil", "voices", "halo", "afterglow", "bars"];
const SCALAR = ["still", "tide", "centre", "timeline", "clocks", "ripples", "tint", "bars"];

export const FLAVOUR_KINDS = {};
for (const [kind, ids] of [["spectrum", SPECTRUM], ["scalar", SCALAR]]) {
  for (const id of ids) (FLAVOUR_KINDS[id] ??= []).push(kind);
}

export const flavoursFor = (kind) => (kind === "spectrum" ? [...SPECTRUM] : kind === "scalar" ? [...SCALAR] : []);
