# Shared home metadata implementation handoff

Prepared 2026-11-05. Scope and ownership are defined in the
[design consolidation](../superpowers/specs/2026-11-05-shared-home-component-metadata.md).
This is a repository-level handoff. Real home inputs and physical acceptance evidence
stay in their private instance repository.

## Starting point

The framework main already declares 38 read/explanation capabilities across 14
components through `assistant.yaml`. Source selection, shared timers and light/awning
action metadata from framework PR #204 are merged. Bridge PR #4 remains open at the
inspection baseline. Android PR #2 is merged. Treat release, publication, installation
and activation as separate states.

The `feature/pocket` branch already supplies the shared input mechanism. The v2
branches already supply a compiler, Bridge projection, native matcher and presentation
experiments. Review and reuse them. Their existence is insufficient evidence for
enabling v2.

| Source | Pinned inspection reference | Files to inspect first |
|---|---|---|
| Framework main | `013af945fad43217272aa6d2b3e52af82ef1322b` | `docs/ASSISTANT.md`, SPEC-029/032/033, `tools/assistant_contract.py`, component definitions and binding templates |
| Shared inputs/Pocket | `60a36a20da393b523bc0eb3bb476f3caee583e0a` | `schemas/home-inputs.schema.json`, `tools/domosenso_cli/home_inputs.py`, `tools/domosenso_render.py`, `components/pocket/` |
| Framework v2 | `e67f0c0ed4557e0bd45d569d7c3583f176149c20` | `tools/assistant_metadata.py`, `schemas/frame-assistant-metadata.schema.json`, `tests/test_assistant_metadata.py`, `docs/research/frame-read-routing/` |
| Metadata-client design | `2b989bd` | `.ai/specs/SPEC-034-2026-11-04-metadata-driven-frame-client.md` and its implementation plan |
| Bridge v1 integration | `c4d668904c07f9430d3a347f6fc9fdb32220174d` | PR #4, source selection, timers and control execution |
| Bridge v2 | `bed8a1b84cb41af14cecf561a8bca13f5fd8a6f5` | `assistant_metadata.py`, `assistant_metadata_api.py`, `assistant_metadata_legacy.py`, `assistant_projection.py`, `action_metadata.py` |
| Android main | `51540f0d36530531b1ebcc645444950a67a236ac` | Current speech, display, timer and control lifecycle |
| Android v2 | `20f082e46b97a8a1ce2a93bfb0c20e590a04fc74` | `src/assistant/metadata/`, `src/voice/assistant-turn.ts`, `src/controls/metadata-intent.ts`, `src/timers/metadata-actions.ts` |

Resolve abbreviated hashes in their repository. Fetch and compare current remote
states before integrating. Do not reset another session's worktree. Allocate one
owned worktree and named branch per implementation/review session.

The metadata-client SPEC-034 and the gate-remote SPEC-034 are distinct documents on
different branches. Resolve the number collision before publishing cross-references.
Do not edit either approved meaning merely to make filenames agree.

## Component coverage to preserve

All rows need a conformance record covering definition, bindings, permissions,
current/unavailable/stale/partial evidence, localized answer and displayed detail.
An explanation-only component is complete when its installed purpose and limitations
are exposed correctly. It does not need an invented numeric sensor.

| Component | Current capability suffixes | Evidence or policy that needs explicit acceptance |
|---|---|---|
| climate-air | `temperature`, `humidity`, `status`, `air_readings`, `air_assessment`, `explain` | Indoor/outdoor scope, one effective policy, exact metric and units, partial coverage |
| plants | `watering_need`, `status`, `last_watered`, `water_in`, `explain` | Stable plant identity, observation versus estimate, historical light semantics, count plants once |
| media | `now_playing`, `status`, `mains`, `explain` | Reported playback, explicit power/voltage sources, unavailable player |
| lights | `status`, `explain` | Current group membership, permitted members, reported brightness and qualified counts |
| calendar | `agenda`, `explain` | Explicit sensitive exposure, timezone/date windows, all-day and ongoing events |
| weather | `current`, `forecast`, `explain` | Current versus forecast, bounded period, unknown provider sync |
| bermuda-presence | `observations`, `explain` | Explicit exposure, identity limits and stale observations |
| awnings | `status`, `wind`, `explain` | Reported/estimated position, fresh wind evidence, no inferred safety verdict |
| audio-sensor | `level`, `explain` | Units and calibration, no unsupported hearing-safety claim |
| backup | `status`, `explain` | Age/count/size, archive existence and restore evidence kept distinct |
| ramka | `status`, `current_time`, `explain` | Reported mode/configuration and current HA timezone, available without owning shared home data |
| floorplan | `explain` | Installed purpose, HA areas versus geometry, no occupancy inference |
| remote-access | `explain` | Authorized installed configuration, no invented tunnel-health measurement |
| timers | `status`, `explain` | Current shared helper identity, remaining duration, cancellation/reconnect and separate mutation grants |
| pocket, integration branch | Read its own `assistant.yaml` at the selected integration revision | Shared input consumption and purpose, no dependency on Ramka configuration |
| Future component | Explicit definition plus supported primitive/evaluator | Same conformance contract and metadata-only extension test |

