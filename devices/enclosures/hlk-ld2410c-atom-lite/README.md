# Atom Lite and LD2410C modular mount

A printable open mount for an M5Stack Atom Lite and an HLK-LD2410C radar, with interchangeable
standing and shelf-edge bases. The Atom's button faces up; its GPIO harness passes below its
case. The radar remains vertical while its head turns left and right. All mechanical fasteners
are printed. Wiring and firmware remain as described in the [device guide](../../hlk-ld2410c.md).

**Prototype: complete-mount fit exposed cradle and cable-clearance failures.** Do not treat the
revised full-mount meshes or assembly previews as a physically accepted design. A successful mesh check
does not establish clamping force, stability, friction or radar performance.

First-print feedback: the test sample had obstructing plastic at the spindle bore entrance,
key channels and other interfaces. The other sample parts fit. The long key entered the sample
base receiver from one side, but its openings also contained obstructing plastic. Inspection of the original toolpaths confirmed
support inside these interfaces. The printable dimensions remain unchanged. Non-printing
support blockers and snug supports remove these paths in the revised slicing check; that
revision was subsequently printed, with the additional findings below.

### Complete-mount feedback (2026-11-16)

- The shelf clamp worked in the reported trial. The mast was a tight fit in that clamp's socket
  without a base key. This is one physical fit result, not a verified retention force or proof
  that all materials and printers can omit the key. Keep it optional when the actual fit is
  already secure; do not force it into a tight joint.
- The cradle could not seat on the mast with the USB plug and cable in the tested orientation.
  The model's `usb_env()` only checks a forward-facing plug; the trial routes USB towards the
  mast. The diagonal braces and cradle docking region were not validated for that route.
- One cradle docking hook broke while trapped support was removed from the gap behind it.
  The modeled hook has a 0.7 mm rear joining web and a narrow, inaccessible support gap.
  Neither strength during cleanup nor support removability was established by the mesh gate.
- The lower wire bend was cramped. The requested correction is 10 mm more mast height and
  cable-routing room. Raising the radar alone would consume jumper slack: the revised design
  must evaluate the cradle height, both connector ends and the complete cable path together.
- Pending: USB plug/strain-relief dimensions, a stronger docking interface with accessible or
  absent supports, and a new fit test with USB and all radar wires connected. Standing-base
  stability, long-term clamp retention and unobstructed yaw with the real harness remain
  unverified. Private photos and printer-specific records are kept outside this repository.

| Standing base | Shelf clamp |
|---|---|
| ![Standing assembly](preview/assembly_stand.png) | ![Shelf assembly](preview/assembly_clamp.png) |

The radar centre is 82 mm above the support; the highest printed part is 94.63 mm above it.
The clamp also extends 22.9 mm below the shelf top. Its 18 mm under-edge engagement is measured
horizontally, independently of that vertical drop.

## Parts and assembly

For the corrected prototype, replace **tower, atom_cradle and atom_keeper**. The head, radar
keeper, both bases and their keys retain their geometry. First print `dock_coupon` with the new
cradle and keeper to test the guide fit and USB access. The coupon is a short receiver slice,
not a replacement base.

For a complete new set, print one each of `tower`, `head`, `radar_keeper`, `atom_cradle`, `atom_keeper`, `base_key` and
`head_key`. Add `stand` for the desktop version, or `clamp` and `clamp_wedge` for the shelf version.
Print both bases to interchange them. The [STL folder](stl/) contains all parts;
[enclosure.scad](enclosure.scad) is the editable source.

![Exploded assembly](preview/explode_stand.png)

1. Lower the mast into the base's keyed socket. Feed the narrow end of `base_key` from left to
   right through the aligned slot only if needed to remove play. Omit it when the physical
   socket fit is already secure; do not force the key.
2. For the shelf base, slide the clamp over the edge and insert `clamp_wedge` from the left,
   flat face upwards. Advance it until both jaws bear; pull its tab to release.
3. Lower the head into the bearing at zero yaw, with its stop lug in the arc. Insert `head_key`
   from the left beneath the bearing. Ease it out before turning the head and reseat by hand.
4. Slide the radar into its edge rails from above, antenna outward, then lower `radar_keeper`
   onto both rails until its rear latch engages. Pull the rear tab away from the PCB to release
   the cap. Check that the antenna face remains unobstructed.
5. Connect the Atom's lower jumpers while its cradle is accessible. Fit the Atom button up,
   USB-C towards the rear/mast, and slide the revised `atom_keeper` front to back until its
   right latch engages. The keeper's rear opening leaves the USB envelope clear. Bring both
   solid dovetails above the receiver mouths (6.3 mm lift), then lower the cradle onto their
   stops. Route the wires under the cradle, through the corridor beside USB, then behind and
   above the bearing with a free loop at the head. Do not use the small side eye as a mandatory
   waypoint or pull the wires tight.
