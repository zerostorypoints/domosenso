# HiFiSync in Frame Studio v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an HA administrator see the HiFiSync system and room for a player and enable their screens for one Frame without applying a different template.

**Architecture:** HiFiSync grants read access to eligible systems and HA remains the owner of the selected player and system. Frame HA supplies the Studio summary and composes the effective Music playlist. The paired Frame reports Room interactions while HA owns the rotation clock.

**Tech Stack:** Home Assistant custom integrations, Python and pytest, Studio ES modules and Node tests, Android Frame and a pinned Studio bundle.

**Spec:** [SPEC-052](../../../.ai/specs/SPEC-052-2026-11-15-hifisync-frame-v1.md), building on [SPEC-050](../../../.ai/specs/SPEC-050-2026-11-14-hifisync-studio-pilot.md).

## Global constraints

- Optional in HA and per panel. New panels start off. Keep explicit pilot opt-ins and the existing status sensor.
- Paste one 90-day read-only token into HA. Keep the production default and supported HTTPS Preview origins, including the requirement that the token comes from the selected environment.
- Preserve saved templates, layout history, existing scheduler ownership, player registry binding and system UUID. Reuse compatible pilot pages once.
- New System and Room pages use 15 seconds each. Room interaction resumes the remaining time after 30 seconds of inactivity. Independent manual pause remains effective.
- Show Polish and English UI according to the Ramka configuration. Preserve other supported locales and source names.
- Use fictional systems and room names in shared tests, screenshots and documentation. No household data in the catalog.

## Review focus

| Risk | Check |
| --- | --- |
| Changing the player in an unsaved Studio draft shows the previous player's private names. | Tasks 1 and 4 verify the summary is keyed to the current candidate and cleared on endpoint changes. |
| Toggling a panel at the saved template page limit drops a custom page or adds duplicate pilot pages. | Task 2 tests a full saved template and an existing HiFiSync template. |
| Expiry, revocation or a player change during a hold retains data from the previous room. | Tasks 1, 3 and 5 verify validity, fallback and rejection of obsolete interaction messages. |
| A drag or pinch spans a scheduled transition, or its final event never arrives. | Tasks 3 and 4 exercise touch ownership, the monotonic clock, disconnect and a bounded timeout. |
| Upgrading only one side exposes the wrong layout or makes Studio unusable. | Task 5 verifies mixed versions and an independent HA with the connector omitted. |

## Baseline and pull-request order

