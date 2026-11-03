# SPEC-032: Shared source selection and future component subjects

- Status: approved 2026-11-03 by the maintainer: "tak", including the requested timer diagnosis.
- Source: maintainer request to make newly configured plants available to the assistant,
  with an opt-in for all present and future plants, and configuration parity for supported sensors.
- Baseline: framework main `1376887`, Frame HA bridge main `f6659cd`; inspected on the date above.
- Scope: reusable source selection in the Frame HA integration, shared component metadata and
  compatible native presentation. Production deployment and remote publication are separate steps.

## Goal and placement

Configure a source once in HA and use its identity, name, room, readings and assessment policy
consistently on the frame and in answers. An administrator can expose all present and future
subjects of a supported component scope, or keep selecting individual sources. Existing homes
retain their current exposure until they opt in.

HA remains the configuration and permission authority. Components already provide normalized
semantic bindings; the bridge owns endpoint exposure. This is useful to any installation and
belongs in the shared projects, with private mappings remaining in the home/HA storage.
No new home-specific mechanism or Android copy of the component configuration is needed.

## Existing behavior and approach

Verified: the classic plants card dynamically discovers `plant.*` with the `domosenso_plant`
marker. The component's bindings use the same `_plant-rows.jinja` normalization as its package.
The bridge stores exact `assistant.component_sources` subject/role/entity references; new subjects
and changed source identities are not implicitly granted. Metadata currently loads at startup or
an explicit administrator reload. Android requests negotiated capabilities for each question.

Recommended approach: add declarative future-subject selection to the existing bridge resolver.
Reuse the component bindings and the same normalized manual adapters for display and assistant.
Duplicating lists in Android would retain the drift. Treating everything visible on an HA
dashboard as an authorization grant would change existing permissions and cannot establish semantics.
This approach was approved by the maintainer on 2026-11-03.

## Devices, integrations and inputs

No new hardware, service, model or cloud dependency. Target the repository-pinned HA 2026.9.2,
the compatible Frame HACS integration and existing app v1 answer schemas. Existing component
hardware recommendations remain unchanged; no additional tablet is claimed tested.

Inputs are administrator-owned endpoint settings in the integration's existing source editor:

| Input | Type/default | Meaning |
|---|---|---|
| Selection mode per supported scope | enum; existing explicit mode | `selected` or `all_current_and_future` |
| Explicit sources | existing references, unchanged | Exact individual role/source grants |
| Future scope | component/provider id, subject kind, approved read capability revisions and fact roles | Bounds what a dynamic selection may include |
| Exclusions | subject identity list; empty | Omit individual subjects from a dynamic scope |

A fictional example is `plants`, kind `plant`, existing plant read capabilities, all present and
future subjects except `plant.office_fern`. Persist bounded, validated data, not wildcard entity
patterns or executable rules. Exact serialization belongs to the bridge schema and tests.
No YAML editing is required to choose or change exposure.

## Resolution and configuration parity

1. Normalize installed component bindings and manually configured sources into one server-side
   subject representation. Reuse shared categories/kinds for grouping, never as authorization or
   measurement evidence. Floorplan geometry and inferred room names remain presentation only.
2. Resolve selection, exclusions and overrides per endpoint. Manual fields retain precedence and
   their matching policy; a component policy must not attach to a replaced manual sensor.
3. A dynamic scope follows new subjects and current source bindings for the approved roles of its
   verified component. This includes a configured replacement sensor. State this clearly in the UI.
   New capability revisions, roles, subject kinds and operations need another explicit grant.
4. Intersect with current HA read permissions, adapter support and client negotiation at every
   request. Dynamic selection does not grant write actions or turn on calendar/presence access.
   Existing sensitive gates continue to apply, even for explicitly selected dynamic scopes.
5. Use the resolved subjects for bridge-backed display data and assistant answers. Keep existing
   response schemas where possible. Android must not hold a separate editable list of plant ids.
   An unanswered topic reports missing mapping, stale evidence or incompatibility accurately.

Implement the generic policy for existing metadata-backed read scopes, with end-to-end acceptance
for plants and climate-air (temperature, humidity and supported air measurements). Apply the same
resolver to other already implemented read adapters; do not advertise unsupported interpretations.
Component explanations retain their existing separate opt-in.

Vanilla HA uses the existing manual adapter configuration as its normalized subject collection.
In dynamic mode, adding a compatible subject there also exposes it to the assistant without a
second selection. Newly discovered, unmapped sensors remain candidates until their roles are
configured. Do not infer plant thresholds, indoor/outdoor meaning or freshness from entity names.
Automatic discovery of every vanilla HA device is outside this increment.

The classic HA dashboard continues to use its HA configuration and existing discovery. It does not
become restricted by assistant exposure: viewing a plant and allowing voice access are distinct.
Parity means shared semantics and no duplicate mapping once exposure is enabled, not identical
permissions on all screens. The source editor shows discovered, selected, excluded, unsupported
and incomplete counts/reasons, including why a visible subject cannot currently be answered about.
Do not modify unrelated HA dashboard settings or the ongoing layout editor work.

## Refresh, removal and failure behavior

- A normal component input update must render/deploy both the HA package and private bindings.
  A sensor created only in HA does not magically enter a DomoSenso component's configuration.