6. Check both yaw endpoints and the centre. No connector may be pulled or used to restrain
   rotation. For service, press the keeper's front-right tab towards the centre and slide it
   forward; lift the cradle out as needed.

The tapered keys are shown released in collision checks. Further insertion deliberately brings
their faces into contact; the physical force and friction have not been measured. Do not hammer
them in.

## Build and customize

Install Python 3.11 or newer and OpenSCAD with its Manifold backend. The export wrapper needs
only the Python standard library. From this directory:

```sh
python3 build.py
python3 build.py --part fit_coupon --out /tmp/radar-fit
python3 build.py -D shelf_thickness=16 --out /tmp/radar-shelf-16
python3 build.py --support-blockers --no-preview --out /tmp/radar-with-blockers
```

`OPENSCAD` may name the executable when it is not on `PATH`. Exported meshes are already in
their intended print orientation, with their lowest face at Z=0. Custom outputs belong outside
the reference `stl/` directory so it remains clear which files match the default source.

For the optional external design and verification tools, follow
[3D printing setup](../../../docs/3D_PRINTING.md). With `SKILL_DIR` set to the installed skill:

```sh
python3 "$SKILL_DIR/verify-model.py" enclosure.scad \
  --build-volume 256x256x256 --export /tmp/radar-verified
```

Use your own printer's build volume. Repeat the gate with the same `-D` values used for export.
Rebuild both sides of a mating interface when changing its dimensions.

| Parameter | Purpose |
|---|---|
| `radar_center_height` | Height above the supporting surface; reference 82 mm |
| `atom_usb_plug_width`, `atom_usb_plug_length`, `atom_usb_vertical_margin` | Rear USB clearance, reference 16 mm wide × 40 mm long and full case-side height + 2 mm above/below |
| `yaw_limit` | Left/right travel, reference 60 degrees each way |
| `atom_clearance` | Case underside to base top, reference 37 mm |
| `shelf_thickness`, `shelf_engagement` | Shelf thickness and under-edge reach |
| `jumper_total_length` | End-to-end length, including housings |
| `atom_connector_housing`, `radar_connector_housing` | Rigid connector lengths deducted from available wire |
| `radar_thickness`, `radar_rear_depth` | PCB and rear hardware fit assumptions |
| `fit_clearance`, `hole_compensation` | Sliding clearance and separate hole-size compensation |

## Printing

The starting settings are PETG, 0.20 mm layers, four walls and 25% gyroid infill. PLA can be
used for a rigid prototype, but fit and wedge retention must be checked in the material actually
used. Print each part in its exported orientation. Inspect bridges and flange undersides in
the slicer; the geometry gate's overhang report does not establish that a part needs no supports.

Provide removable external supports under the head flange/stop lug and unsupported bearing
faces. Exclude supports from the spindle bore and its entrance, both key channels, base sockets,
Atom keeper channels, mast docking slots and wire eye. The reference export includes optional
non-printing volumes in `blockers/`, generated by [support-blockers.scad](support-blockers.scad).
Keep each blocker in the same coordinates and orientation as its matching STL: import them as
parts of one object, change the blocker volume's type to **Support blocker**, and move them
together. Never print a blocker as a normal part or position it independently at the bed centre.
Use the same `-D` overrides for printable parts and blockers.

In Bambu Studio, the checked combination is **Normal (auto)**, style **Snug**, with
`raft_first_layer_expansion=0`. Default grid-style supports can fill the bore entrance even
with a blocker; automatic first-layer support expansion can also cover its bottom opening.
The blockers alone are therefore insufficient. A native CLI assembly can attach each volume
with `subtype: "support_blocker"` and the same nonzero `assemble_index` as the printed mesh.
Keep machine/material profiles local and inspect the sliced paths, not just the modifier shape.
When exporting through Bambu Studio CLI, preserve the process override list in
`different_settings_to_system`: a project may slice correctly from the CLI yet revert to system
preset values when reopened in the GUI if this list is empty. Verify support enablement, wall
count, infill and blocker types after reopening, then reslice in the GUI before calling the
project ready. A missing Support column or a substantially different model weight warrants
checking these settings; a successful CLI slice alone is insufficient.

The revised local toolpath check found no support extrusion in the sampled interiors of the
spindle bores/entrance, key channels, base sockets or Atom keeper channels. Bridges across the
horizontal tower bore and clamp socket still need physical inspection: a support-free channel
can have a sagging roof. The revised cradle has one continuous first-layer region and solid guide roots. It has no
rear hook gap. Keep the dovetail receivers, USB opening and cable corridor free of supports;
check these with the small receiver coupon before a full mast print. Remove external supports before checking fit, without scraping fitted surfaces.
The keeper latches are designed for PETG: their nominal beam-strain estimates are 1.58% and
1.41%. These estimates do not certify fatigue life or make PLA a tested latch material.

