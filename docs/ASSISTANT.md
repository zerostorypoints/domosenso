# Component-backed assistant answers

Implementation of [SPEC-024](../.ai/specs/SPEC-024-2026-10-31-assistant-component-contract.md).
This contract is unreleased. Component metadata, a compatible Frame HA bridge and a compatible
Frame app are required together; a file in the catalog alone does not enable voice answers.

## Installation and update

Use a current source checkout of the catalog tooling (`uv sync`; Python 3.11.4 or newer). A home
keeps its normal input files and component lock. No helper values or dashboard settings need to
change. Upgrade the tooling before adopting component releases that declare `assistant`.

1. Install a compatible Frame HA integration through HACS and pair the Frame app using its wizard.
2. Update the selected components using their released tags and the normal `domosenso update`
   workflow. Before release, developers use `render --catalog-dev <owned catalog worktree>` only
   with an isolated staging home. Do not publish a tag merely to test a branch.
3. Inspect `deploy staging --plan`. Each compiled bundle appears under
   `domosenso/assistant/<component-id>.yaml` in the HA config directory. Deployment uses the normal
   hash check, backup and restart. The files must never be served under `www` or included as YAML
   packages. They contain private entity mappings and labels.
4. In the Frame endpoint's mapping editor, share the intended sources. Calendar and presence are
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
