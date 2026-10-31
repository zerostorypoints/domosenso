# SPEC-024: Component contracts for grounded assistant answers

- Status: approved 2026-10-31 by the maintainer: "ok, implementuj", including whole-catalog scope.
- Source: the maintainer requested an assistant that explains its actual capabilities and answers
  about plants, air and temperature from HA data, with the knowledge owned by each component.
  Scope expanded by the maintainer on 2026-10-31 to music, home lighting, calendar and every other
  component in the current catalog. All requested interactions remain read-only answers.
- Baseline: upstream main `6affed4`, inspected after fetching on 2026-10-31: plants 0.3.1,
  climate-air 0.2.0, Ramka 0.8.0; SPEC-022 and SPEC-023. This is a proposal, not shipped behaviour.
- Scope: the open framework's manifest, metadata artifacts and compatibility surface; the public
  Frame HA integration consumes them; the separate Android app supplies speech and presentation.
  No production deployment, tablet update, HA settings change or remote publication is authorized
  by preparing this document.

## 1. Outcome and approaches

The assistant can answer “What can you do?”, “Which plants need water?”, “Why is the air quality
poor?” and “What is the temperature in the living room?” using the current installation's
authorized sources. It says what it knows, why, and what is missing. A component update can add
descriptions or new instances of already supported capabilities without another APK; a new query
or answer schema still requires compatible bridge and app implementations.

Considered approaches:

1. Component prose included in an LLM prompt: easy to add, but cannot reliably establish data
   requirements, freshness, permissions or the difference between reading and controlling.
2. A growing topic list in Android: predictable initially, but duplicates component semantics and
   requires an APK for component knowledge updates.
3. **Selected direction:** a versioned, structured, read-only component contract with localized
   descriptions and examples. HA resolves bindings and evaluates facts; Android negotiates supported
   answer types and speaks bounded responses. This develops the direction requested by the owner.

The design covers all 12 components present at the baseline, as enumerated in section 7.1. Every
component has a declared conversational scope, but only supported, mapped and authorized capabilities
are advertised at runtime. Existing calendar questions keep working through the legacy route while
the new route adds explicit date windows. Implementation may ship in independently verified groups;
partial delivery must be labelled as such rather than advertised as whole-catalog support.

## 2. Verified foundations

- `sensor.domosenso_components` already describes installed versions and provenance (SPEC-023).
  It can also include a component borrowed through an ESPHome package. Neither a catalog entry nor
  this inventory proves that usable entities, policies or an assistant adapter exist.
- Ramka's discovery snapshot supplies related integrations/devices; it is diagnostic evidence,
  not an authorization grant or a live-data source. Do not export its registries to the LLM.
- Plants provides per-plant bands, translated names/rooms, moisture and other measurements,
  a detected `last_watered` timestamp and estimated `water_in_days`. Brightness assessment uses a
  historical peak, not the instantaneous light reading. See `components/plants/README.md`.
- Climate-air exposes configured rooms, indoor exclusions and aggregate sensors. Ramka's air card
  supports live threshold helpers with explicit fallback limits. Do not freeze these into a prompt.
- The existing Frame bridge has mapped sources, endpoint/device grants and air assessment evidence;
  the Android pilot accepts temperature, air and today's calendar. Plants and capability help need
  new negotiated routes. This inspection does not establish public-release compatibility.

## 3. Ownership, devices and integrations

| Owner | Responsibility |
|---|---|
| Framework/component | Capability definitions, typed facts, interpretation, translation keys, defaults and tests |
| Home | Entity bindings, local labels, policy overrides, endpoint exposure and permissions |
| Frame HA integration | Resolve bindings, authorize every query, validate data, calculate assessment and return evidence |
| Android client | Recognize intent, negotiate schemas, render/voice a short faithful response in the HA session language |

No new device or cloud service is required. Use the existing HA entities: temperature sensors,
optional air sensors, and plant entities/sensors. Existing recommended hardware remains in the
component manifests (Tapo T315, Ruuvi Air, Mi Flora and their required hub/proxies). Other hardware
works through explicit adapters with compatible units; this is not a claim of physical testing.

Target HA is the repository-pinned 2026.9.2, Container or HAOS. Existing core integrations remain
unchanged. Frame's HACS integration is required for the app bridge. The free framework and HA
contract remain independent of QVAC, Android licensing and any paid AI service. No new container,
add-on, microphone enrollment or model training is part of this change.

## 4. Declarative component metadata

Add an optional `assistant` field to `schemas/component.schema.json`, with exact keys:

```yaml
assistant:
  version: 1
  definition: assistant.yaml
  bindings: templates/assistant-bindings.yaml.j2
```

Both paths must be relative, remain inside that component and exist. The bindings template is also
listed in `artifacts.templates`. The assistant compiler consumes its rendered result; it is not
installed as an HA package or a public `www` file. A component without this field remains valid.

`assistant.yaml` is validated by a new `schemas/assistant.schema.json`. It contains a bounded list
of capabilities. Each capability has:

| Field | Meaning |
|---|---|
| `id` | Stable namespaced id, such as `plants.watering_need` |
| `revision` | Positive integer semantic contract revision, initially 1 |
| `operation` | Exactly `read` in v1 |
| `query_type`, `answer_type` | Versioned allowlisted schemas implemented by bridge and client |
| `title_key`, `description_key`, `examples_key` | Component translation keys under `meta.assistant.*` |
| `required_facts`, `optional_facts` | Named typed roles, accepted units, scalar/event/estimate meaning |
| `policy` | An allowlisted evaluator id and the required policy roles; not executable code |
| `freshness` | Per-fact maximum report age and evidence requirements |
| `limitations` | Structured reason codes that the response formatter understands |

Examples are a nonempty bounded list per language. The framework supplies en/de/pl and retains
English fallback within the existing `meta` namespace. Android v1 speaks PL/EN using the authenticated
HA session's locale; this spec does not promise German speech. Local translated plant names and room
labels take precedence, then their existing name; do not invent a translation of a proper name.

Metadata cannot contain arbitrary prompts, expressions, scripts, network URLs to execute, service
calls or Python/JavaScript. New evaluator/query types require reviewed implementation. Facts must
refer to the component's `provides`/declared upstream surface, or a declared `consumes` relation.
The catalog check validates these references, schema versions, bounds and translation coverage.

