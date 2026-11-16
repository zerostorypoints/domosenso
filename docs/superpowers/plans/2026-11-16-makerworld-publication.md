# Shared enclosure publication plan

> Execute inline with `superpowers:executing-plans`; independent technical review before delivery.

**Goal:** Prepare three DomoSenso models for MakerWorld using the same sources as domosenso.org.
**Scope:** Atom Lite/LD2410C mount, CO2L dragon, M5Stack Module CC1101 enclosure.
**Authority:** User requested preparation/publication, a small base logo and shared .org content;
confirmed that the latest dragon and radio enclosure were printed and checked.

## Design and implementation

- [x] Preserve the fitted mount geometry; recess the framework symbol 0.6 mm into the desktop
  base, 12 mm high, away from the socket. Supply only the branded base, as requested. No button-access redesign.
- [x] Correct the .org documentation pin after the source PR was squash-merged. Full checks and
  independent review cover the hash-only change separately from new model work.
- [x] Update physical fitting status in device guides and enclosure READMEs, without claiming
  measured strength, calibrated sensor response or that every optional variant was printed.
- [x] Add an explicit model/file manifest and an immutable-commit exporter. Extract the same
  device section used by .org and the existing README assembly/printing sections. Copy exact
  source/STL/3MF/illustrations, LICENSE and NOTICE; record hashes. No second editorial copy.
- [ ] Validate geometry, native slicing, all archive files and descriptions; independent review.
- [ ] Save MakerWorld drafts on the verified DomoSenso account. Publish only with matching
  photographs and a compatible license option. Record actual URLs, never proposed URLs.
- [ ] Update the .org publication pin only after the changed source is merged; preserve the
  existing main-source gate. Finish owned-resource cleanup with a recoverable snapshot.

## Constraints and publication limits

The model-upload guidelines inspected on 16 November 2026 require three complete real-print
photos from distinct angles per model. Earlier damaged/incomplete prototypes do not meet that
requirement. CAD images are assembly illustrations, not substitute print evidence. Public
publication awaits those photos; preparation and saving drafts can continue. Do not enter the
Exclusive program: sources are public on GitHub. Do not silently relicense Apache-2.0 files to
an incompatible platform license. Functional descriptions, not off-platform advertisements.

## Verification

Exporter tests cover missing sections/parts, source hashes and path traversal. Compare the unchanged fitted interfaces with V5, gate the engraved base and its mast interface, render the assembly
image and slice a Bambu P2S/PETG project. The logo itself remains physically unprinted.
Website impact: device sections and the mount assembly image; no firmware/component release,
no HA runtime change, no demo requirement. .org and MakerWorld select immutable source versions;
record any temporarily different publication versions explicitly.
