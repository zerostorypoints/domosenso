# Dragon stand: M5Stack Atom Lite and Unit CO2L (no screws)

A bedside figure for an M5Stack Atom Lite (ESP32) and an M5Stack Unit CO2L (Sensirion SCD41),
joined by the unit's 20 cm Grove cable. A dragon sits on a rock:

- **CO2L:** lies in the dragon's openwork head. It touches the figure only at its flange; the vented dome has 4 mm of air in front and 5.5 mm at the sides, top and bottom. The head is open through about 14 cm² (`head_vents = "gills"`): five slanted gill slots on each cheek facing the dome's side vents, five pointed slots on top over its grid, plus nostrils and eyes. Other variants: `"diamonds"`, `"slots"`, `"cage"`.
- **Atom:** stands in a cave in the rock. A hollow plunger in the cave presses its button, and the LED glows through the plunger.
- **Cables:** the Grove ribbon runs up a hollow core through the haunch, body and neck (7 mm, as wide as the 20 mm body allows with 1.6 mm walls; `clash_core_wall` checks it). The USB-C cable runs through a tunnel in the rock: 6.5 mm inside so it lies in easily, narrowing to the cable size (4.5 mm + clearance) over the last 8 mm at the exit.

The dragon is two halves joined without screws:
- **Dowels:** four printed PETG dowels across the seam (light press fit): in the body, the back of the head, the snout and the tail.
- **Dovetail keys:** three keys whose bowtie section stops the halves parting. Two slide up from the rock's underside; one slides in from the rock's back face, above the Atom.

The Atom is held against its plugs by stop lips above and below the plug window. Its small side key is a reset key; it sits flush with the case, so the bay's clearance keeps it free. The wings plug into the shoulders and their last finger stands on the table.

Status: test cuts printed (TEST1 sections, TEST2 coupon, TEST3 changes), then one full build in v2.5: the halves, wings and keys came out; its dowels came off the bed and its wings were loose. v2.6 fixes both and is not printed yet. Gate (3d-print-designer `verify-model.py`): 34 parts per version, all clash checks empty, no overhang past 45° on the halves, every plate one body per part; `check_atom_stop` proves the Atom cannot slide into the plug bay, `clash_sockets` that the two wing sockets keep a 1.6 mm wall. The halves' binary STLs show 2 to 10 non-manifold edges where the body's rounded edge has vertices closer together than single precision holds; the model itself is closed, the gate reports this as a failure on some runs, and Bambu Studio repairs it on import (the v2.5 halves printed whole). Reviews: a Sonnet design review, then a final review on Fable (claude-fable-5-1); all of the final review's geometry findings are fixed.

## Print first: test cuts (about 1.5 h) and the fit coupon

`test/TEST1_cf_light_right.3mf` (or `_light_left`), PETG-CF, about 1 h 30 min and 35 g in Bambu Studio. It holds sections cut from the cave-side half:
- the head, with the CO2L's flange slot, the dome's clearance and the gills;
- the Atom's bay, with the stop lips and the plunger bore;
- the shoulder socket, with a wing-root stub.

Lay the real CO2L and Atom in, hold them by hand, and check that they seat, that the dome touches nothing, and that the plunger clicks the button.

`test/TEST2_petg_coupon.3mf`, plain PETG: the fit coupon below plus a plunger.

`test/TEST3_cf_light_right.3mf` (or `_light_left`), PETG-CF, small: the plug window and the shoulder socket with a wing-root stub, to check a change to those alone.

### The fit coupon

`3mf/dragon_stand-plate_coupon.3mf`, plain PETG, about 25 minutes. It contains:
- **Dowel test:** a block with three dowel holes (−0.15 / −0.05 / +0.05 mm) and three pins.
- **Key test:** three pairs of half-blocks with a dovetail groove on the bed, printed like the halves. One, two or three notches mark the fits of 0.15, 0.05 and −0.05 mm per side. Stack each pair groove to groove and slide the key in.

Pick the hole where the pin goes in with a firm push and holds, and the pair where the key slides in with light friction. If that is not the middle one, change `dowel_fit` or `key_fit` in `enclosure.scad` and re-export. Take the firmer dowel fit if in doubt: the head relies on its two dowels.

