# SPEC-033: Room lights and window-covering voice controls

- Status: approved 2026-11-03 with maintainer amendment: include awnings.
- Source: maintainer request for Polish/English room light on/off and cover open/close commands, including awnings.
- Baseline inspected: framework a2521ce, Frame HA bridge 5e7faa1, native 16b34dc.

## Goal and placement

Use HA's existing light and cover services, room registry and permissions through the same
endpoint mappings used by Frame controls. Components describe supported actions; the bridge
resolves and authorizes exact targets; Android recognizes an intent and presents its result.
This reusable extension belongs in the framework metadata, free HA bridge and native client.
No separate Android room configuration, new cloud service or model-generated HA service call.

Verified: assistant metadata currently describes read capabilities. Studio can control mapped
lights/covers and checks HA READ/CONTROL. Timer actions already use capability negotiation,
request IDs and revision checks. Studio light toggle is unsuitable for an explicit voice on/off
request. Reuse authorization and mapping primitives, extending the action dispatcher rather than
creating another unrestricted service endpoint. Existing timer revision 1 remains unchanged.

## Devices and integrations

HA 2026.9.2, the compatible Frame bridge and Android app; existing lights and motorized window
coverings exposed by HA. No new hardware or firmware. Domosenso light room groups retain their
existing template-light indirection. Vanilla HA uses entity/device area assignments and explicit
mapping where metadata is absent. No model of tablet or cover is newly claimed tested.

## Inputs and target semantics

Administrator-owned endpoint inputs in the existing integration editor:

- `assistant.controls.enabled`: boolean, default false.
- Explicit grants: stable mapped subject identity, exact entity binding, allowed action revisions.
  READ exposure, visibility in a card and SPEC-032 future read scopes never grant writes.
- Room identity: existing component `roomKey`, resolved to an HA area; otherwise entity area,
  then device area. Conflicting associations require explicit mapping; labels alone do not create
  room membership. Existing localized labels and HA aliases feed PL/EN recognition.
- Cover semantics: verified HA `blind`, `curtain`, `shade`, `shutter` classes are eligible.
  Missing/ambiguous class requires administrator mapping to a window-covering type.
  `garage`, `gate`, `door` and `damper` are excluded. A verified `awning` has its own
  extend/retract/stop semantics and cannot be silently relabelled as a blind.
- Awning extension requires an explicit wind-safety binding: wind alarm entity, last-heard
  timestamp and positive maximum-silence threshold from component policy or administrator mapping.
  An alarm, unknown/unavailable input, stale evidence or absent safety mapping blocks extension.
  Retraction and supported STOP remain available without a safe-wind assertion; existing device
  protection/automations are never overridden. A fresh safe report is not a weather guarantee.

An administrator reviews and enables current mapped targets without YAML. Future targets require
an explicit new write grant. A changed binding cannot inherit permission. Duplicate room group
and member mappings are resolved to one canonical target set; ambiguous overlap is rejected.

## Provides and consumes

Add negotiated, stable capability IDs/revision 1: `lights.turn_on`, `lights.turn_off`,
`covers.open`, `covers.close`, `covers.stop`, `awnings.extend`, `awnings.retract`,
`awnings.stop`. Metadata is descriptive data, never executable code.
Schema support for action declarations is additive/versioned and separately negotiated so older
read-only consumers retain valid schema-1 bundles. The implementation must keep read definitions
unchanged and deliver action definitions through a separately versioned optional sidecar rather
than placing write operations in a read-only schema-1 bundle. The sidecar has the same provenance
and ownership checks as assistant metadata. Unsupported sidecars are ignored, not interpreted.

Consume only manifest-declared light roles and upstream HA cover entities from approved endpoint
adapters. No direct cross-component entity lookup. Framework lights and awnings declare their actions and bindings; generic window coverings use
the bridge's vanilla adapter. Awning actions consume declared cover, wind and last-heard roles;
the wind policy is shared with component settings rather than duplicated in Android.

Bridge negotiation returns typed actions and opaque target/room identities only after filtering
endpoint/device grants and HA READ+CONTROL. Requests contain capability/revision, target token,
request ID and a target-set/mapping revision; never an arbitrary service name or entity list.
The server revalidates all targets, grants, feature support and current availability at execution.
A room request covers the exact exposed room set. If other known lights/covers in that room are
not exposed, show a partial-scope explanation before execution rather than claiming whole-room
control. No implicit whole-house fallback, current-room guess, scheduled command or offline queue.

## Interaction and execution