- Reload on startup and inventory changes. Also detect changes to private metadata independently
  of inventory version: adding a plant may leave the component version and commit unchanged.
  Use a bounded asynchronous file-change check, at most 30 seconds while integration is active,
  plus the existing explicit reload. No disk I/O on the HA event loop; no new APK or pairing needed.
- Validate an affected bundle completely and publish one atomic resolver snapshot/revision.
  Changed invalid or missing bundles disable their dynamic sources; do not serve the last good
  bundle as current evidence. Reconcile partial deploys on subsequent checks.
- Invalidate relevant capability/answer caches on source revision, grant or permission change.
  Concurrent answers cannot publish data from a revoked selection. Cancel refresh tasks/listeners
  on integration unload; unchanged metadata must not cause repeated reloads.
- Removing a configured subject removes it from dynamic results. A retained unavailable source
  stays configured with an unavailable status. Neither case produces invented values.
- Exclusions use provider + stable subject key. A label change retains the exclusion. A changed
  subject key is a new subject under the explicitly enabled future-subject rule; document that
  distinction. Do not silently rewrite existing explicit grants after source identity changes.

## Provides, consumes and ownership

- No new public HA entities or services. Existing stable entity identifiers stay unchanged.
- Consume verified SPEC-029 bundles, installed inventory, existing manual adapter subjects and
  current HA permissions/state. No additional cross-component entity dependency is introduced.
- Bridge source-selection storage and resolver diagnostics gain an explicitly versioned extension;
  retain the existing mappings protocol and read routes for clients that lack its editor support.
- Component definitions/bindings remain managed framework artifacts. Selection, exclusions and
  manual overrides remain instance-owned integration storage. Do not put them in public assets.
- Native app renders resolved data and negotiated answers; no component-specific household ids,
  thresholds or credentials enter its source code or release artifact.

## Compatibility and rollout

Absent new configuration means current behavior, including legacy mapping/enrichment semantics.
An empty explicit selection still means no selected component sources. Never migrate an existing
home to all-future automatically. Saving an unrelated field must preserve the new policy and
reject stale revisions rather than erase it. Old clients must not be able to overwrite unknown
selection state through a partial save.

Use a storage migration with a pre-migration backup. A downgrade restores the compatible backup;
do not encode dynamic grants as thousands of materialized explicit grants. Keep old explicit
selection behavior for at least one minor release and document the new opt-in in bridge upgrade
notes, framework `docs/ASSISTANT.md` and `docs/COMPATIBILITY.md`. Bump affected component versions
only if their shipped contracts/artifacts change, not merely for the new bridge resolver.

Implementation order: bridge policy/resolver and refresh, source-editor controls/diagnostics,
shared display projection as needed, client compatibility checks and shared setup documentation.
No speculative Android release if existing parsers already handle the resulting data correctly.
Website impact: explain automatic exposure in setup documentation when released; do not publish
unreleased behavior as available. This draft has no website/runtime impact.

## Acceptance and validation

1. Fresh independent DomoSenso HA: enable future plants with two fictional subjects; add a third
   through normal inputs/render/deploy, without changing component version. After refresh, both
   display and assistant see its matching name, room, readings and policy without remapping/APK.
2. Repeat with temperature/humidity and a supported air metric; no duplicate subjects/rooms.
3. Explicit-only endpoint does not expose the new plant. Exclusion, permission denial, missing
   metadata and unsupported capability revision each prevent exposure independently.
4. Test replacement sensors, manual overrides, label/key changes, removals and unavailable/stale
   readings. No old policy joins the wrong source; freshness requirements remain unchanged.
5. Fresh vanilla HA: configure manual sources once, select dynamic adapter scope, add another
   mapped subject; display and assistant agree. An arbitrary unmapped entity is not exposed.
6. Exercise restart/reload, same-version metadata replacement, partial/invalid files, concurrent
   saves/queries/revocation, unload cleanup, persisted exclusions and downgrade backup restoration.
7. PL/EN source-editor wording and assistant answers; existing app parser/formatter tests verify
   new subjects and capability refresh. Use a tablet only after a separately authorized deployment.
8. Focused bridge unit/DOM tests and isolated HA smoke, framework affected tests and full
   `tools/check-all.sh` before any framework commit. Runtime demo/staging is warranted for metadata
   refresh and cross-surface behavior; unit tests alone are not runtime acceptance.

## Non-goals and remaining checks

No wake-word/model change, new control commands, dashboard redesign, plant medical diagnosis,
automatic access to arbitrary HA entities, or changes to production settings in this spec task.
The exact minimum bridge/app release and which display payloads need extension must be established
by implementation tests; present inspection does not prove existing app compatibility for every
subject kind. Larger category discovery for vanilla HA requires a separate scoped design.


## Implementation clarification, 2026-11-03

Manual adapter subjects are already explicit assistant grants in the existing bridge. Reuse them
for display without introducing a redundant manual-kind permission toggle. Component dynamic
policies alone use the new scope selector. Existing manually mapped display overrides remain
preferred. Attribute-backed room metrics need a display adapter; do not substitute entity state.
The implemented scope schema is `source_policy: {version: 1, scopes: [{component, kind, roles,
capabilities: {<read-id>: <revision>}, exclude: [<subject-key>]}]}`. An omitted policy on an older
editor's unrelated save is preserved. A pre-policy storage envelope supports downgrade recovery.