Result on one Bambu Lab P2S in plain PETG (2026-11-08): the pin only grips in the tightest hole, so `dowel_fit` is −0.15 (−0.05 barely holds); the key grips at 0.05 per side and −0.05 does not go in, so `key_fit` stays 0.05. On another printer or filament, print the coupon again.

## Parts

Two versions differ only in the halves: `light_left/` puts the cave (button, LED) on the dragon's left side, `light_right/` on its right (`cave_side = 1` / `-1`). Print both halves from one folder; every other part is shared.


| # | part | file | material | qty |
|---|---|---|---|---|
| 1 | +Y half | `light_left/` or `light_right/` `dragon_stand-half_r.3mf` | PETG-CF | 1 |
| 2 | -Y half | same folder, `dragon_stand-half_l.3mf` | PETG-CF | 1 |
| 3 | right wing | `3mf/dragon_stand-wing_r.3mf` | PETG-CF | 1 |
| 4 | left wing | `3mf/dragon_stand-wing_l.3mf` | PETG-CF | 1 |
| 5 | plunger (window end down) | `3mf/dragon_stand-plunger.3mf` | PETG (white glows) or CF | 1 |
| 6 | dowels 13.4 (body), 17.4 (back of head), 15.4 (snout), 7.4 mm (tail), two sets, each pin its own object with a 3 mm brim | `3mf/dragon_stand-plate_dowels_petg.3mf` (or one pin: `dragon_stand-dowel_7/9/8/4.3mf`) | plain PETG | 1 plate |
| 7 | dovetail key, underside | `3mf/dragon_stand-key_bottom.3mf` | plain PETG | 2 |
| 8 | dovetail key, back of the rock | `3mf/dragon_stand-key_rear.3mf` | plain PETG | 1 |

Each half is 178.6 × 170.2 × 34 mm and needs its own plate; Bambu Studio sliced the cave half (light_right) at 2 h 53 min and 74 g of PETG-CF on a P2S. Settings: 0.2 mm layers; halves 3 walls and 10 % gyroid (the TEST1 sections were already stiff at 4 walls and 15 %); wings, plunger, dowels and keys 4 walls and 100 % rectilinear, no supports, brim on the halves and a 3 mm brim round each dowel. The dowels lie on a 3.7 mm flat (`dowel_flat`); without a brim, PETG on a textured PEI plate let every one go.

PETG-CF needs a hardened nozzle. Dry it at 65 °C for 6 h and print at 250 °C with the bed at 75 °C. Keep the slicer's elephant-foot compensation on, because the cut faces mate. Dowels and keys are plain PETG because PETG-CF is brittle.

To buy: a pea-sized piece of foam (to plug the Grove slot), and optionally two rubber dots for the wing feet.

## Assembly

![The cave half cut face up with the four dowel holes labelled by pin length (13.4 mm body, 17.4 mm back of the head, 15.4 mm snout, 7.4 mm tail), the Atom on the plunger, the CO2L in the head, and the closed figure with the two keys from below, the long key into the back face and the wing peg into the shoulder socket](preview/connections.png)

1. Lay the half with the cave cut face up. Drop the plunger into the cave bore from the inside, window end first; its flange rests on the rim.
2. Plug the USB-C and Grove cables into the Atom. Lay the Atom in its bay, button face down onto the plunger's ring, ports towards the figure. Lay the USB cable in its tunnel.
3. Coil the Grove slack (about 5 cm) in the plug bay. Lead the ribbon, standing on edge, through the narrow slot into the hollow core, then up the body and neck. Press the foam into the slot.
4. Plug the ribbon into the CO2L and stand the CO2L on its side in the head, flange in the slot between shelf and tab.
5. Push the four dowels into the cave half's holes, each by its length (drawing above), then press the other half on.
6. Turn the figure over and slide the two keys up into the pockets in the rock's underside. Their ends stay 1.5 mm proud inside a recess, so they do not touch the table.
7. Slide the third key into the bowtie pocket in the rock's back face, above the Atom.
8. Push the wing pegs into the shoulder sockets. They are a light press fit (`peg_fit` 0.15 mm per side, from TEST1) and go 8 mm deep; add a drop of glue if they are loose.

To take it apart, pull the three keys out with pliers, then pull the halves apart.

## Measurements used

