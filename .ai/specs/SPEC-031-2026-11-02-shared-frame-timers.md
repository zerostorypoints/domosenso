# SPEC-031 — Shared timers and time answers for Frame

Status: approved by the owner in this conversation, 2026-11-02. Implementation authorized; deployment and publication remain separate.
Source: the owner's request for timers available from HA Ramka controls and the native Frame
application, including voice; a request for time-of-day answers. No household data is part of this spec.
Baseline: framework main `1376887`; SPEC-029 read contract. SPEC-030 is an independent draft PR.

## Goal and placement

A timer started from either interface is the same HA timer, visible and controllable from both.
A native frame renders its countdown locally and can sound a local completion alert. It does not
create a second, unsynchronized timer. Basic questions about the current time have a deterministic,
localized answer without an LLM. Existing environmental answers remain read-only.

Placement test: HA already supplies the timer engine and helper editor; reuse them. Shared mapping,
capability metadata, Ramka controls and native notification delivery are reusable integration work.
No custom scheduler replaces HA, and no household-specific configuration enters the framework.

## Approaches and decision

1. **Selected:** HA core timer helpers, shared capability/action contracts, native display/alarm.
   This matches the requested shared control and keeps one source of state.
2. Native-only timers: simpler offline operation, but another HA screen would not see/control the
   same timer. Rejected for the requested shared scope.
3. Independent timers in every client with synchronization: adds competing owners and conflict
   resolution without a requirement. Rejected.

The owner selected shared timers. The bounded defaults, notification target and offline policy below
are implementation proposals, not previously agreed facts. Approving this spec accepts those choices.

## Devices and integrations

- HA core `timer`, target HA 2026.9.2; no extra container, cloud service or paid AI dependency.
- HA browser/Ramka controls remain usable without the native app or QVAC.
- Native Android Frame uses the existing app and device pairing. Voice supports PL/EN; catalog UI
  and metadata use en/de/pl. Existing supported tablets remain in scope; no new tablet-specific code.
- An Android completion alarm uses an OS alarm, not a JavaScript interval. Check special exact-alarm
  access and notification permission during alarm opt-in; never silently change OS settings.
  Do not request restricted `USE_EXACT_ALARM` or full-screen intent by default. Select an allowed
  scheduling/notification implementation against the installed Android target before coding it.
- With no background-alarm permission, keep shared controls working and clearly mark sound as
  foreground-only. Do not promise an unattended alarm in that state.

## Catalog, setup and ownership

Add a small free `timers` component around HA core helpers and composed HA controls. Its inputs:

| Input | Type | Default | Example |
|---|---|---|---|
| `prefix` | slug | `domosenso` | `domosenso` |
| `timers` | list of `{id, label, duration_seconds}` | one `general` timer, 300 s | `{id: cooking, label: Cooking, duration_seconds: 600}` |

IDs are unique slugs; initial duration is an integer from 1 to 86,400 seconds. Labels are bounded
plain text. Helpers are `timer.<prefix>_<id>` with `restore: true`. The component declares these
STABLE provided entity patterns and their state/attribute semantics, plus metadata identifying them
as user countdown timers. It never exposes the Ramka's internal control/rotation timers.

Ramka has an optional `timers` mapping (default empty); a mapped set adds a Timer tile to Controls.
No timer replaces or obscures the existing controls. Compose the HA timer tile, timer-actions and
normal timer more-info dialog for duration entry; verify the available features against pinned HA
2026.9.2 rather than assuming the latest documentation's presets exist there. Do not build another
helper editor or duration widget. A small custom element is justified only for the cross-view
countdown badge and native alarm handshake that HA does not provide. Native controls use their
existing app UI toolkit against the same mapped timer contract. Native/voice replacement of an
active run asks for confirmation; standard HA timer controls retain HA's normal restart semantics.
Cancel affects only the selected timer. An active countdown is visible as a small status badge
outside Controls and does not disable normal page rotation, radar, sleep or fullscreen.

Domosenso: install the component, then import its declared timers into the Frame mapping.
Vanilla HA: create a Timer helper in the normal HA UI, enable Restore, and select it in the same
Frame mapping. No YAML/terminal requirement for the vanilla path. No arbitrary `timer.*` discovery
is treated as permission to control all timers. Existing HA helpers are not recreated or renamed.

Artifacts: component manifest, translations, helper package, composed controls and metadata are managed.
Home inputs and a chosen helper/mapping remain instance-owned. HA runtime, grants and alarm receipts
are integration-owned persisted state, never generated files or files under `www`. Native sources
and Android alarm delivery stay in the private app repository. No change to current settings is
deployed as part of writing this spec; the later implementation touches only the Timer section.

## Typed read and command contracts

