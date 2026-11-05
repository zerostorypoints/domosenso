# DomoSenso brand book

Version 1.0 · Approved portal family · 5 November 2026

## One family, two roles

**DomoSenso.com** identifies professional building-automation services for homes, hospitality and businesses. Its closed architectural portal expresses a coherent building and a considered implementation.

**DomoSenso.org** identifies the open Home Assistant framework: reusable components, documentation and tools for AI-assisted setup. It opens the right shoulder of the same portal to express connection and extension. It is not a second company or a claim of endorsement by Home Assistant.

Use the approved Open shoulder pair. The earlier tiled framework mark and the alternative crown opening are superseded concepts, not production marks. DomoSenso operates under ZeroStoryPoints GmbH. Do not add invented certifications, partnerships, legal details or customer references.

## Construction

The source canvas is 64 × 64 units. Final visible bounds are x=8…56, y=6…58, including the 2-unit vertical translation. Outer and inner arcs share a centre at (32,28) before translation, with radii 24 and 12 units. Uprights and the centre block are 12 units wide. The two base gaps are 6 units. The centre block is x=26…38, y=44…56 before translation.

The framework symbol removes the y=20…28 band from the right shoulder of the commercial portal. It adds no tile, dot, outline or different curve. The same paths serve digital and physical applications; physical files only crop and scale the viewport. Keep geometry.json and generate.py as the editable construction source.

## Colours

| Role | Colour | HEX |
| --- | --- | --- |
| Commercial identity | Olive | #4E5E43 |
| Framework identity | Terracotta | #AD431F |
| Main lettering / monochrome | Ink | #252A24 |
| Shared pale surface / reverse | Paper | #FAF9F5 |
| Commercial accent on dark surfaces | Pale sage | #D6DFBC |
| Framework accent on dark surfaces | Pale terracotta | #FFC4A5 |

Use olive for .com and terracotta for .org. Colour supports the distinction; shape and the domain suffix must remain understandable without it. Preserve existing site surface colours where they differ slightly. For dark surfaces use the supplied dark lockup (paper lettering with the pale domain accent), or the single-colour reverse version. Use ink for monochrome on light surfaces. Production colour matching for a particular printer, paint, filament or substrate needs its own proof; HEX values specify digital colour.

## Typography and lockups

Manrope regular forms “Domo”; Manrope semibold forms “Senso”. The domain suffix follows the name on the same baseline. The full lockup adds BUILDING AUTOMATION or OPEN FRAMEWORK in English. The compact lockup omits the fine role label and vertically centres the name against the symbol; use it in website navigation and other small spaces.

Distributed SVG lettering is converted to paths, so recipients need no font installation. Editable text uses the existing Manrope font files and their SIL Open Font License; see the neighbouring Manrope-OFL.txt. Site editorial typography may retain its established serif or monospace choices.

## Spacing, sizes and misuse

Keep at least one structural width (12 source units) clear around the visible symbol or lockup. Measure from visible shapes, not the SVG artboard. Do not add a box around a plain logo; the supplied rounded tile is for app icons and favicons.

- Standalone digital symbol: 24 px or larger; prefer 32 px. The 16 px favicon is a checked small-size application, not the preferred general logo size.
- Compact lockup: prefer 200–240 px wide on desktop. Responsive headers may reduce it to 160–200 px on narrow screens, subject to visual review.
- Full lockup: use approximately 520 px or wider when the small role label must read as 12 px text. In small applications switch to compact rather than squeezing the label.
- Scale uniformly. Do not rotate, stretch, redraw, add effects or close the framework opening. Do not exchange the domain colours, remove the suffix where the destination would become ambiguous, or revive the earlier house/tile marks.
- On a casing use only the symbol. Keep the domain-specific silhouette; do not replace it with a generic house or four-square grid.

## Physical casing mark

Centre the symbol in an approximately **20 × 20 mm field (4 cm²)**. The tightly cropped master is **18.461538 × 20 mm**, preserving its 48:52 aspect ratio. At this size the main members are **4.615 mm**, the framework opening is **3.077 mm**, and the base gaps are **2.308 mm**. SVG millimetre units and the viewBox are intentional; retain aspect ratio when importing into CAD.

The reference coupon uses a 28 × 28 × 2.4 mm backing with either a 0.8 mm raised detail or a 0.8 mm recess. It is a geometry sample, not the real enclosure. Union every raised component into the enclosure surface, or subtract the same profiles for a recess. Do not export detached parts as if they were a freestanding stencil. A recess requires sufficient remaining wall thickness.

The reviewed sample meshes were connected and watertight. No physical print or printer-specific slicing has been completed. Confirm nozzle, extrusion width, layer settings, orientation, material and the actual enclosure wall before manufacturing. The reference dimensions are a first-trial choice, not a universal printer limit.

## Files, ownership and maintenance

Each owning repository stores this family guide, the same construction source and its own config.json. The commercial repository owns .com production assets; the framework repository owns .org production assets. The generated public/brand copies belong to the website build, not to private home configuration. Cross-repository copies must be updated in the same branding change and checked for matching family geometry.

`assets/logo-color.svg` is the full lockup. `logo-compact-color.svg` is the header/footer version. Mono, dark and reverse variants are explicit. `symbol-color.svg`, `symbol-mono.svg` and `symbol-reverse.svg` are digital symbols. `symbol-20mm.svg` is the physical master. `favicon.svg`, app PNGs and social.svg are derived delivery assets.

Rebuild from the repository root:

```sh
uv run --with fonttools python branding/generate.py
node branding/render.mjs
uv run --with fonttools --with reportlab --with svglib python branding/book.py
```

Requires Python 3.11+, uv, Node and the site's locked Node dependencies. The renderer resolves dependencies from the configured site package, including website/ in the framework repository. Rebuilds use repository-relative fonts and paths, not a personal checkout. Keep logos, guide, generated delivery assets and site integration in the same review. Test headers, footers, favicons and social cards on desktop/mobile before publication. Website publication and a physical manufacturing trial are separate checks.
