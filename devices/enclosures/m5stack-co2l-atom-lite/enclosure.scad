// === DESCRIPTION ===
// Dragon stand ("smok"): a bedside figure that holds an M5Stack Atom Lite (ESP32) and an M5Stack
// Unit CO2L (Sensirion SCD41) joined by the unit's 20 cm Grove cable. A dragon sits on a rock; the
// Atom stands in a cave in the rock's side, the CO2L lies inside the dragon's openwork head, the
// Grove cable runs up a hidden channel through the haunch, body and neck, and the Atom's USB-C cable
// runs through a tunnel in the rock and leaves at the head end.
// Indoors, on a bedside table. Loads: handling, a finger pressing the Atom's button sideways in the
// cave, the cables. The Atom dissipates roughly 0.5 W (estimate); the sensor must not see it.
//
// Design decisions:
//   - Clamshell: the dragon and rock are two mirror halves split on the mid plane (Y = 0), each
//     printed lying on its cut face. Every cavity (Atom bay, plug bay, USB tunnel, Grove channel,
//     head cage) is a groove in the cut faces, so the Atom, the sensor and both cables are laid in
//     with their plugs connected and the second half closes over them. Nothing is threaded.
//   - Cavities that open towards the bed in print have 45-degree vaulted ceilings (pockets) or
//     diamond cross-sections (channels); the head cavity is an octagon so its widest flat ceiling is
//     head_bridge. All openwork holes are diamonds: vertical holes in print, or pointed upwards.
//   - Atom: stands on its edge, button face towards +Y, its port face (USB-C and Grove) towards the
//     figure (+X); lips in front of the port face stop it sliding towards the plug bay. A hollow
//     plunger (separate part) runs through the cave's bore: its ring presses the button, its flange
//     behind the rim keeps it captive, and the LED's light comes out through its tube and grille.
//   - Heat: the Atom bay vents through the rock's back wall (-X), low and high, away from the head;
//     the rock's roof is solid. The Grove ribbon leaves the plug bay through a narrow slot that takes
//     a foam plug, so the hollow core of the body and neck is no chimney from the Atom to the sensor.
//   - Hollow core: a 7 mm gallery through haunch, body and neck carries the ribbon loosely.
//   - The halves are mirror images except the cave and plunger bore (cave_side) and the boulders (-Y).
//   - Sensor: touches the figure only at its flange (the low step at the Grove end): a shelf below
//     and a tab above on each half grip the flange's full width; the tab's front face stops against
//     the dome's step, the cavity's rear stop against the flange's end face. The vented dome has
//     sensor_gap of air on every side (Sensirion SCD4x design-in guide: large openings, small dead
//     volume, decoupled from heat and from the housing).
//   - Wings: separate flat plates (smooth outer face on the bed, ribs up), plugged into the shoulders
//     by a peg and splayed outwards so the last finger rests on the table: outriggers across the
//     figure's thin axis.
//   - Grove slack (the cable is longer than the channel) coils in the plug bay; asserted to fit.
//   - No screws: four printed PETG dowels across the seam (light press fit, blind holes, hidden) and two
//     dovetail keys slid up from the rock's underside (bowtie section: the halves cannot part). PETG-CF is
//     too brittle for springs, so nothing in it flexes; dowels and keys are plain PETG. Print `coupon`
//     first: it settles the dowel and key fits on this printer (playbook-multipart-enclosures.md).
//
// Terminology -> code:
//   "the rock"                 -> rock_pts, rock_solid()
//   "the cave" / Atom pocket   -> atom_box, atom_dy, atom_bay(), atom_stop_t, cave_mouth(), cave_side
//   "button pusher"            -> plunger_*, plunger(), cave_surface_y
//   "vents" / "hollow core"    -> atom_vents(), gallery_w, gallery_dy, gallery()
//   "plug bay" (cable slack)   -> plug_bay_x, plug_bay_z, plug_bay_ys
//   "USB tunnel"               -> usb_tunnel_d (inside), usb_cable_d + usb_exit_len (exit), usb_z
//   "Grove channel"            -> grove_ribbon, grove_path, ribbon_channel()
//   "the head" / cage          -> head_c, head_outer() (crest, brows), head_cavity(), head_holes(), head_eye
//   "flange grip"              -> co2_flange_l, co2_flange_h, flange_grip()
//   "body", "neck", "tail"     -> body2d(), neck_pts, tail_pts, body_t, tail_t
//   "wings"                    -> wing_tips, wing_plate(), wing_placed(), wing_splay, shoulder
//   "dowels", "keys"           -> dowels, dowel_fit, dowel_holes(), bottom_keys, key_fit, coupon()
//
// Common modifications:
//   Real CO2L flange measured   -> co2_flange_l, co2_flange_h (asserts keep the grip off the dome)
//   Thicker USB cable            -> usb_cable_d (channel follows; USB tunnel is asserted inside the rock)
//   Atom ports elsewhere         -> plug bay is generous; usb_z sets the tunnel height
//   Cave on the other side       -> cave_side = -1 (LED towards the other side)
//   Wider wing stance            -> wing_splay (clash_wing_rock must stay empty)
//   Longer tail                  -> tail_pts
//
// Overall dimensions: see the ECHO of `overall` (assembled); each half fits a 256 x 256 plate alone.
// Coordinate system (assembled): X towards the head, Y across (mid plane Y = 0), Z up, rock on Z = 0.
// NOTE: half_r / half_l are rotated into print orientation (cut face on Z = 0); wing_r / wing_l lie flat.
// Reviews: 2026-11-07 Sonnet design review (claude-sonnet-5-5).
// Final review: 2026-11-07, claude-fable-5-1; findings fixed: Atom stop lips restored (plug bay starts behind them),
//   funnel instead of a 24.6 mm flat ceiling over the button face, wing peg 4 mm and core moved off the
//   sockets (>= 1.6 mm wall, checked by clash_wing_channel), rear dovetail key, tail dowel, key recesses,
//   gill ribs 2.4 mm, coupon key test printed like the halves. Residual: tiny first-layer islands (stop lips).

// === PRINT SETTINGS ===
// Material: PETG-CF (eSun, black): stiff, matte, hides layer lines. Needs a hardened nozzle.
// Layer Height: 0.2mm
// Walls/Perimeters: 4 (1.8mm)
// Infill: 15% gyroid (halves), 100% wings and plunger
// Supports: None (vaulted pockets, diamond channels and holes; flat ceilings only head_bridge wide)
// Orientation: halves on their cut face; wings flat, ribs and peg up; plunger grille end down.
// Elephant foot: keep the slicer's compensation on (0.15-0.2): the halves' cut faces mate and carry the grooves.
// Notes: dry PETG-CF 65 C 6 h; nozzle 250 C, bed 75 C; brim 5 mm on the halves (tail and horns).

// === PARAMETERS ===
nozzle_diameter = 0.4;
layer_height = 0.2;