## 5. Bindings, distribution and installation

The rendered bindings are private data: component instance ids, HA entity ids/attributes, labels,
indoor flags, policy references and per-source freshness overrides. The template uses declared
component inputs and their documented defaults; no name guessing, undocumented entity suffix search
or household-specific defaults. In particular, omitted plant sensor ids use the existing package's
default derivation from the plant object id. Factor that normalization into one shared render helper
or equivalent single definition, tested against both package and assistant outputs; do not copy the
defaulting algorithm into the bridge. An explicit `sensors` override always wins.

`domosenso add/adopt/render/update` compiles the definition, all three translations and rendered
bindings from the **same pinned component revision**, into one managed YAML artifact:
`<config_dir>/domosenso/assistant/<component-id>.yaml`. Its envelope contains `schema: 1`, component
id/version, source commit/dev flag, definitions, translations and bindings. No readings are embedded.

Implementation extends the existing build/install mapping for these artifacts; it does not add a
parallel installer or a new CLI command. Paths/hashes are recorded as ordinary managed files in the
lock/dev-render records. Status, plan, deploy and rollback must include them; deploy checks the recorded
hash without needing the catalog. Dirty artifacts follow SPEC-019. Updating a component removes its
obsolete managed assistant artifact according to the existing reviewed deploy plan; it never removes
instance mapping overrides. Unknown file ownership remains an error. Deterministic rendering and
rollback are acceptance requirements.

Explanation-only components render an empty binding set; their entire inputs object must never be
serialized into metadata. Only explicitly declared fact roles can be exported. In particular,
remote-access secrets and host/network configuration are excluded from its assistant bundle.
Optional `media.mains` requires an explicit power/voltage binding: add optional `mains: {power?, voltage?}`
to that component's inputs (default absent) and declare the meter entities as upstream; vanilla uses
the same roles in the bridge mapping UI. Do not derive meter entities from the player name.

The bridge reads only regular YAML files in that fixed config subdirectory, rejects symlinks/path
escapes, uses safe parsing, validates bounded schemas and matches component identity/version/commit
against SPEC-023 inventory. Missing inventory or a mismatch prevents **automatic** activation and is
reported to the administrator. Inventory's `package`-only entries cannot activate an assistant contract.
The inventory sensor's existing fields and generation remain unchanged; it is a cross-check, not a
licence, signature or proof of installer identity.

Reload metadata on integration load and an explicit admin reload; keep current metadata on invalid
reload only for diagnostics, disable affected queries until corrected. Per-request authorization and
live values are always rechecked. No polling of GitHub or loading code from a metadata artifact.

Vanilla HA and older DomoSenso installations use the bridge's bundled, versioned adapters and existing
mapping UI. They can express the same normalized roles without an inventory sensor, YAML editing or
terminal commands. Their provenance is `manual_adapter`, not a claimed DomoSenso installation.
Administrator-confirmed per-endpoint bindings override automatic suggestions; ambiguous matches require
mapping. Removing a component must not silently convert it to a manual adapter.

Input decisions (proposed defaults, not validated sensor sampling guarantees):

| Input | Type/default | Ownership |
|---|---|---|
| Source binding | Typed entity/attribute role; no guessed default | Component render or explicit vanilla mapping |
| Temperature/air max report age | Seconds, 900 | Contract default; existing explicit home value wins |
| Plant measurement max report age | Seconds, 21600 | Contract default; per-source home override |
| Freshness override bounds | Integer 60..86400 | Validated mapping |
| Assessment bands | No new universal thresholds | Existing plant config / air policy, evaluated live |
| Endpoint exposure | Existing mappings/grants | Home; metadata never widens access |

Prefer freshness/measurement metadata from the source adapter. HA `last_changed` is not a sample
timestamp; stable values can be current. `last_reported` describes an HA report, not necessarily a
physical sample. Mark its basis explicitly. A restored state or periodically refreshed template is
not proof of a new measurement: validate underlying source reports and reject restored/unverified
data for a current assessment. If this cannot be established, return unknown freshness, not “fresh”.
Event age is different: yesterday's detected watering remains a historical fact, not a stale sensor
because its event timestamp is old. An estimate additionally needs current valid source evidence.

## 6. Runtime negotiation and capability help

Add `assistantVersion: 1` to a bridge profile endpoint without changing protocol 1 or legacy topics.
New authenticated, paired-device operations:

- `domosenso_frame/assistant_capabilities`: endpoint, version 1, supported query/answer type versions.
- `domosenso_frame/assistant_query`: endpoint, version 1, capability id/revision, typed arguments and
  supported answer type version. No raw entity ids, service names or model-supplied code as arguments.

Both operations enforce existing session, user, device and endpoint grants on the server. Filter
source access using HA's permission facilities as well as endpoint mappings. Client negotiation
only narrows results; it grants nothing. Do not reveal hidden entity names, counts or capabilities.

Capability records distinguish three dimensions:

1. Implementation support: bridge and client understand the definition/query/answer revision.
2. Configuration: required roles are mapped and authorized.
3. Availability now: `ready`, `partial`, `unavailable`, with reason codes (`missing_source`,
   `stale`, `unknown_freshness`, `invalid_unit`, `missing_policy`, `warming_up`, `insufficient_history`).

The complete initial data-limitation vocabulary also includes `conflicting_policy`,
`history_coverage_unknown`, `watering_history_unknown` and `provider_history_unknown`. Unknown future
reason codes are displayed as a generic limitation and never interpreted as a successful assessment.
Unknown schema versions are rejected gracefully. Administrator diagnostics additionally distinguish
`needs_mapping`, `unsupported_version`, `contract_mismatch`; ordinary help does not enumerate hidden
or unmapped household entities. Runtime capability listing must not be based on inventory alone.

