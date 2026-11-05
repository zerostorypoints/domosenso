# DomoSenso identity

Start with [the brand book](brand-book.pdf) or its [editable guide](brand-book.md). The approved identity is the Open shoulder portal pair, version 1.0, 5 November 2026.

This repository stores its domain's web assets in `assets/`, dimensioned symbols and flat raised/recessed STL test coupons in `casing/`, and the shared family construction in `geometry.json` and `generate.py`. The public site copies are generated delivery files; edit source and regenerate rather than hand-editing those copies. The other owning repository retains the same guide and construction source with its own `config.json`.

From the repository root, after installing the site's locked Node dependencies:

```sh
uv run --with fonttools python branding/generate.py
node branding/render.mjs
uv run --with fonttools --with reportlab --with svglib python branding/book.py
```

Requirements: Python 3.11+, uv and Node compatible with the site. Fonts come from the configured repository-relative directory and use the supplied Manrope SIL OFL notice. SVG lettering is outlined; recipients need no font installation. Review PDF pages after regenerating, and check desktop/mobile headers, footers, browser icons and the social card before publishing.

For physical review, use `assets/symbol-20mm.svg`: actual bounds 18.462 × 20 mm. In OpenSCAD, render `branding/casing/sample.scad` for the raised 28 × 28 mm trial coupon; pass `-D 'finish="recessed"'` for its recess. This is a casing integration study, not the actual enclosure. No physical print or printer-specific slicing has been verified.

Historical design alternatives are not production assets. The brand book's commercial/framework comparison explains one brand family; each site uses only its own domain's production mark.
