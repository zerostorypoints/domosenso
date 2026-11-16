# Atom Lite and LD2410C modular mount

Status: selected arrangement, revised to the requester's all-printed fastening requirement; physical acceptance pending.

## Purpose and scope

A reusable indoor mount for an M5Stack Atom Lite wired to an HLK-LD2410C. It raises the radar,
keeps its PCB vertical and lets the user aim it left/right. Both a freestanding foot and a
shelf-edge clamp share the same mast and head. This is a hardware accessory, not an HA component;
it changes neither NAS nor standalone-tablet firmware, bindings or dashboard behaviour.

Generic source, reference STL files, previews and assembly/build instructions belong in
`devices/enclosures/hlk-ld2410c-atom-lite/`. Printer selection, filament presets and an
installation's measured shelf/cable values remain in local configuration outside the public
repository. Shared dimensions and tolerances are parameters; no personal paths or photographs.

## Approaches

- A single closed enclosure is compact but does not meet the requested elevated, adjustable
  radar arrangement.
- A fixed stand is simpler but cannot attach to a shelf edge.
- **Selected by the requester:** a braced open mast with a swivel head and two interchangeable
  bases. It needs more assembly joints but reuses the electronics holder and head in both modes.

## Proposed geometry and assembly

1. Nominal radar centre height: **72 mm** above the supporting surface. Keep the assembled top
   below **100 mm** for this reference design. Height remains a source parameter and may be
   reduced from the initial 80 mm proposal to leave more slack in the available jumpers.
2. Radar PCB: nominal **22 x 16 mm**, vertical in an open-front carrier. Support its edges;
   leave antenna features uncovered. Connectors and rear components need their own clearance
   envelopes; PCB thickness and connector projection still need confirmation.
3. Head: rotation around the vertical axis, proposed travel **-60 to +60 degrees**, with physical
   stops and a removable tapered printed keeper that applies friction to the swivel. No tilt joint. Route a slack wire loop outside the pivot
   and verify its clearance at both endpoints and the centre.
4. Atom Lite: nominal **24 x 24 x 9.5 mm**, button face **up**, GPIO connectors **down**, USB-C
   accessible from the side. Support the case rim in a raised, open-bottom cradle. The central
   button area stays uncovered; do not retain the Atom by pressing its button.
5. Provisional clear space below the Atom case: **27 mm above the base top**, to accommodate
   plugged-in jumper bodies and a gentle wire turn towards the mast. This reference allowance includes clearance for a 25 mm harness envelope; encode it
   as a parameter and clearance test, and verify actual routing with a fit coupon. Keep the cradle removable for connector access; provide a wire restraint on the mast.
6. Mast: two side members and diagonal bracing. Place the Atom in front of it, leaving finger
   access above the button. Print orientation is chosen per part to avoid a tall, weak joint
   across layer lines; do not assume assembly orientation is the print orientation.
7. Standing base: initially **70 x 60 mm**, rounded corners and optional non-slip feet. Test
   resistance to the USB cable pull and button press on the actual first print. Dimensions
   alone are not evidence of stability.
8. Shelf clamp: parameterized shelf thickness and padded contact faces. Proposed under-shelf
   engagement **18 mm**. A laterally inserted printed wedge beneath the shelf provides
   clamping adjustment without screws. Verify wedge travel and clearance
   in the locally configured shelf envelope before exporting that variant.
9. Base exchange uses a keyed socket and a transverse tapered printed key. The head uses a
   vertical spindle and a smaller tapered keeper. All fastening parts are printed: no metal
   screws, nuts or heated inserts. Fit coupons must establish insertion, retention and release
   before the full print. An open-centre sliding keeper retains the Atom by its case edges.
10. Reference jumper length: **120 mm including both female connector housings**. Do not treat
    this as flexible wire length. Housing lengths remain unmeasured; provisionally allocate
    14 mm per housing, leaving 92 mm of flexible span. Check the routed path from housing exit
    to housing exit, bend allowance and slack at centre and both yaw endpoints. Lower the radar
    if the path cannot fit. The actual pin/adaptor stack under the Atom is covered by its
    measured 25 mm harness envelope; electrical compatibility is not inferred from connector gender.

## Material and delivery

Proposed first material: PETG for the clamp and repeatedly handled joints; PLA remains a possible
rigid prototype after checking its own tolerances and joint strain. This is a proposal, not a
claim that a filament profile or physical joint has been verified. Aim for support-free parts;
inspect slicer previews before claiming that outcome.

Deliver parametric OpenSCAD, all printed-part STLs, assembly and exploded previews, a fit coupon,
an assembly guide with printed-key insertion directions, and reproducible export commands. Generate the user's
Bambu Studio project locally from the verified mesh and selected profile; keep the generic
model independent of that printer. A small interface coupon precedes the full print if
hardware fit cannot be established from measurements.

## Verification and limits

Encode dimensions, height bounds, minimum wall thicknesses, mating clearances, head travel and
connector/button access as asserts or explicit collision envelopes. Run the skill's geometry
gate for every printed part, both assemblies and sampled travel poses. Verify the base/mast,
head/mast, electronics/cradle, connector passages and clamp/shelf interfaces. Check insertion
paths as well as the assembled pose. Render for review; inspect the final slicer output.

An independent review must use a host-supported isolated session. If the client cannot provide
one, report that limitation and do not claim review completion. Physical fit, retention, cable
strain, clamp force, stability and radar performance require the first print; no CAD gate proves
them. Publishing a model or sending a print is separate from generating files.

## Sources and next input

- [Atom Lite manufacturer dimensions and interfaces](https://docs.m5stack.com/en/core/Atom-Lite).
- [Hi-Link LD2410C outline dimensions](https://www.hlktech.com/NewsInfo-276.html).
- Existing DomoSenso [device guide](../../../devices/hlk-ld2410c.md) and
  [Atom catalog measurements](../../../devices/m5stack-atom-lite.yaml).

The requester selected both bases and all-printed fasteners. The connected Atom harness needs
25 mm of space below its case; the reference model allows 27 mm. Radar PCB thickness/rear
connector projection remain assumed parameters until a fit coupon or measurements confirms them.
Preserve installation measurements and printer presets outside Git.

Website impact: after the model is verified and accepted, link its preview/files from the
LD2410C device guide using the existing enclosure publication workflow. No website publication
or component release is part of this design approval.
