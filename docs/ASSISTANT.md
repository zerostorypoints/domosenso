# Component-backed assistant answers

Implementation of [SPEC-029](../.ai/specs/SPEC-029-2026-10-31-assistant-component-contract.md).
This contract is unreleased. Component metadata, a compatible Frame HA bridge and a compatible
Frame app are required together; a file in the catalog alone does not enable voice answers.

## Shared metadata with the floorplan

SPEC-028 Amendment 5 made `categories/` catalog-wide. Its definitions, `kinds/` and `devices/`
classify hardware and additional roles; the CLI and floorplan share category fixtures and generated
rules. Reuse these definitions for discovery and grouping. A category is not a capability, an
entity binding, an assessment policy or a permission grant. For example, a climate role does not
establish that a measurement is indoor temperature or authorize reading it.

The HA entity/device/area registry owns installed identities and explicit location relationships.
Floorplan geometry, manually joined hardware and inferred room-name matches serve presentation;
they must not silently become assistant authorization or authoritative room identities. Component
metadata owns domain semantics: plants already publishes `sensors`, `domosenso_names`,
`domosenso_rooms` and `domosenso_bands` used by cards. The assistant bindings template reuses the
same `_plant-rows.jinja` normalization as the plant package, rather than defining another set of
names, sources or thresholds in Android.

The runtime path is therefore: shared catalog discovery, installed component definitions and
private bindings, endpoint exposure and HA permissions, typed query/evidence, then localized
screen and speech presentation. `assistant.yaml` adds supported questions, required facts,
freshness and interpretation to the shared metadata. Existing query/answer types remain bounded
implementations in the bridge and app; metadata alone cannot introduce an arbitrary new operation.

A working floorplan or plant card does not prove that the assistant is connected. Diagnose these
separately: the compiled private bundle exists; its provenance matches the installed inventory;
the endpoint exposes the required source roles; the HA user can read them; and the reported values
have sufficient evidence. Do not work around a missing bundle by accepting category membership,
entity-name guesses or a fresh timestamp on an aggregate as proof of a current measurement.

## Installation and update

Use a current source checkout of the catalog tooling (`uv sync`; Python 3.11.4 or newer). A home
keeps its normal input files and component lock. No helper values or dashboard settings need to
change. Explicit endpoint exposure is still required and is stored by the Frame integration. Upgrade the tooling before adopting component releases that declare `assistant`.

1. Install a compatible Frame HA integration through HACS and pair the Frame app using its wizard.
2. Update the selected components using their released tags and the normal `domosenso update`
   workflow. Before release, developers use `render --catalog-dev <owned catalog worktree>` only
   with an isolated staging home. Do not publish a tag merely to test a branch.
3. Inspect `deploy staging --plan`. Each compiled bundle appears under
   `domosenso/assistant/<component-id>.yaml` in the HA config directory. Deployment uses the normal
   hash check, backup and restart. The files must never be served under `www` or included as YAML
   packages. They contain private entity mappings and labels.
4. In the integration's **Assistant sources** view, select the frame, review verified component
   bindings and save the intended sources. Component explanations are separately opt-in. Calendar and presence are
   sensitive and require explicit exposure. Automatic component discovery is a suggestion, not a
   permission grant. HA user permissions still apply to each source.
5. Ask what the assistant can do, then a question in the HA user's Polish or English language.
   Only negotiated, mapped and authorized topics should appear. Keep an unavailable source mapped
   to verify that the assistant describes the missing data instead of answering another topic.

Vanilla HA uses the bridge's versioned manual adapters and the same endpoint mapping editor. It
requires no inventory sensor or YAML editing. Manual bindings are explicitly identified as such;
they do not pretend that DomoSenso installed a component. Local mapping overrides survive component
updates. Removing a component never automatically converts its contract into a manual adapter.

## What the contract can describe

| Component | Read scope |
|---|---|
| climate-air | Temperature, humidity, measurements and assessment against configured policy |
| plants | Moisture band, supported problems, detected watering and qualified HA estimate |
| media | Reported playback, track metadata, volume, explicitly mapped power and voltage |
| lights | Shared light/group states and reported brightness, with permission-safe counts |
| calendar | Today, tomorrow or the next seven local dates, including ongoing/all-day events |
| weather | Current conditions and available bounded forecasts |
| bermuda-presence | Explicitly exposed device/radar observations, without inferring identity |
| awnings | Reported/estimated cover state and wind evidence, without a safety verdict |
| audio-sensor | Typed sound level and calibration status, without a hearing-safety verdict |
| backup | Archive age, count and size; existence is not a successful restore test |
| ramka | Reported mode, page, theme, rotation and radar-wake configuration |
| floorplan | Purpose and installed metadata; no plan editing or occupancy inference |
| remote-access | Purpose and authorized installed metadata only; no tunnel-health claim |

Every component also defines a short explanation. Read scope never implies control: this contract
cannot switch lights, operate covers, start playback, create events, initiate backups or change HA.

## Evidence and troubleshooting

