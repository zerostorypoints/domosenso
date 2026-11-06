// === DESCRIPTION ===
// Enclosure for the gate-remote node: a three-part box (base, lid, jumper clamp) for an M5Stack Atom
// Lite (ESP32) wired to an M5Stack Module CC1101 855-925 MHz (SKU M146) with eight Dupont
// jumpers. The node sends a fixed-code 868 MHz gate handset's signal. The box replaces two loose
// boards whose female jumpers kept slipping off the module's short (3.0 mm) header pins.
// Physical context: stands on a shelf (base) or hangs on a wall (base_wall, antenna side up),
// indoors; loads are handling, the USB-C cable and a 110 x 8 mm SMA rubber antenna. The Atom's
// button opens the gate when held for 1 s, so it sits at the bottom of a finger well.
//
// Design decisions:
//   - Module pin face up on four pads under its corners; underneath it is an open shell (walls
//     1.5-2 mm, measured), and each pad carries a corner of its rim. The left wall, two stops on its
//     right side and the SMA slot locate it. The first base had pins on the pads, 2.8 mm into the
//     3.1 mm corner holes from below, and no stops: the pins kept the module from sitting down,
//     and without them nothing held it, so the pins went and the stops came. Its SMA jack leaves through a slot in the back wall; a tongue on the lid closes
//     the slot above it. The two screws of the jack's flange (not in M5Stack's drawing; measured
//     on the module, 2026-11-06) stand 1.1 mm into the wall; a groove in its inner face, open to
//     the top, takes their heads down as the module drops in (clash_sma_heads_path) and leaves
//     0.75 mm of wall outside them, so the back stays closed.
//   - Beside each corner hole, 3.3-3.8 mm towards the middle, an M2 socket screw holds the board to
//     its frame; its head stands on the pin face (not in M5Stack's drawing; measured from M5Stack's
//     product photo after the first fit test, 2026-11-05). The board model sweeps each head over
//     that whole range, so the clash checks cover every position. The clamp's pins are thin and
//     sit off the hole's centre, away from the screw; the clamp's bosses and the lid's tubes have
//     notches over the heads.
//   - The clamp, a bar with one slot per jumper, sits on the eight female housings. Two spring
//     flaps cut into the lid press it down, so the housings stay on the pins and their length
//     tolerance (dupont_tol) needs no adjustment. The flaps rise 0.5-2.5 mm above the lid's top
//     face while they press (echoed as flap_rise_above_lid_mm). Pins on the clamp locate it in the
//     module's right-hand corner holes. For housings shorter than dupont_len the clamp's bar grows
//     down (clamp_housing_len) and the box stays as it is: clamp_12mm takes 12 mm housings in the
//     box made for 14 mm, with the same flap pressure.
//   - No screws: four latches on the lid snap into 45-degree V-grooves in the front and back
//     walls. The lid presses on and pulls off by hand, starting at the notch in the left wall.
//   - The latch tabs stand upright in print, so they bend across the layers, which the usual
//     FDM rule avoids. Their strain is asserted below strain_limit (0.9 % against PLA's 1-1.5 %
//     and PETG's 5-8 %). In-plane latches would need thin spring strips cut into the walls.
//   - Print orientation: base open side up; lid and clamp flat face down. Overhangs stay at or
//     under 45 degrees; vent tops and the counterpart groove ceilings are 2 mm bridges or 45-degree faces.
//   - Vents: 2 mm slots in the lid and three walls (vents = false removes them). The node
//     dissipates roughly 0.5 W, so cooling does not need them (unmeasured estimate).
//   - Logo: the DomoSenso.org symbol, 20 mm high, recessed into the lid's top face left of the
//     vents, upright when the box stands on a shelf and when it hangs antenna side up. Built from
//     the brand's construction (branding/geometry.json in this repository), because OpenSCAD's
//     SVG import shifts the master file by 12 units. The recess is as deep as the accent ring, so
//     one second filament fills both on the same three layers; printed in one colour it stays an
//     engraving.
//
// Terminology -> code:
//   "the base", "the box"     -> base(), wall, floor_t, inner_x, inner_y, pad_h
//   "module stops"            -> mod_stop_t, mod_stop_w, mod_stop_rise, mod_stop_v
//   "the lid"                 -> lid_body(), lid_t, lip_h, lip_t
//   "latches", "snaps"        -> latch_tab(), v_wedge(), latch_x, latch_len, latch_t, latch_bump
//   "the clamp", "comb"       -> clamp_body(), pins_used, wire_d, slot_w, skirt_h, clamp_housing_len
//   "spring flaps", "nubs"    -> flap_w, flap_t, flap_hinge_x, flap_preload, nub_d
//   "button well"             -> well_d, well_depth, accent, accent_od, accent_t
//   "logo", "symbol"          -> logo, logo_h, logo_depth, logo_2d(), logo_xy
//   "inlay", "second colour"  -> lid_inlay_body() (accent ring and logo), part lid_inlay_parts
//   "vents"                   -> vents, vent_w, vent_len, lid_vent_rows
//   "antenna slot", "tongue"  -> sma_slot_w, the tongue in lid_body()
//   "antenna screws", groove  -> sma_screw_dx, sma_head, sma_head_clear, sma_heads(), sma_head_slot_w, sma_head_groove_d
//   "USB opening"             -> usb_plug_w, usb_plug_h
//   "wall ears"               -> base(ears = true), ear_len, ear_w, ear_hole_d
//   "pry notch"               -> notch_w, notch_d
//   "corner screws"           -> screw_dx, screw_y_tol, screw_head_d, screw_head_h, head_sweep()
//
// Common modifications:
//   Other flange screws        -> sma_screw_dx (both spacings swept), sma_head (the groove follows; asserted >= 0.7 mm of wall)
//   Other screws on the module -> screw_dx, screw_y_tol, screw_head_d, screw_head_h (notches and the pin follow)
//   Other jumper pins          -> pins_used (M-Bus numbers; odd pins are the edge column)
//   Thicker jumper wires       -> wire_d (slot = wire_d + 0.2 + hole_comp; ribs stay >= 0.6 mm, asserted)
//   Other housing length       -> dupont_len (clamp height follows), dupont_tol (flap travel)
//   Shorter housings, same box -> clamp_housing_len (only the clamp changes; build.py exports clamp_12mm)
//   Firmer or softer lid       -> latch_bump (holding force), latch_t (latch_len follows at 10:1)
//   Deeper button well         -> well_depth (lowers the Atom; room for the plug bends is asserted)
//   Bulky USB-C plug           -> usb_plug_w, usb_plug_h
//   Other material             -> e_modulus, strain_limit (asserts re-check latches and flaps)
//   No logo, or a smaller one  -> logo = false (the lid vents return to the full grid), logo_h
//
// Overall dimensions: 92.3 x 61.2 x 37.0 mm assembled (base_wall 120.3 wide with its ears);
//   every part fits the Bambu Lab P2S 256 x 256 x 256 mm build volume.
// Coordinate system (assembled): X right, Y back (antenna side), Z up; origin at the base's
//   front-left inner corner, z = 0 under the base. Printed parts are exported in print
//   orientation on Z = 0: the base as assembled, the lid and the clamp turned over about X.
// Board dimensions: M5Stack drawings; the corner screws from M5Stack's product photo. See
//   README.md "Sources".
// Final review: 2026-11-05, claude-fable-5-1 (after a Sonnet review; findings fixed)
// Corner-screw fix: reviewed 2026-11-05, claude-sonnet-5-5; its findings fixed
// Flange-screw groove, the Atom stop's web, the module stops: 2026-11-06, lightweight check (gate; without the
//   groove both clash_base_boards and clash_sma_heads_path fail)
// Clamp for shorter housings (clamp_housing_len, clamp_12mm): reviewed 2026-11-06, claude-sonnet-5-5;
//   no blocker, documentation findings fixed. The Atom's male plugs stay modelled at dupont_len.