Optional Bambu Studio projects can be made from the STL with the installed skill. Supply your
own machine, material preset and support choice:

```sh
python3 "$SKILL_DIR/make-bambu-3mf.py" --mesh stl/fit_coupon.stl \
  --printer "$PRINTER" --filament "$FILAMENT_PRESET" \
  --layer-height 0.2 --walls 4 --infill 25 --infill-pattern gyroid \
  --supports "$SUPPORTS" --scatter off --out /tmp/radar-fit.3mf
python3 "$SKILL_DIR/bambu-cli.py" slice /tmp/radar-fit.3mf
```

`SUPPORTS` is `on` or `off`, selected after inspecting that part. These commands generate and
slice files locally; they do not send a print job. Printer presets and installation-specific
projects are not part of the shared source.

## Measurements and fit

The nominal Atom case is 24 × 24 × 9.5 mm; the radar board outline is 22 × 16 mm.
The reference design provides 37 mm under the Atom for a 25 mm connector-and-wire envelope.
Keep the GPIO region open, and check that the USB plug enters without pushing the Atom out of
its cradle. The keeper must hold the case edges without bearing on the button.

Jumper length includes the connector housings: a 120 mm female-to-female jumper is **not**
120 mm of flexible wire. Housing lengths and the radar's PCB thickness and rear component
projection need measurement or a trial fit. Check the wire route at both yaw limits with
gentle bends and slack. Lower the radar when the available wire cannot follow that route.
Do not use the connector pins as a strain relief.

The shelf thickness is adjustable. Confirm the depth and thickness of its unobstructed edge
before making the clamp; tighten its printed wedge gradually. A reference dimension does not
establish that a clamp fits every shelf or that its surface will tolerate contact pressure.

## First print

Use the intended material and layer settings for the fit sample. Check insertion and removal
of the printed keys, the pivot clearance, the Atom case rim and the radar carrier. Adjust the
source's fit allowances if a joint binds or falls free. Do not force the PCB or its components
into an undersized carrier.

The revised nominal wire route is 80.05 mm at centre and up to 84.74 mm at the yaw endpoints.
With 120 mm overall length, two reference 12 mm housings and a provisional 3 mm endpoint
allowance, the calculated remaining margin is 8.26 mm. The collision check uses a 4 mm bundle
and the complete 16 mm-wide rear USB envelope. These are model estimates: actual individual
pin paths, connector angles and bend radii remain physical checks. The guide mouths are 50.2 mm
wide overall to leave structural material around both the USB and wire corridors; the lower
base tenon is unchanged. A larger overmold or longer connector housings requires reevaluating
the route, and may require longer jumpers. Do not lower the reserve just to pass the assert.

![Representative wire route](preview/view_wires.png)

After assembling the complete prototype, check that the button can be pressed without tipping
the standing base, the clamp does not slip, and the head stays aimed while the wires remain
slack. Test presence sensing after placing the radar; mechanical clearance alone does not
validate its RF performance.

## Verification record

The original revision passed 41 geometry checks but missed the rear USB route and support-removal
load on its hooks. The corrected revision passed all 45 geometry checks, including 12 connected manifold printed
solids on Z=0, loaded cradle insertion, the USB docking path and wire/USB intersections.
Native slicing of the receiver sample and replacement-parts plate found zero support extrusion
segments in the sampled dovetail slots, USB path, keeper channels, spindle bore and lower wire
corridor. Physical guide fit, bridge finish and cable slack are still unverified.

Original evidence: OpenSCAD 2026.10.11 passed 41 geometry checks: 11 manifold connected printable solids on Z=0,
assembly views, sampled insertion/yaw collision checks and two latch diagnostic renders. The
locked latch probes separately produced solid interference; the released paths were empty.
The head and cable checks sample 25 yaw poses from −60 to +60 degrees.

Independent artifact review found loose keepers and insufficient key travel in the first draft.
The revised source adds releasable printed latches and includes the complete key clearance stack.
Corrective review confirmed all four findings addressed at CAD level, including an independently
rendered near-contact head-key check. Sonnet/Fable were unavailable on this host; review used
the available GPT-6 Astra model. This is geometry review, not physical acceptance.

The source and build wrapper are reusable without the external skill. Re-export and run the
gate after parameter changes; the above record applies to the reference dimensions.

## Sources

- [M5Stack Atom Lite](https://docs.m5stack.com/en/core/Atom-Lite), nominal case dimensions;
  the repository's [dimension record](../../m5stack-atom-lite.yaml) records its interfaces.
- [Hi-Link LD2410C](https://www.hlktech.com/NewsInfo-276.html), nominal board outline.
- [Design specification](../../../docs/superpowers/specs/2026-11-15-atom-radar-mount-design.md).

Original design and source: Apache-2.0, like the repository. Electronics shown in assembly
previews are clearance references and are not printable parts.