/* [Unit CO2L - M5Stack U104; measured with a caliper 2026-11-07] */
co2 = [48, 24, 16];          // length (X), width (Y), height (Z): M5Stack spec, confirmed
co2_flange_l = 17;           // low step at the Grove end, from the end face to the dome: measured 17
co2_flange_h = 8;            // flange top above the unit's bottom: measured 8
// vents: grid on the dome's top, slots on both long sides; bottom closed (label, screw); photos 2026-11-07
grove_plug = [2, 10, 4];     // Grove plug: sticks out 2 beyond the end face (measured); 10 x 4 max outline (measured)
grove_plug_z = 4;            // plug axis above the unit's bottom: mid-flange (photo, unmeasured)
sensor_gap = 4;              // air round the dome

/* [Atom Lite - M5Stack C008: caliper 2026-11-07, side key from the official STL 2026-11-08] */
atom = 24;                   // face size
atom_t = 10;                 // thickness (button face to back): measured 9-10
usb_z_on_atom = 12;          // USB-C axis above the Atom's lower edge, as it stands (estimate)
// Side key (position from M5Stack's official Atom-Lite.stl, M5_Hardware/Products/C008_Atom-Lite). It is the reset key (pressing it restarted a running unit, 2026-11-08). On a side face next to the
// port face; seen with the back (label) towards you and the ports on the right, it is on the upper face.
atom_key_x = [4.4, 10.5];    // along the side face, from the edge away from the ports (official STL)
atom_key_d = 7.9;            // from the button face towards the back (official STL)
atom_key_proud = 0;          // the reset key sits flush with the case outline (official STL, checked on a unit 2026-11-08)
key_relief = false;          // pocket in the bay wall over the key; off: a flush key is never pressed with the bay clearance
key_relief_margin = 1;       // relief pocket larger than the key on each side (when key_relief)

/* [Cables] */
usb_cable_d = 4.5;           // USB-C cable diameter (estimate)
grove_ribbon = [6.4, 1.4];   // Grove: flat 4-wire ribbon, width x thickness (measured ~6 x 1.2; 8 wide at the plugs)
grove_len = 200;             // Grove cable, plug face to plug face
plug_out = 22;               // USB-C and Grove plugs: rigid length out of the Atom (estimate)

/* [Figure] */
body_t = 20;                 // body and neck slab thickness
tail_t = 12;
cave_side = 1;               // +1: cave (button, LED) on +Y = the dragon's left; -1: on -Y = the dragon's right
wing_splay = 26;             // wing plane tilted outwards from vertical (degrees)

// === DERIVED CONSTANTS ===
extrusion_width = nozzle_diameter * 1.125;
wall = extrusion_width * 4;                 // 1.8
fudge = 0.01;
tolerance = 0.3;                            // PETG sliding fit
hole_comp = 0.3;
$fn = $preview ? 24 : 48;

// --- rock (low-poly hull) ---
rock_w = 68;
rock_front_h = 24;
rock_pts = [
    [-58, -rock_w/2, 0], [62, -rock_w/2, 0], [62, rock_w/2, 0], [-58, rock_w/2, 0],
    [-56, -22, 42], [-56, 22, 42], [-40, -20, 46], [-40, 20, 46], [-24, -18, 44], [-24, 18, 44],
    [-8, -22, 34], [-8, 22, 34], [16, -24, 28], [16, 24, 28], [40, -24, 24], [40, 24, 24],
    [62, -24, rock_front_h], [62, 24, rock_front_h], [62, -30, 6], [62, 30, 6], [-58, -30, 14], [-58, 30, 14]];

// --- Atom, standing on edge; x range, z range; y centred ---
floor_z = 4;
atom_x0 = -54;
// plunger (button pusher) between the Atom's face and the cave: the Atom sits plunger_room towards -Y
plunger_od = 12;            // tube outside diameter
plunger_id = 8;             // tube bore: the LED's light comes out through it
plunger_windows = 1;        // end plate: 1 = one large round window (6.4), 4 = four behind a 1.8 mm cross
plunger_flange_d = 18;      // flange inside the rock, keeps the plunger captive
plunger_flange_t = 1.8;
plunger_cone = 3.6;         // flange's cone towards the tube (50 degrees: prints on the grille end)
plunger_pad = [10, 7, 0.8]; // ring that presses the button: od, id, height beyond the flange
plunger_travel = 0.6;       // free play before the pad touches the button
plunger_proud = 2.5;        // tube end stands this far out of the rock
plunger_room = plunger_pad[2] + plunger_flange_t + plunger_cone + plunger_travel;   // Atom face -> rim
atom_dy = -cave_side * (plunger_room - atom_t / 2 + 1.2);   // shift so the rim lands 1.2 behind the old face line
atom_box = [[atom_x0, -atom_t / 2 + atom_dy, floor_z], [atom_x0 + atom, atom_t / 2 + atom_dy, floor_z + atom]];
atom_port_x = atom_x0 + atom;
cave_rim_t = 1.8;                           // rim the plunger flange rests against (4 perimeters)
cave_surface_y = 29;                        // rock's side surface at the cave centre (from the rock hull; check in renders)
// plug bay: both plugs and the Grove slack
plug_bay_x = [atom_port_x + tolerance + 1.8 - fudge, atom_port_x + plug_out + 14];   // starts behind the stop lips
atom_stop_t = 1.8;                          // lips in front of the Atom's port face, above and below the plug window
plug_window_z = [floor_z + 5, floor_z + atom - 5];
usb_window_extra = 2;        // plug window reaches this far past the button face, where the USB-C sits (TEST1 2026-11-08: socket flush with the edge)
plug_bay_z = [floor_z, floor_z + atom + 4];
plug_bay_ys = 7.5;                          // straight walls to |y| = plug_bay_ys, then a 45-degree vault
usb_z = floor_z + usb_z_on_atom;
// The Atom is not mirrored with the figure: with the button face towards the cave and the ports to +X, its key face
// is the bay's ceiling for cave_side = +1 and its floor for cave_side = -1 (it would stand on the key).
atom_key_up = cave_side > 0;
atom_face_y = cave_side > 0 ? atom_box[1].y : atom_box[0].y;   // button face
key_relief_h = atom_key_proud + tolerance + 0.7 + 0.5;                // pocket depth beyond the bay wall

// --- head ---
head_c = [52, 0, 138];                      // sensor centre
CAV = co2 + 2 * [sensor_gap, sensor_gap + 1.5, sensor_gap + 1.5];   // +1.5 in Y, Z keeps the dome's long edges off the chamfers
head_wall = 4;
head_chamfer = 8;                           // octagon corners of the cavity (along Z; 1.1x along Y: faces steeper than 45 in print)
head_bridge = CAV.z - 2 * head_chamfer;     // flat ceiling width in print
head_rear = 14;                             // solid rear block behind the cavity (plug pocket, screw)
head_front = 10;
flange_x0 = head_c.x - co2.x / 2;           // sensor's Grove end face
flange_top = head_c.z - co2.z / 2 + co2_flange_h;
sensor_bottom = head_c.z - co2.z / 2;