// === PRINT SETTINGS ===
// Material: PETG (latches and spring flaps; forgiving if a first print fits tight). PLA works:
//   latch and flap strain stays under its 1-1.5 % limit. One material for all parts; the lid's
//   accent ring and logo can take a second filament (part lid_inlay_parts), terracotta for the brand.
// Layer Height: 0.2 mm (the lid's flaps are 5 layers thick, the ring and the logo 3)
// Walls/Perimeters: 5 (wall = 2.25 mm prints solid)
// Infill: 15 % gyroid
// Supports: None required
// Orientation: as exported. Base open side up; lid top face down; clamp flat face down.
// Notes: PETG about 240 C nozzle, 70-80 C bed, dried filament. No brim.

/* [Output] */
// Printed: base, base_wall, lid, lid_inlay_parts, clamp (clamp_12mm: clamp with clamp_housing_len = 12). Views: assembly, assembly_open, explode, section, plate_all. Checks: clash_*.
part = "assembly"; // [assembly, assembly_open, explode, section, plate_all, base, base_wall, lid, lid_inlay_parts, clamp, clash_lid_base, clash_clamp_lid, clash_clamp_base, clash_base_boards, clash_lid_boards, clash_clamp_boards, clash_inlay_lid, clash_sma_heads_path]

/* [Printer] */
nozzle_diameter = 0.4;
layer_height = 0.2;
build_xyz = [256, 256, 256];

/* [Material] */
// Young's modulus for the spring and latch forces, MPa (PETG about 2100, PLA about 3500)
e_modulus = 2100;
// Allowed bending strain of latches and flaps, % (PLA 1-1.5, PETG 5-8)
strain_limit = 1.2;

/* [Wiring] */
// CC1101 M-Bus pins that carry a jumper; each gets a slot in the clamp
pins_used = [1, 7, 8, 9, 11, 20, 22, 28];
// Outer diameter of one jumper wire
wire_d = 1.4;
// Length of a Dupont housing, female on the module and male on the Atom
dupont_len = 14.0;
// Housing length variation the clamp's spring flaps take up
dupont_tol = 1.0;
// Length of the female housings under this clamp. Shorter than dupont_len, the clamp's bar grows
// down to meet them and the box stays as it is: clamp_housing_len = 12 is clamp_12mm, for
// 12 mm housings in the box made for 14 mm
clamp_housing_len = dupont_len;

/* [Button well] */
// Diameter of the finger well above the Atom's button
well_d = 15;
// From the lid's top face down to the Atom's top face
well_depth = 3.4;
// Ring around the well in a second filament
accent = true;
accent_od = 21;
// Thickness of the ring: the first layers of the lid as printed
accent_t = 0.6;

/* [Logo] */
// DomoSenso.org symbol recessed into the lid's top face
logo = true;
// Height of the symbol; its width follows at 48:52. The brand book asks for about 20 mm on a casing
logo_h = 20;
// Depth of the recess, a whole number of layers; equal to accent_t so one filament change fills both
logo_depth = 0.6;

/* [USB-C cable] */
// Opening for the plug's moulded body
usb_plug_w = 13;
usb_plug_h = 8.5;

/* [Vents] */
// Slots in the lid and in the front, left and right walls
vents = true;
// Slot width: too narrow for a finger
vent_w = 2;
vent_len = 12;

/* [Module corner screws] */
// Range of the head's centre, from its corner hole's centre towards the module's middle (measured)
screw_dx = [3.3, 3.8];
// The head's centre off the hole's line, either way (measured within 0.2)
screw_y_tol = 0.2;
// Head diameter, with margin (M2 socket cap 3.8; 3.8-4.0 measured)
screw_head_d = 4.0;
// Head height above the pin face, with margin (M2 socket cap 2.0; about 2.2 estimated from a side photo)
screw_head_h = 2.4;

/* [Wall mount, part base_wall] */
ear_hole_d = 4.2;
ear_head_d = 8.5;

/* [Hidden] */
$fa = 4;
$fs = 0.25;
fudge = 0.01;
extrusion_width = nozzle_diameter * 1.125;
tolerance = 0.3;        // sliding clearance per side (PETG)
hole_comp = 0.3;        // printed slots and holes come out this much narrower
ef_chamfer = 0.4;       // elephant-foot chamfer on edges that touch the plate
mu = 0.3;               // friction on the 45-degree latch faces

// --- printed shell ---
wall = 5 * extrusion_width;     // 2.25
floor_t = 10 * layer_height;    // 2.0
lid_t = 10 * layer_height;      // 2.0
r_out = 3.0;
chamfer = 0.8;                  // base bottom and lid top outer edges (covers ef_chamfer)
lip_h = 2.5;                    // locating lip under the lid
lip_t = 3 * extrusion_width;    // 1.35
lip_gap = tolerance;
clamp_t = 10 * layer_height;    // 2.0
wire_clear = 3.9;               // above the clamp, where the jumpers bend over
pocket_wall = 4 * extrusion_width;
pocket_wall_rise = 6;           // pocket side walls stand this far above the Atom's underside
pedestal_uv = [1.5, 8];         // pedestal under the Atom: start in u and v (Atom coordinates)
pedestal_size = [15, 8];        // between the plug rows, short of the Grove socket
stop_v = [9, 6];                // stop on the module side of the Atom: start and width in v
stop_rise = 4;                  // above the Atom's underside
atom_pad = 3;                   // lid pads on the Atom's corners
atom_pad_inset = 1.5;
vent_margin = 8;                // wall slots start this far from the inner corners
lid_vent_x0 = 12;               // first lid slot
lid_vent_end_gap = 3;           // last lid slot stops this far before the Atom
accent_colour = "#ad431f";      // preview colour of the inlays: the brand's framework terracotta
inlay_gap = 0.025;              // per side between an inlay and its recess
stop_t = 3 * extrusion_width;
skirt_t = 2 * extrusion_width;
skirt_h = 2.5;                  // short, so the clamp slides on with a small lift
notch_w = 12;                   // pry notch at the top of the left wall
notch_d = 1.5;

// --- M5Stack Module CC1101 (M146), model-size drawing M135/M146 ---
// Drawing coordinates, pin face up: dx from the left edge, dy from the antenna (SMA) edge.
mod_w = 54;
mod_r = 5;
mod_rim_t = 6.6;           // body at the edge
mod_t = 7.6;               // body with the 1 mm plateau on the pin face
mod_plateau_inset = 1.55;
mod_holes = [[5, 5], [49, 5], [5, 49], [49, 49]]; // through holes, 3.1 mm
mod_hole_d = 3.1;
hdr_col = [44.78, 47.32];  // inner column (even pins), edge column (odd pins)
pitch = 2.54;
hdr_row1 = mod_w / 2 - 7 * pitch; // row of pins 1 and 2, next to the antenna edge
hdr_spacer_top = 10.1;     // header's plastic spacer, above the module's underside
hdr_pin_top = 13.1;
sma_dx = 34;
sma_z = 3.75;              // jack axis above the module's underside
sma_len = 9.6;             // jack beyond the body edge
sma_d = 6.35;              // 1/4-36 UNS thread
sma_flange = [14, 1.8, 5.7];
// two screws hold the flange to the module's frame, their heads towards the back wall; measured
// with a ruler on one module (2026-11-06): 12 mm apart, 4 mm heads standing 1.5 mm proud of the
// flange. 12.7 mm (1/2 in) is the usual spacing of a two-hole SMA flange, so the slot takes both
sma_screw_dx = [12, 12.7];   // centre to centre: measured, usual
sma_head = [4, 1.5];         // head diameter, height above the flange
sma_head_clear = 0.4;        // per side, around the heads
sma_slot_w = 7.0;            // the jack's thread
// a groove in the back wall's inner face, as wide as both heads, takes them down to their place;
// the wall stays closed outside it
sma_head_slot_w = max(sma_screw_dx) + sma_head[0] + 2 * sma_head_clear + hole_comp;
tongue_w = sma_slot_w - 2 * tolerance; // lid tongue in the slot: 0.3 mm per side, the printed slot narrows