Preserve SPEC-029 `assistant_query` and `operation: read`. Do not send a timer command through a read
capability or grant writes merely because metadata is installed.

- Read capability `timers.status`, revision 1, types `timer-query.v1` / `timer-status.v1`:
  authorized opaque timer subject IDs, labels, idle/active/paused state, duration, remaining seconds,
  UTC deadline when active, server time, run ID and state revision. Distinguish cancelled, completed,
  completion inferred while HA was offline and outcome unknown in separate outcome fields; core
  `idle` alone is not evidence of successful completion.
- Read capability `ramka.current_time`, revision 1, `time-query.v1` / `time.v1`: HA server UTC instant
  and configured IANA time zone. The metadata declares the closed runtime source `ha_clock`, not
  an invented sensor or free-form template. Limit this runtime source to this evaluator. Use the
  authenticated user's language/time format; deterministic PL/EN speech and the same home time zone
  as the HA display. A timezone change invalidates cached time context. No model-supplied time.
- Separate negotiated command metadata: `timers.start`, `timers.pause`, `timers.resume`,
  `timers.cancel`. User duration is seconds, not a service name or template. Start requires explicit
  duration; pause/resume/cancel require an unambiguous mapped timer. Replacing an active run requires
  a separate explicit confirmation against its current revision.
- Add optional manifest `assistant_actions` (version, definition, bindings) and a separate private
  managed `domosenso/assistant-actions/<component>.yaml`. Keep existing read metadata byte-compatible
  for old bridges. Reuse label, binding and subject conventions, not executable prompts. Commands
  declare parameter schemas, expected effects, confirmations and localized examples. Unknown
  command kinds are unavailable; no generic HA service gateway or executable metadata.
- Bridge routes `domosenso_frame/assistant_actions` and `.../assistant_action` negotiate supported
  command revisions and execute the fixed timer allowlist. Both voice and native controls use the
  same executor; the existing Studio action path should delegate to it rather than implement a
  second timer engine. Classic HA controls use HA's normal authenticated helper actions; the bridge
  observes these state transitions too. Every path converges on the same core helper state.
- Command request: endpoint, capability/revision, subject ID, request ID, expected state revision,
  expected run ID for an existing run, and typed arguments. Native/bridge scope, HA READ+CONTROL
  permissions, the endpoint timer mapping and explicit timer-write grant are checked just before
  the service call. Concurrent commands are serialized per helper. A stale revision returns a
  conflict and current state. This comparison/serialization guarantee covers bridge-mediated
  commands only. Ordinary HA UI actions/automations bypass that lock: HA's action ordering is
  authoritative, and no global compare-and-swap guarantee is claimed. Observe external transitions,
  read back state after the call, and return a conflict when an intervening change is observed.
  Acknowledgement identifies the resulting run/revision, not an assumption that no other actor can
  change it. Do not replace core timer services or globally intercept unrelated HA actions.
- An opaque request ID deduplicates retries within the same endpoint/action payload. A repeated ID
  with different content is rejected. Persist pending/result records before claiming success. If
  HA restarted between the service call and durable result, reconcile state or return outcome
  unknown; never blindly repeat a potentially applied start. UI confirms success only after an
  authoritative result. A disconnect is not a successful cancellation.

Help lists only negotiated, enabled and authorized features, with examples: “set a timer for five
minutes”, “ile zostało czasu?”, “anuluj minutnik”, “Which hour is it?” and “która godzina?”.
A missing duration, multiple possible timers, conflicting number phrases or unsupported duration
prompts for clarification without changing state. Initial start duration range: 1 s–24 h. Do not
interpret dates, recurring alarms, calendar reminders or arbitrary device actions as timer requests.

## Countdown, sound and reconnect

- HA owns the deadline. Clients render remaining time from a server-time snapshot and a monotonic
  elapsed clock while running, rather than decrementing a persisted integer every second. Accept
  newer revisions only; reconnect retrieves a fresh snapshot before enabling writes.
- All authorized frames can show shared state. **Proposed default:** one designated paired frame
  per timer sounds the alarm, regardless of where it was started. Selection is explicit in the
  Timer mapping; no household-wide broadcast. If no frame is selected, use the foreground HA card's
  opt-in sound and show that no unattended Android alarm is armed.
- Arm native notification only after a confirmed active revision and target match. Persist its
  `(HA installation, timer subject, run ID, revision)` and receipt. Pause/cancel/replacement clears
  the corresponding alarm. The bridge observes starts/changes from normal HA controls too.