// --- body, neck, tail (XZ, slab) ---
neck_pts = [[10, 88, 10.5], [12, 102, 9.5], [17, 116, 9], [25, 126, 9], [head_c.x - 30, head_c.z - 10, 9]];
tail_pts = [[-10, 36, 9], [-24, 46, 7], [-38, 48, 6], [-52, 48, 5.2], [-64, 46, 4.8], [-74, 43, 4.4],
            [-82, 47, 4.0], [-85, 56, 3.8], [-80, 64, 3.6]];

// --- Grove channel: plug bay -> haunch -> body -> neck -> head plug pocket (XZ, y = 0) ---
grove_path = [[atom_port_x + 10, plug_bay_z[1] - 6], [-4, 40], [2, 62], [11, 88], [13, 100],
              [18, 113], [head_c.x - 31, head_c.z - 14], [head_c.x - 31, sensor_bottom + grove_plug_z]];
function seglen(p) = len(p) < 2 ? 0 : norm(p[1] - p[0]) + seglen([for (i = [1:len(p) - 1]) p[i]]);
grove_route = seglen(grove_path) + abs(flange_x0 - grove_plug.x - (head_c.x - 31));   // + the run into the plug
grove_slack = grove_len - grove_route - plug_out;  // left over, coils in the plug bay

// --- USB tunnel ---
usb_x1 = 62;
usb_tunnel_d = 6.5;          // tunnel inside the rock: roomier than the cable so it lies in easily
usb_exit_len = 8;            // last part of the tunnel, at the cable size, so the exit holds the cable (cable measured 4-4.5 mm 2026-11-08)

// --- no screws: printed PETG dowels across the seam (press fit) + dovetail keys from the rock's underside ---
dowel_d = 5;
dowel_flat = 0.8;           // D-flat depth the pin lies on: 0.8 gives a 3.7 mm wide footing (0.4 / 2.7 mm let every pin go, 2026-11-13)
dowel_fit = -0.15;           // diametral allowance on top of hole_comp: light press. Coupon 2026-11-08 (PETG, P2S): -0.15 grips, -0.05 is loose
dowels = [[12, 60, 7], [head_c.x - 36, head_c.z + 9, 9], [head_c.x + 33, head_c.z - 9, 8], [-70, 45, 4]];   // [x, z, depth per side]; the last one in the tail
key_w = 4; key_d = 4.5; key_flank = 30;
key_fit = 0.05;              // per side: light press, nothing else holds them in. Coupon 2026-11-08: 0.05 grips, -0.05 does not go in
bottom_keys = [[28, 9], [48, 9]];   // [x, length up from the rock's underside]; under the USB tunnel
rear_key = [36, 13.5];               // [z, length in from the rock's back face]: above the Atom bay

// --- wings ---
shoulder = [0, body_t / 2, 86];       // wing root = the wrist joint, where the peg sits
wing_t = 3.2; memb_t = 1.8; rib_w = 3.4;
foot_float = 0.4;           // foot pad stops this far above the table when the peg is seated: it settles in the peg's play
wing_arm = [12, -24];                 // forearm bone: from the wrist (root) down to the front of the membrane
foot_r = 3.5;
// last finger's v so that its foot pad's lowest point (inner face) lands on the table, z = 0
foot_v = -(shoulder.z - foot_float - wing_t * sin(wing_splay)) / cos(wing_splay) + foot_r;
wing_tips = [[-40, -10], [-44, -40], [-26, -66], [-6, foot_v]];
wing_gap = 3;               // plate stands off the body so its top edge (above the root) clears when splayed
peg = [8, 5, 8 + wing_gap]; // peg on the wing's inner face: u, v, height. 8 mm engagement (4 mm let the wings fall out, 2026-11-13)
peg_at = [-4, -1];           // peg centre on the wing plate (u, v) from the root: 4 mm back, off the Grove core, so it can go 8 deep
peg_fit = 0.15;              // per side, wing peg in its shoulder socket. TEST1 2026-11-08: 0.3 (= tolerance) was loose

// === GEOMETRY HELPERS ===
module blob(a, ra, b, rb) hull() { translate(a) circle(ra); translate(b) circle(rb); }
module chain(p) for (i = [0:len(p) - 2]) hull() { translate([p[i].x, p[i].y]) circle(p[i].z); translate([p[i+1].x, p[i+1].y]) circle(p[i+1].z); }
module box(b) translate(b[0]) cube(b[1] - b[0]);
module diamond(w, h) polygon([[0, h / 2], [w / 2, 0], [0, -h / 2], [-w / 2, 0]]);
module octa(r) polyhedron([[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]],
    [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]);
// slab in the XZ plane, t thick, centred on Y = 0, rounded edges
module slab(t, r = 2.5) rotate([90, 0, 0]) minkowski() { linear_extrude(t - 2 * r, center = true) offset(-r) children(); sphere(r, $fn = 8); }
// diamond-section channel along an XZ polyline (apex towards +-Y: prints as a pointed groove)
// ribbon channel along an XZ polyline: the ribbon stands on edge (width across Y) so it bends in XZ;
// section: w wide in the plane, 2 * dy deep across Y, closed by 45-degree points (print: pointed groove)
module ribbon_channel(path, rib) { w = rib[1] + 2 * tolerance + 0.6; dy = rib[0] / 2 + tolerance;
    module st() hull() { rotate([90, 0, 0]) cylinder(d = w, h = 2 * dy, center = true, $fn = 12); cube([fudge, 2 * (dy + w * 0.6), fudge], center = true); }   // round in the plane: faces past 45 degrees for any direction
    for (i = [0:len(path) - 2]) hull() { translate([path[i].x, 0, path[i].y]) st(); translate([path[i+1].x, 0, path[i+1].y]) st(); } }
// hollow core: gallery_w wide in the plane, 2 * gallery_dy across Y, pointed at 50 degrees
gallery_w = 7; gallery_dy = 3.5;
module gallery(path, grow = 0) { w = gallery_w + 2 * grow; dy = gallery_dy + grow;
    module st() hull() { rotate([90, 0, 0]) cylinder(d = w, h = 2 * dy, center = true, $fn = 16); cube([fudge, 2 * (dy + w * 0.6), fudge], center = true); }
    for (i = [0:len(path) - 2]) hull() { translate([path[i].x, 0, path[i].y]) st(); translate([path[i+1].x, 0, path[i+1].y]) st(); } }
// Atom bay vents through the rock's back wall (-X): cool air in low, warm air out high, away from the head
module atom_vents() for (z = [floor_z + 3, floor_z + atom - 3], y = [-6, 0, 6]) translate([atom_x0 - 6, y + atom_dy, z])
    rotate([0, 90, 0]) linear_extrude(8) rotate(90) diamond(4, 2.6);
module channel(path, d) { r = (d / 2 + tolerance) * sqrt(2);
    for (i = [0:len(path) - 2]) hull() { translate([path[i].x, 0, path[i].y]) octa(r); translate([path[i+1].x, 0, path[i+1].y]) octa(r); } }
