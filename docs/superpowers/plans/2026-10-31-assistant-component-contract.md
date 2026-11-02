# Component assistant implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track completed tasks and verification here.

**Goal:** Implement SPEC-029 across the framework, HA bridge and Android client, with all catalog topics grounded in authorized HA data.
**Architecture:** Components publish validated definitions and private rendered bindings. The bridge normalizes Domosenso or manual mappings, authorizes and evaluates read queries. The app negotiates types, recognizes PL/EN questions, formats and speaks facts; old bridges retain legacy behavior.
**Tech Stack:** Python/Jinja/YAML/JSON Schema; HA Python/WebSocket; Expo/React Native/TypeScript/QVAC.
**Spec:** ../../../.ai/specs/SPEC-029-2026-10-31-assistant-component-contract.md

## Global constraints

- Read-only operations; no live HA/tablet changes, store publication, pushes or merges are included in this implementation run.
- Existing protocol 1, three legacy topics, pairing, model C and PL/EN lifecycle stay compatible.
- Refreshed main d997beb includes floorplan; all 13 components require explicit coverage.
- Permission checks precede reads, filtering, counts and help. Metadata does not widen grants.
- No private household data or credentials in any shared repository or test fixture.
- New optional manifest schema; version 1 definitions and runtime negotiation; unknown types fail closed.
- English source/fallback with en/de/pl component translations; Android speech/UI PL/EN.
- Maximum 100 plants/lights/events, 64 rooms/capabilities, 16 players/calendars, 168 forecast periods.

## Review focus

- A group grant does not expose hidden light children: bridge permission fixtures.
- Same-value source reports versus restored templates: bridge freshness fixtures.
- Old app parsing the three-topic profile: protocol compatibility tests.
- Native speech cancellation while a new-domain request is pending: app lifecycle tests.
- Component update and rollback preserving mappings: temporary-home managed-artifact tests.

## Coordination and authorization

The maintainer approved the specification and requested implementation. Use owned named worktrees;
framework and bridge/app subsystems have disjoint files. Keep source snapshots of the existing
uncommitted Android pilot before extending it. No remote integration or production effects. The
framework coordinator integrates the implementation and reviews cross-repository fixtures. Record
unverified hardware/runtime limits rather than calling unit tests a physical test.

## Task 1: Framework schema, compiler and all-component metadata