Static configuration discovery needs no sensor read. “What can you do?” performs a bounded read of
the already loaded HA state machine for its authorized mapped sources, with no device polling,
recorder query or LLM call, to qualify availability: “I can check temperatures and plant watering. Air readings are
temporarily unavailable.” Offer at most three example questions, deterministic order: temperature,
air, plants, media, lights, calendar, weather, presence, awnings, audio level, backup, frame and
component explanations. Help first gives a compact category summary, not all capability entries;
“what else?” can page through examples without implying new data access. Missing all capabilities gives a setup/data message, not a
catalog sales pitch. Installed devices or visible widgets never imply voice control support.

Keep this help route deterministic and cheap; no LLM completion is required. Recompute capability
availability for each query; a cached help response cannot authorize a later request.

### Normative v1 routing and identifiers

All operations retain the bridge's existing session/device proof fields. Additional request fields
are exactly those listed below; unknown request fields are rejected. JSON types use camelCase on the
wire. `version` is exactly 1. A client may ignore unknown optional response fields, but never unknown
versions or reason/status meanings; these become a generic unavailable result, not success.

| Operation | Additional request fields | Response fields |
|---|---|---|
| `assistant_capabilities` | `endpoint: string`, `version`, `supported: [{queryType, answerType}]` | `version`, `asOf`, `capabilities: [Capability]` |
| `assistant_query` | `endpoint`, `version`, `capability`, `revision`, `answerType`, `arguments: Query` | Answer envelope from section 8 |

Query/answer pairs are fixed for v1:

| Capability | Query type | Answer type | Permitted `Query` keys |
|---|---|---|---|
| `climate-air.temperature` | `temperature-query.v1` | `temperature.v1` | optional `roomId` |
| `climate-air.air_readings` | `air-query.v1` | `air.v1` | optional `roomId`, `metric` |
| `climate-air.air_assessment` | `air-query.v1` | `air.v1` | optional `roomId`, `metric` |
| `plants.watering_need` | `plant-query.v1` | `plant-watering.v1` | optional `roomId` or `plantId` |
| `plants.status` | `plant-query.v1` | `plant-status.v1` | optional `roomId` or `plantId` |
| `plants.last_watered` | `plant-query.v1` | `plant-event.v1` | required `plantId` |
| `plants.water_in` | `plant-query.v1` | `plant-estimate.v1` | required `plantId` |
| `climate-air.humidity` | `environment-query.v1` | `environment.v1` | optional `roomId` |
| `climate-air.status` | `environment-query.v1` | `environment.v1` | optional `roomId` |
| `media.now_playing`, `media.status` | `media-query.v1` | `media.v1` | optional `roomId` or `subjectId` |
| `media.mains` | `reading-query.v1` | `reading.v1` | optional `subjectId`, `metric` from power/voltage |
| `lights.status` | `light-query.v1` | `lights.v1` | optional `roomId` or `subjectId`, `filter` from all/on/off/unknown |
| `calendar.agenda` | `calendar-query.v1` | `calendar.v1` | optional `subjectId`, `period` from today/tomorrow/next_7_days, `date` instead of period, `nextOnly: boolean` |
| `weather.current` | `weather-query.v1` | `weather.v1` | optional `subjectId` |
| `weather.forecast` | `weather-query.v1` | `weather.v1` | optional `subjectId`, `period` from today/tomorrow/next_7_days, `date` instead of period |
| `bermuda-presence.observations` | `presence-query.v1` | `presence.v1` | optional `roomId` or `subjectId` |
| `awnings.status`, `awnings.wind` | `awning-query.v1` | `awnings.v1` | optional `roomId` or `subjectId` |
| `audio-sensor.level` | `audio-query.v1` | `audio-level.v1` | optional `roomId` or `subjectId` |
| `backup.status` | `status-query.v1` | `backup.v1` | optional `subjectId` |
| `ramka.status` | `status-query.v1` | `frame.v1` | optional `subjectId` |
| `<component-id>.explain` (all catalog ids) | `component-query.v1` | `component-description.v1` | none; capability id selects the component |

`roomId` and `plantId` are mutually exclusive. Omission means the endpoint's authorized set, except
temperature defaults to indoor rooms; specifying a room selects that room even if it is outdoors.
For `air-query.v1`, `metric` is one of `score`, `co2`, `pm2_5`, `voc`, `nox`; other query types use
only their own metric enum from the table. Only the calendar/forecast routes below accept bounded time selectors. No action arguments are allowed.

`Capability` has `id`, `revision: 1`, `queryType`, `answerType`, `title`, `description`, `examples`,
`configuration: configured`, `availability`, `limitations`, `subjects: [{id, kind, label, roomId?}]`.
Localized strings are maps with en/de/pl keys. `kind` is `room`, `plant`, `player`, `light`, `calendar`, `weather`, `presence_source`, `awning`,
`audio_source`, `backup`, `frame` or `component`. Only the intersection of
configured, authorized and client-supported capabilities is returned, including temporarily unavailable
ones. Administrator diagnostics are separate; reasons may explain missing data but must not reveal
unauthorized subjects. The app advertises the new calendar route when negotiated, otherwise its legacy today-only route;
it must not list both as separate abilities.

Opaque subject ids are UUIDv5 values, namespaced by the bridge's existing installation UUID and a
canonical tuple `(endpoint id, kind, stable identity)`. Plants and other entity-backed subjects use the HA entity registry entry id;
rooms use an explicit HA area id when mapped, otherwise a generated UUID persisted when the admin
creates that room mapping. YAML-only sources without registry identity use their exact declared
binding key and must be remapped if that key changes. Labels never define identity. Renames with
unchanged identity keep ids; reassignment, deletion/recreation or endpoint change invalidates them.
Derived ids are not credentials. Current authorization and existence are checked on every request.

Limits per endpoint: at most 64 capabilities, 64 rooms, 100 plants, 100 light sources,
16 players, 16 calendars, 8 weather sources, 100 other subjects, 6 air metrics per subject,
3 examples per capability; ids <=80 characters, labels <=120, descriptions/examples <=300. Each
capability lists at most 164 subjects and each answer at most 600 fact rows; no pagination in v1.
Counts describe the complete authorized query set. Reject over-limit configuration with admin
diagnostics instead of silently truncating a capability. Capability ids/revisions and type versions must match exactly;
semantic changes require a new revision with explicit dual support, never silent reinterpretation.

