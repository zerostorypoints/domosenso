# HiFiSync Studio Drawings Implementation Plan

> **For agentic workers:** Use test-driven development for the independent API, renderer, and transport changes.

**Goal:** Put the approved HiFiSync rack and interactive room drawings into the Studio pilot and build a locally signed test APK under its separate pilot package ID.

**Spec:** SPEC-050 with the user-approved rack elevation and room isometric/top-down mockup amendment.

1. Publish an additive optional system drawing projection from the existing scoped snapshot. Per component, optional physical fields: `widthCm`, `heightCm`, `depthCm`, `floorstanding`, `drivers` (role, size, count, optional type and face), `bassAlignment`, `active` and `rackKind` (amp/phono/tt/src/spk/sub/dac). Keep revision hashing, scoping and cache expiry. Exact supported fields and compatibility are tested with real catalog fixtures. Transport strips unknown nested fields and retains bounds.
2. Reuse the exact HiFiSync RackView, RoomIsometric and their drawing dependencies via a pinned build artifact. Compile them offline into Studio with Polish/English/German copy and style adapters matching the approved mockup. Keep the current text and dimensions-only fallbacks. Keep selected equipment and room preset across snapshot refreshes, and clear the view when projection is no longer valid.
3. Keep requests by earlier pilot clients valid by negotiating the enhanced projection separately at the Frame bridge. Older clients continue to receive the original Studio payload. Import the new checksummed artifact into bridge and Android repositories.
4. Exercise physical projection validation, old/new requests, touch selection and view switching after refresh, fallback and expiry. Verify an isolated HA run, frame build and separate application identifier. Preserve the APK and source recovery outside worktrees.
