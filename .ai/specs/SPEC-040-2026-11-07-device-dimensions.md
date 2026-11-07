# SPEC-040: physical dimensions of catalog devices, with a drawing, on their domosenso.org pages

- Status: approved 2026-11-07 by the maintainer. Added in implementation: the optional `approximate` flag and the wording of the Atom's key D.
- Source: maintainer request 2026-11-07: document the dimensions of the hardware DomoSenso uses and
  show them on domosenso.org. Answers the same day: on the device pages only (no community
  section); one value per dimension plus a drawing showing what each value measures; the M5Stack
  Unit CO2L enters the catalog with a new component that extends an Atom node, as the radar
  extends a presence node (separate spec, see "CO2L").

## Goal and placement

Whoever designs a stand, a box or a mount for a catalog device needs its outline, and today the
numbers are scattered: an enclosure's README (SPEC-036), the `.scad` constants, a design session's
notes. A device file gets a `dimensions` block: lettered values, each with its source and the date
it was read or measured, and a drawing that puts the letters on the part. The device's page on
domosenso.org shows the drawing and the table.

Placement test: a second home with the same board has the same dimensions; nothing is
home-specific; Home Assistant has nothing to say about them. → the device file in the catalog, next
to its match rules.

## Device file

`schemas/device.schema.json` gets an optional `dimensions` (ADDITIVE-ONLY):

```yaml
dimensions:
  drawing: devices/dimensions/m5stack-atom-lite.svg
  items:
    - key: A                       # the letter on the drawing, unique in the file
      label: Body, width × depth × height
      value: [24, 24, 9.5]         # one to three numbers, in the order the label names them
      unit: mm                     # mm (default) or g
      tolerance: 0.2               # optional, ± in the unit
      approximate: false           # optional; true shows the value as ≈ (an estimate, not a reading)
      source: manufacturer         # manufacturer | official-model | caliper | ruler | inference
      ref: https://docs.m5stack.com/en/core/ATOM%20Lite
      checked: "2026-11-07"        # quoted; when the source was read or the part measured
      note: Caliper 2026-11-07, height 9–10 mm.
```

- One value per dimension. A second source that disagrees goes in `note`, with its value and date;
  the value shown is the one the catalog relies on.