// pocket split by Y = 0: straight walls to |y| = ys, then a 45-degree vault on both sides
module vault(x, z, ys) { m = min(x[1] - x[0], z[1] - z[0]) / 2 - 0.05;
    hull() { translate([x[0], -ys, z[0]]) cube([x[1] - x[0], 2 * ys, z[1] - z[0]]);
             translate([x[0] + m, -ys - m, z[0] + m]) cube([x[1] - x[0] - 2 * m, 2 * (ys + m), z[1] - z[0] - 2 * m]); } }
function pdist(p, a, b) = let(d = b - a, t = max(0, min(1, (p - a) * d / (d * d)))) norm(p - (a + t * d));
function path_dist(p, path) = min([for (i = [0:len(path) - 2]) pdist(p, path[i], path[i + 1])]);

// === CONTRACTS ===
assert(co2_flange_l >= 8, "flange too short to grip");
assert(co2_flange_h < co2.z - 2, "flange as tall as the dome: no step to stop against");
assert(head_bridge <= 12, "head cavity ceiling would bridge more than 12 mm in print");
assert(grove_slack >= 0, str("Grove cable too short for the route: ", grove_slack));
assert(grove_slack <= 110, str("too much Grove slack for the plug bay: ", grove_slack));
assert(usb_z + (usb_tunnel_d / 2 + tolerance) * sqrt(2) + 2 <= rock_front_h, "USB tunnel too high for the rock's front");
assert(usb_tunnel_d >= usb_cable_d, "USB tunnel narrower than its exit");
for (s = dowels) assert(path_dist([s[0], s[1]], grove_path) >= gallery_w / 2 + dowel_d / 2 + 1.5, str("dowel too close to the Grove core: ", s));
for (k = bottom_keys) assert(k[1] + 0.5 <= usb_z - (usb_tunnel_d / 2 + tolerance) * sqrt(2) - 1.2, str("bottom key reaches the USB tunnel: ", k));
echo(grove_route = grove_route, grove_slack = grove_slack, head_bridge = head_bridge);

// === SOLIDS ===
boulders = [
    [[30, -34, 0], [62, -34, 0], [62, -18, 0], [34, -14, 0], [44, -30, 26], [56, -24, 30], [52, -18, 22], [40, -22, 18]],
    [[-26, -34, 0], [0, -34, 0], [-2, -16, 0], [-24, -14, 0], [-16, -30, 40], [-8, -24, 46], [-18, -20, 38]]];
module rock_solid() {
    hull() for (p = rock_pts) translate(p) cube(2 * fudge, center = true);
    mirror([0, cave_side > 0 ? 0 : 1, 0]) for (b = boulders) hull() for (p = b) translate(p) cube(2 * fudge, center = true);   // boulders on the side away from the cave
}

module body2d() {
    blob([0, 56], 20, [8, 84], 14);             // sitting body
    chain(neck_pts);
    blob([-8, 44], 16, [10, 28], 10);           // haunch
    blob([10, 28], 7, [30, 23], 5);             // hind foot
    blob([20, 74], 4, [30, 62], 3.2); blob([30, 62], 3.2, [38, 63], 2.4);   // arm
}
body_holes = [[-6, 54, 6, 10], [-12, 66, 5, 8], [-14, 44, 5, 8]];   // openwork diamonds, filtered off the channel
module body_openwork() for (h = body_holes) if (path_dist([h[0], h[1]], grove_path) > h[3] / 2 + 5)
    translate([h[0], 0, h[1]]) rotate([90, 0, 0]) linear_extrude(body_t + 2, center = true) diamond(h[2], h[3]);
module tail_solid() {
    slab(tail_t) union() { chain(tail_pts); translate([-80, 65]) rotate(-40) polygon([[0, 7], [6, -2], [0, 0], [-6, -2]]); }
}
module claws() slab(8, 1) for (k = [-1, 0, 1]) translate([32, 23 + k * 3]) rotate(k * 20) polygon([[-2, -2], [7, 0], [-2, 2]]);
module spikes() slab(6, 1) for (p = [[-14, 66, 125], [-8, 82, 115], [0, 96, 120], [6, 108, 128], [14, 120, 135]])
    translate([p[0], p[1]]) rotate(p[2]) polygon([[0, -3.5], [9, 0], [0, 3.5]]);

