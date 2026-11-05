# SPEC-036: printable enclosures in the catalog, shown in the device guides on domosenso.org

- Status: approved 2026-11-05 by the maintainer, as written.
- Source: maintainer request 2026-11-05. An enclosure for the `gate-remote` node (M5Stack Module
  CC1101 wired to an Atom Lite) was designed in his home repository and approved for printing; he
  asked to publish it on domosenso.org the way the wiring diagrams are published, and to prepare it
  for public 3D-model catalogs. SPEC-034 left the loose-jumper problem to "the home's enclosure";
  `devices/m5stack-module-cc1101.md` already advises "an enclosure or a strip of tape".

## Goal and placement

A home that builds a board pair the catalog documents gets a printable enclosure for it from the
catalog: a parametric source, ready STL and Bambu Studio 3MF files, previews and a README. The
device's guide links it, and its page on domosenso.org shows a preview.

Placement test:

1. Home Assistant and ESPHome have nothing to say about a box; nothing is rendered into a home or
   deployed. → not a component.
2. A second home with the same boards needs the same box, unchanged. → the catalog, next to the
   device guide and its wiring diagram (`devices/wiring/`).
3. Nothing in it is home-specific. Parameters a builder may change (wire diameter, button-well
   depth, vents, logo) are parameters of the source, not instance inputs.

## Devices

| role | device | tested |
|---|---|---|
| radio module | `m5stack-module-cc1101` (SKU M146) | dimensions from M5Stack's 1:1 vector drawing; not printed |
| board | `m5stack-atom-lite` | dimensions from M5Stack's raster drawing, ±0.2 mm; not printed |
| jumpers | 8 × Dupont female–male, at least 8 cm of wire | common values (housing 14 mm, wire 1.4 mm), not measured |

Verified: the model's own asserts and the 3d-print-designer skill's gate (`verify-model.py`, 17 of
17 parts: every printed part one manifold body with no overhang past 45°, seven clash checks
empty), a Sonnet design review and a final Fable review, findings fixed. Not verified: everything a
print shows (latch click, module on its pins, clamp on the jumpers, USB-C plug, antenna nut). The
enclosure's README lists these under "Not verified".

## Layout in the catalog

`devices/enclosures/<id>/`, `<id>` naming the board pair as its wiring diagram does. The first one:
`devices/enclosures/m5stack-cc1101-atom-lite/`, moved from the maintainer's home repository
(about 1.5 MB, mostly generated files):

| path | what |
|---|---|
| `README.md` | what it holds and fixes, files, hardware, print settings, assembly, parameters, sources, not verified |
| `enclosure.scad` | OpenSCAD source; DESCRIPTION and PRINT SETTINGS headers; asserts for every functional claim |
| `build.py` | `uv run build.py [-D name=value]` exports `stl/` and `preview/` (OpenSCAD 2025+ with Manifold) |
| `stl/<part>.stl` | printed parts, generated, committed so a pinned link can download them |
| `3mf/<part>.3mf` | Bambu Studio projects with the print settings applied (P2S profile), generated, committed |
| `preview/<view>.png` | renders, generated, committed; one or more are shown on the website |

The device guide (`devices/m5stack-module-cc1101.md`) gets a section `## Enclosure`: one preview
image, one sentence on what the box fixes (the short pins), and relative links to the folder's
README, the 3MFs and the STLs. Its sentence advising "an enclosure or a strip of tape" points there.

Licence: Apache-2.0 like the rest of the repository. The lid carries the DomoSenso.org symbol, the
casing mark of brand book 1.0 (`branding/`), built in OpenSCAD from `branding/geometry.json`;
`logo = false` removes it. NOTICE already says the licence grants no trademark rights.

## Website

`tools/website_content.py` `export_source_assets` serves only `devices/wiring/<name>.svg` today
(text, read from git at the documentation commit, compared byte for byte by `--check`). It also
accepts:

- `sourcePath` `devices/enclosures/<id>/preview/<name>.png`, served at exactly
  `/enclosures/<id>/<name>.png` (no other public path);
- read as bytes from git at `sourceCommit` (equal to the documentation commit, as for wiring),
  refused unless it starts with the PNG signature, written byte-identical; `--check` fails on a
  missing or different copy;
- asset metadata as for wiring: `alt`, `kind: enclosure-preview`, `credit: DomoSenso`,
  `license: Apache-2.0`, `scope: public-device-guide`.

Nothing else in the folder is copied to the site. The guide's other links become GitHub links at the
pinned commit, as today; GitHub shows an STL in its 3D viewer and offers every file for download.
The device page's image renderer stays as it is (a linked figure, caption "Open full-size diagram").
Inference, to check on a built page: its CSS keeps the 4:3 preview's aspect ratio.

The site shows the enclosure only after the website's normal publication PR moves
`documentationCommit` to a commit with it and adds the preview to `assets.json`;
`uv run tools/export_website.py --check` verifies that PR.

## Compatibility

`docs/COMPATIBILITY.md`, Distribution, two new rows:

| surface | level |
|---|---|
| `devices/enclosures/<id>/` with `README.md`, `stl/`, `3mf/`, `preview/` | ADDITIVE-ONLY |
| Served preview path `/enclosures/<id>/<name>.png` on domosenso.org | STABLE |

No home changes anything; no component version changes; the command lines of
`export_website.py` and `check-all.sh` stay the same. Published guides pin their links to a commit,
so a later rename in the folder does not break a page already published.

## Tests

- `tests/test_website_export.py`: a PNG source asset is exported byte-identically from the given
  commit, not from the working tree; a source path outside `devices/enclosures/<id>/preview/*.png`,
  a served path other than `/enclosures/<id>/<name>.png`, or bytes without the PNG signature fail;
  `--check` fails on a stale copy.
- `tests/test_catalog_content.py`: every `devices/enclosures/<id>/` has `README.md`, a `.scad`
  source, at least one `stl/*.stl` and one `preview/*.png`; every relative link in its README and
  every link from a device guide into it resolves to a file.
- The privacy test as it is (it scans `devices/`; it skips binary files and reads the text ones).
- `tools/check-all.sh` green; the website's `npm run build` and a look at the built device page.
- Geometry, by hand (OpenSCAD is not in CI): `verify-model.py` passes on every part, and `build.py`
  run on the committed source reproduces the committed STLs.

## Out of scope

- Uploading to MakerWorld, Printables or any other catalog: the maintainer's accounts and choice.
  The listing text, previews and files are prepared for him outside this repository.
- A field for enclosures in `devices/<id>.yaml` (a schema change), an enclosure page or index of
  its own on the website, serving STL or 3MF from the website.
- Enclosures for other boards; the layout allows them.

## Open questions

1. OpenSCAD in CI to prove the committed STL and 3MF match the source. It would need the 2025+
   snapshot with the Manifold backend in the CI image. Proposed: no; the README says how to
   regenerate, and a reviewer runs the gate.
2. Licence on the external catalogs: whether MakerWorld and Printables offer Apache-2.0 is not
   checked; the maintainer picks one when uploading.
3. The device page captions every guide image "Open full-size diagram". Proposed: keep it; a
   preview opened full size is still useful.