// --- M5Stack Atom Lite, model-size drawing and Atom-Lite.stl ---
// Atom coordinates, top face up: u from the face opposite the USB-C, v across.
atom = 24;
atom_h = 9.5;
atom_r = 3;
atom_usb_dz = 2.15;        // USB-C axis below the top face
atom_well_uv = [11.3, 12]; // between the button's centre and the LED
atom_plug_u = [12.0, 14.54, 17.08, 19.62]; // header rows 2 to 5
atom_col_v = [4.5, 19.6];  // 4-socket column (G21 G25 5V G), 5-socket column (3V3 G22 G19 G23 G33)

// --- layout ---
gap = 0.5;
gap_back = 2.2;   // room for the SMA flange between module and back wall
bay = 9;          // jumper channel between module and Atom
atom_gap = tolerance;
pad_h = 3;        // module stands on four pads; the room under the Atom follows from it
pad_d = 9;
// two stops on the module's right side: with the left wall they keep it from sliding into the
// jumper bay
mod_stop_t = 4 * extrusion_width;  // 1.8
mod_stop_w = 8;
mod_stop_rise = 4;                 // above the module's underside, on its 6.6 mm side
mod_stop_v = [12, 42];             // centres along the module's right side, from its front edge

inner_x = gap + mod_w + bay + atom + atom_gap;
inner_y = gap + mod_w + gap_back;
mod_x0 = gap;
mod_y0 = gap;
mod_z0 = floor_t + pad_h;
plateau_z = mod_z0 + mod_t;
spacer_z = mod_z0 + hdr_spacer_top;
housing_top = spacer_z + dupont_len;
clamp_top = housing_top + clamp_t;
clamp_under = spacer_z + clamp_housing_len;  // the bar's underside, on the female housings
clamp_drop = housing_top - clamp_under;      // how far the bar grows down for shorter housings
z_lid = clamp_top + wire_clear;     // underside of the lid plate = top of the base walls
atom_top = z_lid + lid_t - well_depth;
atom_z0 = atom_top - atom_h;
atom_x0 = mod_x0 + mod_w + bay;
atom_y0 = mod_y0 + mod_w / 2 - atom / 2;
usb_z = atom_top - atom_usb_dz;
usb_y = atom_y0 + atom / 2;
well_xy = [atom_x0 + atom_well_uv[0], atom_y0 + atom_well_uv[1]];
sma_x = mod_x0 + sma_dx;
sma_zz = mod_z0 + sma_z;
sma_head_slot_z = sma_zz - sma_head[0] / 2 - sma_head_clear; // floor of the groove
sma_head_groove_d = sma_flange[1] + sma_head[1] + sma_head_clear - gap_back; // into the wall's inner face
outer = [inner_x + 2 * wall, inner_y + 2 * wall, z_lid + lid_t];

// --- fixing without screws ---
clamp_pin_d = 2.2;    // the clamp's pins in the 3.1 mm corner holes, beside the screw heads
clamp_pin_taper = 0.4;
clamp_pin_shift = 0.25; // off the hole's centre, away from the screw
head_clear = 0.3;     // above and around a screw head in its notch
// notch over a head: the head's swept range plus head_clear, plus the printed-hole shrink
head_notch_r = screw_head_d / 2 + head_clear + hole_comp / 2;
clamp_pin_h = 3.0;    // from the clamp's bosses, into the right-hand holes from above
tube_gap = 0.4;       // lid tubes stop the module this far above it
boss_gap = 1.5;       // clamp boss above the module: room for shorter housings
boss_d = 5.6;
tube_d = 6.5;

// Spring flaps cut into the lid; each nub reaches flap_preload below the clamp's nominal top.
flap_w = 6;
flap_t = 5 * layer_height;      // 1.0
flap_slot = 1.2;                // wide enough that elephant foot cannot fuse it
flap_hinge_x = 29;
flap_ramp = 10 * layer_height - 5 * layer_height; // 45-degree thinning at the hinge: lid_t - flap_t
flap_preload = 1.0 + 0.5;       // dupont_tol + 0.5: still pressing with the shortest housings
nub_d = 5;

// Latches: tabs under the lid with a 45-degree bump, V-grooves in the front and back walls.
latch_x = [20, 72];
latch_w = 7;
latch_t = 3 * extrusion_width;  // 1.35
latch_len = 10 * latch_t;       // 13.5, L:T = 10
latch_bump = 1.0;
latch_side_gap = 1.0;           // lip cut away beside each tab
latch_gusset = 0.8;             // 45-degree gusset on the inner side of each tab's root
groove_clear = 0.3;
seat_clear = 0.05;              // the groove sits low, so the flaps cannot lift the lid more than this

// Vents
vent_pitch = vent_w + 2.5;
vent_z0 = 6;                    // wall slots start above the module pads
lid_vent_rows = [[14, 26], [30, 42]]; // Y ranges of the two rows of lid slots, clear of the flaps

// Logo: the symbol's construction is 48 x 52 source units; one structural width is 12 units
logo_unit = logo_h / 52;
logo_w = 48 * logo_unit;
logo_clear = 12 * logo_unit;    // the brand book's clear space around the symbol
// centred between the lid's left edge and the flap hinges, and across the lid
logo_xy = [(-wall + flap_hinge_x) / 2, inner_y / 2];
// the first lid slot column on the original grid that keeps the clear space
lid_vent_first = logo
  ? lid_vent_x0 + vent_pitch * ceil((logo_xy[0] + logo_w / 2 + logo_clear + vent_w / 2 - lid_vent_x0) / vent_pitch)
  : lid_vent_x0;

// Wall ears (base_wall)
ear_len = 11;
ear_w = 16;
ear_t = 3;

function mp(p) = [mod_x0 + p[0], mod_y0 + mod_w - p[1]];
function row_of(p) = ceil(p / 2);
function pin_xy(p) = mp([hdr_col[p % 2], hdr_row1 + (row_of(p) - 1) * pitch]);
function row_y(r) = mp([0, hdr_row1 + (r - 1) * pitch])[1];
hole_xy = [for (h = mod_holes) mp(h)];
left_holes = [hole_xy[0], hole_xy[2]];  // under the lid's stop tubes
right_holes = [hole_xy[1], hole_xy[3]]; // under the clamp's bosses
// the screw beside a hole lies towards the module's middle in X: +1 for the left-hand holes
function screw_dir(h) = h[0] < mod_x0 + mod_w / 2 ? 1 : -1;
// the clamp's pin sits clamp_pin_shift off the hole's centre, away from the screw
function clamp_pin_of(h) = [h[0] - screw_dir(h) * clamp_pin_shift, h[1]];
// notch tops: the lid sits fixed over the module; the clamp sinks dupont_tol on short housings
tube_pocket_top = plateau_z + screw_head_h + head_clear;
boss_pocket_top = plateau_z + screw_head_h + head_clear + dupont_tol;