## H0 — Reconcile contracts before coding

Owner is the framework coordinator. Read this design, the existing specifications,
Pocket's `home_inputs` work and all three v2 branches. Produce a short decision record
with the exact integration revisions, a uniquely numbered spec/amendment, and the
boundary between canonical definitions and derived v1/v2 artifacts.

Resolve schema numbering, the lifecycle of shared inputs, API/version compatibility
and the v2 activation threshold in that record. Preserve the existing 95% release
target. Issue #203's 90% experiment is an intermediate routing milestone.
Approval of the new schema/API amendment precedes runtime changes. This handoff
does not claim that a new wire format or public shared-data API is already approved.

Done when one implementer can identify the authoritative room, fact-role, policy,
binding and grant definition for each consumer without introducing another copy.

## H1 — Integrate shared home inputs and migration

Owner is the framework. Start from the existing loader and renderer on
`feature/pocket`. Inspect and modify as needed `schemas/home-inputs.schema.json`,
`schemas/home.schema.json`, `schemas/component.schema.json`,
`tools/domosenso_cli/{home_inputs,home,build}.py` and `tools/domosenso_render.py`.
Use the existing `tests/test_cli_home_inputs.py`, `test_home_inputs_schema.py` and
`test_render_home.py` as regression entry points.

- Verify `home_inputs`, `uses_home: true` and `uses_home: optional` behavior, malformed
  data, reserved outside identity, unresolved HA area references and translated names.
- Keep selected room defaults separate from complete device inventories. Exercise two
  independently addressable sources of the same metric in one room and explicit
  default selection, without merging their identities or exposure grants.
- Extend render dependency tracking so a shared edit marks every consumer affected,
  updates the appropriate managed hashes and participates in deploy plans/rollback.
- Prepare an additive migration from duplicated client inputs. Equal bindings can
  become shared references. Report conflicting source, area and policy choices.
  Preserve current local overrides until a user explicitly resolves each conflict.
- Render Pocket, Ramka, Floorplan and assistant bindings from the shared layer. Domain
  subject/policy inputs remain owned by their components. Retain legacy input-only
  installations and document the compatibility bridge.

Done when a fresh fictional home uses Pocket and Floorplan plus assistant bindings
without Ramka, and a second legacy home migrates without silent input changes.
Removing either display must preserve shared data and the remaining consumer.

## H2 — Finish component metadata and compiler projections

Owner is the framework. Reuse `tools/assistant_contract.py` and experimental
`tools/assistant_metadata.py`, the existing assistant schemas and compiler lifecycle.
For every component inspect `component.yaml`, `assistant.yaml`, translations and
`templates/assistant-bindings.yaml.j2`. Keep action definitions and their bindings
separate from read definitions.

- Compile fact roles, subject/area identity, scope, unit, freshness and policy from
  one authoritative definition. The effective policy can reference existing live
  threshold helpers with a same-revision fallback.
- Reconcile the experimental `assistant_metadata` declaration with the v1 source.
  Extend the reviewed descriptor format for bounded aliases/examples/presentation
  instead of copying semantic rules into a new parallel catalog.
- Keep schema-1 artifacts and v2 private artifacts derived from the same pinned
  component revision. Validate declared source relations, duplicate subjects/roles,
  incompatible units, unsafe paths, excess document size and translation fallback.
- Expand the compiler fixtures beyond measurements. The inspected generic v2
  definition schema supports measurement/area/subject fields. Enums, booleans,
  timestamps, text, records and periods need either declared supported primitives
  or a verified projection from existing evaluators.
- Test add/render/update/removal, input overrides, dev provenance, lock ownership,
  rollback and privacy. Compiled bindings stay outside `www` and HA packages.

Done when all coverage rows have a deterministic compiled/projection route, and a
fictional temperature capability followed by a second humidity capability with a
different ID plus new subject/alias can be installed as data on the same Bridge
binary and APK. Use `workbench.station_temperature` and
`workbench.station_humidity`, with declared fictional sources and supported units.

## B1 — Resolve shared data independently of displays