- At most one bounded audible alert (30 s maximum) per run on the chosen frame. Native alarm and
  WebView card share a receipt/host handshake to avoid duplicate sound on one tablet. Dismiss stops
  the alarm, records acknowledgement and updates all clients; it does not mutate a later run.
  During alarm output, suspend voice capture so the alarm cannot trigger its own wake word; restore
  the previous listening state after dismissal. Never change radar delay or preferred wake app.
- Offline after an acknowledged start: display and local alarm may follow the last confirmed
  deadline, visibly labelled offline. They cannot know about a later remote cancellation. Do not
  claim otherwise. New shared commands are disabled offline, not silently converted to local timers.
  On reconnect, reconcile against HA and remove obsolete local notifications.
- `restore: true` retains HA active/paused timers, but completion during HA downtime does not replay
  `timer.finished`. Persist the last observed run/deadline/outcome and reconcile on startup. Show a
  missed elapsed timer explicitly; never assert a confirmed finish from `idle` alone. A completion
  older than 60 seconds is shown silently on reconnect. A recent unacknowledged completion may alert
  once on the designated frame, subject to its durable receipt. Wall-clock/timezone changes and
  device reboot require recalculating/validating the armed alarm; do not use a stale monotonic base.

## Compatibility and rollout

New timers and write grants are opt-in. Existing homes, old clients and read-only sessions keep their
behavior. Unsupported command negotiation hides/disables timer commands and gives an honest answer;
there is no legacy generic-write fallback. Preserve all existing v1 read files and routes for at
least one minor version; add UPGRADE.md/COMPATIBILITY entries for new source, metadata and routes.
Framework, public HA bridge and private native app changes require separate PRs/releases. Select the
Ramka version after reconciling any intervening release; do not reuse/move a published tag. Website:
Timer capability/setup pages stay draft until a component tag is published. No automatic production
deployment, merging or Play publication follows specification approval.

## Verification and acceptance

- Schema/render/privacy/catalog checks, en/de/pl completeness, declared provides/consumes; full
  framework `tools/check-all.sh` before committing implementation.
- Fresh isolated HA 2026.9.2: install once through Domosenso and once through vanilla UI-created
  mapped helpers. Start in HA, inspect/cancel from native; start by voice, inspect/pause/resume in HA.
- Bridge: unauthorized/missing grants, unmapped/internal timers, stale revisions, duplicate requests,
  replay after restart, conflicting payloads, removed user permission and indeterminate outcomes.
- Consistent help/metadata/state across both installations; no fake provider or silent broadening.
- PL/EN start/read/cancel/time questions, units and number words, no duration/ambiguous duration,
  multiple timers, zero/negative/too-large durations. No write on an unclear utterance.
- Clock: midnight, noon, DST transition, HA timezone different from tablet timezone, localized spoken
  time and display format. Time questions do not invoke the LLM or change HA profile settings.
- Alarm: foreground, screen off/Doze, app process death, reboot, permission denied/revoked, disconnect,
  remote cancellation while disconnected, HA restart past deadline, duplicate/out-of-order events,
  simultaneous WebView/native handling, dismissal concurrent with a new run. Report tested devices
  and OS versions; do not infer reliability from unit tests alone.
- Physical acceptance: a short shared timer rings once on the selected frame, remains visible on
  the other view, cancels from either view, and returns to the previous classic view/listening state.

## Out of scope and remaining decisions

No global atomicity guarantee against arbitrary direct HA actions, recurring alarms, calendar notification scheduler, arbitrary service calls, timer creation by the
LLM, cloud sync, standalone offline timer mode or household-wide alarm broadcast. Existing concise
speech/waiting-cue fixes are independent and do not depend on this feature.

The selected architecture is verified against the code/official sources below; notification target,
1 s–24 h bound, 30 s sound bound and 60 s missed-alarm policy are proposed product choices. Android
alarm API/permission behavior must be verified on targetSdk 36 and the actual supported tablet OS
before claiming background support. Exact request/response schemas and implementation task split
follow approval, retaining the semantics and compatibility requirements above.

Sources checked 2026-11-02:
- https://www.home-assistant.io/integrations/timer/
- https://www.home-assistant.io/dashboards/features/#timer-actions
- https://github.com/home-assistant/core/blob/2026.9.2/homeassistant/components/timer/__init__.py
- https://developer.android.com/develop/background-work/services/alarms
- SPEC-029, schemas/assistant.schema.json, docs/PRINCIPLES.md and docs/COMPATIBILITY.md.

Independent builder review, 2026-11-02: two planning questions were raised and resolved in this
draft. Concurrency guarantees are explicitly bounded to bridge-mediated commands; direct HA
changes retain HA ordering and are reconciled. The controls compose HA primitives instead of
reimplementing a timer editor. The new `ha_clock` runtime source is an explicit contract amendment.
This technical review is not human approval of the specification.