// flap centre lines: over the clamp bosses, kept clear of the lid's lip
flap_y_min = lip_gap + lip_t + flap_slot + flap_w / 2 + 0.3;
flap_y = [for (h = right_holes) min(max(h[1], flap_y_min), inner_y - flap_y_min)];
nub_x = right_holes[0][0];
flap_x1 = nub_x + nub_d / 2 + 1;
// the clash check poses the nub just clear of the clamp
preload_eff = part == "clash_clamp_lid" ? -2 * fudge : flap_preload;

latch_overlap = latch_bump - lip_gap;            // how far a tab bends while the lid goes on
latch_z = z_lid - latch_len + latch_bump + 0.2;  // bump centre, near the tab's tip
latch_arm = z_lid - latch_z;                     // root to bump, for strain and force
groove_z = latch_z - (groove_clear - seat_clear); // groove centre
groove_d = latch_overlap + groove_clear;         // groove depth into the wall

// clamp slots: the wire plus the printed-slot shrink, no further allowance (keeps the ribs printable)
slot_w = wire_d + hole_comp;
slot_rib = pitch - slot_w;

// --- forces and strains (cantilever: k = 3EI/L^3, surface strain = 3 t d / 2 L^2) ---
latch_k = 3 * e_modulus * (latch_w * pow(latch_t, 3) / 12) / pow(latch_arm, 3);
latch_strain = 100 * 3 * latch_t * latch_overlap / (2 * latch_arm * latch_arm);
latch_hold = latch_k * latch_overlap * (mu + 1) / (1 - mu);   // pull-off force per latch, N
flap_len = nub_x - flap_hinge_x - flap_ramp;   // from the end of the hinge ramp
flap_k = 3 * e_modulus * (flap_w * pow(flap_t, 3) / 12) / pow(flap_len, 3);
flap_defl_max = flap_preload + dupont_tol;
flap_defl_min = flap_preload - dupont_tol;
flap_force_max = flap_k * flap_defl_max;
flap_strain = 100 * 3 * flap_t * flap_defl_max / (2 * flap_len * flap_len);

assert(atom_z0 - dupont_len - floor_t >= 5, "no room under the Atom for the jumper bends");
assert(boss_gap >= dupont_tol, "clamp boss would land on the module before short housings");
// clamp pin against the nearest screw head, and inside its hole, at the ends of the measured range
clamp_pin_in = clamp_pin_d / 2 - clamp_pin_shift;    // pin's edge on the screw side, from the hole's centre
clamp_pin_out = clamp_pin_d / 2 + clamp_pin_shift;   // and on the far side
head_near = screw_dx[0] - screw_head_d / 2;          // nearest head edge, from the hole's centre
assert(head_near - clamp_pin_in >= 0.25, "clamp pin under 0.25 mm from a screw head");
assert(mod_hole_d / 2 - clamp_pin_out >= 0.15, "clamp pin under 0.15 mm inside its hole");
assert(screw_dx[0] - head_notch_r >= clamp_pin_in - fudge, "head notch cuts into the clamp pin");
assert(boss_pocket_top + 3 * layer_height <= clamp_under, "clamp boss notch leaves under three layers");
assert(clamp_drop >= 0, "clamp_housing_len longer than dupont_len: the box is too low for these housings");
assert(clamp_under - skirt_h > mod_z0 + hdr_pin_top, "clamp skirts reach down to the header pins' tips");
assert(tube_pocket_top + 3 * layer_height <= z_lid, "lid tube notch reaches the lid plate");
assert(latch_len / latch_t >= 10 - fudge, "latch L:T below 10");
assert(latch_strain <= strain_limit, "latch strain over the limit");
assert(flap_strain <= strain_limit, "flap strain over the limit");
assert(4 * latch_hold >= 3 * 2 * flap_force_max, "latches hold less than 3x the flaps' push");
assert(groove_d < wall - 2 * extrusion_width, "latch groove leaves under two lines of wall");
assert(slot_rib >= 2 * extrusion_width - 0.1, "clamp ribs between neighbouring slots under two lines");
assert(well_depth + atom_usb_dz - usb_plug_h / 2 >= 1.2, "lid left over the USB opening under 1.2 mm");
assert((sma_slot_w - hole_comp - tongue_w) / 2 >= 0.1, "lid tongue binds in the printed SMA slot");
assert(wall - sma_head_groove_d >= 0.7, "back wall over the flange screws' groove under 0.7 mm");
assert(gap_back > sma_flange[1] + 0.2, "SMA flange touches the back wall");
assert(min(mod_stop_v) - mod_stop_w / 2 >= mod_r && max(mod_stop_v) + mod_stop_w / 2 <= mod_w - mod_r, "module stops reach its rounded corners");
assert(bay - tolerance - mod_stop_t >= 6, "module stops leave under 6 mm of jumper bay");
assert(mod_stop_rise < mod_rim_t, "module stops stand above the module's side");
assert(stop_v[0] >= pedestal_uv[1] && stop_v[0] + stop_v[1] <= pedestal_uv[1] + pedestal_size[1], "Atom stop wider than the pedestal it is joined to");
assert(gap_back + wall >= sma_flange[1] + sma_head[1], "SMA flange screw heads stick out past the back wall");
assert(sma_zz + sma_d / 2 + 0.3 >= sma_zz + sma_head[0] / 2 + 0.5, "lid tongue comes down onto the flange screw heads");
assert(sma_x - sma_head_slot_w / 2 - (latch_x[0] + latch_w / 2 + latch_side_gap) >= 2 * extrusion_width,
  "flange screws' groove leaves under two lines of wall beside the latch groove");
assert(flap_defl_min >= 0.4, "flaps stop pressing the clamp with the shortest housings");
assert(abs(lid_t - flap_t - flap_ramp) < 1e-6, "flap ramp is not 45 degrees");
assert(min(flap_y) - flap_w / 2 - flap_slot > lip_gap + lip_t, "front flap cuts into the lip");
assert(max(flap_y) + flap_w / 2 + flap_slot < inner_y - lip_gap - lip_t, "back flap cuts into the lip");
assert(lid_vent_rows[0][0] > min(flap_y) + flap_w / 2 + flap_slot + 2, "lid vents run into the front flap");
assert(lid_vent_rows[1][1] < max(flap_y) - flap_w / 2 - flap_slot - 2, "lid vents run into the back flap");
assert(latch_z - latch_bump > z_lid - latch_len, "latch bump hangs below the tab");
assert(seat_clear > 2 * fudge && seat_clear < groove_clear, "groove offset out of range");
assert(vent_z0 + vent_len < groove_z - groove_d - 2, "wall vents run into the latch grooves");
assert(vent_z0 + vent_len < atom_z0, "right-wall vents reach the Atom");
if (logo) {
  assert(logo_xy[0] - logo_w / 2 + wall >= logo_clear - fudge, "logo closer to the lid's left edge than its clear space");
  assert(logo_xy[1] - logo_h / 2 + wall >= logo_clear, "logo closer to the lid's front edge than its clear space");
  assert(logo_xy[0] + logo_w / 2 + logo_clear <= flap_hinge_x, "spring flaps inside the logo's clear space");
  assert(lid_vent_first - vent_w / 2 >= logo_xy[0] + logo_w / 2 + logo_clear - fudge, "lid vents inside the logo's clear space");
  assert(6 * logo_unit >= 3 * extrusion_width, "logo's base gaps narrower than three lines");
  assert(abs(logo_depth / layer_height - round(logo_depth / layer_height)) < 1e-6, "logo depth is not whole layers");
  assert(lid_t - logo_depth >= 5 * layer_height, "lid under the logo thinner than five layers");
}
for (i = [0 : 2]) assert(outer[i] <= build_xyz[i], "part larger than the build volume");