Owner is the free HA Bridge. Integrate the reviewed v1 increment before dependent
v2 work. Inspect `assistant_bindings.py`, `assistant_selection.py`,
`assistant_refresh.py`, `assistant_projection.py` and the existing Studio source API.

- Factor room/source/policy resolution into shared domain code. Keep client-specific
  selection and display configuration as adapters. Pocket and Floorplan must not
  require a Ramka endpoint to resolve a room or sensor.
- Normalize compiled component bindings and explicit vanilla mappings into the same
  semantic input. Keep provenance differences visible in administrator diagnostics.
- Verify inventory provenance, actual HA areas, entity identities and current
  membership. Reassignment, deletion or unsupported metadata invalidates the affected
  capability. A category/name/polygon match supplies no authorization.
- Enforce each client's appropriate HA permissions and native endpoint/device grants.
  Hide unauthorized source counts and labels. Revalidate after asynchronous data
  fetches and invalidate caches on revocation or scope change.
- Preserve manual overrides and explicit opt-out. Future-subject selection includes
  only the administrator-approved role/capability revisions and exclusions.

Done when equivalent authorized inputs produce the same semantic facts for a
display-independent component home and a vanilla HA home, including denied and
reassigned-source cases.

## B2 — Complete v2 evidence, discovery and compatibility

Owner is the Bridge. Reuse `assistant_metadata.py`, `assistant_metadata_api.py`,
`assistant_metadata_legacy.py`, `action_metadata.py` and the pinned v2 schema.

- Preserve generic measurement handling and reuse specialized v1 evaluators through
  typed adapters for every coverage row. Close enum, timestamp, duration, list,
  calendar/forecast period and component-explanation cases.
- Move component-owned `ANCHORS` and presentation vocabulary from the legacy adapter
  into compiled component metadata. Keep validated language grammar and evaluator
  implementations in code. Legacy adapters remain a migration mechanism.
- Negotiate supported primitive revisions and use opaque session-scoped catalog
  revisions. Bound discovery pages and answers. A value update must not invalidate
  the structural catalog. A permission/policy/binding change must invalidate it.
- Test stale revisions, malformed requests, unknown primitives, overlapping aliases,
  unit/metric mismatches, forged selectors, partial evidence and revocation in flight.
- Keep existing action execution and timer mutation routes. Project only currently
  authorized action keys and exact targets. A denied v2 read/action never falls back
  to a wider v1 operation. Preserve wind and group-membership checks.
- Advertise v2 only after complete enabled-v1 read parity for the endpoint and the
  corresponding client primitive set. Retain an observable administrator diagnostic
  for why a component cannot be advertised.

Done when four old/new Bridge/APK combinations pass and both complete and intentionally
incomplete endpoint catalogs behave correctly. Use `tests/metadata_ha_smoke.py` and the
existing activation/projection/control tests as entry points, extending their coverage.

## C1 — Connect browser cards to shared semantics

Owners are the Pocket, Ramka and Floorplan component implementers, coordinated with
the framework and Bridge owners. This task follows H1/H2 and the shared resolver
contract from B1. Changing render inputs alone does not complete it.

Inspect Pocket's `templates/dashboard.lang.yaml.j2` and
`cards/lib/{climate,level,attention,sensors}.js`, Ramka's
`templates/_air-policy.jinja`, `cards/{air-card,rooms-card,climate-rooms-card}.js`
and `cards/lib/climate-widgets.js`, plus Floorplan's `cards/lib/{measure,view,maps}.js`
and its existing registry/plan bindings. Determine the smallest adapter changes at
those entry points before extracting shared code.

- Reconcile Pocket's `climate_air_*` references with the effective policies currently
  supplied by Ramka and the owning domain component. Report conflicts before choosing
  one. Preserve accepted household policy values through migration.
- Feed each card the same stable source/subject/area and effective policy references.
  Keep the existing HA state access and authentication where supported. If a client
  uses backend evidence, add a reviewed adapter rather than copying private grants
  or native pairing into browser code.
- Use a common documented interpretation for units, age, unavailable values, partial
  coverage and assessment. If evaluation remains in browser code, exercise it with
  the same fixtures and expected evidence as the Bridge. Missing policy retains the
  raw numeric value and withholds an assessment.
- Retain independent card layout, navigation and Floorplan geometry. Removing or
  omitting Ramka must leave the other cards functional. Do not add component-specific
  parsing or per-home sensor IDs to the renderer libraries.
- Verify changed source, live threshold, fallback threshold, stale timestamp,
  revocation/visibility where applicable, two sources in one room and partial
  evidence. Assert identical semantic results across all cards and Frame speech.

Done when the same source and policy revision produces the same numeric value,
freshness qualification and assessment in Pocket, Ramka, Floorplan and Bridge output,
including a fictional home that never installs Ramka.