// head: outer volume around the sensor centre (local coordinates)
module head_outer() {
    hull() {
        for (y = [-1, 1], z = [-1, 1]) translate([-CAV.x / 2 - head_rear + 8, y * (CAV.y / 2 + head_wall - 8), z * (CAV.z / 2 + head_wall - 8)]) sphere(8);
        for (y = [-1, 1], z = [-1, 1]) translate([CAV.x / 2 + head_front - 6, y * (CAV.y / 2 + head_wall - 7), z < 0 ? -(CAV.z / 2 + head_wall - 6) : CAV.z / 2 + head_wall - 7]) sphere(6);
    }
    // crest of swept-back horns on the mid plane (grows from the cut face in print)
    rotate([90, 0, 0]) linear_extrude(7, center = true) for (h = [[-CAV.x / 2 - 6, 26, 140], [-CAV.x / 2 + 6, 18, 135], [-CAV.x / 2 + 16, 11, 130]])
        translate([h[0], CAV.z / 2 + head_wall - 2]) rotate(h[2]) polygon([[0, -4.5], [h[1], 0], [0, 4.5]]);
    for (k = [-1, 1]) hull() for (x = [-24, -12]) translate([x, k * (CAV.y / 2 + head_wall - 3.5), CAV.z / 2 + 1]) sphere(3.5);   // brow ridges
}
module head_cavity() rotate([0, 90, 0]) linear_extrude(CAV.x, center = true) {   // octagon section (local Y, Z)
    c = head_chamfer; cy = 1.1 * head_chamfer; w = CAV.y / 2; h = CAV.z / 2;
    rotate(90) polygon([[-w + cy, -h], [w - cy, -h], [w, -h + c], [w, h - c], [w - cy, h], [-w + cy, h], [-w, h - c], [-w, -h + c]]);
}
head_eye = [-18, 4];                        // eye centre (local X, Z), through both cheeks
// head openwork, variants: "diamonds" (original), "slots" (long horizontal slots, like the sensor's own),
// "gills" (slanted slots), "cage" (vertical bars). Side openings are vertical holes in print (any shape);
// top openings run horizontally in print, so they are pointed along Y (no flat roofs).
head_vents = "gills";
vent_rib = 2.4;                               // material left between openings (PETG-CF: >= 1.6, 2.4 for stiffness)
module stadium(l, w) hull() for (x = [-(l - w) / 2, (l - w) / 2]) translate([x, 0]) circle(d = w);
module pointed_slot(l, w) polygon([[-w / 2, -l / 2 + w / 2], [0, -l / 2], [w / 2, -l / 2 + w / 2], [w / 2, l / 2 - w / 2], [0, l / 2], [-w / 2, l / 2 - w / 2]]);   // long along Y, 45-degree tips
module side_vents2d() {
    if (head_vents == "diamonds")
        for (i = [-1:2], j = [-1, 0, 1]) translate([i * 9 + (j == 0 ? 4.5 : 0), j * 6.5]) diamond(6, j == 0 ? 6 : 4.4);
    if (head_vents == "slots")
        for (j = [-1, 0, 1], x = [[-8, 7], [7 + vent_rib, 25]]) translate([(x[0] + x[1]) / 2, j * (4.2 + vent_rib)]) stadium(x[1] - x[0], 4.2);
    if (head_vents == "gills")
        for (i = [0:4]) translate([-8 + i * (4 + vent_rib) / sin(60), 0]) rotate(60) stadium(24, 4);
    if (head_vents == "cage")
        for (i = [0:5]) translate([-7 + i * (3.6 + vent_rib), 0]) rotate(90) stadium(22, 3.6);
}
module top_vents2d() {
    if (head_vents == "diamonds")
        for (i = [-2:2], k = [-1, 1]) translate([i * 9 + 2, k * 7]) rotate(90) diamond(8, 4.4);
    else
        for (i = [0:4]) translate([-6 + i * (4 + vent_rib + 0.6), 0]) pointed_slot(18, 4);   // clear of the crest
}
module head_holes() {
    translate([head_eye[0], 0, head_eye[1]]) rotate([90, 0, 0]) cylinder(d = 8, h = 60, center = true);
    rotate([90, 0, 0]) linear_extrude(60, center = true) intersection() {   // through both sides, kept inside the cavity's height
        side_vents2d(); translate([-CAV.x / 2 + co2_flange_l - 6, -CAV.z / 2 + 2]) square([CAV.x - co2_flange_l + 6 - 2, CAV.z - 4]);   // stops 2 mm short of the cavity's front
    }
    for (k = [-1, 1]) translate([CAV.x / 2 + 6, k * 7, 4]) rotate([0, 90, 0]) linear_extrude(20, center = true) rotate(90) diamond(8, 4.4);
}
module head_top_holes() translate([0, 0, CAV.z / 2 + head_wall / 2]) linear_extrude(head_wall + 10, center = true) top_vents2d();
// shelf and tab gripping the flange, plus the rear stop (local coordinates, both halves)
module flange_grip() {
    x0 = -co2.x / 2; z0 = -co2.z / 2;
    // shelf: from the cavity floor up to the flange's underside
    translate([x0 - fudge, -CAV.y / 2 - fudge, -CAV.z / 2 - fudge]) cube([co2_flange_l - 1, CAV.y + 2 * fudge, CAV.z / 2 - co2.z / 2 - tolerance / 2 + fudge]);
    // tab: from the flange's top up to the cavity ceiling; its front face stops against the dome's step
    translate([x0 - fudge, -CAV.y / 2 - fudge, z0 + co2_flange_h + tolerance / 2]) cube([co2_flange_l - tolerance, CAV.y + 2 * fudge, CAV.z / 2 - (z0 + co2_flange_h + tolerance / 2) + fudge]);
    // rear stop: frame round the plug, from the cavity's rear wall to the flange end face
    translate([-CAV.x / 2 - fudge, 0, 0]) difference() {
        translate([0, -CAV.y / 2, -CAV.z / 2]) cube([sensor_gap - tolerance / 2 + fudge, CAV.y, CAV.z]);
        translate([-1, -grove_plug.y / 2 - tolerance, -co2.z / 2 + grove_plug_z - grove_plug.z / 2 - tolerance]) cube([sensor_gap + 2, grove_plug.y + 2 * tolerance, grove_plug.z + 2 * tolerance]);
        // keep the stop off the dome: it only covers the flange's height
        translate([-1, -CAV.y, -co2.z / 2 + co2_flange_h]) cube([sensor_gap + 2, 2 * CAV.y, CAV.z]);
    }
}
// plug pocket behind the sensor: plug, and the wires bending down into the neck channel
module plug_pocket() {
    pz = -co2.z / 2 + grove_plug_z;
    vault([-co2.x / 2 - grove_plug.x - 9, -co2.x / 2 + fudge], [pz - grove_plug.z / 2 - tolerance - 1, pz + grove_plug.z / 2 + tolerance + 1], grove_plug.y / 2 + tolerance);
}

module head() translate(head_c) difference() {
    head_outer();
    head_holes();
    head_top_holes();
}
module head_cuts() translate(head_c) { head_cavity(); plug_pocket(); }

