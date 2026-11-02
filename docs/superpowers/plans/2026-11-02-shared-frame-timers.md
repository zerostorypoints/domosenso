# Shared Frame timers implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One HA countdown controllable from classic Ramka and native Frame, with deterministic bilingual voice, time answers and local alarm delivery.
**Architecture:** Core HA timers remain authoritative. Separate negotiated assistant actions enforce explicit mappings and permissions; native countdowns/alarms mirror acknowledged HA runs. Three repository changes are coordinated here, without production writes.
**Tech Stack:** Python/HA 2026.9.2, JSON Schema/Jinja, plain HA ES modules, React Native/TypeScript/Kotlin Android target 36.
**Spec:** `.ai/specs/SPEC-031-2026-11-02-shared-frame-timers.md` (approved).

## Global Constraints

- Existing assistant v1 reads remain read-only and old clients remain usable. New actions are opt-in.
- Start duration integer 1–86400 seconds; active replacement explicitly confirmed against revision/run.
- One designated paired frame per timer; sound maximum 30 seconds; missed completion older than 60 seconds silent.
- No household data, arbitrary services, new YAML requirement for vanilla HA, or HA setting changes.
- Time source is HA UTC plus HA IANA timezone. PL/EN spoken answers, catalog en/de/pl.
- No production deploy, Play release or merge follows this spec approval. Version 0.9.2 is an already-authorized independent release.

## Review Focus

- Direct HA action races do not inherit bridge CAS guarantees; observe changes and return conflict (Task 2).
- Response loss after service execution cannot repeat a start on retry or restart (Task 2).
- Remapping/revocation while a command awaits a lock invalidates authorization (Task 2).
- Background sound permission denial/revocation, process death/reboot and later cancellation remain explicit (Task 3).
- Utterances with conflicting numbers, multiple timers, time zones and a past alarm must not cause unintended writes/sound (Tasks 2–3).

## Wire decisions shared by all tasks

Continue existing `assistant_capabilities`/`assistant_query` envelopes for `ramka.current_time` and `timers.status`.
Time capability uses a stable opaque frame subject. Its fact has `instant` (UTC ISO), `timezone` (IANA), evidence freshness basis `provider_response`, summary status `reported`.
Timer status uses opaque timer subjects, summary `active|paused|idle|mixed|unknown`, fact fields `state`, `durationSeconds`, `remainingSeconds`, `deadline` (UTC ISO or null), `runId` (opaque string or null), `stateRevision` (opaque string), `outcome` (`none|completed|cancelled|inferred_completed|unknown`), `alarmDeviceId` (paired ID or null), `acknowledged` (boolean). Envelope `asOf` is server time. No entity IDs in client facts.

Separate routes (all existing authenticated endpoint/proof checks apply):
- `assistant_actions`: request `{version:1,endpoint,supported:[{actionType:"timer-action.v1",resultType:"timer-result.v1"}]}`; response `{version:1,asOf,actions:[{id:"timers.start|pause|resume|cancel",revision:1,actionType:"timer-action.v1",resultType:"timer-result.v1",subjects:[{id,label}],...localizedMetadata}]}`. Expose only granted, mapped, READ+CONTROL permitted timers.
- `assistant_action`: `{version:1,endpoint,capability,revision:1,subjectId,requestId,expectedStateRevision,expectedRunId,arguments}`. Arguments only `durationSeconds` and `confirmReplace` for start; empty for other actions. Response `{version:1,capability,revision:1,resultType:"timer-result.v1",requestId,status:"applied|conflict|confirmation_required|outcome_unknown",asOf,timer:<same timer fact>}`. Denied/invalid payload fails via existing WS error. A confirmation is a new request with current revision and `confirmReplace:true`.
- `timer_acknowledge`: `{version:1,endpoint,subjectId,runId}`; persist receipt only for that run, return current state.
- Existing `subscribe` delivers `{kind:"timers",...}` invalidation; client fetches authoritative `timers.status` snapshot. Bridge publishes on state/run/receipt/mapping changes. Reconnect fetches before actions.
- Endpoint mapping `timers:{writeEnabled:false,items:[{entity,label,alarmDeviceId:null}]}` (max16). Only explicit admin selection enables writes. Internal Ramka timers excluded; selected normal core timer helpers work without catalog metadata.