echo(outer_mm = outer, base_wall_x = outer[0] + 2 * (ear_len / 2 + 0.5 + ear_w / 2));
// the flange screws' groove measured from the outside of the left wall and the base's underside
// (for cutting it into a base printed before the screws were modelled)
echo(sma_head_groove_from_left_mm = [wall + sma_x - sma_head_slot_w / 2, wall + sma_x + sma_head_slot_w / 2],
  sma_head_groove_floor_mm = sma_head_slot_z, sma_head_groove_w_mm = sma_head_slot_w,
  sma_head_groove_d_mm = sma_head_groove_d, back_wall_over_groove_mm = wall - sma_head_groove_d,
  wall_beside_latch_mm = sma_x - sma_head_slot_w / 2 - (latch_x[0] + latch_w / 2 + latch_side_gap));
echo(latch_strain_pct = latch_strain, latch_hold_N = latch_hold, flap_strain_pct = flap_strain,
     flap_force_max_N = flap_force_max, clamp_rib_mm = slot_rib,
     flap_rise_above_lid_mm = [flap_defl_min, flap_preload, flap_defl_max],
     clamp_housing_mm = [clamp_housing_len - dupont_tol, clamp_housing_len + dupont_tol], clamp_bar_mm = clamp_t + clamp_drop);
echo(clamp_pin_to_head_min_mm = head_near - clamp_pin_in, clamp_pin_in_hole_mm = mod_hole_d / 2 - clamp_pin_out,
     head_notch_from_hole_mm = [screw_dx[0] - head_notch_r, screw_dx[1] + head_notch_r],
     boss_notch_depth_mm = boss_pocket_top - plateau_z - boss_gap, tube_notch_depth_mm = tube_pocket_top - plateau_z - tube_gap);
if (logo) echo(logo_mm = [logo_w, logo_h], logo_centre = logo_xy, logo_clear_mm = logo_clear, lid_vent_first = lid_vent_first);

// ---------------------------------------------------------------- helpers

module rbox(size, r) {
  rr = min(r, size[0] / 2 - fudge, size[1] / 2 - fudge);
  hull() for (x = [rr, size[0] - rr], y = [rr, size[1] - rr])
    translate([x, y, 0]) cylinder(r = rr, h = size[2]);
}

// rounded box with 45-degree chamfers on the bottom (cb) and top (ct) outer edges
module cbox(size, r, cb = 0, ct = 0) {
  hull() {
    translate([cb, cb, 0]) rbox([size[0] - 2 * cb, size[1] - 2 * cb, fudge], r - cb);
    translate([0, 0, cb]) rbox([size[0], size[1], size[2] - cb - ct], r);
    translate([ct, ct, size[2] - fudge]) rbox([size[0] - 2 * ct, size[1] - 2 * ct, fudge], r - ct);
  }
}

// A screw head's whole range beside hole h: circles of radius r swept over screw_dx and
// screw_y_tol, from z0 for hgt. The board model uses the head's radius, the notches head_notch_r.
module head_sweep(h, r, z0, hgt) {
  hull() for (dx = screw_dx, dy = [-screw_y_tol, screw_y_tol])
    translate([h[0] + screw_dir(h) * dx, h[1] + dy, z0]) cylinder(r = r, h = hgt);
}

module ring(od, id, h) {
  difference() {
    cylinder(d = od, h = h);
    translate([0, 0, -fudge]) cylinder(d = id, h = h + 2 * fudge);
  }
}

// DomoSenso.org symbol, centred on the origin, logo_h high, upright along +Y.
// The brand's construction in its 64-unit source frame (SVG, y down): arcs of radius 24 and 12
// about (32, 28), uprights and centre block 12 wide, the right shoulder open between y = 20 and
// 28, everything moved 2 units down. Same outline as branding/assets/symbol-20mm.svg.
module logo_2d() {
  scale([logo_unit, -logo_unit]) translate([-32, -32]) translate([0, 2]) {
    translate([8, 28]) square([12, 28]);    // left upright
    translate([44, 28]) square([12, 28]);   // right upright
    translate([26, 44]) square([12, 12]);   // centre block
    difference() {
      translate([32, 28]) difference() { circle(r = 24, $fn = 180); circle(r = 12, $fn = 180); }
      translate([0, 28]) square([64, 64]);  // the arch is the upper half
      translate([32, 20]) square([64, 64]); // the open right shoulder
    }
  }
}

// Horizontal 45-degree wedge along X: base (2d high) in the plane y = 0, apex at y = -d.
module v_wedge(xc, w, zc, d) {
  hull() {
    translate([xc - w / 2, -fudge, zc - d]) cube([w, 2 * fudge, 2 * d]);
    translate([xc - w / 2, -d, zc - fudge]) cube([w, fudge, 2 * fudge]);
  }
}

// Places children at the front wall (side 0) or mirrored onto the back wall (side 1).
module at_wall(side) {
  if (side == 0) children();
  else translate([0, inner_y, 0]) mirror([0, 1, 0]) children();
}

module wire(points, d, c) {
  color(c) for (i = [0 : len(points) - 2])
    hull() {
      translate(points[i]) sphere(d = d, $fn = 10);
      translate(points[i + 1]) sphere(d = d, $fn = 10);
    }
}

// ---------------------------------------------------------------- base