Bounded errors: `unsupported_version`, `unsupported_capability`, `invalid_arguments`, `unknown_subject`,
`ambiguous_subject`, `contract_mismatch`, `unavailable`; authorization uses existing generic bridge
errors without confirming subject existence. Unusable data is normally an answer with availability
and limitations, rather than a transport failure. An error never starts a substitute topic.

## 7. Initial capabilities and answer rules

| Capability id | Required evidence | Behaviour |
|---|---|---|
| `climate-air.temperature` | Authorized room temperature reports, units, indoor flag | Requested room, or indoor min/max summary; counts disclose partial coverage |
| `climate-air.air_readings` | At least one requested current metric | Numeric readings; no assessment if policy absent |
| `climate-air.air_assessment` | Current metrics and compatible live policy | Worst evaluated status, coverage and reasons; score cannot hide an elevated pollutant |
| `plants.watering_need` | Moisture and that plant's configured moisture band | Below/within/above band, which plants, how many not assessable |
| `plants.status` | Plant problem flags and underlying metric/window evidence | Explain supported moisture, conductivity, temperature and light problems; identify unassessed dimensions |
| `plants.last_watered` | Valid detected watering event | “Watering was detected …”, not a confirmed human action |
| `plants.water_in` | Existing HA estimate and its valid source/history | “Estimated …”; preserve unknown after watering or absent drying trend |

Except the explicitly bounded calendar and forecast requests in section 7.1, all questions concern
current state or a specifically declared existing derived fact, not arbitrary history.
Queries use stable opaque instance/room ids supplied by the authorized capability response. Natural
names are resolved within that set; duplicate/ambiguous names ask for clarification. An unknown room
does not fall back to a whole-home answer. Queries may narrow to a known metric. Unsupported time
periods, trends and controls return an explicit limitation rather than a different supported topic.

Temperature is not a comfort/health judgement. Negative Celsius values are valid. Convert only
explicitly supported Celsius/Fahrenheit units with consistent comparison/display rules; unsupported
units are excluded with a reason. Indoor aggregation excludes `indoor: false` and invalid/stale
sources. Do not trust a fresh aggregate template timestamp when its underlying sensors are stale.

Air policy binding is explicit: `(endpoint, metric, source entity id, unit)` maps to one owner
component/contract revision, helper entity references and release-pinned fallback bounds. The bridge
joins the climate-air facts and Ramka policy descriptors by that exact tuple, never by labels or
matching component names. An admin-selected endpoint override wins; otherwise there must be exactly
one compatible candidate. Multiple incompatible candidates produce `conflicting_policy`, no assessment;
zero candidates produce `missing_policy`, while readings remain available. Two Ramka views with
different policies therefore require an explicit endpoint choice. Climate-air never copies Ramka's
fallback constants: those ship with the same Ramka revision as the helper/card definition.

Air bands must match effective card/helper configuration, including direction and exact boundary
operators. Climate-air owns measurement meanings; Ramka or manual mapping owns the configured
assessment policy. Cross-component references are declared. Live helper changes affect the next
query without APK/render/restart; missing helpers follow the existing explicit card fallback, reported
in provenance. A hidden tile is a presentation choice, not a permission or rule change. Existing endpoint
exposure governs speech. No conflicting policy wins silently. Index warm-up is excluded only when an
adapter can establish it; otherwise state the missing evidence. These are configured ranges, not a
medical or regulatory certification. Partial good data never becomes “all the air is good”.

Plants must not equate every `problem` state with needing water. High moisture is not a watering
recommendation; low conductivity is not proof of nutrient deficiency. Brightness uses the component's
configured historical window/peak; a low instantaneous reading at night cannot justify an alert.
For light, v1 may report the plant integration's own current `brightness low` problem flag and the
configured `check_days` window, with `basis: provider_assessment`; it must not claim to have independently
verified complete history or cite a numeric peak it did not receive. Require a non-restored plant state,
current underlying light source report and a known configured window; otherwise that dimension is
unassessable. The existing 24-hour maximum is not evidence for a multi-day window. Unknown provider
history completeness is disclosed on a detailed explanation and prevents an independent all-clear.

For watering estimates, v1 deliberately reports a **provider estimate**, not an independently
validated forecast. Bind the existing moisture source, drying-rate sensor, configured minimum and
last-watered event alongside `water_in_days`. Require current valid moisture, a finite negative rate,
a finite nonnegative HA estimate and no known watering within 48 hours. Missing rate/history yields
`insufficient_history`; invalid or stale source data cannot be rescued by a numeric estimate.
The existing rate uses available samples within a maximum 48-hour window, which may be shorter.
Do not require or claim exactly 48 hours of observed history. Set `historyBasis: provider_estimate`,
`windowHours: 48`, `coverage: unknown` and limitation `history_coverage_unknown`; explain on screen
that history completeness has not been verified, and say “HA estimates about …” in speech. An unknown
last-watered event remains unknown, never “no recent watering”; include `watering_history_unknown`
when applicable. A future independently verified forecast is a separate capability revision. This
choice preserves the component's existing calculation without adding recorder queries, helper
entities or changing HA settings. Fixtures must cover numeric estimates from shorter available
history as qualified estimates, not certified forecasts.

Use the existing watering estimate rather than calculate a new one in the LLM. Do not claim that
unknown history means the plant has never been watered. For long lists, speak the count and up to
three prioritized names, show the full authorized list, and state omitted/unassessable counts.

## 7.1. Whole-catalog conversational coverage (scope amendment)

This matrix is exhaustive for the 12 current component ids. It describes the **target contract**,
not the capabilities already in the published APK. Implemented help must distinguish those two.