Files: schemas/component.schema.json, new schemas/assistant.schema.json and assistant-profile.schema.json;
tools/assistant_contract.py; tools/catalog_check.py; tools/domosenso_cli/build.py;
components/*/assistant.yaml, templates/assistant-bindings.yaml.j2, translations/*.json;
tests/test_assistant_contract.py and tests/test_cli_build.py; COMPATIBILITY/UPGRADE docs.
Interfaces: compile_profile(component_dir, manifest, rendered_bindings, version, sha, dirty) -> dict.
Artifact path domosenso/assistant/<id>.yaml; stamp plus safe YAML; ordinary managed lock hashes.
Envelope schema=1, component={id,version,commit,dev}, definitions={capabilities:[]},
translations={en,de,pl}, bindings={subjects:[],policies:[]}. Subject key/kind/label/roomKey?
plus fields map of named roles to {entity,attribute?}, indoor?, limits?; no secrets or prompts.
Policies join by exact metric/entity/unit and include owner, levels, direction and helper refs.
- [x] Write failing schema/path/privacy/coverage and compile/install tests.
- [x] Observe RED; implement bounded pure compiler and catalog validation.
- [x] Add declared inputs/default-based bindings and en/de/pl metadata for all 12 components.
- [x] Observe GREEN including independent temporary home, old manifest and rollback compatibility.

## Task 2: HA bridge adapters, authorization and read API

Files in separate Frame HA repo: new assistant_contract.py, assistant_data.py, assistant_api.py;
__init__.py profile/setup; studio_sources.py/mapping UI; tests/ and docs/assistant.md.
Interfaces: profile endpoint assistantVersion=1; assistant_capabilities and assistant_query as SPEC-029.
Consume Task 1 envelope and manual endpoint mappings; return spec typed response/evidence.
- [x] Write failing pure adapter, schema, permissions, unknown-source, live-policy and date tests.
- [x] Observe RED; implement definitions loader, identity matching, allowlisted source adapters and routes.
- [x] Implement all 13 scopes, explanation-only remote-access, explicit sensitive exposure/mapping.
- [x] Observe GREEN; fresh fake-HA Domosenso and vanilla instances return equivalent normalized answers.

## Task 3: Android negotiation and PL/EN conversation

Files in app repo: src/assistant/{protocol,intent,format}.ts, src/ha/protocol.ts,
App.tsx, src/voice/VoicePanel.tsx, tests/assistant*.test.mjs and lifecycle fixtures.
Interfaces: negotiate typed capabilities after pairing; route help and matching PL/EN intents;
retain old getData fallback for old bridges; cancellation/epoch checks around all async stages.
- [x] Write failing protocol, natural-question, qualified-speech and legacy/lifecycle tests.
- [x] Observe RED; implement bounded validators, intent routing and deterministic responses.
- [x] Wire actual app panel/QVAC speech to new request path without changing model C/native screen behavior.
- [x] Observe GREEN in both languages, all domains, old bridge and source permission failure.

## Task 4: Cross-repository acceptance and documentation

Files: shared fictional protocol fixtures in framework tests/fixtures/assistant and pinned copies in consumers;
repository docs/assistant and installation/update instructions.
- [x] Run the same fixtures through compiler, bridge and client, detecting schema mismatch.
- [x] Verify actual HA startup/reload/read routes in isolated fictional staging if available; no production.
- [ ] Framework check-all, bridge suite, app suite/typecheck/lint; build Android if native packaging changes.
- [ ] Record exact results, source revisions, remaining runtime limits and reusable install/update steps.

## Task 5: Independent final review

- [x] Fresh review in owned worktrees: spec coverage, access filtering and source provenance.
- [ ] Fix material findings with regression tests; verify changed areas.
- [ ] Prepare reviewable branch changes; no push/publish/deploy without task authorization.

## Website impact

No public claims before release. Prepare draft component/question documentation only; publish after
reviewed component tags and bridge/app releases exist. Existing public site behavior is unchanged.

## Execution ledger

- Planning: specification approved; implementation in progress.
- Remote baseline: 6affed4; coordinator branch feature/assistant-component-contract.
- Ruling: use isolated subsystem sessions with fixed contract and final cross-repo review; do not
  merge or publish remote branches. Existing APK changes are preserved in their current worktree.

- Task 1 compiler/build: RED (16 missing-compiler tests, private-path integration test and HA-package
  exclusion test), then GREEN: 120 focused compiler/build/deploy/harness tests. A temporary-home
  rollback preserves endpoint storage. Compiler metadata validation remains subject to full catalog
  integration and review.
- Task 1 metadata: delegated to a separate named worktree; shared plant normalization and Ramka
  policy fallback first, then all catalog definitions/translations/bindings.
- Tasks 2/3: subsystem worktrees preserve bridge and Android baselines. Initial restricted sessions
  were incomplete; resumed with the parent environment's writable/network policy. No deployment.
- Ruling: retain the existing source-checkout/uv tooling distribution; add compiler/helper modules
  to its module list. Wheel packaging of the pre-existing schema layout is outside this contract.
- Ruling: raw assistant bindings are excluded from ha-check package installation; ordinary build
  compiles them into the private managed artifact. No alternate installer or runtime service.

- Task 1 complete: all 12 definitions (34 capabilities), private artifact compilation, strict
  translation lists and manifest ownership validation. All profiles compile from fictional inputs.
  Existing Ramka/plants/audio/awning runtime renders stay byte-identical. Shared Ramka air constants
  and audio/wind helper defaults are component-local template partials, pinned with their revision.
- Verification: full tools/check-all.sh passed: Python, Node, strict catalog, website, agent rules,
  two fresh staging homes, HA config checks for all 12 components plus two Ramka variants, and both
  ESPHome components. A subsequent isolated regression verifies single-language name fallback.
- Task 3: 219 app tests, TypeScript and lint passed; temperature fixture from actual bridge output
  accepted. Natural PL/EN speech and per-endpoint help paging implemented. Full cross-repo acceptance
  still in progress; no native build or device test claimed.
- Task 2 split for completion: original bridge session owns metadata activation/permissions/identity
  and existing-domain interoperability; a disjoint adapter module in its own worktree owns plant,
  environment, mains, wind and forecast routes. Parent will integrate and verify them together.

## Resume on 2026-11-02

Main integration: d997beb, preserving new Ramka previews/music settings and floorplan 0.3.1. Assistant specification renumbered SPEC-029 to avoid main SPEC-024 collision. Reviewer fixes move all binding normalization into pinned component templates, correct upstream source ownership, preserve translated plant roomLabel, and classify awning wind as reported state. Focused compiler/binding tests: 41 passed. Full checks pending after integration. No production changes.

Verification on 2026-11-02: framework at 45c90ba passed full check-all (1495 Python tests, 699 card tests, fresh staging lifecycle, all HA/ESPHome configuration checks). Real HA 2026.9.2 bootstrap and registered-handler smoke loaded compiler-generated climate-air/floorplan artifacts, verified signed pairing and approval, returned qualified unknown-source readings and an installed floorplan explanation, and denied the query after device revocation. No HTTP WebSocket transport, browser or physical-device acceptance is implied. Bridge initially passed 76 tests; app passed 275 after floorplan/fixture integration. Independent whole-change review found source adapter, partial-provider coverage, localized labels, forecast condition and spoken truncation issues; the bridge/app follow-up fixes and final cross-fixture verification remain in progress.