module base(ears = false) {
  difference() {
    union() {
      difference() {
        translate([-wall, -wall, 0]) cbox([outer[0], outer[1], z_lid], r_out, cb = chamfer);
        translate([0, 0, floor_t]) rbox([inner_x, inner_y, z_lid], 1);
      }
      for (h = hole_xy) translate([h[0], h[1], floor_t - fudge]) {
        cylinder(d = pad_d, h = pad_h + fudge);
      }
      // stops on the module's right side
      for (v = mod_stop_v) translate([mod_x0 + mod_w + tolerance, mod_y0 + v - mod_stop_w / 2, floor_t - fudge])
        cube([mod_stop_t, mod_stop_w, pad_h + mod_stop_rise + fudge]);
      // Atom pedestal, between the two rows of plugs under the Atom
      translate([atom_x0 + pedestal_uv[0], atom_y0 + pedestal_uv[1], floor_t - fudge]) cube([pedestal_size[0], pedestal_size[1], atom_z0 - floor_t + fudge]);
      // stop on the module side of the Atom, joined to the pedestal by a web up to the Atom's
      // underside: standing alone it was a 1.35 mm plate 26 mm tall, held only by the floor
      translate([atom_x0 - atom_gap - stop_t, atom_y0 + stop_v[0], floor_t - fudge]) {
        cube([stop_t + fudge, stop_v[1], atom_z0 + stop_rise - floor_t]);
        cube([stop_t + atom_gap + pedestal_uv[0] + fudge, stop_v[1], atom_z0 - floor_t + fudge]);
      }
      // side walls of the Atom pocket
      for (y = [atom_y0 - atom_gap - pocket_wall, atom_y0 + atom + atom_gap])
        translate([atom_x0 - atom_gap, y, floor_t - fudge]) cube([inner_x - atom_x0 + atom_gap + fudge, pocket_wall, atom_z0 + pocket_wall_rise - floor_t]);
      if (ears) for (s = [-1, 1]) ear(s);
    }
    // SMA jack: slot open to the top, closed by the lid's tongue
    hull() {
      translate([sma_x, inner_y - fudge, sma_zz]) rotate([-90, 0, 0]) cylinder(d = sma_slot_w, h = wall + 2 * fudge);
      translate([sma_x - sma_slot_w / 2, inner_y - fudge, sma_zz]) cube([sma_slot_w, wall + 2 * fudge, z_lid]);
    }
    // the flange screws' heads go down this groove as the module drops in
    translate([sma_x - sma_head_slot_w / 2, inner_y - fudge, sma_head_slot_z]) cube([sma_head_slot_w, sma_head_groove_d + fudge, z_lid]);
    // USB-C plug, open to the top; the lid closes it
    translate([inner_x - fudge, usb_y - usb_plug_w / 2, usb_z - usb_plug_h / 2])
      cube([wall + 2 * fudge, usb_plug_w, z_lid]);
    // latch grooves in the front and back walls
    for (side = [0, 1], x = latch_x) at_wall(side) v_wedge(x, latch_w + 2 * latch_side_gap, groove_z, groove_d);
    // pry notch
    translate([-wall - fudge, inner_y / 2 - notch_w / 2, z_lid - notch_d]) cube([wall + 2 * fudge, notch_w, notch_d + fudge]);
    if (vents) wall_vents();
    if (ears) for (s = [-1, 1]) ear_hole(s);
  }
}

module wall_vents() {
  for (x = [vent_margin : vent_pitch : inner_x - vent_margin])
    translate([x - vent_w / 2, -wall - fudge, vent_z0]) cube([vent_w, wall + 2 * fudge, vent_len]);
  for (y = [vent_margin : vent_pitch : inner_y - vent_margin])
    translate([-wall - fudge, y - vent_w / 2, vent_z0]) cube([wall + 2 * fudge, vent_w, vent_len]);
  // right wall, into the room under the Atom
  for (y = [atom_y0 + 3 : vent_pitch : atom_y0 + atom - 3])
    translate([inner_x - fudge, y - vent_w / 2, vent_z0]) cube([wall + 2 * fudge, vent_w, vent_len]);
}

function ear_hole_x(s) = s < 0 ? -wall - ear_len / 2 - 0.5 : inner_x + wall + ear_len / 2 + 0.5;

module ear(s) {
  x_wall = s < 0 ? -wall + 1 : inner_x + wall - 1;
  hull() {
    translate([x_wall - 0.5, inner_y / 2 - ear_w / 2 + ef_chamfer, 0]) cube([1, ear_w - 2 * ef_chamfer, fudge]);
    translate([x_wall - 0.5, inner_y / 2 - ear_w / 2, ef_chamfer]) cube([1, ear_w, ear_t - ef_chamfer]);
    translate([ear_hole_x(s), inner_y / 2, 0]) cylinder(d = ear_w - 2 * ef_chamfer, h = fudge);
    translate([ear_hole_x(s), inner_y / 2, ef_chamfer]) cylinder(d = ear_w, h = ear_t - ef_chamfer);
  }
}

module ear_hole(s) {
  translate([ear_hole_x(s), inner_y / 2, -fudge]) {
    cylinder(d = ear_hole_d, h = ear_t + 2 * fudge);
    translate([0, 0, ear_t - (ear_head_d - ear_hole_d) / 2])
      cylinder(d1 = ear_hole_d, d2 = ear_head_d, h = (ear_head_d - ear_hole_d) / 2 + 2 * fudge);
  }
}

// ---------------------------------------------------------------- lid

module latch_tab(x) {
  translate([x - latch_w / 2, lip_gap, z_lid - latch_len]) cube([latch_w, latch_t, latch_len + fudge]);
  translate([0, lip_gap, 0]) v_wedge(x, latch_w, latch_z, latch_bump);
  // gusset on the inner side of the root
  hull() {
    translate([x - latch_w / 2, lip_gap + latch_t - fudge, z_lid - latch_gusset]) cube([latch_w, fudge, latch_gusset + fudge]);
    translate([x - latch_w / 2, lip_gap + latch_t - fudge, z_lid - fudge]) cube([latch_w, latch_gusset + fudge, 2 * fudge]);
  }
}

module lid_body() {
  union() {
    difference() {
      union() {
        translate([-wall, -wall, z_lid]) cbox([outer[0], outer[1], lid_t], r_out, ct = chamfer);
        // lip that locates the lid inside the walls; cut away beside the latches and above the Atom
        difference() {
          translate([lip_gap, lip_gap, z_lid - lip_h]) rbox([inner_x - 2 * lip_gap, inner_y - 2 * lip_gap, lip_h + fudge], 1);
          translate([lip_gap + lip_t, lip_gap + lip_t, z_lid - lip_h - fudge])
            rbox([inner_x - 2 * (lip_gap + lip_t), inner_y - 2 * (lip_gap + lip_t), lip_h + 3 * fudge], 0.5);
          translate([atom_x0 - 1, atom_y0 - 1, z_lid - lip_h - 1]) cube([inner_x, atom + 2, lip_h + 1]);
          for (x = latch_x) translate([x - latch_w / 2 - latch_side_gap, -1, z_lid - lip_h - 1])
            cube([latch_w + 2 * latch_side_gap, inner_y + 2, lip_h + 1]);
        }
        for (side = [0, 1], x = latch_x) at_wall(side) latch_tab(x);
        // tongue that fills the SMA slot down to the jack, joined to the lip by a web
        tongue_z = sma_zz + sma_d / 2 + 0.3;
        translate([sma_x - tongue_w / 2, inner_y, tongue_z]) cube([tongue_w, wall, z_lid - tongue_z + fudge]);
        translate([sma_x - tongue_w / 2, inner_y - lip_gap - lip_t, z_lid - lip_h]) cube([tongue_w, lip_gap + lip_t + fudge, lip_h + fudge]);
        // 45-degree gusset under the web stiffens the tongue's root
        hull() {
          translate([sma_x - tongue_w / 2, inner_y - lip_gap - lip_t, z_lid - lip_h - fudge]) cube([tongue_w, lip_gap + lip_t + fudge, fudge]);
          translate([sma_x - tongue_w / 2, inner_y - fudge, z_lid - lip_h - lip_gap - lip_t]) cube([tongue_w, 2 * fudge, fudge]);
        }
        // tubes over the module's left-hand holes keep it down
        for (h = left_holes) translate([h[0], h[1], plateau_z + tube_gap]) cylinder(d = tube_d, h = z_lid - plateau_z - tube_gap + fudge);
        // pads on the Atom's four corners, clear of the button
        for (u = [atom_pad_inset, atom - atom_pad_inset - atom_pad], v = [atom_pad_inset, atom - atom_pad_inset - atom_pad])
          translate([atom_x0 + u, atom_y0 + v, atom_top + 0.1]) cube([atom_pad, atom_pad, z_lid - atom_top - 0.1 + fudge]);
      }
      translate([well_xy[0], well_xy[1], z_lid - 1]) cylinder(d = well_d, h = lid_t + 2);
      translate([inner_x - 2, usb_y - usb_plug_w / 2, z_lid - fudge])
        cube([wall + 3, usb_plug_w, max(0, usb_z + usb_plug_h / 2 - z_lid) + fudge]);
      if (accent) translate([well_xy[0], well_xy[1], z_lid + lid_t - accent_t]) ring(accent_od, well_d - fudge, accent_t + fudge);
      if (logo) translate([logo_xy[0], logo_xy[1], z_lid + lid_t - logo_depth]) linear_extrude(logo_depth + fudge) logo_2d();
      // spring flaps: a U-shaped cut through the plate, thinned to flap_t from below
      for (fy = flap_y) {
        difference() {
          translate([flap_hinge_x, fy - flap_w / 2 - flap_slot, z_lid - fudge]) cube([flap_x1 + flap_slot - flap_hinge_x, flap_w + 2 * flap_slot, lid_t + 2 * fudge]);
          translate([flap_hinge_x - fudge, fy - flap_w / 2, z_lid - 2 * fudge]) cube([flap_x1 - flap_hinge_x + fudge, flap_w, lid_t + 4 * fudge]);
        }
        // thinned from below, with a 45-degree ramp at the hinge against a sharp root
        hull() {
          translate([flap_hinge_x, fy - flap_w / 2 - fudge, z_lid - fudge]) cube([fudge, flap_w + 2 * fudge, fudge]);
          translate([flap_hinge_x + flap_ramp, fy - flap_w / 2 - fudge, z_lid - fudge]) cube([flap_x1 - flap_hinge_x - flap_ramp + fudge, flap_w + 2 * fudge, lid_t - flap_t + fudge]);
        }
      }
      if (vents) for (r = lid_vent_rows, x = [lid_vent_first : vent_pitch : atom_x0 - lid_vent_end_gap])
        translate([x - vent_w / 2, r[0], z_lid - fudge]) cube([vent_w, r[1] - r[0], lid_t + 2 * fudge]);
      // notches in the tubes over the left-hand screw heads
      for (h = left_holes) head_sweep(h, head_notch_r, plateau_z + tube_gap - 1, tube_pocket_top - plateau_z - tube_gap + 1);
    }
    // nubs under the flaps press the clamp
    for (fy = flap_y) translate([nub_x, fy, clamp_top - preload_eff]) cylinder(d = nub_d, h = z_lid + lid_t - flap_t - clamp_top + preload_eff + fudge);
  }
}