Framework command artifact: optional manifest `assistant_actions:{version:1,definition:"assistant-actions.yaml",bindings:"templates/assistant-action-bindings.yaml.j2"}`. Compiled private artifact mirrors read profile top-level `schema:1,component,definitions,translations,bindings`; definitions have `actions` with `id,revision,operation:"timer",action_type:"timer-action.v1",result_type:"timer-result.v1",title_key,description_key,examples_key,parameters,confirmation,effect`; bindings reuse subject structure, kind `timer`, role `timer`. Exactly four reviewed action IDs; metadata never grants access.
Time read metadata declares `runtime_source:"ha_clock"` only on `ramka.current_time`; no fake entity/fact source. Compiler enforces pairing to time query/answer and no runtime source elsewhere. Existing files without this field remain byte compatible.

## Task 1: Catalog compiler, timer component and classic controls (coordinator)

Files: schemas/assistant-actions.schema.json, schemas/assistant-actions-profile.schema.json, schemas/component.schema.json, schemas/assistant.schema.json, schemas/assistant-profile.schema.json; tools/assistant_contract.py, tools/assistant_actions.py, tools/domosenso_cli/build.py, tools/catalog_check.py; components/timers/**; components/ramka manifest/templates/cards/translations; tests/test_assistant_actions.py, tests/test_timers.py and catalog registries; compatibility/upgrade/docs.
Interfaces: produces private command artifacts above and managed core timer helpers; consumes HA helper state in composed controls. Ramka optional timers mapping defaults empty.
- [x] Write rejection/render tests: unknown action/service field, wrong ownership, unsafe binding, duplicate IDs, bool/zero/86401 duration; time runtime source restricted; command metadata private, read artifacts unchanged.
- [x] Run focused tests, record expected RED.
- [x] Implement compiler and catalog manifests/helpers with restore:true, en/de/pl metadata and explicit bindings; wire both render/install paths and catalog validation.
- [x] Add optional composed HA timer tile/timer-actions and shared countdown badge; test paused/active/unavailable/time-zone/empty mapping and escaping; never reimplement HA helper editor.
- [x] Run focused tests then tools/check-all.sh; inspect all failures. Commit on task branch only.

## Task 2: HA bridge command executor and UI mapping (isolated bridge session)

Files: custom_components/domosenso_frame/timers.py, timer_api.py, assistant_api.py, assistant_contract.py/schema, assistant_data.py/extended.py as necessary; __init__.py/onboarding/studio mappings and panel; tests/test_timers.py, test_timer_api.py, fixtures/shared-timers.json; docs/timers.md.
Interfaces: consumes Task1 artifacts and produces the wire decisions above. Native Task3 consumes fixture and routes.
- [x] Write tests for permission revocation/remapping, duplicate and conflicting payload replay, restart pending outcome, stale revisions, external transition during awaited call, completion during downtime, run-specific acknowledgement and target selection.
- [x] Run RED then implement fixed allowlist with per-helper locks, durable pending/result/observation ledger and lifecycle cleanup. Read/write grants rechecked immediately before service call and after await; reads respect mapped sources and permissions.
- [x] Add typed time/status capabilities, vanilla adapter and verified artifact loading; unknown definitions rejected. Admin mapping UI selects core helpers, explicit grant, designated approved device. Existing Studio timer action delegates executor if exposed.
- [x] Generate fictional JSON cross-repo fixtures; test every WS handler on independent HA with normal user. Unit suite and isolated HA smoke, no production writes.
- [x] Commit tested source in owned branch; report exact tests and remaining runtime limits. Do not publish/deploy.

## Task 3: Native voice, controls and Android alarm (isolated Android session)

Files: src/assistant/{protocol,intent,conversation,format}.ts; src/ha/{protocol,webview}.ts; src/timers/**; App.tsx and controls; modules/frame-device/index.ts and Android source; app config/plugin; tests/timer*.test.* and Android policy tests; docs/timers.md.
Interfaces: consumes Task2 wire decisions; validates all data, monotonic countdown anchored to `asOf`; bridge helper authoritative.
- [x] Write PL/EN routing tests for number words/digits/units and unknown/ambiguous duration; separate typed action negotiation from reads. Time noon/midnight/DST/HA different timezone, localized format.
- [x] Run RED then implement native controls, confirmation, short voice/status replies and no LLM time. WebView allowlists only named routes. Missing grant/old bridge/offline never broadens access.
- [x] Add Android OS alarm manager/receiver durable run receipts. Check installed SDK docs; use opt-in schedule exact alarm and notifications, foreground-only fallback. Bound tone30s and suspend/restore wake capture; expose dismissal to all clients.
- [x] Test monotonic countdown, out-of-order messages/reconnect, cancellation/replacement, duplicate native/WebView receipt, permission revoke and process/reboot policy. Build Android without touching signing version0.9.2 or uploading.
- [x] Full npm/typecheck/lint/native checks; commit owned task branch; report tested vs untested hardware cases. No live tablet change yet.

## Task 4: Cross-repository acceptance and review (coordinator)

- [x] Consume bridge-generated fixture in native validator and compare metadata/compiler output with bridge loader. Fix mismatches before claiming integration.
- [x] Fresh isolated HA core2026.9.2: Domosenso helper install plus vanilla UI helper, normal user mappings/grants; bidirectional start/pause/resume/cancel/time and restart/replay.
- [x] Independent technical review in separate exact-revision worktrees. Important findings resolved with regression tests; native fixes independently rechecked.
- [x] Prepare reviewable PR descriptions locally (publication approval remains separate). Website impact: draft timer/setup page until release; no tag/production update implied.
- [ ] Physical tablet acceptance requires explicit feature-deployment authorization after reviewable build. Report Doze/reboot/permission tests actually performed, never infer from unit tests.

## Progress and rulings

2026-11-02: SPEC-031 approved. Tasks1–3 implementation preparation. Repo sessions use independent linked worktrees; coordinator integrates contracts. Existing0.9.2 publishing proceeds separately. New timer implementation stays off production.

Ruling, Task1: inspected HA2026.9.2 image, bundled frontend20260826.7 contains no timer-actions
feature in its JavaScript. Use core timer tile with standard more-info dialog in this version;
retain native controls independently. No unsupported feature config is rendered. Cost: classic
start/pause/cancel take a dialog tap, preserving the approved principle of composing HA controls.


Review ruling: runtime-source definitions and their text are split from the existing read artifact
into `domosenso/assistant-runtime/<component>.yaml`; old bridges ignore this sibling directory.
Legacy definitions/translations/bindings stay byte-compatible (apart from normal component identity
updates). New bridge validates/loads this directory separately with provenance checks. This corrects
the initial bridge-first migration suggestion, which did not meet SPEC-031 compatibility.

Classic browser integration uses authenticated HA read-only snapshot/claim/acknowledge routes for
explicitly mapped and READ-permitted helpers. This is separate from paired native command routes;
no core timer action is added. Snapshot provides server time and opaque run/revision facts. A
durable claim authorizes one foreground opt-in alert only when there is no designated native target;
acknowledgement remains run-specific. Native host handshake always suppresses browser audio.


Implementation checkpoint: catalog/compiler/classic controls complete; 1526 Python and 756 JS tests
plus the full HA/ESPHome/catalog checks passed. Installed-wheel CLI help was verified outside the
source tree. The runtime split passes the original strict profile schema. Browser countdown uses
exact HA deadline minus server asOf, then monotonic elapsed time, including fractional seconds.

Bridge implementation and review fixes through `a7f6123` passed 212 Python unit tests,
two additional real-HA lifecycle/mapping scenarios and 13 JS tests. A fresh HA2026.9.2
container passed the core-helper and UI-helper scenario, including real authenticated WebSocket
transport, ordinary native pairing/actions and two unpaired read-only browser tabs racing for one
durable sound claim. Independent review found two P2 issues (restoration run identity and alarm
target reachability). Both were fixed with regressions and coordinator review; the final bridge
revision passed the fresh Docker/WebSocket scenario again. The restored entity, repeated state
reports, rename, pause/resume, same-second restart and mapping persistence were tested against
actual HA core classes in separate temporary processes. This is not a whole-process HA restart.

Native implementation and fixes through `d00f5ff` passed 355 JS tests, TypeScript, ESLint, native policy tests,
Frame UI pin checks and full Android release APK assembly. Real bridge-generated fixtures cover
every read/result state including unavailable values. PL time uses inflected hours and timer
durations; no HA language/profile writes. Independent review identified a long-helper reconciliation
failure and a completion/service-start race. Both have real-Kotlin JVM regression coverage, including
eight invalidations, and the final APK was rebuilt with the unchanged model C. A focused independent
review of `d00f5ff` found no remaining issue in those two fixes and added temporary
checks for a 36-hour helper, both completion outcomes, inherited deadlines, invalidation,
boot mismatch and the 60-second grace boundary. These are source
and isolated-runtime checks, not physical timer/Doze/reboot acceptance. The APK retains development
version metadata and has not been published or installed.

Website impact: no public capability claim before tags; setup and limits are in component docs.
Publishing the three branches, production deployment and the new Play build remain separate steps.

Browser review found that a poll could discard a durable sound claim and another helper could
stop an unrelated alarm. The follow-up preserves claims through a fresh snapshot and invalidates
only the affected run; 19 added regressions cover delayed claims, slow polling, unrelated state
changes and cancellation/replacement/acknowledgement. Coordinator inspection and focused tests
passed. The final full catalog check is recorded in the handoff after completion.