Taken with a caliper on 2026-11-07:
- **CO2L:** 48 × 24 × 16 mm; flange 17 mm long and 8 mm high; LEGO holes 4 mm wide, 17 mm apart; the Grove plug sticks out 2 mm; plug outline at most 4 × 10 mm.
- **Vents:** on the dome's top and on both long sides; the bottom is closed.
- **Grove ribbon:** about 6 × 1.2 mm.
- **Atom:** 24 × 24 × 9–10 mm.
- **Atom side key (reset):** the Atom Lite has a second, small key on a side face next to the port face. Pressing it restarts the Atom (tested 2026-11-08: Home Assistant showed the device unavailable and its uptime back at zero). It sits flush with the case outline, so the bay needs no pocket for it. Its position comes from M5Stack's official model ([`Atom-Lite.stl`](https://github.com/m5stack/M5_Hardware/tree/master/Products/C008_Atom-Lite/Structures)): 4.4–10.5 mm from the edge away from the ports, and from the button face to 7.9 mm deep. The Atom is not mirrored with the figure, so the key faces the bay's ceiling in `light_left/` and its floor in `light_right/`. For an Atom whose key stands proud, set `atom_key_proud` and `key_relief = true`; `clash_atom` then checks the pocket clears it.

Estimated, not measured: the USB-C plug (12.5 × 7 × 22 mm) and the cable (4.5 mm).

## Not verified (a print will show)

- v2.6: the wings' 8 mm pegs holding without glue, and the dowels on their wider flat and brim staying on the bed and still pressing in.
- Small first-layer islands on the halves' cut faces: the Atom's stop lips and the edges round the key recesses. Use a brim or glue stick and watch the first layers.
- The dowel and key fits in the halves themselves (the coupon set them; the halves' seam faces may print differently).
- The head ceiling bridges 11 mm in PETG-CF and may sag slightly.
- The plunger's travel and feel.
- The stance on the wing feet.
- Sensor temperature: run the Sensirion acceptance test (15 minutes running, difference ≤ 0.5 °C from a reference, CO₂ step under 60 s). The sensor sits above the Atom, against Sensirion's advice; this was accepted for this design.

## Files

`uv run build.py` regenerates the halves (`light_left/`, `light_right/`), the shared parts and plates (`stl/`) and the previews (`preview/`, including `connections.png`, drawn from the model) with OpenSCAD 2025+ and its Manifold backend. The Bambu Studio projects in `3mf/` and `test/` are made from those STLs with the print settings above.

## Design history

| Version | AI model | Date | Change |
|---|---|---|---|
| v2 | claude-opus-5-5 (review: claude-sonnet-5-5) | 2026-11-07 | Clamshell dragon, sensor in the head, Atom in the cave, plunger |
| v2.1 | claude-opus-5-5 | 2026-11-07 | No screws: PETG dowels and dovetail keys; fit coupon |
| v2.2 | claude-opus-5-5 | 2026-11-07 | Head openwork variants; gill slots chosen (open area x2) |
| v2.4 | claude-opus-5-5 | 2026-11-07 | Left and right versions (cave side), boulders follow |
| v2.3 | claude-opus-5-5 (final review: claude-fable-5-1) | 2026-11-07 | Review fixes: Atom stop lips, funnel over the button face, wing-socket wall, rear key, tail dowel, key recesses, coupon key test |
| v2.5 | claude-opus-5-5 | 2026-11-08 | Atom's side (reset) key located from the official model; optional pocket for it (`key_relief`, off: the key is flush); `dowel_fit` −0.15 from the TEST2 coupon; coupon key moved clear of the pins; plug window 2 mm deeper on the USB-C side (TEST1: the socket sat flush with its edge); wing socket 0.15 mm per side (`peg_fit`, TEST1: 0.3 was loose); USB tunnel 6.5 mm inside with a cable-size exit |
| v2.6 | claude-opus-5-5 | 2026-11-13 | Wing pegs 8 mm deep instead of 4 (the 4 mm pegs let the wings fall out), moved 4 mm back off the Grove core, `clash_sockets` keeps 1.6 mm between the two sockets; dowels lie on a 3.7 mm flat (`dowel_flat` 0.8: on the 2.7 mm flat every pin came off the bed) and print on their own plate with a brim, one 3MF object per pin |