// the whole figure, solid, before the split
module figure_solid() {
    rock_solid();
    slab(body_t) body2d();
    tail_solid();
    spikes();
    claws();
    head();
}
module figure_cuts() {
    // Atom bay: straight to the Atom's faces, then vaulted in both halves
    atom_bay();
    vault([plug_bay_x[0], plug_bay_x[1]], plug_bay_z, plug_bay_ys);
    // plug window through the stop lips: the lips stay above and below it
    box([[atom_port_x - 0.5, atom_box[0].y - tolerance - (cave_side > 0 ? 0 : usb_window_extra), plug_window_z[0]], [plug_bay_x[0] + 0.5, atom_box[1].y + tolerance + (cave_side > 0 ? usb_window_extra : 0), plug_window_z[1]]]);
    rear_key_pocket();
    channel([[plug_bay_x[1] - 4, usb_z], [usb_x1 - usb_exit_len - 3, usb_z]], usb_tunnel_d);
    hull() { channel([[usb_x1 - usb_exit_len - 3, usb_z], [usb_x1 - usb_exit_len - 3, usb_z]], usb_tunnel_d);   // 45-degree taper
             channel([[usb_x1 - usb_exit_len, usb_z], [usb_x1 - usb_exit_len, usb_z]], usb_cable_d); }
    channel([[usb_x1 - usb_exit_len, usb_z], [usb_x1 + 5, usb_z]], usb_cable_d);
    ribbon_channel([grove_path[0], grove_path[1]], grove_ribbon);               // narrow slot: foam plug, no chimney
    gallery([for (i = [1:len(grove_path) - 1]) grove_path[i]]);                // loose hollow core through body and neck
    atom_vents();
    body_openwork();
}
// Atom bay: straight to both faces; vaulted (45 degrees) behind the back face; plunger chamber in front
module atom_bay() {
    x = [atom_box[0].x - tolerance, atom_box[1].x + tolerance]; z = [atom_box[0].z - tolerance, atom_box[1].z + tolerance];
    y = [atom_box[0].y - tolerance, atom_box[1].y + tolerance];
    difference() {
        union() {
            translate([x[0], y[0], z[0]]) cube([x[1] - x[0], y[1] - y[0], z[1] - z[0]]);
            // relief for the Atom's side key, full bay depth in Y
            if (key_relief) translate([atom_x0 + atom_key_x[0] - key_relief_margin, y[0], atom_key_up ? z[1] - fudge : z[0] - key_relief_h])
                cube([atom_key_x[1] - atom_key_x[0] + 2 * key_relief_margin, y[1] - y[0], key_relief_h + fudge]);
            mirror([0, cave_side > 0 ? 0 : 1, 0]) intersection() {
                translate([0, (y[0] + y[1]) / 2 * cave_side, 0]) vault(x, z, (y[1] - y[0]) / 2);
                translate([-200, -200 + (cave_side > 0 ? y[0] : -y[1]) + 1, -10]) cube([400, 200, 300]);
            }
        }
        // stop lips in front of the port face (+X), above and below the plug window
        for (zz = [[z[0] - 1, plug_window_z[0]], [plug_window_z[1], z[1] + 1]])
            translate([atom_box[1].x + tolerance - fudge, y[0] - 1, zz[0]]) cube([atom_stop_t, y[1] - y[0] + 2, zz[1] - zz[0]]);
    }
}
// cave: flange chamber in front of the button face, rim, then the plunger bore out to the rock's side
cave_c = [atom_x0 + atom / 2, 0, floor_z + atom / 2];
module cave_mouth() mirror([0, cave_side > 0 ? 0 : 1, 0]) translate([cave_c.x, 0, cave_c.z]) rotate([-90, 0, 0]) {
    y_face = abs(cave_side > 0 ? atom_box[1].y : atom_box[0].y);
    fd = plunger_flange_d + 2 * tolerance; od = plunger_od + 2 * tolerance;
    translate([0, 0, y_face - fudge]) cylinder(d = fd, h = plunger_room - plunger_cone + 2 * fudge);
    // funnel from the bay's square to the chamber: no flat ceiling over the Atom's face (45 degrees at the corners)
    hull() { translate([-(atom + 2 * tolerance) / 2, -(atom + 2 * tolerance) / 2, y_face - fudge]) cube([atom + 2 * tolerance, atom + 2 * tolerance, fudge]);
             translate([0, 0, y_face + 8.5]) cylinder(d = fd, h = fudge); }
    translate([0, 0, y_face + plunger_room - plunger_cone]) cylinder(d1 = fd, d2 = od, h = (fd - od) / 2 * 1.2);   // cone, 50 degrees
    translate([0, 0, y_face]) cylinder(d = od, h = 60);
    translate([0, 0, cave_surface_y - 1]) cylinder(d1 = od, d2 = od + 8, h = 4 + fudge);                       // countersunk mouth
}
module dowel_holes() for (s = dowels) translate([s[0], 0, s[1]]) rotate([90, 0, 0])
    cylinder(d = dowel_d + hole_comp + dowel_fit, h = 2 * s[2], center = true, $fn = 32);
module key_shape(l, fit = 0) {   // bowtie section across the seam, extruded along Z
    w0 = key_w + 2 * fit; d = key_d + fit; w1 = w0 + 2 * d * tan(key_flank);
    linear_extrude(l) polygon([[-w0 / 2, 0], [-w1 / 2, d], [w1 / 2, d], [w0 / 2, 0], [w1 / 2, -d], [-w1 / 2, -d]]);
}
module key_pockets() for (k = bottom_keys) {
    translate([k[0], 0, -1]) key_shape(k[1] + 1.5, key_fit);
    translate([k[0] - 6, -6, -1]) cube([12, 12, 3]);          // recess round the key's end: 1.5 mm stands proud to grip it
}
module rear_key_pocket() translate([rock_pts[0].x - 4, 0, rear_key[0]]) rotate([0, 90, 0]) key_shape(rear_key[1] + 4, key_fit);
module key_print(l) translate([0, 0, key_d]) rotate([90, 0, 0]) key_shape(l);
// pin: D-flat so it prints lying down (strong along its length); chamfered ends
module dowel_print(len) intersection() {
    translate([0, 0, dowel_d / 2 - dowel_flat]) rotate([0, 90, 0]) hull() { cylinder(d = dowel_d - 0.8, h = len, $fn = 32); translate([0, 0, 0.4]) cylinder(d = dowel_d, h = len - 0.8, $fn = 32); }
    translate([-1, -dowel_d, 0]) cube([len + 2, 2 * dowel_d, dowel_d]);
}
// fit coupon: two blocks with holes and pockets at three allowances, plus pins and a key
module coupon() {
    fits = [-0.15, -0.05, 0.05];
    difference() { cube([46, 16, 8]); for (i = [0:2]) translate([8 + i * 15, 8, -1]) cylinder(d = dowel_d + hole_comp + fits[i], h = 10, $fn = 32); }
    // key test: for each fit two half-blocks, groove on the bed as in the halves; stack one on the other, slide the key
    for (i = [0:2], h = [0, 1]) translate([i * 16, 20 + h * 16, 0]) difference() {
        cube([14, 14, key_d + 2.5]);
        f = 0.15 - 0.1 * i; w0 = key_w + 2 * f; d = key_d + f; w1 = w0 + 2 * d * tan(key_flank);
        translate([7, -1, 0]) rotate([-90, 0, 0]) linear_extrude(16) polygon([[-w0 / 2, fudge], [w0 / 2, fudge], [w1 / 2, -d], [-w1 / 2, -d]]);
        for (n = [0:i]) translate([2 + n * 2.5, 12, key_d + 2]) cube([1.2, 3, 1]);   // 1, 2, 3 notches = fit 0.15, 0.05, -0.05
    }
    for (i = [0:2]) translate([50, i * 7, 0]) dowel_print(16);
    translate([54, 16 + dowel_d / 2 + 2 + 10, 0]) key_print(10);   // 2 mm clear of the last pin (it fused at 26)
}

// wing: plate in its own (u, v) plane, root at the origin; peg on the inner face (+w)
function lerp(a, b, t) = a + (b - a) * t;
module wing_outline() polygon(concat([[2, 6], [-6, 4], wing_tips[0]],
    [for (i = [0:len(wing_tips) - 2]) each [lerp(lerp(wing_tips[i], wing_tips[i + 1], 0.5), [0, 0], 0.3), wing_tips[i + 1]]],
    [wing_arm + [-2, -16], wing_arm + [4, 0]]));
