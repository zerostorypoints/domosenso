# Mount fit correction implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Continue inline in the approved task worktree; a separate review follows the geometry gate.

**Goal:** Lift both modules by 10 mm and replace fragile cradle hooks with robust sliding guides while allowing rear USB access.

**Architecture:** Preserve the lower mast tenon and both bases. Replace rear cradle hooks with two short, solid dovetail guides seated on open-top receivers. Remove central rear obstructions through the full USB insertion envelope and reroute the radar harness around USB.

**Tech Stack:** OpenSCAD, Python export wrapper, native Bambu Studio 3MF/slicing.

**Spec:** The existing mount design plus the accepted correction diagram and 2026-11-16 physical feedback in the enclosure README. The user explicitly approved the paired lift, guides and generous USB clearance; USB dimensions confirmed as millimetres.

## Global constraints

- Atom and radar both +10 mm: underside clearance 37 mm, radar centre 82 mm, height below 100 mm.
- No metal fasteners. Preserve existing base geometry and the lower mast interface.
- Generous rear USB space: width 16 mm, length 40 mm, full case-side height plus clearance; include the cradle insertion path.
- The measured cable remains local configuration; 120 mm jumpers with approximately 12 mm housings must retain modeled slack at yaw ±60°.
- No supports trapped in docking or fitted interfaces. Preserve the GUI preset override list in native 3MF exports.

## Review focus

- Cradle seated and sliding with Atom, keeper and USB connected, including yaw-head interference.
- Rear USB envelope and radar harness competing for the same volume.
- Dock root strength, print orientation, support access and first-layer connection.
- Compatibility with existing bases/head/keeper; identify every replacement precisely.
- CLI versus GUI support/settings retention and isolated toolpath regions.

## Task 1: Geometry and regression

- [x] Record physical findings before changing geometry; reproduce rear USB collision with the old model.
- [x] Modify enclosure.scad: paired lift, solid dovetails, USB window/path, wire route, coupling coupon and clash probes.
- [x] Update support-blockers.scad and build.py for revised parts and coupon.
- [x] Run the full geometry gate plus measured local cable overrides, inspect assembly/insertion renders and verify unchanged meshes geometrically.

## Task 2: Deliverables and review

- [x] Export shared STL/previews and local replacement/coupon 3MFs with native Bambu Studio.
- [ ] Slice and inspect fitted regions for support paths; reopen/reslice in GUI if available.
- [ ] Independent review in a separate owned session/worktree; address findings and reverify.
- [ ] Update README and assembly drawings for both bases; run repository checks before commit.
- [ ] Preserve deliverables and recovery record; clean temporary review/build resources while retaining the active worktree for physical testing.

## Ledger

- Baseline e65eeae: original rear USB mirror test produced a nonempty solid; forward USB test was empty. Existing guide root has a 0.7 mm web and physical breakage.
- Ruling: implement inline because the corrective interfaces are tightly coupled; obtain one independent review after the gate. Existing user authorization covers the correction and execution here.

- Geometry: full 45/45 gate passed after extending the wire corridor only through the inner guide corner; minimum remaining guide wall is asserted. Rear USB 16 × 40 mm, full case-height margin.
- Ruling: widen the upper mast to 38 mm and place guides at ±18.5 mm to preserve a structural wall beside the wire corridor; the lower tenon remains unchanged. Reference housings are now 12 mm; longer housings require rerunning the slack assertion.
- Native slicing: zero support paths in sampled fitted interfaces; 0.184 g external supports for the coupon plate and 0.259 g for replacement parts. The seven reusable part meshes compare equal at 0.00001 mm vertex resolution.
