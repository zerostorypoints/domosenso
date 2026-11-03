# Assistant room controls implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** PL/EN light, window-covering and awning voice commands using shared HA metadata and explicit grants.
**Architecture:** Optional managed action sidecars supplement unchanged read bundles. The bridge negotiates approved targets, preflights and executes fixed commands. Native renders concise results and clarification choices.
**Tech Stack:** Python/JSON Schema/Jinja in framework; HA Python/WebSocket and vanilla JS configuration; React Native/TypeScript.
**Spec:** `.ai/specs/SPEC-033-2026-11-03-assistant-room-controls.md` (approved with awnings).

## Global Constraints

- HA 2026.9.2; current QVAC/models/detector C unchanged.
- Existing read schema-1 bundles and timer action revision 1 remain compatible.
- Explicit endpoint write grants default off; no inheritance from future read grants.
- No arbitrary entity/service execution, optimistic physical-completion claim, unattended production actuation or HA settings rewrite.
- Shared source/area identity for Domosenso and vanilla; homes keep private mappings/data.
- English source/docs; en/de/pl framework metadata, PL/EN native and bridge feedback.
- No pushes, releases or production activation of new controls in this implementation task; the separately authorized 0.9.6 release contains prior fixes only.

## Review Focus

- Read bundles remain identical when actions are enabled: Task 1 golden comparison.
- Cover class relabelling or newly exposed sources cannot broaden a grant: Task 2 source-replacement test.
- An awning wind alarm arrives after negotiation: Task 2 dispatch-time safety test.
- Repeated/reconnected requests after ambiguous dispatch never operate twice: Task 2 crash-ledger test.
- A status/negated question must never actuate a device: Task 3 bilingual negative parser tests.

### Task 1: Framework action sidecars

**Files:** new `tools/assistant_actions.py`, `schemas/assistant-actions.schema.json`, `schemas/assistant-actions-profile.schema.json`, lights/awnings `assistant-actions.yaml` and `templates/assistant-actions-bindings.yaml.j2`; modify `schemas/component.schema.json`, `tools/domosenso_cli/build.py`, `tools/catalog_check.py`, relevant component manifests/translations/UPGRADE, `tools/domosenso_cli/recommend.py`, `docs/COMPATIBILITY.md`, `docs/UPGRADE_NOTES.md`, `docs/ASSISTANT.md`; tests `tests/test_assistant_actions.py` plus CLI render/deploy coverage.

**Interfaces:** manifest optional `assistant_actions: {version: 1, definition: assistant-actions.yaml, bindings: templates/assistant-actions-bindings.yaml.j2}`. Output `domosenso/assistant-actions/<component>.yaml`, schema 1, component `{id, version, commit, dev}`, definitions `{actions: [...]}`, translations and bindings. Capabilities use allowlisted IDs/revision 1 (`lights.turn_on`, `lights.turn_off`, `awnings.extend`, `awnings.retract`, `awnings.stop`), operation `write`, title/description/examples keys, declared required/optional source roles and no service/prompt fields. Bindings share read subject keys and light/cover entity identities; awning wind guard carries wind+last_heard references and max_age_seconds derived from existing component silence input. Vanilla covers are bridge adapters, not a new framework component. Reuse existing `load_actions(component_dir, manifest, strict_translations=False)` and `compile_actions(component_dir, manifest, rendered_bindings, version, sha, dirty)` from SPEC-031. Merge local approved feature/shared-frame-timers dependency before implementation; extend its closed timer schemas additively, preserving timer operation/parameters and existing outputs. Write a protocol fixture JSON suitable for Task 2 under tests/fixtures/assistant-actions/.

- [ ] Add RED tests for default absence, light/awning compilation, exact provenance, positive finite wind age, undeclared sources, unsafe paths, arbitrary executable fields, translated labels, read bundle byte equality, private managed output tracking and rollback/removal.
- [ ] Implement optional compiler and catalog validation; reuse safe-path/size/source validation helpers without changing existing read serialization. Track action templates as metadata in recommendations; never HA packages.
- [ ] Add lights/awnings definitions and bindings, additive version bumps and upgrade docs. No existing instance inputs or default behaviour changes. Existing silence policy is authoritative.
- [ ] Run focused tests then `tools/check-all.sh` before commit; record Demo: skip because this task compiles metadata without runtime services, fresh HA execution is Task 2.
- [ ] Commit and write schema/fixture paths plus full evidence in task report. Do not push.