- `needs_mapping`: the endpoint has no confirmed source roles. Map the sources; do not infer them
  from names or copy another home's entity ids.
- `contract_mismatch`: the bundle's version/commit/dev provenance does not match the installed
  inventory, or a schema/evaluator is unsupported. Render and deploy the matching pinned revision.
  Firmware borrowed through an ESPHome package alone cannot activate a contract.
- `stale` or `unknown_freshness`: a current measurement cannot be established. An unchanged value
  may still be current; a template heartbeat or restored state does not prove a fresh sample.
- `missing_policy` or `conflicting_policy`: numeric readings may be available, but an assessment is
  withheld. Bind one policy to the exact metric, entity and unit. Live threshold helpers take
  precedence over the fallback from that same component revision.
- Reported light/media/frame state is qualified as what HA reports. Estimated cover positions and
  plant forecasts remain estimates. A fetched calendar/forecast does not prove provider sync time.

Metadata reload must validate the whole affected bundle before enabling it. Invalid reloads disable
queries for that contract; retained old data is diagnostic only. Permission or mapping revocation
must invalidate cached answers. Calendar/forecast caches may last at most 60 seconds and are scoped
to the user, grant, source and requested date window.

## Development checks

Run `uv run pytest -q tests/test_assistant_contract.py tests/test_assistant_bindings.py
 tests/test_cli_build.py tests/test_cli_deploy.py tests/test_ha_check_harness.py` (as one line), then
`tools/check-all.sh` before a commit. The framework checks validate schema, declarations,
translation completeness, defaults and the private managed-file lifecycle. Bridge tests must prove
per-source permissions and domain evidence, while app tests prove PL/EN phrasing and lifecycle
cancellation. Unit tests are not physical tablet, voice-quality or live-provider acceptance.

Use only the fictional demo home in shared fixtures. Household labels, addresses, calendars,
tokens and real entity ids belong in the private home repository, never this catalog.

The Frame integration stores selected component source identities as references, not copies of
labels or thresholds. A compatible component update can update its descriptions and policy; a
reassigned source or new role requires renewed selection. Removed/mismatched metadata disables
component-backed queries. Vanilla manual mappings remain a separate, explicit path.

For a cross-repository bootstrap test, `uv run python tests/generate_assistant_profiles.py <fresh-test-config>` emits three fictional compiler bundles (climate-air, plants and floorplan). Use that directory as the Frame bridge smoke test config, following its `docs/assistant.md`. The test must load the real bundles, supply matching fictional inventory, pair a test device and reject queries after revocation. This is HA bootstrap and handler evidence, not an HTTP/WebSocket transport or physical-device test.

After explicit component-source selection is enabled for a frame, an empty selection remains
an explicit opt-out. Legacy entity-level artifact enrichment must not reactivate a removed or
reassigned role. Direct/manual adapters stay separate. A shared ambient sensor does not make two
plants the same subject; plant identity and assessment-source identities must remain distinct.

## Pending component releases

These versions are prepared on the feature branch, not published tags. Release only from the
reviewed commit after it reaches `main`; existing tags must never be moved.

| Component | Previous version | Prepared version |
|---|---|---|
| audio-sensor | 0.3.0 | 0.4.0 |
| awnings | 0.2.1 | 0.3.0 |
| backup | 0.1.0 | 0.2.0 |
| bermuda-presence | 0.2.1 | 0.3.0 |
| calendar | 0.1.0 | 0.2.0 |
| climate-air | 0.2.0 | 0.3.0 |
| floorplan | 0.3.1 | 0.4.0 |
| lights | 0.2.0 | 0.3.0 |
| media | 0.1.0 | 0.2.0 |
| plants | 0.3.1 | 0.4.0 |
| ramka | 0.11.0 | 0.12.0 |
| remote-access | 0.1.0 | 0.2.0 |
| weather | 0.1.0 | 0.2.0 |


## Future sources and configuration parity (SPEC-032, development)

A compatible Frame bridge offers **All current and future sources** per supported component
scope. This is an explicit endpoint opt-in with individual exclusions. A new plant configured
through the component's inputs and normal render/deploy becomes available to answers without a
second mapping or APK. Existing selections stay unchanged until the administrator opts in.
Component names, rooms, measurement sources and assessment policies remain authoritative;
existing manual overrides keep precedence. Only approved read roles/capability revisions are
included, and HA permissions and sensitive-data gates still apply to every request.

The bridge detects changed private bundles within 30 seconds, including input updates that retain
the same component version and commit. Missing or invalid bundles disable their dynamic sources.
Plants and supported room measurements feed bridge display and assistant from the same resolved
subjects. The classic HA cards retain independent visibility; being visible is not a voice grant.
Vanilla HA manual adapters are configured once; unmapped sensors remain discovery candidates.
See [SPEC-032](../.ai/specs/SPEC-032-2026-11-03-assistant-source-parity.md) for boundaries and acceptance.
This is a development contract pending bridge release, not an automatic upgrade of an installed home.
