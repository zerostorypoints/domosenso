# SPEC-035: Shared home metadata and the native Frame contract

- Status: draft 2026-11-05; H0-native amendment awaiting human approval.
- Source: the maintainer requested implementation after the design and handoff in
  [PR #219](https://github.com/zerostorypoints/domosenso/pull/219), merged as
  `6d3d8e27c839553a249db5d5b53a6d3aa21949c3`.
- Scope: reconcile the native metadata experiment with the accepted shared-home
  ownership and browser contract. No runtime activation or installation is included.

## Authority and specification identity

The gate component keeps [SPEC-034](SPEC-034-2026-11-05-gate-remote.md). The historical
native document at `.ai/specs/SPEC-034-2026-11-04-metadata-driven-frame-client.md` in
framework revision `e67f0c0ed4557e0bd45d569d7c3583f176149c20` is reproduced below so this
proposal can be reviewed without another session's local branch. SPEC-035 identifies
the native contract going forward. Update native experimental references when those
branches are integrated; do not rename the gate spec or silently rewrite its meaning.

The amendment in this section takes precedence over the retained historical text.
The historical protocol/limits remain the starting contract where this section does
not change them. Approval of #219 accepts the design direction; it does not mark this
new schema amendment approved or a prototype ready for release.

## Goal, placement and independent delivery

A new subject or read capability made from implemented primitives must become usable
by native Frame through metadata, without another APK or Bridge binary. HA supplies
entities, areas, permissions and service execution. The catalog supplies reusable
component meaning; this is a framework/client contract needed by a second home, not
a replacement for HA configuration. Private bindings remain in the home repository.

Browser track A follows H0-lite/H1/C1/A2 independently. Its shared-input migration
needs no Bridge, Android installation or voice-accuracy gate. Native track B follows
H0-native/H2/B1/B2/F1/F2. Server provisioning and recovery remain in
[track S](../../docs/superpowers/specs/2026-11-05-tablet-installation-profile.md).
Do not add installation fields to home inputs or make browser cards load this profile.

## One canonical semantic definition

Existing `assistant.yaml`, translations and the assistant binding template remain the
source for capability identity/revision, declared fact roles and sources, evaluator,
freshness, policy, subject identities and private source bindings. Existing action
metadata remains separate. Neither Android nor a second author-maintained v2 file
becomes an independent source for those values.

Proposed additive authoring extension: an optional `client` object on a read or
explanation capability in `schemas/assistant.schema.json`, with these closed fields:

| Field | Meaning |
|---|---|
| `version: 2` | Client metadata projection version, independent of semantic revision |
| `anchors_key` | Translation key holding bounded localized intent-anchor phrases |
| `selectors` | Unique subset of `area` and `subject`; no entity-name inference |
| `presentation` | Ordered references to declared fact roles, generic labels and supported layouts; no expression or component formatter |

Use existing `title_key`, `description_key` and `examples_key`; do not copy their text
or policy/source declarations into a second definition. A capability without `client`
keeps its current v1 output. The compiler derives the private v2 artifact using the
same canonical definition and normalized private bindings. Validate presentation
references against the capability's declared roles, and reject undeclared selectors.

Subject and area aliases are home-owned binding annotations, not capability anchors.
Add optional `aliases` (subject) and `roomAliases` (the subject's explicit `roomKey`)
to the normalized authoring model rendered by the existing assistant binding template.
They originate in optional component instance inputs or the existing vanilla source
editor; do not introduce another v2 binding file or require a home-input schema change
for this native task. Each is a localized map for `en/de/pl` with at most 16 unique
nonempty phrases per locale, 120 characters each, with the historical text validation.
`roomAliases` requires a stable `roomKey`; all bindings for that key must agree.
Cross-subject alias collisions stay ambiguous and must not resolve by list order.

Validate those two annotations in the canonical normalization stage. Project them to
v2 selector aliases, and strip only those known annotation fields before validating
and serializing the strict schema-1 bundle. Do not relax the schema-1 wire validator
or discard arbitrary unknown fields. Alias-only changes must leave v1 bytes identical
for identical provenance, while changing the authorized v2 catalog revision. An alias
never changes identity, exposure or a source grant. Shared browser room names remain
the selected labels; native aliases are optional selector vocabulary, not new labels.

Retain the experimental private `domosenso/assistant-metadata/<id>.yaml` transport
artifact as a derived output with separate schema/version/provenance; it is not an
HA package or a public `www` resource. The experiment's independent authoring files
and `assistant_metadata: {definition, bindings}` declaration are replaced by the
canonical projection before production components opt in. Synthetic compiler fixtures
may keep standalone samples but must exercise the same projection entry point.

H2 must supply closed field-level JSON schemas and generic evaluator/primitive maps
for the historical wire types. A draft authoring field is not permission to introduce
remote expressions or new operations. A new evaluator or primitive implementation
requires code and review; a new capability using those already supported needs data
only. Existing specialized v1 evaluators may be typed adapters; their fact/policy
semantics still come from the owning component contract. Move legacy client matching
vocabulary into translated metadata without moving general language grammar into data.

## Shared semantics, identity and grants

Adopt the browser decision record from PR #233 and the fixture version pinned below:
`good/fair/poor`, optional `side: low|high`, inclusive range endpoints, rising `>=`
and falling `<` boundaries. Preserve live household helper values; never seed over
an existing restored helper. Differing values are migration conflicts before apply.
The owning domain helpers carry policy; missing policy preserves the raw reading
and withholds assessment. Domain evaluators retain explicitly different assessment
vocabularies, such as plant watering outcomes, instead of relabelling them as air levels.

Entity area, then device area, is legitimate HA registry discovery. Selected defaults
are not a complete room inventory. Browser HA permissions and native endpoint/device
read/action grants remain separate. Neither discovery, `timer_role: user_countdown`,
component presence, labels nor categories authorize native access. Preserve explicit
manual selections, opt-outs, subject identity and per-person/per-device settings scopes.

Use shared assessment and operability fixtures in JS and Python, pinned to
`b75547ea6de8594010faffdc19c8ba3afc30e6a5` for this inspection:

| File | SHA-256 | Cases |
|---|---|---|
| `tests/fixtures/assessment.json` | `b3f9f78dae5bb1f83eb20c16e3cf66757cbc070c8849e7ccd5b946f4fd3b4140` | 25 |
| `tests/fixtures/operability.json` | `694558b012b2811f6384a63ee3d09ec5a1458eb5e50240e88a4486d41c3f4a42` | 24 |

Re-pin deliberately when the corpus changes; counts are inspection evidence rather
than a fixed coverage target. Operability does not grant permission or imply a supported
action. Missing/unavailable targets block; a domain-permitted `unknown` state can remain
operable after support and permission checks. Staleness and source observation age
must not be replaced with broker receipt time or restored-state timestamps. Add the
companion freshness/partial-evidence corpus before native parity acceptance.

## Compatibility and managed artifacts

Existing schema-1 bundles retain their fields and private paths. A home without the new
projection must produce identical v1 bytes for identical source/input/provenance. With
projection enabled, only the approved optional authoring declaration and derived output
are added. Minimum framework/Bridge versions are established by implementation tests;
old strict authoring validators need not accept a newly tagged component using `client`.
Publish that minimum and the upgrade steps before releasing such a tag.

Managed layers: canonical catalog metadata, derived private v1/v2 bundles, stamps and
lock entries. Instance layers: home source choices, HA helper policy values, endpoint
selection, pairings and grants. Local overrides remain local. Snapshot/digest/deploy/
rollback procedures preserve these boundaries. No new HA entity/service is provided;
consume only declared component `provides`/`upstream`/`consumes` sources.

Keep the four old/new Bridge/APK combinations and the historical absence-only v1
fallback. Do not convert a denied, invalid, stale or missing v2 capability into a wider
v1 read. Existing timer/control dispatch remains unchanged; read metadata cannot create
action verbs or HA service calls. Retain compatibility for at least one minor release
and document the eventual minimum/removal separately in each repository's upgrade notes.

## Reproducible baseline and integration order

| Input | Inspected revision | State at inspection |
|---|---|---|
| Framework main | `6d3d8e27c839553a249db5d5b53a6d3aa21949c3` | Shared design/handoff merged, no native v2 runtime |
| Pocket shared contract | `b75547ea6de8594010faffdc19c8ba3afc30e6a5` | PR #233 decisions/fixtures and #235 timer-role discovery on `feature/pocket`; not a main release |
| Framework experiment | `e67f0c0ed4557e0bd45d569d7c3583f176149c20` | Local recoverable source, generic measurement compiler and routing archive |
| Bridge v1 prerequisite | `c4d668904c07f9430d3a347f6fc9fdb32220174d` | PR #4 open in `domosenso-frame-ha`; merge needs its own authorization |
| Bridge experiment | `bed8a1b84cb41af14cecf561a8bca13f5fd8a6f5` | Local branch exists; GitHub object lookup returned 404 |
| Frame main | `51540f0d36530531b1ebcc645444950a67a236ac` | Deployed protocol baseline, not the experiment |
| Frame experiment | `20f082e46b97a8a1ce2a93bfb0c20e590a04fc74` | Local branch exists; GitHub object lookup returned 404 |

These are inspection facts, not a compatible release set. Do not claim that a 404 proves
an object was deleted; it establishes that this lookup did not retrieve it. Before
implementation, preserve and review the experimental source on authorized repository
branches or an immutable shared archive with checksums, then verify a fresh clone can
retrieve every pinned input. Never depend on the presence of this computer's worktrees.
The historical design is preserved below, but that does not publish the experimental code.

H2 integrates canonical projection and produces immutable schema/wire fixtures. B1/B2
integrate the v1 prerequisite and fixture-conforming resolution/projection. F1 consumes
those schemas and fixtures. F2 alone decides native activation. Browser implementation
continues on `feature/pocket`; do not create a competing browser migration.

## Tests and acceptance of this amendment

1. Framework focused compiler/schema/ownership tests plus full `tools/check-all.sh`:
   canonical facts/policy cannot disagree between v1/v2, private output is deterministic,
   absence preserves v1 bytes, removal and rollback preserve ownership and instance data.
   Include subject/area alias-only edits, malformed annotations, conflicting aliases
   for one room key, ambiguous aliases across subjects, unchanged schema-1 bytes and
   strict rejection of other unknown fields.
2. Bridge runs identical assessment/operability cases and companion evidence fixtures,
   authenticated pinned-HA transport tests, async revocation and source-reassignment
   cases. A capability with unsupported primitives is not advertised as complete.
3. Freeze an exact parity inventory including all 15 main components / 39 read and
   explanation capabilities at the inspected baseline, plus adopted Pocket metadata.
   Test component-specific facts without hardcoding their IDs in the generic client.
4. On unchanged APK and Bridge binaries, expose `workbench.station_temperature`, then
   separately `workbench.station_humidity` and a new subject/alias. Verify help, PL/EN
   matching, numeric facts, scope, qualified speech and screen details without rebuilds.
5. Test all four version combinations, partial and stale evidence, unknown primitive,
   incomplete pagination, malformed/oversized metadata, reconnect/locale races and no
   v1 fallback after v2 denial. Assert zero unexpected service calls.
6. Keep the 95% exact intent-plus-slot threshold per language, all named examples,
   no silent scope broadening and zero unauthorized/mis-scoped writes. Issue #203's
   90% experiment is intermediate evidence. Freeze the historical holdout manifest
   before collecting results; leave the optional local ranker disabled for acceptance.
7. Physical microphone/speech/display/process and installation-provider acceptance
   are separate evidence. This specification does not claim new tablet acceptance.

A2 browser acceptance proceeds independently. Native activation waits for F2; passing
schema/unit tests alone does not turn the profile on. Runtime demo is justified for
subsequent HA reload, cross-component and reconnect changes, not for this draft document.

## Website impact and out of scope

No catalog version, tag or public runtime claim changes with this draft. Public assistant
setup, coverage, shared-input migration and client compatibility pages are deferred until
compatible releases exist. No website route changes are required for this amendment.

Out of scope: browser-track implementation, new action semantics, arbitrary service
execution, Android/server installation schema, packaging, remote support, model swaps,
production/device changes, component releases and store publication. Publication and
merge of dependent repository PRs require their own task authorization.

## Retained historical scope

The following text preserves the experimental contract and its prior approval, including
its bounded wire, action boundary and release suite. Where it describes independently
authored v2 definitions, the canonical projection above supersedes that authoring model.

# Historical native contract retained from the experiment

- Historical approval: 2026-11-04. It does not approve the amendment above.
- Source: maintainer request for a native Frame client driven by DomoSenso and Home Assistant metadata.
- Baseline: SPEC-029 component contracts, SPEC-031 timers, SPEC-032 shared sources, SPEC-033 room controls and SPEC-028 category, kind and room identities. The latter three assistant increments are local integration work at this baseline.

## Goal and placement

After a compatible Android release, a home can expose a new read capability made from existing protocol primitives, or change a subject, room, label or policy, and use it in Frame without another APK. Help, spoken questions, short spoken answers and detailed screen results use the same current contract. Preserve timers, voice and display lifecycle, the classic HA view, and existing approved room-control behavior through the rollout.

Use HA entities, areas, permissions and services for configuration and control. Reuse DomoSenso component definitions and the existing bridge and source editor for the additional voice and display surface used in multiple homes. Home bindings, choices and overrides remain private instance data. No new hardware, credentials, HA integration or cloud service. Validate against the framework-pinned HA version, 2026.9.2 at drafting. The existing Frame bridge is required for the new profile.

## Approaches

| Approach | What can change after installing an APK | Cost |
| --- | --- | --- |
| Generate an Android catalogue from framework metadata at build time | Current subjects, labels, policies and help for capabilities compiled into the build | Eliminates handwritten duplication at build time. New capability definitions still need an APK even if all primitives are already implemented. Useful as a source of fixtures and legacy compatibility. |
| Negotiate a versioned declarative runtime contract | New capabilities built from supported types, labels, phrases, fact layouts and presentation primitives, plus current bindings and policy | Requires bounded wire validation, refresh, generic rendering and a compatibility adapter. New primitives or interactions still need compatible client code. **Selected.** |

Use locale-aware deterministic matching over structured patterns, aliases and labelled examples at first. Measure it on held-out PL/EN paraphrases and ambiguity cases. Compare a small on-device model only as a bounded read-candidate ranker after deterministic shortlisting. It may return one supplied candidate index or abstain. Android resolves and validates slots from the original utterance and current discovery, then clarifies if needed. No model selection for writes, ambiguity overrides, generated IDs, authored facts or generated service names. The runtime contract must satisfy the release criteria with the model disabled. An optional hybrid default needs separately reviewed results against deterministic matching.

## Ownership and inputs

| Owner | Input and responsibility |
| --- | --- |
| Component and framework | Namespaced capability and semantic revision, typed fields, supported operations, evaluator, interpretation and freshness policy, localization and generic presentation hints. Reuse compiler, declared provides/consumes, and managed artifact provenance. |
| Home and HA | Real entities/attributes, stable subject/area mappings, labels, policy overrides, sensitive flags and explicit exposure. Existing exact mappings remain the default. SPEC-032 future-subject grants cover only approved role and capability revisions. |
| Bridge | Verify artifacts and inventory, normalize explicit vanilla mappings, resolve one authorized source set for queries and supported display, evaluate current facts and evidence, validate requests and dispatch approved fixed operations. |
| Android | ASR, wake, TTS, generic intent and clarification, protocol validation, render and device lifecycle. Knows supported primitive versions and types. The new route has no list of component IDs, household setup, thresholds or per-component formatting. |

No new HA entities. Reuse existing subject and area identities. Area labels and aliases assist selection, while IDs and current membership establish association. Use framework English source with en/de/pl metadata and established fallback. PL/EN are required for matching and speech. Administrator label overrides apply to the same stable key. Vanilla administrators select explicit entities, roles and policies in the existing editor. Equivalent normalized inputs yield the same facts, limitations and presentation apart from provenance and opaque endpoint IDs.

## Discovery and operations

Keep all deployed v1 routes and exact validators. The additive profile advertises `assistantMetadataVersions: [2]` only when the bridge supports the new routes. The separate WebSocket commands are `domosenso_frame/assistant_metadata` and `domosenso_frame/assistant_metadata_query`. Reuse the authenticated HA connection, paired-device proof and endpoint checks. First negotiate version 2 plus client-supported primitive revisions. Advertise the profile only when all existing enabled v1 read routes have v2 equivalents for that endpoint on a client supporting the baseline primitives. Unsupported entries are omitted with generic capability limitations where disclosure is authorized. Devices advertise support only for versions they implement.

Discovery returns version, endpoint-scoped opaque `catalogRevision`, `asOf` and bounded descriptors for supported and exposed capabilities. Each descriptor contains `id`, `revision`, operation class, title/description, localized matching metadata, availability/limitations, selectors, argument types and answer shape. A capability revision changes when argument meaning, interpretation or result semantics change. Labels, selector sets, bindings, permissions and compatible policy values change via the snapshot revision. Live measurements and transient availability use their own timestamps; they do not churn the structural revision. Component version and compiler provenance stay available to admin diagnostics through existing facilities. Hidden subjects, counts and internal permission reasons stay private.

A read request sends version, current catalog revision, capability ID and semantic revision, plus structured arguments. The bridge rejects unknown fields, types, combinations, revisions and arguments outside the currently authorized snapshot. A stale revision returns a typed conflict and triggers rediscovery. Async queries recheck authorization and source identity before returning evidence. Client negotiation and metadata are descriptive inputs. Neither is authority to access data.

## Typed primitives

Publish bounded JSON schemas and matching generic validators. Use a closed schema vocabulary, with no remotely supplied executable expressions, scripts, regex, URLs to fetch, prompt templates, commands or arbitrary nested JSON.

- Arguments support an opaque subject or area selector, boolean, bounded integer/duration, enum and bounded local date/period. The descriptor declares required fields, enum domains, bounds and mutually exclusive selectors. A selector references a descriptor-provided set of allowed subject or area keys. Omitting a selector uses the bridge's declared authorized default scope only. An explicit unmatched or ambiguous selector triggers clarification or refusal. It never broadens to the default set.
- Localized matching supplies bounded token phrases for intent anchors and aliases, and example utterances with named slot placeholders. The matcher applies locale normalization and bounded pattern matching. Required slot values must be grounded in the utterance or an explicit choice and come from current discovery. Tied capabilities, ambiguous labels, competing slots or uncertain matches ask for a choice. Unknown intent receives available help. Separate read matching and the existing conservative write grammar.
- Fact primitives are finite measurement with unit, count with explicit counted kind, enum/status with localized labels, boolean, plain text, timestamp, bounded duration, and bounded list of typed rows. Dates, timezone, unit and precision come from the authorized fact and the locale. An absent or unrecognized value cannot become a zero, healthy assessment or positive action result. Deduplicate counts by stable subject key and qualify incomplete coverage. Counts of plants count plants.
- The bridge attaches per-fact status, observation or report time when known, freshness basis, evaluation time, source reference, coverage and a qualified assessment. Unknown freshness, restored data, stale data and missing evidence stay distinct. Unknown required status, fact or unit fails that fact or result closed. Current assessments require evidence for the current policy and binding. Existing SPEC-029 report versus observation distinctions apply. No Android threshold or inferred policy. Start with reusable bridge evaluator primitives for a current scalar observation, per-subject rows and a count or explicitly declared aggregate over a set of authorized subjects. The fictional workbench fixture must use these primitives through the same descriptor registration as a real component. Adding the fixture or an equivalent new capability must require only metadata and fictional bindings, with no bridge code change or APK rebuild. Existing v1 adapters may supply typed v2 facts for specialized reads, including calendar, weather, plant estimates, timers and the clock.
- Presentation is structured as an ordered summary and detail sections with fact references, generic localized labels, values and optional supported list/table layouts. Summary uses short, qualified fact clauses, capped at three spoken clauses, with limitations prioritized when material. The screen shows evidence, scope, details and current availability. Compose with generic locale formatters and sentence splitting. Plain text is rendered without HTML or markup and treated as data in speech. Existing native display widgets keep their normal configuration and can consume supported bridge sources. The classic HA dashboard retains independent visibility.
- Example v2. A fictional component exposes `workbench.station_temperature` with optional area selector, temperature measurement in Celsius, report freshness and a detail row per station. Current `Studio` area is bound to two fictional stations. English “How warm is the workbench in the studio?” and Polish “Jaka jest temperatura przy stole roboczym w pracowni?” select the same operation and area through anchors and aliases. Help picks an advertised example. The bridge returns an aggregate only if its declared evaluator and coverage permit it. A single current reading and one stale reading produce a qualified partial answer and both detail rows. The same APK is used before and after this descriptor is exposed.

Start with finite bounds in both compiler and bridge, mirrored on device. Proposed per-endpoint ceiling is 64 descriptors and 256 KiB of encoded discovery. Per descriptor allow 8 arguments, 32 selector entries per page, 8 examples and 16 aliases per locale. Limit labels/aliases to 120 characters, examples to 240, detail responses to 64 rows and 128 KiB. Page large authorized collections by opaque revision-bound cursor, deduplicate stable keys and surface incomplete matching coverage. Never choose a unique target from an incomplete selector scope. Reject invalid records independently where isolation is possible. A malformed envelope makes the new route unavailable.

## Action boundary

Keep the existing SPEC-031 timer and SPEC-033 action execution protocols. A v2 action descriptor projects only a current independently authorized action from those protocols. It carries the server-issued capability and action key, a versioned verb class, target and selector constraints, available argument types, and localized target labels and examples. Read metadata never grants writes. The bridge alone maps approved action keys to fixed HA services.

The first milestone enables generic reads while existing action intent continues through the legacy adapter. Before declaring the client migration complete, move target and action binding for existing writes to the negotiated projection. Android retains a finite reviewed PL/EN imperative grammar and protocol validators for generic verb classes, including the existing movement, light and timer primitives. Component metadata can map supported verb classes to exposed actions. Home labels and examples can name targets but cannot introduce a new verb or weaken the grammar. Once the projection is negotiated, Android chooses among opaque supplied action keys and no longer hardcodes a component-to-action table for those turns. Negated, conditional, quoted, compound and ambiguous utterances retain the existing safeguards. Unsupported action projections keep the independently negotiated legacy adapter until the compatible cutover. A v2 denial or invalid selection never retries through legacy.

Reuse signed proof, binding revisions, READ+CONTROL, exact selection and group membership, explicit partial-scope approval, wind checks, exact cancellation and durable request IDs. A stale write is cancelled or clarified using the existing protocol. An uncertain dispatch is never replayed. Any expansion of action execution semantics or supported action primitives requires a separate safety contract.

## Refresh, invalidation and offline behavior

Keep current discovery in memory keyed by authenticated session, device, endpoint, negotiated primitive set and locale. Fetch on connect/reconnect or key change, before first use, on bridge invalidation, and after a short bounded lifetime (30 s maximum proposed). The bridge advances revision on changes in metadata, exposed subjects, bindings, relevant permissions, policies or locale resolution. Use the existing metadata reload path, including file/inventory refresh and admin reload. Invalidation events carry an opaque revision only. Refresh is atomic and stale replies cannot replace a newer snapshot. A client can retry a stale read once after rediscovery if the same grounded selector and capability are still authorized. Otherwise clarify. Action resolution and cancellation retain their own revision rules.

When disconnected, discard source choices and pending confirmations. Frame may show its existing offline screen and local speech/clock functions where already supported. No current HA result or command comes from an expired catalogue, previous user's cache or offline action queue. Compatible local diagnostics report schema or negotiation reasons without recording private utterances, IDs, metadata, entity snapshots or readings by default.

## Compatibility and artifacts

| Pair | Behavior |
| --- | --- |
| Old bridge and old APK | Existing routes and settings. |
| Updated bridge and old APK | Existing v1 payloads and behavior, including timers and independently negotiated room controls where supported by both. |
| Old bridge and updated APK | Explicit absence of the v2 profile marker selects the existing negotiated v1 adapter. |
| Updated bridge and updated APK | V2 reads after parity, then metadata-based target/action binding after the control projection passes parity. Keep existing timer/control execution routes. A v2 capability that is denied, stale, invalid or missing cannot regain access through v1. |
| Future-only bridge or incompatible profile | Identify unsupported capability/profile, retain independently compatible routes and keep the UI responsive. |

Ship bridge support before enabling v2 by default on Android. Keep v1 fallback through at least the repository's deprecation window, with an upgrade note and separate decision before removal. Place optional client-facing artifact extensions in a private, separately versioned managed artifact so strict legacy loaders continue reading the unchanged v1 bundles. Use normal compile, install, inventory, reload, lock and rollback procedures. Preserve existing mappings and user overrides. No release migration writes solely to activate v2. Document prerequisites and rollback in the framework and bridge, and document client compatibility in Android. Public website claims stay deferred until the corresponding release.

## Verification and release gates

1. Generate a fictional capability using existing primitives in a fresh independent installation. Capture the APK hash before and after adding the capability. With that unchanged APK, verify help, held-out PL/EN paraphrases, bridge argument/evidence validation and short speech plus screen details. Include a second fixture using the same primitives and different capability ID so the Android route cannot depend on one fixture name.
2. Add, remove and rename a plant and room; change a policy and its underlying binding. Prove display and voice see one authorized set with current labels and assessments, removed/stale sources cannot answer, and a new role or revision needs explicit exposure. Compare classic view visibility and keep explicit display overrides. Verify identical normalized vanilla and DomoSenso cases in separate fresh HA configs.
3. Inject unsupported profiles and primitives, unknown statuses/units, oversize metadata, duplicate keys, malicious labels, reconnect races, revoked permissions and stale revisions. Exercise ambiguous, negated and quoted utterances, hidden selectors, attempts to inject service names, changed group membership and uncertain outcomes. Assert no extra service calls or expanded access. Use exact fixture provenance across repos.
4. Verify all four supported bridge/APK combinations explicitly, including immediate timer starts, alarms and existing PL/EN light/cover/awning outcomes, clarification and cancellation. Verify both action intent paths before cutover and a metadata-only label/target update after cutover, with unchanged grants and safety decisions. Use pure tests, isolated pinned HA with intercepted services, native parser/presentation/lifecycle tests and independent review. Physical microphone, audio, display and actuation are separate supervised acceptance.
5. Compare fixed, held-out PL/EN utterances across the deterministic and experimental hybrid matchers. Record per-language and per-capability intent+slot accuracy, correct abstention, unsafe admissions, and cold/warm median and p95 decision and full-turn latency. Include plant/room aliases, calendar, weather, timers, negation and fictional new capabilities. Require zero unauthorized or mis-scoped writes in the safety suite and no deterministic routing regressions on existing supported examples. Provisional target for novel unambiguous reads is at least 95% correct capability plus selectors per language, with 100% on the named acceptance examples and no silent broadening. Report measured tablet results separately from desktop. The implementation plan must preregister the corpus, comparison budget and go/no-go thresholds before collecting results.

## Approval and scope

The approved direction is a read-first migration followed by declarative target/action binding with retained execution protocols and deterministic matching by default. Any optional read-only model ranker needs comparison evidence. The implementation plan pins per-repository deliverables, schema fixtures and review steps. New action types, generic downloaded executables, model swaps, remote voice inference, classic view redesign and production/store changes are outside this spec.
