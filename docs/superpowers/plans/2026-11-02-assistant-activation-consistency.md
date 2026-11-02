# Assistant activation consistency implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this continuation. The component contract is already approved; this closes its activation and acceptance gaps.

**Goal:** Make existing component metadata usable through explicit Frame exposure, with the same typed answers consumed by HA and Android.
**Architecture:** Catalog definitions and private rendered bindings remain the semantic source. The bridge offers admin-only binding proposals and persists explicitly selected component/source references. Runtime resolves those references only against currently verified artifacts; Android consumes the existing capability/answer protocol. Shared categories remain discovery metadata, never grants.
**Tech Stack:** Python/HA, plain JavaScript admin panel, TypeScript Android formatter.
**Spec:** ../../../.ai/specs/SPEC-029-2026-10-31-assistant-component-contract.md (sections 5–7, mapping UI and diagnostics); SPEC-028 Amendment 5 (catalog-wide categories).

## Global constraints

- No production settings, mappings, helpers or HA profiles changed during implementation.
- No new actuator operations, no implicit source exposure, no inference from device names.
- Existing manual mappings and legacy clients remain valid. Missing metadata never converts a component binding into a manual adapter.
- HA 2026.9.2; all shared fixtures use fictional installations.
- No publication, merge or deployment is implied by local acceptance.

## Interface decisions

- Add optional `assistant.component_sources` to the bridge-owned mapping record. Each selection names a component, subject key and exact selected role-to-entity references. This is an implementation of the approved explicit exposure policy, not a new answer type. Artifact changes that replace an entity require renewed selection; adding a new role never grants it automatically.
- Admin `studio_mappings` gains optional `assistantCatalog` diagnostics/proposals. Ordinary paired capability responses continue to contain only authorized opaque subjects. Existing manual sources UI remains available for vanilla HA.
- The HACS integration owns its assistant activation view; do not edit the separately generated/pinned Studio renderer or the catalog's HA settings UI.
- Component thresholds stay in live verified metadata. Never copy them into a manual mapping when accepting a proposal. Explicit manual overrides remain authoritative.

## Review Focus

- Artifact removal/mismatch or source reassignment after consent must disable affected component roles, including after restart.
- A stale admin proposal cannot widen a grant, overwrite an unrelated manual mapping or expose denied sources.
- Labels and thresholds may change on a component update without losing subject identity or requiring an APK.
- An installation with no compiler artifacts needs an actionable diagnostic and still supports explicit vanilla adapters.
- The same plant data and limits must reach the bridge and app in PL/EN; categories alone cannot activate a query.

## Task 1: Verified component exposure and admin proposals

Files in Frame HA: assistant_bindings.py (new), assistant_data.py, studio_mappings.py, studio_api.py; tests/test_assistant_bindings.py (new), test_assistant_activation.py.
- [x] Write failing tests for opt-in, entity substitution, component removal, restart and manual precedence.
- [x] Implement reference validation/resolution and admin proposal diagnostics, with existing revision-checked saves.
- [x] Run the full bridge pytest suite and record results.

## Task 2: Activation view without editing HA settings or pinned renderer

Files in Frame HA: assistant-panel.js (new), panel.js, tests/assistant-panel.test.mjs (new).
- [x] Add PL/EN activation view using existing admin mappings API; proposals enter a review draft before Save.
- [x] Preserve manual mappings and sensitive opt-ins; show missing metadata and existing selections.
- [x] Exercise draft selection/removal, save payload and stale responses in JS tests.

## Task 3: Reproducible compiler-to-HA-to-app acceptance

Framework: tests/generate_assistant_profiles.py; Frame HA: tests/ha_smoke.py, docs/assistant.md; Android: tests/assistant-bridge-fixtures.test.mjs and fictional fixtures as needed.
- [x] Generate real plant bundles from fictional component inputs, including translated names and non-default limits.
- [x] On fresh HA, select generated proposals through admin handlers, query through paired handlers, verify revocation and missing metadata; export protocol evidence only.
- [x] Validate/format the returned facts with the actual app in PL/EN, including short speech/full details.
- [x] Update operational docs and run repository checks appropriate to changed code; independent review before completion.

## Website impact

No public website claims or release changes before reviewed releases. Update internal installation and troubleshooting documentation only.

## Verification and review

- Full framework `tools/check-all.sh`: passed, including isolated configuration checks; opt-in demo skipped. This change has no catalog runtime/card modification requiring the full browser demo.
- Bridge: 109 Python tests and 9 DOM tests, including the five independently reproduced review findings and regressions for shared plant sensors, changed policy sources, explicit-role consent, endpoint handoff, and uninterrupted source review.
- Fresh HA 2026.9.2 compiler/handler acceptance: compiled climate-air, floorplan and plants; signed pairing, non-default plant thresholds, metadata removal and revoked access.
- Android: actual HA wire fixture accepted and formatted in PL/EN; 306 tests, typecheck and lint. Speech summaries retain full on-screen facts.
- No live tablet/microphone, full WebSocket reconnect or whole-catalog runtime acceptance is claimed. No production deployment, settings change or release was performed.

The independent snapshot review requested five fixes. Each was reproduced in a failing regression and corrected. Explicit component-source mode now disables legacy artifact enrichment, including when selections are empty; manual/direct adapters remain available. Metadata policies are inherited only when their full source identities still match. Bridge downgrade requires a compatible backup; deleting selections is not a downgrade migration.