| Component | Supported questions / capability ids | Evidence and mandatory limits |
|---|---|---|
| `media` | What is playing, who performs it, album, source/service, reported format/quality, volume/mute, which player? `media.now_playing`, `media.status`; optional power/voltage `media.mains` | Authorized `media_player` state/attributes and explicitly mapped optional quality/service/meter entities. Never infer a codec, losslessness or artist from a filename; distinguish player volume percent from measured room loudness. No playback commands. |
| `lights` | Which lights are on, where, how many, reported brightness? `lights.status` | Component's reachable-bulb room lights or individually mapped bulbs; groups and bulbs cannot both count as independent lights. Unreachable is unknown, not off. Group-only observations must be described as reported group state, never verified bulbs. |
| `calendar` | What is today/tomorrow, what is next, appointments on a date within the next seven local dates? `calendar.agenda` | Read authorized calendars through the bounded HA event adapter, preserving all-day/multi-day semantics and installation timezone. No creation, cancellation, reminder setup or attendee/location disclosure by default. |
| `weather` | Current conditions, temperature, rain, wind and available forecast? `weather.current`, `weather.forecast` | Current `weather.*` attributes and supported forecast response. Separate observation time from forecast validity/issue time; do not turn rain probability into certainty or expose unsupported hourly detail. |
| `plants` | Watering need, plant condition, detected watering, qualified estimate | Section 7's plant capabilities and provider-evidence rules. |
| `climate-air` | Temperature, humidity, air readings/assessment, reported indoor/outdoor difference and humidity alert? Existing capabilities plus `climate-air.humidity`, `climate-air.status` | Reuse published measurements/derived entities and configured policy. A humidity alert is the component's time-qualified flag, not a new conclusion from one sample. |
| `bermuda-presence` | What authorized devices are detected in a room, what does the radar report? `bermuda-presence.observations` | BLE area association and/or radar state with evidence type. A phone/tablet being detected is not proof its owner is present; radar cannot identify a person. No historical tracking or unauthorized household names. |
| `awnings` | Which awnings are extended, estimated position, wind alarm or sensor report age? `awnings.status`, `awnings.wind` | Configured cover state/position and wind evidence. Somfy RTS positions are travel-time estimates, not physical feedback. A stale/auto-cleared alarm is not proof of calm conditions or safety to extend. |
| `audio-sensor` | What sound level does the room sensor report, is it calibrated/online? `audio-sensor.level` | Selected source, dBFS versus estimated/calibrated SPL, offset/calibration evidence. Unweighted 1-second level is not an exposure-dose measure; no hearing-safety verdict, song recognition or conversation interpretation. |
| `backup` | How old is the latest local backup, how many archives, reported size? `backup.status` | The component's age/count/size sensors. Sentinel age 9999 with no archives means no backup, not a 9999-hour-old backup. Archive existence does not prove completeness, restoreability, encryption or an off-host copy. |
| `ramka` | Current mode/page/theme, configured rotation, radar-wake setting, component versions? `ramka.status` | Scoped helper states, rotation metadata and permitted inventory summaries. A configured screen-off mode is not proof of physical display power. Do not read photo contents, EXIF, private paths or full discovery registry dumps. |
| `remote-access` | What does remote access provide, and is the component listed as installed? `remote-access.explain` | Curated component explanation and authorized inventory identity/version/provenance only. No installation-configuration claim is supported. This component declares no live HA entities; never claim tunnel health, Internet reachability or security-policy effectiveness. No probing, hostnames, tokens, proxy lists or country rules in speech. |

Every component also supplies `<component-id>.explain`: a concise localized purpose, examples of
negotiated functions, and limitations, without advertising unimplemented controls. This answers
“What is this component for?” as distinct from a live status query. `remote-access` is intentionally
explanation-only until a later version adds an explicit live-status provider. Installed metadata is
not enough to make that status up. Newly added catalog components must declare either implemented
read capabilities or an explanation-only scope/reason; a catalog test guards matrix coverage.

### Shared rules for the added routes

- `subjectId` always selects a currently authorized subject from the capability list; it is mutually
  exclusive with `roomId`. Multiple possible players/weather sources without a unique endpoint default
  prompt for selection; no heuristic chooses the loudest room or an unrelated player. No selector means
  all authorized lights/presence sources/awnings, or the paired endpoint for frame status.
- Only `calendar.agenda` and `weather.forecast` accept dates. Default is today. `date` is ISO YYYY-MM-DD
  within today through local today + 6 days, mutually exclusive with `period`. `next_7_days` spans
  today plus six local dates. `nextOnly` selects the earliest ongoing/upcoming authorized event inside
  the chosen interval; it does not silently search farther into the future. Dates and “tomorrow” use
  HA's timezone and DST-aware local boundaries, not the tablet's UTC day or a fixed 24-hour duration. Past dates and dates after this interval return an
  explicit unsupported-range response. Help/examples must say “today, tomorrow or the next seven days”,
  never advertise arbitrary-date or historical calendar queries.
- Calendar/forecast adapters may invoke only the allowlisted read actions `calendar.get_events`
  and `weather.get_forecasts`, with server-selected authorized entities and validated date/type
  parameters. The model cannot provide a service/action name. No generic HA action API is exposed.
  Cache at most 60 seconds per user/grant revision, source and interval; invalidate on revocation,
  mapping changes or known source changes. Responses include fetch time and provider sync/issue time
  when available. Unknown provider sync age is explicit, not equated with the fetch time.
- Calendar reads can have materially different provider refresh schedules (see the calendar README).
  Say “HA shows no events” only after every queried authorized source succeeds; partial/failed reads
  cannot imply a free day. Omit descriptions, URLs, attendees and locations from model/speech by
  default. Titles and timestamps are the minimum useful exposed fields; titles remain untrusted text.
  Sort by start then source/id. Deduplicate only identical source+event identity, not matching titles
  across calendars. All-day end dates are exclusive; include overlapping multi-day events correctly.
- Bound responses to 100 events and 168 forecast periods. Providers unable to supply a complete result
  within those limits return `truncated` with no “nothing else” or complete-list claim. Speak at most
  three upcoming events; show the remaining authorized results. Forecast type (daily/hourly) and horizon
  come from the provider; unavailable periods are absent with a limitation, never interpolated.
- Global negatives (“all lights are off”, “nobody is home”, “everything is working”) require sufficient
  evidence for that exact scope. Use “among the lights shared with this frame” for endpoint subsets.
  No whole-home health conclusion may be synthesized from only the catalog's available sensors.
- Presence names and private calendar details require explicit per-endpoint exposure in existing
  administrator mapping/grants, default off for newly added sensitive capabilities. Metadata import
  cannot widen those grants. A grant to a temperature entity does not reveal a person's room.