// the second-filament fills: accent ring and logo, each inlay_gap smaller than its recess
module lid_inlay_body() {
  if (accent) translate([well_xy[0], well_xy[1], z_lid + lid_t - accent_t])
    ring(accent_od - 2 * inlay_gap, well_d + 2 * inlay_gap, accent_t);
  if (logo) translate([logo_xy[0], logo_xy[1], z_lid + lid_t - logo_depth])
    linear_extrude(logo_depth) offset(delta = -inlay_gap) logo_2d();
}

// ---------------------------------------------------------------- clamp

inner_face = mp([hdr_col[0], 0])[0] - pitch / 2;  // -X face of the housing block
edge_face = mp([hdr_col[1], 0])[0] + pitch / 2;   // +X face
clamp_x0 = inner_face - tolerance - skirt_t;
clamp_x1 = max(right_holes[0][0] + boss_d / 2, edge_face + tolerance + skirt_t);
clamp_y0 = min(right_holes[0][1], right_holes[1][1]) - boss_d / 2;
clamp_y1 = max(right_holes[0][1], right_holes[1][1]) + boss_d / 2;
used_y = [for (p = pins_used) pin_xy(p)[1]];
// housing faces of the header's first and last rows: the bosses stay clear of them
row1_face = row_y(1) + pitch / 2;
row15_face = row_y(15) - pitch / 2;

module clamp_body() {
  difference() {
    union() {
      translate([clamp_x0, clamp_y0, clamp_under]) cbox([clamp_x1 - clamp_x0, clamp_y1 - clamp_y0, clamp_t + clamp_drop], 1.5, ct = ef_chamfer);
      for (h = right_holes) {
        intersection() {
          translate([h[0], h[1], plateau_z + boss_gap]) cylinder(d = boss_d, h = clamp_under - plateau_z - boss_gap + fudge);
          // flat side towards the header
          if (h[1] > mod_y0 + mod_w / 2)
            translate([0, row1_face + tolerance, 0]) cube([200, 100, 100]);
          else
            translate([0, row15_face - tolerance - 100, 0]) cube([200, 100, 100]);
        }
        let(p = clamp_pin_of(h))
          translate([p[0], p[1], plateau_z + boss_gap - clamp_pin_h]) cylinder(d1 = clamp_pin_d - clamp_pin_taper, d2 = clamp_pin_d, h = clamp_pin_h + fudge);
      }
      // skirts on both long sides keep the housings upright
      for (x = [clamp_x0, edge_face + tolerance])
        translate([x, min(used_y) - pitch / 2 - 0.5, clamp_under - skirt_h])
          cube([skirt_t, max(used_y) - min(used_y) + pitch + 1, skirt_h + fudge]);
    }
    // notches in the bosses over the right-hand screw heads, from the boss's underside up; the
    // pins below stay whole
    for (h = right_holes) head_sweep(h, head_notch_r, plateau_z + boss_gap - fudge, boss_pocket_top - plateau_z - boss_gap + fudge);
    // one slot per jumper, open towards the Atom so the clamp slides over the wires
    for (p = pins_used) {
      xy = pin_xy(p);
      hull() {
        translate([xy[0], xy[1], clamp_under - skirt_h - 1]) cylinder(d = slot_w, h = skirt_h + clamp_t + clamp_drop + 2);
        translate([clamp_x1 + 1, xy[1] - slot_w / 2, clamp_under - skirt_h - 1]) cube([1, slot_w, skirt_h + clamp_t + clamp_drop + 2]);
      }
    }
  }
}

// ---------------------------------------------------------------- boards (views and clash checks)

module cc1101_model() {
  color("#30343b") translate([mod_x0, mod_y0, mod_z0]) {
    difference() {
      union() {
        rbox([mod_w, mod_w, mod_rim_t], mod_r);
        translate([mod_plateau_inset, mod_plateau_inset, 0])
          rbox([mod_w - 2 * mod_plateau_inset, mod_w - 2 * mod_plateau_inset, mod_t], mod_r - mod_plateau_inset);
      }
      for (h = mod_holes) translate([h[0], mod_w - h[1], -1]) cylinder(d = mod_hole_d, h = mod_t + 2);
    }
  }
  color("#e8e8e8") translate([mod_x0 + 6, mod_y0 + 8, plateau_z - fudge]) cube([32, 38, 0.05]);
  // M2 socket screws beside the corner holes: each head at its largest size, swept over the
  // measured range of positions, so the clash checks cover all of them
  color("#b8bcc2") for (h = hole_xy) head_sweep(h, screw_head_d / 2, plateau_z - fudge, screw_head_h + fudge);
  color("#111") translate([mp([hdr_col[0], 0])[0] - pitch / 2, row_y(15) - pitch / 2, plateau_z - fudge])
    cube([2 * pitch, 15 * pitch, spacer_z - plateau_z + fudge]);
  color("#d4af37") for (r = [1 : 15], c = [0, 1]) {
    xy = mp([hdr_col[c], hdr_row1 + (r - 1) * pitch]);
    translate([xy[0] - 0.32, xy[1] - 0.32, spacer_z - fudge]) cube([0.64, 0.64, mod_z0 + hdr_pin_top - spacer_z]);
  }
  color("#d4af37") {
    translate([sma_x - sma_flange[0] / 2, mod_y0 + mod_w - fudge, mod_z0 + 0.9]) cube([sma_flange[0], sma_flange[1], sma_flange[2]]);
    translate([sma_x, mod_y0 + mod_w - fudge, sma_zz]) rotate([-90, 0, 0]) cylinder(d = sma_d, h = sma_len);
  }
  color("#b8bcc2") sma_heads();
}