### Task 2: Bridge negotiation, explicit mapping and bounded execution

**Files:** Frame HA integration `control_actions.py`, `control_api.py`, `control_profiles.py`, action schemas, tests; existing setup/timer dispatcher and admin source editor/mapping validation extended additively; `docs/controls.md`, compatibility/upgrade notes.

**Interfaces:** consume Task 1 sidecar fixture and installed provenance; expose new `domosenso_frame/control_targets` and `domosenso_frame/control_action` version 1 authenticated through existing endpoint/device proof. Keep timers' APIs untouched. Targets carry opaque id, kind, room identity/labels/aliases, allowed capabilities and revision; execution accepts target id/revision, capability/revision and requestId only. Results carry accepted/confirmed/moving/failed/unknown and per-target outcomes; no arbitrary service names. `assistant.controls` holds enabled:false and exact source/action grants plus optional vanilla room/wind mapping. Persist bounded request ledger before service dispatch and record terminal/uncertain result; do not automatically replay pending records on restart.

- [ ] Inspect Task 1 report and exact output fixture, write RED tests for explicit grants, HA READ+CONTROL and device revocation, mapping replacements, source overlap/dedupe, area precedence/conflicts, unknown services/classes, unavailable targets and incomplete room scope.
- [ ] Resolve common source identity from existing maps, compiled sidecars and HA registries; expose administrator review/save in existing Frame integration panel, no YAML or Android duplicate configuration. Select grants by exact entity/source binding; no default auto-enabling.
- [ ] Implement fixed actions: light.turn_on/off, cover.open/close/stop; awning extend=open_cover, retract=close_cover. Check supported_features, state and permissions at dispatch. Wind extension requires non-alarm known state, parseable nonfuture last-heard and positive bounded age. Deny unknown/missing/stale/replaced wind bindings; retraction/stop do not require safe-wind evidence. Check all target prerequisites before any service call; per-target outcomes survive partial service failure.
- [ ] Add concurrent duplicate and crash-ledger tests, bounded storage, current source/grant revalidation, no premature physical-completion claim and assumed_state handling.
- [ ] Run full bridge suites and a fresh isolated HA 2026.9.2 with fictional Domosenso+vanilla inputs, recording exact mocked calls and denied calls. Keep production untouched. Commit and export native protocol fixtures.

### Task 3: Native PL/EN intent, clarification and results

**Files:** native `src/controls/intent.ts`, `protocol.ts`, `conversation.ts`, UI component for control choices/results, tests; integrate existing assistant routing and authenticated HA transport; docs/controls.md.

**Interfaces:** consume Task 2 validated fixtures and endpoints. Parse deterministic intents to kind/action/target phrase; never a raw entity or service. Clarification stores original capability, bounded candidate list, revision and expiry, cleared on cancel/new unrelated question/reconnect. Exact unambiguous authorized targets execute once using stable requestId; ambiguity/missing target shows choices and asks a short question. No automatic retry on timeout/unknown outcome.

- [ ] RED tests for Polish inflections/ASCII ASR, English room phrases, exact on/off, window coverings and awning vocabulary; negative status/quoted/negated/conditional/compound/future requests cannot dispatch.
- [ ] Implement current-capability negotiation, exact room/alias resolution, explicit choice confirmation for incomplete room scope, stale-choice rejection and target revision revalidation; older bridge yields unsupported message.
- [ ] Show controls results and concise localized speech, with accepted vs confirmed distinction and assumed-position note. Return to listening immediately after speech without waiting for cover motion.
- [ ] Test bilingual end-to-end typed commands with fake bridge fixtures, authorization failures/timeouts/duplicates and lifecycle return to listening; full npm/type/native checks and Android build. No publication of new controls until reviewed.
- [ ] Commit and report integration acceptance plus remaining physical tests.