- Media metadata left behind while stopped/idle is labelled previous/last known, not “now playing”.
  Buffering and pause are explicit states; no diagnosis from a 0.5–3 second track-transition state.
  Unknown format/service, player capabilities or volume is reported as unknown. No lyrics, web lookup
  or external music catalog is added. Mains W/V readings do not establish daily energy or cost.
- Group access does not grant child access. Before reading or counting any expanded bulb, independently
  check that child's HA permissions and endpoint exposure. Unauthorized children contribute no names,
  values or inferred counts to the response. If membership cannot be fully authorized, return only
  the permitted group observation with `basis: reported_group`; never reveal hidden child counts or
  derive a leaf-level all-off claim. Mixed authorized groups/children require an explicit nonoverlapping
  count plan, otherwise provide separate labelled observations without a combined count.
- Effective light state counts reachable leaf bulbs once, with explicit room membership. When only
  a group is available, count groups and label that unit; do not combine group counts with bulb counts.
  A template/group `off` with unreachable underlying bulbs has partial coverage. Brightness is a reported
  setting, not measured illumination. Battery or offline reports do not diagnose their physical cause.
- State-like entities need adapter-specific validity rather than the 900-second measurement default:
  an unchanged on/off value is not stale just because it has not changed. Check known source availability,
  integration connectivity/last successful update where exposed, and mark verification basis. If the
  adapter cannot establish current physical state, say “HA reports …”; do not invent an observation time.
  Wind uses its configured last-heard/alarm semantics; backup age/event timestamps keep their own meaning.
- None of these routes changes helpers, starts playback, turns lights on/off, moves covers, creates
  calendar events, runs discovery scripts, initiates backups or tests remote access. A request to do
  those things returns the explicit read-only limitation and may offer a relevant status answer.

### Typed payload additions

Each added answer type uses the same authorized envelope, evidence, limitations and coverage; rows
are discriminated by `answerType` rather than forced into the numeric measurement schema:

| Answer type | Allowed domain fields beyond common row id/subject/evidence refs |
|---|---|
| `environment.v1` | metric, numeric value/unit, room id, indoor flag, optional configured alert code |
| `media.v1` | player id/label, playback state, optional title/artist/album/source/service, reported format/quality, volumePercent, muted, metadataStatus=current/last_known/unknown |
| `reading.v1` | metric=power/voltage, numeric value/unit, scope=individual_meter |
| `lights.v1` | light/room id/label, state=on/off/unknown, optional brightnessPercent, countUnit=bulb/group, reachability, coverage |
| `calendar.v1` | calendar id, opaque event id, title, start/end as date or timestamp, allDay, ongoing, interval start/end, timezone, providerSyncAt nullable, truncated |
| `weather.v1` | source, condition code, typed measurements, optional forecast periods with validFrom/validTo and issueAt nullable, forecastType, providerSyncAt nullable |
| `presence.v1` | source id/optional exposed label, room id, observationKind=ble_device/radar_presence, detected/unknown, optional distance/unit, observedAt nullable |
| `awnings.v1` | cover id/label, state, positionPercent nullable, stateBasis and positionBasis=estimated/reported/observed, alarm on/off/unknown, lastHeardAt nullable, alarmBasis=reported/timeout_clear/unknown |
| `audio-level.v1` | source id/label, level, unit=dBFS/dB_SPL, calibrated boolean, basis=calibrated/estimate, integrationWindowSeconds, weighting=unweighted, online/unknown |
| `backup.v1` | archiveCount, newestAgeHours nullable, sizeMiB or sizeMB with explicit unit, reportedAt, verification=existence_only |
| `frame.v1` | endpoint id, reported mode/page/theme, enabled rotation ids, radarWakeEnabled, permitted component id/version list, physicalDisplayState=unknown unless separately observed |
| `component-description.v1` | component id/version, localized purpose/limitations, negotiated capability ids, basis=installed_metadata/manual_adapter, liveStatus=not_assessed |

Domain enums, numeric units/ranges, nullable fields and size bounds are closed in v1 schemas;
strings like artist/title/album/event title are bounded to 300 characters, never markup or instructions.
Percentages are 0..100; sound readings may be negative in dBFS; weather uses declared temperature,
pressure, wind, humidity and precipitation units without unvalidated conversions. Unknown optional
values are null/absent, not zero/false. No raw attributes map is permitted. Weather-specific bounds
and observation quality come from its adapter, not air-quality thresholds.

For these added types, summary contains counts/state codes only: media playing/paused/buffering/idle/off/
unknown/mixed; lights on/off/mixed/unknown; calendar events/none/unknown; weather observed/forecast/
unknown; presence detected/not_detected/unknown; awnings extended/retracted/mixed/unknown or
wind_alarm/no_reported_alarm/unknown, with mandatory summary basis=estimated/reported/observed;
audio measured/estimated/unknown; backup present/missing/unknown;
frame reported/unknown; description explained. `affected` counts matched authorized subjects, calendar
events or forecast periods as appropriate, with `coverage.unit` explicitly subject/metric/event_source/
forecast_source. Complete calendar coverage counts successful sources, not number of events. A zero
successful-source result is unavailable, never an empty but complete agenda. Original types retain
section 8's coverage interpretation. An awning state/position summary preserves the least certain basis of included rows. The formatter
must say “estimated” for travel-time-derived Somfy RTS state/position, or “HA reports” for reported
state without independent feedback; only an explicit feedback adapter can use `observed`. It may
never turn a qualified row into an unqualified “the awning is retracted” sentence.
Limitations add `provider_sync_unknown`, `provider_history_unknown`,
`reported_state_only`, `estimated_position`, `uncalibrated`, `truncated`, `no_live_status_provider`.

### Evidence validity by domain

`ready` means the requested **qualified assertion** has all its required evidence; it never promises
physical verification or that a cloud provider is current. Extend evidence freshness to
`current|stale|unknown|not_applicable` and allow `maxAgeSeconds: null` only for the explicitly
non-measurement bases below. Extend `freshnessBasis` with `reported_state`, `provider_response`,
`historical_event`, `installed_metadata`. Adapters cannot arbitrarily opt out of measurement freshness.