module wing_ribs() {
    blob([0, 0], 5.5, wing_arm, 3);                                              // forearm
    rotate(175) polygon([[0, -2.4], [11, 0], [0, 2.4]]);                         // thumb claw, pointing back
    for (t = wing_tips) blob([0, 0], rib_w / 2 + 0.6, t, t == wing_tips[len(wing_tips) - 1] ? rib_w / 2 + 0.6 : rib_w / 2);
    blob(wing_arm, 2.6, wing_arm + [-2, -16], 1.6);
    translate(wing_tips[len(wing_tips) - 1]) circle(foot_r);                           // foot pad
}
module wing_membrane2d() offset(-0.1) offset(0.1) union() {      // closes any pinch points
    difference() {
        wing_outline();
        for (i = [-10:2], j = [-16:2]) translate([i * 7 + (j % 2) * 3.5, j * 6]) diamond(4.4, 4.4);
    }
    difference() { offset(fudge) wing_outline(); offset(-1.8) wing_outline(); }
}
module wing_plate(ribs = true) {
    linear_extrude(memb_t) union() { wing_membrane2d(); wing_ribs(); }
    translate([0, 0, memb_t - fudge]) linear_extrude(wing_t - memb_t + fudge) wing_ribs();
    translate([peg_at.x - peg.x / 2, peg_at.y - peg.y / 2, wing_t - fudge]) cube([peg.x, peg.y, peg.z + fudge]);   // peg

}
// right wing in place (+Y). The plate's w axis maps to -Y, so the peg points into the body.
module wing_place_r() translate([shoulder.x, shoulder.y + wing_gap + wing_t, shoulder.z]) rotate([wing_splay, 0, 0]) rotate([90, 0, 0]) children();
module wing_placed(side, ribs = true) if (side > 0) wing_place_r() wing_plate(ribs); else mirror([0, 1, 0]) wing_place_r() wing_plate(ribs);
module peg_socket(side) {
    module s() wing_place_r() translate([peg_at.x - peg.x / 2 - peg_fit, peg_at.y - peg.y / 2 - peg_fit, wing_t - 1]) cube([peg.x + 2 * peg_fit, peg.y + 2 * peg_fit, peg.z + 1 + tolerance]);
    if (side > 0) s(); else mirror([0, 1, 0]) s();
}

// plunger, in print orientation: grille end on the bed, flange and pressing ring on top
plunger_len = cave_surface_y + plunger_proud - (abs(cave_side > 0 ? atom_box[1].y : atom_box[0].y) + plunger_pad[2] + plunger_travel);
module plunger() {
    difference() {
        union() {
            cylinder(d = plunger_od, h = plunger_len - plunger_flange_t - fudge);
            translate([0, 0, plunger_len - plunger_flange_t - plunger_cone]) cylinder(d1 = plunger_od, d2 = plunger_flange_d, h = plunger_cone);
            translate([0, 0, plunger_len - plunger_flange_t - fudge]) cylinder(d = plunger_flange_d, h = plunger_flange_t + fudge);
            translate([0, 0, plunger_len - fudge]) cylinder(d = plunger_pad[0], h = plunger_pad[2] + fudge);
        }
        translate([0, 0, 1.8]) cylinder(d = plunger_id, h = plunger_len + 10);            // tube bore over the grille
        translate([0, 0, plunger_len - 1]) cylinder(d = plunger_pad[1], h = 10);
        // end plate (lies on the bed): one large window, or four behind a cross
        if (plunger_windows == 1) translate([0, 0, -1]) cylinder(d = plunger_id - 1.6, h = 4);
        else for (q = [0:3]) rotate(q * 90 + 45) translate([0, 0, -1]) linear_extrude(4)
            intersection() { circle(d = plunger_id - 1); translate([0.9, 0.9]) square(plunger_id); }
    }
}
// plunger in place (assembled), pad touching the button
module plunger_placed() mirror([0, cave_side > 0 ? 0 : 1, 0]) translate([cave_c.x, abs(cave_side > 0 ? atom_box[1].y : atom_box[0].y) + plunger_travel + plunger_len + plunger_pad[2], cave_c.z]) rotate([90, 0, 0]) plunger();
assert(plunger_len > 15, "plunger too short: check cave_surface_y");


// ================= TEST PLATE: sections cut from the real halves + the fit coupon =================
// One print (two filaments with an AMS): head and cave sections of both halves, the shoulder with a
// wing-root stub, in PETG-CF; the coupon, plunger, a key and dowels in PETG. Close the sections over the
// real CO2L and Atom to check the flange grip, the dome's clearance, the stop lips, the plunger's click,
// the rear key and the head dowels before the 11-hour halves.
test_cave = [[-58, 2], [-25, 32]];                                    // Atom bay, stop lips, plunger bore
test_head = [[head_c.x - 37, head_c.z - 16], [head_c.x + 31, head_c.z + 16]];   // cut clear of the Grove channel   // flange grip, dome clearance, gills
test_shoulder = [[-11, 75], [11, 93]];   // below the neck spike, so no slivers
// a section of one half, laid on its cut face with its min corner at (px, py)
module test_section(side, b, px, py, d = 200) {   // d: how deep from the seam to keep
    w = b[1].x - b[0].x; h = b[1].y - b[0].y;
    translate([px - b[0].x, side > 0 ? py + b[1].y : py - b[0].y, 0])
        rotate([side > 0 ? 90 : -90, 0, 0]) intersection() { half(side); translate([b[0].x, -d, b[0].y]) cube([w, 2 * d, h]); }
}
module wing_root_stub(r = 16) intersection() { wing_plate(); translate([0, 0, -1]) cylinder(r = r, h = 30); }
module plate_test_cf() {          // the cave side's half only: put the real parts in and hold them
    test_section(cave_side, test_head, 4, 4);
    test_section(cave_side, test_cave, 74, 4);
    test_section(cave_side, test_shoulder, 112, 4);
    translate([160, 22, 0]) wing_root_stub();
}
// TEST3: only what changed after TEST1 - the plug window round the USB-C and the tighter wing socket
test_ports = [[atom_port_x - 8, floor_z - 2], [atom_port_x + 8, floor_z + atom + 2]];   // Atom's port end, stop lips, plug window
module plate_test_delta() {
    test_section(cave_side, test_ports, 4, 4, 12);   // 12 mm from the seam: Atom, window, plug bay walls
    test_section(cave_side, test_shoulder, 26, 4);
    translate([62, 14, 0]) wing_root_stub(8);
}
// dowels alone: two sets, spaced for a 3 mm brim round each pin
module plate_dowels() for (c = [0, 1], i = [0:len(dowels) - 1]) translate([c * 30, i * 12, 0]) dowel_print(2 * dowels[i][2] - 0.6);
module plate_test_petg() {
    translate([4, 46, 0]) coupon();
    translate([92, 58, 0]) plunger();
}

// === PARTS ===
module figure() difference() {
    union() { difference() { figure_solid(); head_cuts(); } translate(head_c) flange_grip(); }
    figure_cuts();
    dowel_holes();
    key_pockets();
    for (s = [-1, 1]) peg_socket(s);
    cave_mouth();
}

module half(side) intersection() { figure(); translate([-200, side > 0 ? 0 : -200, -10]) cube([400, 200, 300]); }
module half_print(side) rotate([side > 0 ? 90 : -90, 0, 0]) half(side);

