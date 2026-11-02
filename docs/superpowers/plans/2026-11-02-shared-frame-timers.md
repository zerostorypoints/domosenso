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
- [ ] Write rejection/render tests: unknown action/service field, wrong ownership, unsafe binding, duplicate IDs, bool/zero/86401 duration; time runtime source restricted; command metadata private, read artifacts unchanged.
- [ ] Run focused tests, record expected RED.
- [ ] Implement compiler and catalog manifests/helpers with restore:true, en/de/pl metadata and explicit bindings; wire both render/install paths and catalog validation.
- [ ] Add optional composed HA timer tile/timer-actions and shared countdown badge; test paused/active/unavailable/time-zone/empty mapping and escaping; never reimplement HA helper editor.
- [ ] Run focused tests then tools/check-all.sh; inspect all failures. Commit on task branch only.

## Task 2: HA bridge command executor and UI mapping (isolated bridge session)

Files: custom_components/domosenso_frame/timers.py, timer_api.py, assistant_api.py, assistant_contract.py/schema, assistant_data.py/extended.py as necessary; __init__.py/onboarding/studio mappings and panel; tests/test_timers.py, test_timer_api.py, fixtures/shared-timers.json; docs/timers.md.
Interfaces: consumes Task1 artifacts and produces the wire decisions above. Native Task3 consumes fixture and routes.
- [ ] Write tests for permission revocation/remapping, duplicate and conflicting payload replay, restart pending outcome, stale revisions, external transition during awaited call, completion during downtime, run-specific acknowledgement and target selection.
- [ ] Run RED then implement fixed allowlist with per-helper locks, durable pending/result/observation ledger and lifecycle cleanup. Read/write grants rechecked immediately before service call and after await; reads respect mapped sources and permissions.
- [ ] Add typed time/status capabilities, vanilla adapter and verified artifact loading; unknown definitions rejected. Admin mapping UI selects core helpers, explicit grant, designated approved device. Existing Studio timer action delegates executor if exposed.
- [ ] Generate fictional JSON cross-repo fixtures; test every WS handler on independent HA with normal user. Unit suite and isolated HA smoke, no production writes.
- [ ] Commit tested source in owned branch; report exact tests and remaining runtime limits. Do not publish/deploy.

## Task 3: Native voice, controls and Android alarm (isolated Android session)

Files: src/assistant/{protocol,intent,conversation,format}.ts; src/ha/{protocol,webview}.ts; src/timers/**; App.tsx and controls; modules/frame-device/index.ts and Android source; app config/plugin; tests/timer*.test.* and Android policy tests; docs/timers.md.
Interfaces: consumes Task2 wire decisions; validates all data, monotonic countdown anchored to `asOf`; bridge helper authoritative.
- [ ] Write PL/EN routing tests for number words/digits/units and unknown/ambiguous duration; separate typed action negotiation from reads. Time noon/midnight/DST/HA different timezone, localized format.
- [ ] Run RED then implement native controls, confirmation, short voice/status replies and no LLM time. WebView allowlists only named routes. Missing grant/old bridge/offline never broadens access.
- [ ] Add Android OS alarm manager/receiver durable run receipts. Check installed SDK docs; use opt-in schedule exact alarm and notifications, foreground-only fallback. Bound tone30s and suspend/restore wake capture; expose dismissal to all clients.
- [ ] Test monotonic countdown, out-of-order messages/reconnect, cancellation/replacement, duplicate native/WebView receipt, permission revoke and process/reboot policy. Build Android without touching signing version0.9.2 or uploading.
- [ ] Full npm/typecheck/lint/native checks; commit owned task branch; report tested vs untested hardware cases. No live tablet change yet.

## Task 4: Cross-repository acceptance and review (coordinator)

- [ ] Consume bridge-generated fixture in native validator and compare metadata/compiler output with bridge loader. Fix mismatches before claiming integration.
- [ ] Fresh isolated HA core2026.9.2: Domosenso helper install plus vanilla UI helper, normal user mappings/grants; bidirectional start/pause/resume/cancel/time and restart/replay.
- [ ] Independent technical review in separate exact-revision worktrees. Resolve important findings with regression tests.
- [ ] Prepare reviewable PRs (ask publication approval if not covered). Website impact: draft timer/setup page until release; no tag/production update implied.
- [ ] Physical tablet acceptance requires explicit feature-deployment authorization after reviewable build. Report Doze/reboot/permission tests actually performed, never infer from unit tests.

## Progress and rulings

2026-11-02: SPEC-031 approved. Tasks1–3 implementation preparation. Repo sessions use independent linked worktrees; coordinator integrates contracts. Existing0.9.2 publishing proceeds separately. New timer implementation stays off production.

Ruling, Task1: inspected HA2026.9.2 image, bundled frontend20260826.7 contains no timer-actions
feature in its JavaScript. Use core timer tile with standard more-info dialog in this version;
retain native controls independently. No unsupported feature config is rendered. Cost: classic
start/pause/cancel take a dialog tap, preserving the approved principle of composing HA controls.