PL: “włącz światła w kuchni”, “zgaś światło w pokoju”, “otwórz rolety w pokoju”,
“zasuń zasłony w pokoju”, “zatrzymaj rolety w pokoju”. EN equivalents include “turn off the
kitchen lights”, “open the bedroom blinds”, “close the living room curtains”. Singular and plural
follow declared subjects/room grouping. Awning phrases include “wysuń markizę”, “zwiń markizę”,
“zatrzymaj markizę”, “extend the awning”, “retract the awning”; open/close synonyms are resolved
only against an explicit awning target. Use deterministic intents first; any model proposal must
pass the same validator. Questions about status must not execute actions. Negated, conditional,
quoted, contradictory, multi-action or low-confidence requests produce clarification/no action.

A unique exact room/subject executes once. Missing/duplicate room names ask for clarification,
with visible choices and a bounded conversation token tied to the original action and candidate
set. No action occurs before selection. Explicit on/off replaces toggle; repeat requests are
idempotent. Persist a request ledger before dispatch; reconnect or process restart never blindly
replays an uncertain request. Mapping changes invalidate pending confirmation/selection tokens.

Preflight all room members before dispatch. Track per-target results; service failures or partial
results must not be reported as success. Use HA user context. Respect existing device interlocks;
never disable automations or protection. STOP is offered only when the integration supports it.
A short spoken response and related controls screen show accepted/moving/confirmed/failed/unknown
status separately. A service-call return means accepted, not physical completion. No fresh state
confirmation means “sent the command”; assumed cover positions remain identified as estimates.
Do not keep the microphone blocked while a motor moves. Restore normal listening after speech.

## Artifacts and ownership

- Framework: optional versioned action metadata schema/compiler, lights and awnings declarations/translations,
  compatibility and upgrade documentation, fictional fixtures. Managed sidecars under private
  `domosenso/assistant-actions/`; never in `www`. Render/install/lock/rollback track their bytes.
- Bridge: shared target resolver, bounded negotiated dispatcher/ledger, existing mappings UI,
  PL/EN feedback and protocol documentation. Grants and room overrides are instance-owned.
- Native: PL/EN intent and clarification, typed protocol client, concise speech and control screen.
- Private homes: configuration only; no real rooms, entity IDs, addresses or credentials in shared
  repositories. No HA settings/profile changes are part of this implementation.

## Compatibility and delivery

Default remains no assistant actuator access. Existing Studio buttons, timers, read capabilities,
pairing and source grants keep working. Clients negotiate action support and fall back to a clear
unsupported message on older bridges. Sidecar format v1 is stable; adding new actions is additive.
Document the bridge/app minimums and upgrade/downgrade sequence. Retain the preceding read-only
bundle format and existing timer API for at least one minor version. Do not enable controls during
an Android update or reuse a read grant as consent.

Implement as three coordinated changes: metadata/compiler, bridge execution+mapping, native PL/EN
client. Cross-repository compatibility tests run before release. Publication and production deploy
remain separate actions from spec approval. Website impact: document new capabilities/minimum
versions only when released; until then retain draft evidence and do not advertise availability.

## Tests and acceptance

- Red-first PL/EN parser cases for exact commands, aliases, inflections, ambiguity, negation,
  status questions, compound/future commands and no-target cases.
- Metadata/schema/compiler and strict catalog checks; old read bundles remain byte-compatible;
  orphan, render/deploy/rollback coverage for optional action sidecars.
- Bridge tests for denied/revoked grants, changed mapping, unknown capabilities, excluded classes,
  unsupported features, stale selection, unavailable targets, duplicate group/member scopes,
  partial rooms, service errors, idempotency and restart after dispatch uncertainty.
- Awning safe/stale/unknown/alarm wind evidence, invalid/future timestamps, permission denied
  wind sources, new alarm between negotiation and dispatch, safe retraction and STOP.
- Fresh independent HA fixtures for both Domosenso and vanilla installations, fake HA services
  capture exact calls; state feedback distinguishes assumed from observed position.
- Native PL/EN request-to-result tests, reconnect/cancel and return to listening; preserve timer
  and read-answer regressions. Full applicable repository checks before commits.
- Physical tests only on explicitly selected household targets; record what was and was not
  tested, restore prior light states when appropriate, and do not infer physical cover position
  from an optimistic integration. User acceptance includes speech and visible result.

## Out of scope and open points

No brightness/colour, percentage/tilt positioning, scenes, locks, garage doors, all-house
commands, arbitrary services, scheduled actions or new automatic write grants in this increment.
No new speech model or wake detector. Physical window-covering operation is unverified; HA integration state can be optimistic,
particularly for one-way radio awnings. Runtime acceptance must retain this limitation.