| Evidence kind | What makes a row usable | Missing age/verification semantics |
|---|---|---|
| Current numeric measurement/assessment | Current source evidence within its configured maximum age | Unknown/stale source evidence blocks a current assessment, as before |
| Reported light/media/cover/frame state | Valid known state from an available, non-restored entity; no known disconnected source | A missing last successful refresh time gives unknown freshness, null maximum age and mandatory reported-state qualification; this can answer what HA reports, not prove physical state |
| Calendar/forecast response | Successful authorized bounded read, valid dates/units and response time within the 60-second cache limit | Provider sync/issue time may be unknown; permit a qualified provider answer with `provider_sync_unknown`. Fetch time never becomes provider observation time |
| Historical event / backup artifact age | Valid timestamp or component-produced age/count from an available non-restored source | Age of the historical event/archive itself is not freshness: `historical_event`, maximum age null, freshness not_applicable. Current source validity is recorded separately; an old event does not prove absence of later unreported events |
| Component explanation | Valid version-matched definition and authorized installed/manual mapping context | `installed_metadata`, maximum age null, freshness not_applicable; no live-state claim |

For action-backed capabilities, help checks configuration/source availability and reports
`availabilityBasis: configuration_only` until an authorized recent response is cached; it does not
claim to have checked the agenda/forecast contents. Capability records otherwise use
`availabilityBasis: live_states|cached_response`, with `availabilityAsOf`. Query responses use their
own evidence and disregard that cached help status. Unknown provider synchronization does not make
all successful responses unavailable, but empty calendar wording remains “HA shows no events”, not
“you have nothing planned”. Failed sources still produce partial coverage or unavailable.

## 8. Answer envelope, language and trust

All new query responses have a versioned envelope:

```yaml
version: 1
capability: plants.watering_need
revision: 1
answerType: plant-watering.v1
asOf: '2026-10-31T10:00:00Z'
availability: partial
coverage: {eligible: 3, evaluated: 2, missing: 1}
summary: {status: needs_water, affected: 1}
facts: []       # typed rows, defined by answerType
evidence: []    # row/metric refs, timestamps/basis, policy id/revision and applied bounds
limitations: [stale]
```

Normative fact fields: `id`, `subjectId`, `metric`, `value` (finite number or null), `unit`, `status`
(`usable`, `missing`, `stale`, `invalid`, `unverified`), `evidenceRefs` (list of ids). Temperature rows
also have `roomId`, `label`, `indoor`; air rows have `assessment` (`good`, `raised`, `high`, `unknown`);
plant rows have `plantId`, `name`, optional `roomId`, and `problems` (bounded metric/status codes).
Event rows use `eventAt` (timestamp or null) instead of numeric value/unit and `basis: detected`;
estimate rows use `value` in whole days, `unit: d`, `basis: estimate`. Nullable fields never imply zero.

Evidence fields: `id`, `sourceRef`, `observedAt` (nullable timestamp), `reportedAt` (nullable timestamp),
`freshnessBasis` (`source_sample`, `source_report`, `provider_assessment`, `unknown`, plus the
non-measurement bases in section 7.1), `maxAgeSeconds` (positive integer, or null only as specified
there), `freshness` (`current`, `stale`, `unknown`, `not_applicable`), optional `policy` (id/revision, bounds, direction,
`source: configured|fallback`), optional `history` (`historyBasis`, `windowHours`, `coverage`, as defined above). Historical
event time is held on the event row, not substituted for report freshness.

`availability` is `ready` when all required evidence for the requested scope is usable, `partial`
when some is usable, `unavailable` when none is usable. `coverage` is counted in requested subjects
for temperature/plants and requested metrics for air; each subject is evaluated only when that
capability's required facts are usable. `eligible = evaluated + missing`. Optional missing facts do
not change required coverage but produce limitations. `summary` has `status` plus `affected`:
temperature `measured|unknown`; air `good|raised|high|unknown`; plant watering
`needs_water|within_band|too_wet|mixed|unknown`; plant status `problem|no_reported_problem|unknown`;
events `detected|unknown`; estimates `estimated|unknown`. `affected` is a nonnegative count of
subjects (metrics for air) matching the selected non-unknown summary status. These are machine codes;
formatters must still disclose partial coverage. Summary extrema reference actual fact ids.

Every fact carries its availability and freshness evidence. Coverage counts are calculated over
the authorized requested set before dropping bad readings; never count inaccessible sources.
Summary/evidence consistency is validated server-side and checked by the client. All values are
finite, timestamps include timezone, ids are bounded and no arbitrary HA state object is forwarded.

Ordinary responses expose opaque source refs; raw entity ids and full policy diagnostics stay in
the authenticated admin interface. Labels, component descriptions and calendar/plant names are data,
never instructions. No credentials, registry dumps or unrelated rooms are passed to QVAC.

Prefer deterministic formatting for all initial capabilities: conclusion, short reason, material
limitation. Typical speech is one or two sentences; detailed facts remain on screen. PL decimals use
correct forms (for example 22.5 with the Polish fractional degree form); EN uses English number/unit
phrasing. Changing HA session language cancels obsolete speech and invalidates localized caches as
in the existing app. If an LLM paraphraser is added later, it must not invent thresholds, causal claims,
facts, recommendations or actions; it is not needed to ship this contract.

## 9. Compatibility and artifacts

New optional manifest metadata, managed artifact path/envelope and negotiated operation schemas
become STABLE surfaces in `docs/COMPATIBILITY.md`; capability ids and revision meaning are STABLE,
new optional fields and reason/capability ids ADDITIVE-ONLY. Existing entity ids/attributes remain as
declared in component manifests, unchanged. No new helper or entity is required by this spec.
New consumers explicitly declare climate-air/plants/ramka dependencies; upstream HA roles are
documented without claiming ownership of their ids. SPEC-023's inventory remains tool-owned.

Old components with no assistant field continue rendering; old APKs retain existing profile, data,
calendar and air-assessment routes unchanged. New apps against old bridges use those routes for
supported topics, report unimplemented new domains unavailable and derive help only from negotiated
legacy topics; it must not imply the new calendar windows work through the today-only legacy route.
New bridges against old apps never add `plants` to the legacy three-topic enum. Maintain this bridge
for at least one minor release; removing it requires a separate deprecation proposal.