## F1 — Finish generic Frame consumption and routing

Owner is the Android Frame repository. Reuse
`src/assistant/metadata/{protocol,session,match,present,records}.ts`,
`src/voice/assistant-turn.ts`, `src/controls/metadata-intent.ts` and
`src/timers/metadata-actions.ts` from the experiment. Reconcile with current main.

- Build help, matching choices, short speech and details from current descriptors and
  typed facts. Keep domain capability IDs, room lists, threshold rules and component
  formatting out of the generic v2 client.
- Validate schema/primitive versions, paginated discovery, bounds, snapshot revisions
  and fact status before using an answer. Refresh on authorized structural changes.
- Keep the full utterance's metric, subject, area and time scope. Unknown or competing
  selectors require clarification/refusal. Never silently broaden to the whole home.
- Fix the routing defects tracked in issue #203 using frozen synthetic PL/EN holdouts.
  The latest archived blind result was 37/45 PL and 38/45 EN exact reads, with 8/40 and
  10/40 risky prompts incorrectly admitted as reads. The separate action interceptor
  saw zero writes. Both measurements matter and do not substitute for each other.
- Keep the optional local ranker disabled for release acceptance. It cannot repair a
  rejected scope, create identifiers or influence writes. Revisit it only with a
  separately reviewed accuracy and tablet-latency comparison.
- Preserve classic HA view, wake/ASR/TTS, timer alarms, reconnect and exact cancellation
  on backgrounding, closing, expiry, revocation or endpoint/language change.

Done when an unchanged APK handles the fictional metadata-only extension and every
baseline component family, with complete and partial evidence, in both PL and EN.
Both differently named fictional capabilities must work without an APK or Bridge
code change between their exposure steps.

## F2 — Prove cross-client consistency and release readiness

Owner is the coordinator with repository implementers. Keep one fixture set and
schema digest across framework, Bridge, native tests and relevant browser clients.

1. Run the applicable repository suites. Framework requires `tools/check-all.sh`.
   Bridge requires its ordinary Python/JS suites and pinned-HA bootstrap/transport
   scenarios. Android requires `npm test`, typecheck, lint and affected native suites.
2. Freeze candidate code and a held-out corpus before collecting acceptance results.
   Follow the metadata-client plan's 60 valid reads per language across its declared
   families, 20 ambiguity/abstention prompts and 40 safety prompts. Require at least
   95% exact intent plus arguments in each language, every named acceptance example
   correct, no supported-example regressions, no silent broadening and zero
   unauthorized/mis-scoped writes. Exercise every matrix row through conformance
   fixtures even if the language holdout samples capability families.
3. Compare two independent fictional homes, all consumers, both locales and old/new
   Bridge/APK combinations. Change a source, label, policy, permission and area. Check
   numerical facts, assessment, missing-data wording and help from the same revision.
4. Perform separate physical acceptance for microphone, speech, display, reconnect and
   process lifecycle. Synthetic text accuracy and earlier local HA tests are separate
   evidence. Use fictitious actuators or intercepted services for control acceptance.
5. Publish exact tested revisions, release versions and compatibility minima after
   review. Install Bridge before exposing dependent metadata/client features. Keep v1
   usable during staged rollout. Record configuration backup and tested rollback.

## Ordering and approval boundaries

H0 precedes schema or runtime changes. H1 and H2 follow the agreed shared contracts.
B1 follows shared identity/binding decisions. C1 implements the browser consumers
against those contracts. B2 and F1 use matching schema/wire fixtures and progress
against the same coverage matrix. F2 gates activation after C1 as well as backend
and native conformance pass.

This handoff authorizes no production installation, device configuration change,
actuation, store publication, repository push or merge. Implementers follow the
task-specific authorization and each repository's workflow. Open PRs and existing
prototype branches are inputs for review, not an instruction to merge them.

## Website impact

The design and handoff describe development work. Public catalog/setup/version claims
wait for actual compatible releases. At release, update assistant setup, the component
coverage list, shared-home input migration notes and relevant Pocket/Floorplan/Ramka
pages. Record deferred pages and exact released versions in the website audit.

## Ready-to-use next-session brief

Read the linked design and this handoff. Verify current repository revisions and the
Pocket home-input implementation before changing code. Produce the H0 contract decision
record and resolve the specification-number collision. Implement H1/H2, B1/B2, C1 and F1
in owned worktrees using matching fixtures. Preserve all coverage rows and explicit
client grants. Treat #203 as an intermediate routing prerequisite and run the full F2
release gate before enabling v2. Keep household data in a private instance repository.
Report each task as implemented, independently verified, released and installed
separately, with exact revisions and remaining manual acceptance.