// the flange screws' heads, each swept over both spacings
module sma_heads(dz = 0) {
  for (s = [-1, 1]) hull() for (dx = sma_screw_dx)
    translate([sma_x + s * dx / 2, mod_y0 + mod_w + sma_flange[1] - fudge, sma_zz + dz]) rotate([-90, 0, 0])
      cylinder(d = sma_head[0], h = sma_head[1] + fudge);
}

module antenna_model() {
  y0 = mod_y0 + mod_w + sma_len - 4;
  color("#1b1b1b") {
    translate([sma_x, y0, sma_zz]) rotate([-90, 0, 0]) cylinder(d = 8, h = 12);
    translate([sma_x, y0 + 16, sma_zz]) sphere(d = 9);
    translate([sma_x, y0 + 16, sma_zz]) cylinder(d = 8, h = 96);
    translate([sma_x, y0 + 16, sma_zz + 96]) sphere(d = 8);
  }
}

module atom_model() {
  translate([atom_x0, atom_y0, atom_z0]) {
    color("#5f6670") rbox([atom, atom, atom_h - 0.2], atom_r);
    color("#d9dde3") translate([4.4, 5.4, atom_h - 0.3]) rbox([12.4, 13.4, 0.3], 3);
    color("#3fa9f5") translate([11, 11.7, atom_h - 0.1]) cube([2, 0.6, 0.15]);
    color("#111") translate([atom - 0.2, atom / 2, atom_h - atom_usb_dz]) rotate([0, 90, 0])
      hull() for (s = [-1, 1]) translate([0, s * 2.85, 0]) cylinder(d = 3.2, h = 0.3);
  }
  // male Dupont plugs under the Atom
  color("#111") for (u = atom_plug_u, v = atom_col_v)
    translate([atom_x0 + u - 1.25, atom_y0 + v - 1.25, atom_z0 - dupont_len]) cube([2.5, 2.5, dupont_len + fudge]);
}

module housings() {
  color("#111") for (p = pins_used) {
    xy = pin_xy(p);
    translate([xy[0] - 1.25, xy[1] - 1.25, spacer_z]) cube([2.5, 2.5, clamp_housing_len]);
  }
}

// [module pin, Atom column (0: 4 sockets, 1: 5 sockets), Atom row, colour] as wired
links = [
  [1, 0, 3, "#202020"],  // GND  - G
  [7, 1, 2, "#2f6fdc"],  // MOSI - G23
  [8, 0, 0, "#ff8c1a"],  // CSN  - G21
  [9, 1, 1, "#2fa84f"],  // MISO - G19
  [11, 1, 3, "#f2d21b"], // SCK  - G33
  [20, 1, 0, "#8e44ad"], // GDO0 - G22
  [22, 0, 1, "#f4f4f4"], // GDO2 - G25
  [28, 0, 2, "#d62828"], // 5V   - 5V
];

module wires() {
  for (i = [0 : len(links) - 1]) {
    l = links[i];
    a = pin_xy(l[0]);
    b = [atom_x0 + atom_plug_u[l[2]], atom_y0 + atom_col_v[l[1]]];
    zr = housing_top + clamp_t + 1.3 + (i % 3) * 0.6;
    zf = floor_t + 1.2 + l[2] * 1.5;
    wire([
      [a[0], a[1], clamp_under],
      [a[0], a[1], zr - 0.6],
      [a[0] + 2, a[1], zr],
      [mod_x0 + mod_w + 1.5 + i * 0.5, a[1] + (b[1] - a[1]) * 0.35, zr - 1],
      [atom_x0 - 4 + i * 0.4, a[1] + (b[1] - a[1]) * 0.85, zf + 4],
      [atom_x0 + 1, b[1], zf],
      [b[0] - 1.5, b[1], zf],
      [b[0], b[1], zf + 1.5],
      [b[0], b[1], atom_z0 - dupont_len],
    ], wire_d, l[3]);
  }
}

// boards without wires and antenna, for the clash checks
module boards_fit() {
  cc1101_model();
  atom_model();
  housings();
}

// ---------------------------------------------------------------- output

module lid_flip() { translate([0, 0, z_lid + lid_t]) rotate([180, 0, 0]) children(); }
module clamp_flip() { translate([0, 0, clamp_top]) rotate([180, 0, 0]) children(); }

// Section view: keeps what lies behind the plane through the jumper on pin 11.
section_y = pin_xy(11)[1];
module sec(c = "#3a3d42") {
  // the cut faces take the colour of the cutting box
  if (part == "section")
    intersection() {
      children();
      color(c) translate([-100, section_y, -100]) cube([300, 200, 300]);
    }
  else children();
}

module shell_colours(lid_dz = 0, clamp_dz = 0, show_lid = true) {
  sec("#c9ced6") color("#c9ced6") base();
  sec("#f08a24") color("#f08a24") translate([0, 0, clamp_dz]) clamp_body();
  if (show_lid) translate([0, 0, lid_dz]) {
    sec("#c9ced6") color("#c9ced6") lid_body();
    sec(accent_colour) color(accent_colour) lid_inlay_body();
  }
}

module boards_view() {
  sec("#30343b") cc1101_model();
  sec("#5f6670") atom_model();
  sec("#1b1b1b") housings();
  sec("#1b1b1b") wires();
  antenna_model();
}

up = [0, 0, 2 * fudge]; // resting parts are posed this far apart in the clash checks

if (part == "base") base();
else if (part == "base_wall") base(ears = true);
else if (part == "lid") lid_flip() lid_body();
else if (part == "lid_inlay_parts") lid_flip() lid_inlay_body();
else if (part == "clamp") clamp_flip() clamp_body();
else if (part == "plate_all") {
  // the parts as they lie on the print plate
  color("#c9ced6") base(ears = true);
  translate([0, -12, 0]) {
    color("#c9ced6") lid_flip() lid_body();
    color(accent_colour) lid_flip() lid_inlay_body();
  }
  color("#f08a24") translate([-70, 60, 0]) clamp_flip() clamp_body();
}
else if (part == "clash_lid_base") intersection() { base(ears = true); translate(up) lid_body(); }
else if (part == "clash_clamp_lid") intersection() { clamp_body(); lid_body(); }
else if (part == "clash_clamp_base") intersection() { clamp_body(); base(); }
else if (part == "clash_base_boards") intersection() { base(); translate(up) boards_fit(); }
else if (part == "clash_lid_boards") intersection() { lid_body(); boards_fit(); }
else if (part == "clash_clamp_boards") intersection() { translate(up) clamp_body(); boards_fit(); }
else if (part == "clash_sma_heads_path") intersection() { base(); hull() { sma_heads(); sma_heads(z_lid); } }
else if (part == "clash_inlay_lid") intersection() { lid_body(); translate(up) lid_inlay_body(); }
else if (part == "assembly_open") { shell_colours(show_lid = false); boards_view(); }
else if (part == "explode") { shell_colours(lid_dz = 55, clamp_dz = 22); boards_view(); }
else { shell_colours(); boards_view(); }