- [ ] Verify owning repository remotes, clean starting revisions and tested pilot ancestry before creating named task worktrees. Locally observed review baselines are DomoSenso `6b8023b` (#309 on `origin/main`), Frame HA `b6beea6` (0.4.1), Frame Android `1ecddf0` (Studio 0.2.6), the connector `0ef02af` (0.1.1) and HiFiSync's grant fix `2c74a7f0f`. These are starting points for reconciliation. Frame HA and Frame have newer main-line work to preserve, and the connector checkout has no configured remote.
- [ ] Land the approved spec and plan in the DomoSenso coordination branch `feature/hifisync-frame-v1` based on verified main. Under `docs/TEAM_WORKFLOW.md`, DomoSenso sub-PRs target that branch. Use corresponding task branches and each owning repo's review workflow for cross-repo changes. Record PR links, integration commits and task status here during execution. Verify the connector's authorized distribution destination before opening a remote PR or shipping HACS instructions.
- [ ] Establish whether the target HiFiSync revision already contains and passes the grant migration, scoped list/detail API and expiry/revoke settings. Reuse the pilot web contract. If the target branch lacks necessary pilot commits, prepare a narrowly scoped HiFiSync prerequisite PR using `docs/runbooks/home-assistant.md`, the account-settings tests, `packages/web/lib/integrations/home-assistant/` and `supabase/tests/home-assistant/`. Run the runbook's web and SQL checks against an isolated environment before connector acceptance.

## Task 1: Local player summary in HiFiSync for HA

**Repo and files:** `hifisync-home-assistant` · `custom_components/hifisync/__init__.py`, `core.py`, `const.py`, `tests/test_ha.py`, `tests/test_core.py`, `README.md`.

**Interface:** Add `hass.data["hifisync"]["studio_link_v1"](entity_id: str)` for the existing registry-backed binding. Return `None` for an unmatched player, or `{status, systemName, roomName}` for the matched player. Names are nullable and available only from a local snapshot within SPEC-050's validity rules. Reuse the readiness states and indicate a stale-but-valid snapshot with `stale`. Keep `studio_snapshot_v1` as the separate display-data provider.

- [ ] Add tests for idle playback, player registry rename, an unmatched player, missing room, valid stale data and data cleared after expiry, revoke, unload or selection change. Assert that neither token nor room geometry is in the summary.
- [ ] Run `python -m pytest -q tests/test_core.py tests/test_ha.py` in the repo's Python 3.14 test environment from `requirements-test.txt`. Confirm the new assertions fail with the summary absent.
- [ ] Register and remove the summary provider alongside the existing snapshot provider. Share the current registry and cache checks, with no network request on a Studio read. Document the setup and repair path in the connector README.
- [ ] Run `python -m pytest -q` in the same environment. Commit the tested connector change.

## Task 2: Panel preference and effective playlist in Frame HA

**Repo and files:** `domosenso-frame-ha` · `custom_components/domosenso_frame/studio_api.py`, `studio_mappings.py`, `studio_data.py`, `hifisync_bridge.py`, and `tests/test_hifisync_bridge.py`, `tests/test_hifisync_rotation.py`.

**Interfaces:** Reuse the revision-checked `studio_mappings_update` patch keys `hifisync` and `media`. For an opted-in admin Studio request, add optional `hifisyncLink` to permitted `candidates.media` rows using Task 1's summary, plus an installed/available marker at the mapping response level. Introduce an additive request capability `hifisyncStudioVersion: 1` for the new admin and display behavior; advertise support before clients send it. The existing snapshot/drawing negotiation remains in place.

- [ ] Add bridge tests for missing connector, idle summary, forbidden candidate, one of two panels toggled, the former pilot template, an unrelated custom music page, and a saved layout with 16 music pages. Assert that the saved template and its revision are identical before and after the toggle and runtime projection.
- [ ] Run `python -m pytest -q tests/test_hifisync_bridge.py tests/test_hifisync_rotation.py` in the bridge's test environment. Confirm the added cases fail before implementation.
- [ ] Resolve the per-player summary through the existing admin, candidate and player checks. On compatible displays derive the playback playlist in memory. Anchor on Now Playing or the first unconditional custom page, place System and Room after it, retain the rest in order and reuse pilot layouts and durations. Permit 18 pages in the negotiated runtime view while saved template writes keep the 16-page limit. Let the server-side Studio selector drive only the compatible panel's Music playlist while the preference applies. Keep installed scripts authoritative for mode and other pages. Reset the Music cursor to Now Playing when its mapping or access changes.
- [ ] Run the two focused test modules and the bridge's affected mapping and authorization tests. Commit the bridge change.

## Task 3: Room rotation hold in Frame HA

**Repo and files:** `domosenso-frame-ha` · `custom_components/domosenso_frame/studio_runtime.py`, `studio_actions.py`, `studio_api.py`, `studio_data.py`, `tests/test_hifisync_rotation.py`.

**Interface:** In the negotiated Room snapshot, provide an opaque `roomVisitId`. Accept a paired display action `{kind: "room_interaction", action: "begin" | "progress" | "end" | "touch", visitId, gestureId?}`. Require a gesture ID for begin, progress and end. Touch covers a discrete selection or zoom. Validate the paired session, current playback projection and visit before changing HA's clock. Renew or end only the matching gesture. A visit is replaced on re-entry even if system and layout revisions match.

- [ ] Add monotonic-clock tests for begin near the page boundary, a gesture longer than 30 seconds, renewal at 29 seconds, resuming the remaining time, an independent manual pause, both swipe directions, disconnect, loss of access and delayed messages from a previous visit.
- [ ] Run `python -m pytest -q tests/test_hifisync_rotation.py`. Confirm the new hold tests fail before implementation.
- [ ] Freeze elapsed page time from the first hold. While a gesture is active, use the same 30-second deadline as an inactivity watchdog. Renew it on accepted progress no more than once per second per gesture. On end or a discrete action, set the deadline to 30 seconds from that interaction. Resume the remaining time at expiry. Clear the hold on manual departure, access loss or playback end and invalidate ownership on disconnect. Keep the existing manual pause independent.
- [ ] Run rotation and bridge tests again, including the authorization cases. Commit the clock and action changes.

## Task 4: Studio setup and Room interactions

**Repo and files:** `domosenso` · `packages/frame-studio/studio.js`, `studio-model.js`, `frame-ui.js`, `contract.js`, `renderer-i18n.js`, `studio.test.mjs`, `renderer.test.mjs`, `contract.test.mjs`, `tools/build_hifisync_drawings.mjs`.

**Interfaces:** Studio reads Task 2's summary for the player currently selected in the draft and saves the existing panel preference with the media mapping. The renderer reads Task 3's current `roomVisitId` and sends validated gesture events through the existing Frame action transport. Use the pinned HiFiSync drawing adapter as the gesture source. If the necessary lifecycle is owned by the shared HiFiSync drawing, change its optional Studio hook there and regenerate the DomoSenso bundle using the pinned source revision.

- [ ] Add tests for PL and EN copy, an unsaved player change, endpoint change during a response, missing room, disabled and repair states, and saving the mapping while the template is dirty. Assert that the save calls the mapping update and no template write.
- [ ] Add renderer tests for 18 runtime pages with the saved limit still at 16, speaker tap and keyboard, rotation and zoom gestures, swipes starting outside controls, and selection retention through a benign Room redraw. Exercise the renderer receiving a page update while a valid gesture begins and receiving an authoritative fallback while offline or access expires.
- [ ] Run `node --test packages/frame-studio/{studio,renderer,contract}.test.mjs`. Confirm failure for the missing summary/hold behavior.
- [ ] Add the player summary and switch under Music Sources. Render bounded state and the appropriate HA repair action. Keep German support and use the established HA/Studio locale selection. Add the Room interaction events at the existing interactive drawing boundary. While a gesture is owned, renew every five seconds and stop renewing on end, cancel or view disposal. Retain the selected speaker for the current visit, recompute its details from fresh data, and clear it on departure or disappearance.
- [ ] Run the focused tests, `npm test` and the repository's required checks before commit. Build Studio with `node tools/build_frame_studio.mjs <artifact-directory>`. Capture the changed Studio configuration and tablet views with fictional data under the framework PR evidence convention.

## Task 5: Pair compatible artifacts and accept the release candidate

**Repos and files:** `domosenso-frame` · `src/display/protocol.ts`, `src/display/PackagedDisplay.tsx`, `src/display/session.ts`, `App.tsx`, `tests/display.test.mjs`, `tests/display-lifecycle.test.mjs`, `frame-ui.lock.json`, `vendor/frame-ui/`. Update matching generated Frame HA assets and the DomoSenso [integration guide](../../integrations/hifisync-studio-pilot.md), plus upgrade notes for affected released surfaces.

- [ ] Add mixed-version checks. Verify an updated app with the pilot bridge and a pilot app with the updated bridge retain their supported view. Verify obsolete visit actions fail, a current visit can be held, and invalid private data expires in the client.
- [ ] Wire capability detection and the action through the existing app transport. Import the same Studio artifact into Frame Android and Frame HA. In Frame Android run `node scripts/import-frame-ui.mjs <artifact-directory>`, `npm run verify:frame-ui`, `npm run typecheck` and `npm test`. Match the Frame HA asset manifest to the same build output and record both checks.
- [ ] Install the exact connector and Frame HA candidates on a fresh isolated HA, initially with the connector omitted. Validate two panel preferences, a private fictional system and token from a controlled HTTPS endpoint, and PL/EN setup. Run the acceptance sequence with missing room, deleted system, revoked token, normal playback and a preserved customized template. Use the existing pilot procedure for pairing.
- [ ] Prepare the signed candidate and verify on a test tablet once that installation is authorized. Exercise rotation, swipe in both directions, interaction across a natural page boundary, the 30-second hold and persistent speaker details. Record which checks ran in the browser, isolated HA and on the physical tablet.
- [ ] Record tested HA, connector, bridge, renderer and Android revisions and hashes. Document clean setup, optional use with ordinary HA, Preview, update, repair and rollback. Prepare the reviewed PRs, with connector/bridge and app availability coordinated before recommending the update. Keep production deployment and publication to their respective authorized release steps.

## Release and rollback

- Release candidate order: verified HiFiSync endpoint, connector, matching Frame HA and Frame artifacts, then public setup instructions. The connector can be installed and configured independently of Frame.
- Demo: run for the framework PR when it can exercise the actual Studio sources and reconnect behavior. Use independent HA and physical tests for integration and hardware paths the fictional demo cannot cover.
- Website impact: review the Ramka catalog entry and integration instructions when the tested builds are available. Keep feature claims in draft until matching releases exist. Use the website audit at merge/release preparation.
- Rollback: switch off the panel feature first. That restores the existing music layout without applying a template. If needed, restore compatible Frame/bridge artifacts together. Disconnect HiFiSync in HA and revoke the account grant when retiring the link.