- `ref` is required for `manufacturer` and `official-model` (a product page, a drawing, a model
  file in the manufacturer's repository) and is a public URL. `caliper` and `ruler` need only
  `checked`; who measured stays out (privacy). `catalog_check` checks that the drawing's
  single-letter text elements are exactly the keys, keys are unique and `checked` is not in the future. `inference` says in `note` what it was inferred from.
- `drawing` is a hand-made SVG in `devices/dimensions/<device id>.svg`: the part in the views the
  letters need, each letter once, labelled with the caption "as the catalog reads the sources".
  It is the reviewer's check that the numbers were understood as meant.
- Positions without a number (the Atom's Grove socket "on the back, USB-C side") are drawn and
  named on the drawing, not listed as items.

## Website

- `tools/website_content.py`: for each device record, read `devices/<id>.yaml` at the record's
  `sourceCommit` (also when `sourcePath` is the `.md` guide) and copy `dimensions.items` into the
  exported device as `dimensions`. No editorial copy in `website/content/devices/*.json`.
- `export_source_assets` accepts `sourcePath` `devices/dimensions/<id>.svg`, served at exactly
  `/dimensions/<id>.svg`, read from git at the documentation commit and compared byte for byte by
  `--check`, as the wiring diagrams are; asset `kind: dimensions`, `credit: DomoSenso`,
  `license: Apache-2.0`, `scope: public-device-guide`. A device whose file has `dimensions` and
  whose drawing is not in `assets.json` fails the export.
- `website/src/app/devices/[id]/page.tsx`: a section **Dimensions** after the documented component
  versions: the drawing as a linked figure (the wiring renderer) and a table *key · dimension ·
  value · source · checked*; the source cell links `ref`; `note` shows under the table row. No
  section when the device has no dimensions.
- `devices/[id]/index.md` (the agent-readable page) gets the same table as Markdown, and the drawing
  link.
- No new navigation entry and no community page.

## First devices

### M5Stack Atom Lite (`devices/m5stack-atom-lite.yaml`, this spec)

| key | dimension | value | source | checked |
|---|---|---|---|---|
| A | Body, width × depth × height | 24 × 24 × 9.5 mm | manufacturer, [product page](https://docs.m5stack.com/en/core/ATOM%20Lite); note: caliper 9–10 mm high | 2026-11-07 |
| B | USB-C axis below the button face | 2.15 mm ± 0.2 | manufacturer, [model-size drawing](https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/docs/products/core/ATOM%20Lite/model%20size.jpg), measured from pixels | 2026-11-05 |
| C | Header sockets from the side edges | 4.5 mm ± 0.2 | manufacturer, model-size drawing | 2026-11-05 |
| D | Header socket rows from the face opposite the USB-C, first × last | 9.5 × 19.6 mm ± 0.2 | manufacturer, model-size drawing | 2026-11-05 |
| E | Button cap, square | ≈ 13 mm (`approximate`) | caliper | 2026-11-07 |

Drawn without a number: USB-C on the side face, next to the button face; the Grove (HY2.0-4P)
socket on the back face at the USB-C side, its plug entering parallel to the back; the M2 hole in
the back. The official model, [C008_Atom-Lite](https://github.com/m5stack/M5_Hardware/tree/master/Products/C008_Atom-Lite),
is named in A's note as a further source (not measured from).

The 2026-11-05 values are those SPEC-036's enclosure README took from the drawing; they move into
the device file, and the README links there instead of repeating them.

### M5Stack Unit CO2L (`devices/m5stack-unit-co2l.yaml`, with its component)

A device file needs a `component`, and no component uses the Unit CO2L yet. Its file, with these
dimensions and drawing, lands in the pull request of the new component (its own spec). Recorded
here so the values are not lost:

| key | dimension | value | source | checked |
|---|---|---|---|---|
| A | Body, length × width × height | 48 × 24 × 16 mm | manufacturer, [U104 product page](https://docs.m5stack.com/en/unit/co2l); caliper agrees | 2026-11-07 |
| B | Flange at the Grove end, length × height | 17 × 8 mm | caliper; note: the official model [U104_Unit_CO2L](https://github.com/m5stack/M5_Hardware/tree/master/Products/U104_Unit_CO2L) shows about 15 × 8 | 2026-11-07 |
| C | LEGO-compatible holes, diameter | 4 mm | caliper | 2026-11-07 |
| D | LEGO holes, centre to centre | 17 mm | caliper | 2026-11-07 |
| E | Grove plug beyond the end face, plugged in | 2 mm | caliper | 2026-11-07 |
| F | Weight | 7.5 g | manufacturer, U104 product page | 2026-11-07 |

Drawn without a number: vent holes on the dome top, horizontal slots on both long sides of the
dome, the closed bottom with its label and centre screw.

Product page read 2026-11-07: "Product Size 48.0 x 24.0 x 16.0mm", "Product Weight 7.5g".

## Compatibility

`docs/COMPATIBILITY.md`, Distribution and Manifest:

| surface | level |
|---|---|
| Device field `dimensions` (`drawing`, `items`: `key`, `label`, `value`, `unit`, `tolerance`, `source`, `ref`, `checked`, `note`) | ADDITIVE-ONLY |
| Drawings `devices/dimensions/<id>.svg` | ADDITIVE-ONLY |
| Served drawing path `/dimensions/<id>.svg` on domosenso.org | STABLE |

The values are data and change freely; a key letter, once published, keeps its meaning.

## Tests

- `tests/test_catalog_content.py`: every `dimensions.drawing` exists; every item key appears as a
  text element in its drawing and every lettered text in the drawing is an item key; keys unique;
  `ref` present for `manufacturer` / `official-model`; `checked` not after today.
- Schema: `catalog_check --strict` validates the new field.
- `tests/test_website_export.py`: a dimensions drawing is exported byte-identically from the commit;
  another source path, another served path, or a device with dimensions and no drawing asset fail;
  the exported device carries the items read at `sourceCommit`, not from the working tree.
- Privacy test as it is (it scans `devices/`).
- `tools/check-all.sh` green; `npm run build` and a look at the built Atom Lite page with the
  documentation commit moved to the implementation (as SPEC-036). Demo: skip (website and catalog
  data only).

## Website impact

The Atom Lite page shows the section after the website's normal publication PR moves
`documentationCommit` and adds the drawing to `assets.json`. The CO2L page comes with its component's
release.

## Out of scope

- A community section or a dimensions index page (the maintainer chose device pages only).
- Accessories (the Grove cable: 4-wire ribbon about 6 × 1.2 mm, 8 mm at the plug, plug at most
  4 × 10 mm); they can go into the CO2 component's device guide.
- Generating drawings or models from the numbers; changing the existing enclosure's geometry.