// proxies (assembled pose), shrunk by fudge for the clash checks
module sensor_proxy(s = 0) translate(head_c - co2 / 2 + [s, s, s]) {
    cube([co2_flange_l - s, co2.y - 2 * s, co2_flange_h - 2 * s]);
    translate([co2_flange_l - fudge, 0, 0]) cube([co2.x - co2_flange_l - 2 * s, co2.y - 2 * s, co2.z - 2 * s]);
    translate([-grove_plug.x + s, co2.y / 2 - grove_plug.y / 2, grove_plug_z - grove_plug.z / 2]) cube([grove_plug.x, grove_plug.y - 2 * s, grove_plug.z - 2 * s]);
}
module atom_proxy(s = 0) {
    translate(atom_box[0] + [s, s, s]) cube(atom_box[1] - atom_box[0] - 2 * [s, s, s]);
    atom_key_proxy(s);
}
// the side key as it stands proud of the case (clash_atom checks the relief clears it)
module atom_key_proxy(s = 0) if (atom_key_proud > 0) {
    ky = cave_side > 0 ? [atom_face_y - atom_key_d, atom_face_y] : [atom_face_y, atom_face_y + atom_key_d];
    kz = atom_key_up ? [atom_box[1].z, atom_box[1].z + atom_key_proud] : [atom_box[0].z - atom_key_proud, atom_box[0].z];
    translate([atom_x0 + atom_key_x[0] + s, ky[0] + s, kz[0] + s])
        cube([atom_key_x[1] - atom_key_x[0] - 2 * s, ky[1] - ky[0] - 2 * s, kz[1] - kz[0] - 2 * s]);
}

part = "all"; // "plate_dowels", "clash_sockets", "check_socket_out", "check_peg_off_wing", "plate_test_delta", "plate_test", "plate_test_cf", "plate_test_petg", "plate_coupon", "dowel_7", "dowel_9", "dowel_8", "dowel_4", "key_bottom", "key_rear", "check_atom_stop", "all", "assembly", "exploded", "view_inside", "half_r", "half_l", "wing_r", "wing_l", "plunger", "clash_plunger", "clash_sensor", "clash_atom", "clash_wing_r", "clash_wing_l", "clash_wing_rock", "clash_wing_channel", "clash_core_wall", "clash_cave_access"
if (part == "all" || part == "assembly") {
    color("#4a4a4a") figure();
    color("#4a4a4a") for (s = [-1, 1]) wing_placed(s);
    color("ivory") sensor_proxy();
    color("dimgray") atom_proxy();
    color("#4a4a4a") plunger_placed();
}
if (part == "exploded") {
    for (s = [-1, 1]) translate([0, s * 60, 0]) { color("#4a4a4a") half(s); color("#555") translate([0, s * 50, 0]) wing_placed(s); }
    color("ivory") sensor_proxy(); color("dimgray") atom_proxy();
}
if (part == "half_r") half_print(1);
if (part == "plunger") plunger();
if (part == "plate_coupon") coupon();
if (part == "plate_test_cf") plate_test_cf();
if (part == "plate_test_delta") plate_test_delta();
if (part == "plate_test_petg") plate_test_petg();
if (part == "plate_dowels") plate_dowels();
if (part == "clash_sockets") intersection() { minkowski() { peg_socket(1); cube(3.2, center = true); } peg_socket(-1); }   // 1.6 mm wall between the two sockets
if (part == "check_socket_out") difference() { peg_socket(1); figure_solid(); }   // socket breaking out of the body
if (part == "check_peg_off_wing") difference() { wing_place_r() translate([peg_at.x - peg.x / 2, peg_at.y - peg.y / 2, 0]) cube([peg.x, peg.y, wing_t]); wing_place_r() linear_extrude(wing_t) offset(-1) wing_outline(); }
if (part == "plate_test") { color("#555") plate_test_cf(); color("#e8e0c8") plate_test_petg(); }
if (part == "key_bottom") key_print(bottom_keys[0][1]);
if (part == "key_rear") key_print(rear_key[1]);
// the stop lips must hold the Atom: shifted 2 mm towards the plug bay it must collide (render NOT empty)
if (part == "check_atom_stop") hull() intersection() { figure(); translate([2, 0, 0]) atom_proxy(fudge); }
for (dl = dowels) if (part == str("dowel_", dl[2])) dowel_print(2 * dl[2] - 0.6);
if (part == "clash_plunger") intersection() { figure(); plunger_placed(); }
if (part == "half_l") half_print(-1);
if (part == "wing_r") wing_plate();
if (part == "wing_l") mirror([1, 0, 0]) wing_plate();
if (part == "clash_sensor") intersection() { figure(); sensor_proxy(fudge); }
if (part == "clash_atom") intersection() { figure(); atom_proxy(fudge); }
// crush ribs left out: they are a deliberate 0.08 mm press fit
if (part == "clash_wing_r") intersection() { figure(); wing_placed(1, false); }
if (part == "clash_wing_l") intersection() { figure(); wing_placed(-1, false); }
// a finger's way into the cave: from the cave mouth straight out sideways
module cave_access() mirror([0, cave_side > 0 ? 0 : 1, 0])
    translate([cave_c.x - 11, cave_surface_y + plunger_proud + 1, cave_c.z - 11]) cube([22, 80, 22]);
if (part == "clash_cave_access") intersection() { cave_access(); union() { for (s = [-1, 1]) wing_placed(s); tail_solid(); } }
if (part == "clash_wing_rock") intersection() { rock_solid(); for (s = [-1, 1]) wing_placed(s); }
// the hollow core keeps 1.6 mm (4 perimeters) of wall to the outside: render must be empty
module gallery_offset(path, g) for (i = [0:len(path) - 2]) minkowski() {   // true offset of the core by g, segment by segment
    hull() for (q = [path[i], path[i+1]]) translate([q.x, 0, q.y]) hull() { rotate([90, 0, 0]) cylinder(d = gallery_w, h = 2 * gallery_dy, center = true, $fn = 16); cube([fudge, 2 * (gallery_dy + gallery_w * 0.6), fudge], center = true); }
    sphere(g, $fn = 8); }
if (part == "clash_core_wall") difference() { gallery_offset([for (i = [1:len(grove_path) - 1]) grove_path[i]], 1.6); figure_solid(); }
// the core grown by 1.6 mm (PETG-CF minimum wall) must not reach the wing sockets
if (part == "clash_wing_channel") intersection() { union() { ribbon_channel(grove_path, grove_ribbon); gallery([for (i = [1:len(grove_path) - 1]) grove_path[i]], 1.6); } for (s = [-1, 1]) peg_socket(s); }

module cable_paths() {
    color("orangered") for (i = [0:len(grove_path) - 2]) hull() { translate([grove_path[i].x, 0, grove_path[i].y]) cube([grove_ribbon[1], grove_ribbon[0], grove_ribbon[1]], center = true); translate([grove_path[i+1].x, 0, grove_path[i+1].y]) cube([grove_ribbon[1], grove_ribbon[0], grove_ribbon[1]], center = true); }
    color("#222") hull() { translate([atom_port_x, 0, usb_z]) sphere(usb_cable_d / 2); translate([usb_x1 + 25, 0, usb_z]) sphere(usb_cable_d / 2); }
}
if (part == "view_inside") { color("#6a6a6a") half(1); color("ivory") sensor_proxy(); color("dimgray") atom_proxy(); cable_paths(); }