Managed: definitions/translations in the component; rendered assistant bundles in the home.
Instance/local: source/policy overrides and endpoint exposure in the existing mapping store/home
inputs. Preserve overrides across update, reload and rollback. Revocation clears access immediately.
No migration writes to HA settings or `.storage` merely because metadata was installed.

Expected implementation surfaces: component/schema/checker, build/install artifact mapping and
managed-file tests; metadata for all catalog components and Ramka live-policy adapter; Frame HA capability,
query and mapping adapters; Android negotiation, intent/formatters and PL/EN tests. This is a design
scope, not a multi-PR execution plan; an approved implementation plan will allocate repositories,
component versions, owners and release order. Update component UPGRADE files and framework
UPGRADE_NOTES when shipping. Do not reserve release versions in this draft.

## 10. Acceptance and verification

1. Catalog schema rejects unknown evaluators, executable fields, escaping paths, undeclared entity
   dependencies, missing translation keys and invalid policies. Old manifests still pass.
2. Fresh independent fictional homes: one installed through Domosenso, one vanilla with explicit
   mappings; equivalent facts produce equivalent capability/assessment semantics. No copied private
   state, fixed host, credentials or installed APK state is required.
3. Render/update/rollback round trips preserve overrides, managed hashes and inventory consistency;
   no `www` exposure. Catalog version mismatch, missing inventory and borrowed firmware entries
   cannot auto-enable queries. Vanilla adapter provenance remains explicit.
4. Permissions tests cover another endpoint/user, revoked device, hidden entity, renamed/missing
   sources, metadata reload and client-supplied ids. Filtering includes help, counts and evidence.
5. Temperature: room selection/ambiguity, negative readings, mixed supported units, indoor exclusion,
   unchanged-but-reported values, restored/template-stale sources, partial/no coverage.
6. Air: every threshold boundary/direction, score plus high pollutant, live helper update/fallback,
   conflicting policies, invalid units, missing policy, warm-up known/unknown and partial good data.
7. Plants: dry/wet/normal, unrelated problem flags, missing bands, night light with adequate historical
   peak, unknown watering history, detected-event wording, qualified short-history estimates,
   post-watering unknown estimate, stale
   underlying sources, translated names, ambiguous duplicates and more than three affected plants.
8. Help reports only configured, supported and authorized functions, qualifies temporary outages,
   negotiates legacy/new calendar help without duplicates, and never promises device control. Unknown revisions fail safely.
9. PL/EN intent, number grammar, summaries and language changes; no QVAC completion required for
   canned help/formatters. Existing wake model C, fullscreen/radar and calendar tests remain green.
10. Framework focused pytest, card parity fixtures, catalog check and required `tools/check-all.sh`;
    affected HA packages validate with error-log accounting. Bridge and app run their own checks.
    Runtime staging scenario: query, change a policy helper in the fictional instance, query again,
    revoke access, reconnect, verify no stale authorization/answer. Demo: run at implementation for
    this specific HA integration/reload risk; skip for this draft-only change. No physical speech or
    sensor sampling guarantee is established by document review or simulated fixtures.

### Additional acceptance for whole-catalog coverage

- A fixture enumerates actual catalog component ids and requires a contract coverage declaration for
  each. Adding a component requires a supported question set or explicit explanation-only reason.
  No installed-but-unimplemented capability is advertised. Remote-access remains explanation-only.
- Music: playing/paused/buffering/stopped with leftover title, missing artist/quality, multiple players,
  mute/volume versus sound level, optional W/V without invented kWh/cost; every adapter's permissions.
- Lights: Hue group on with unpowered bulbs, template room off with unavailable children, duplicate
  group/leaf inputs, group-only count, hidden/ungranted children and no inferred hidden count, subset scope, partial/unknown state, brightness versus lux.
- Calendar: today/tomorrow/next/date, interval bounds, ongoing/all-day/multi-day events, DST boundaries,
  permission filtering, two identical titles from different calendars, partial provider failure, stale
  or unknown sync time, empty success and truncated results. Legacy today-only clients remain valid.
- Weather: current versus forecast, unsupported hourly/horizon, probability versus certainty, mixed
  units, stale observations, unknown issue/sync time, no data and revoked source access.
- Presence: phone versus person, tablet left behind, radar without identity, stale BLE location,
  sensitive capabilities unexposed by default, no unauthorized person name/count leak in help or speech.
- Awnings: travel-time estimated position, delayed/missed wind report, timeout-clear versus observed
  all-clear; no ungrounded safety or causal statement about a retraction.
- Audio: uncalibrated versus calibrated, source change, offline, negative dBFS and known SPL offset;
  never infer hearing safety, a speaker's identity or a playing song from the spectrum.
- Backup/frame/remote access: sentinel no-backup age, old archive, permitted inventory subset,
  configured versus physically observed screen state; no restoreability, tunnel-health or hidden
  remote-access configuration claim. Verify age-not-applicable and unknown-provider-sync semantics.
- Fresh independent DomoSenso/vanilla fixtures cover the expanded set, including explanation-only
  components, missing adapters and per-user grants. Validate bounded read-action dispatch: attempts
  to call any mutating HA action through the new queries must fail before HA is invoked.

## 11. Website impact, exclusions and remaining validation

Website impact: document capability metadata and the component-specific supported questions when a
released version carries them. Keep any preview draft until its tag exists; do not advertise assistant
coverage based only on this spec or the whole catalog inventory.

Out of scope: device control, proactive calendar/air alerts, screen navigation, generic web questions,
new plant-care recommendations, health advice, arbitrary historical queries beyond declared derived
facts and the bounded future calendar/forecast windows, model/wake training,
licensing and redesigning HA settings. The bridge mapping UI may expose missing role/policy mappings;
the existing HA helper values and dashboard layout remain untouched by automatic setup.

Remaining engineering validation: fixture-test HA permission behavior, source report freshness
through each supported adapter, effective live air policy extraction, and model/device latency.
Unsupported provenance or policy shapes must yield explicit limitations, not guessed compatibility.
The proposed freshness defaults need sampling evidence before release and remain overrideable.
