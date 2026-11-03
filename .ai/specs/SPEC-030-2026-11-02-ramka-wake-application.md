# Ramka wake application

Status: approved 2026-11-02 (maintainer: implement SPEC-030). Source: maintainer request to complete return to Frame after voice and radar wake.

## Goal and placement

Wake the installation's chosen Android dashboard application. Home Assistant Companion already
provides `command_launch_app`; reuse it, without another native foreground watchdog. This belongs
in Ramka because a second installation can run either Companion or a separate Frame application.
HA remains the sole owner of radar transitions, brightness and sleep delays.

## Devices and integrations

Existing Android tablet, Companion notification transport and permissions; no new integration.
Current package uses Companion commands on the tested TCL 9469X. Launch of the separate Frame
package through the existing wake script still needs physical acceptance; long Doze and process
death are not covered by a short wake cycle.

## Input

Optional `tablet_wake_package`, type string, default `io.homeassistant.companion.android`.
Example `com.domosenso.frame`. Require an Android package identifier with at least two dot-separated
identifier segments; reject malformed values at render time. Null has the usual absent meaning.
This is installation wiring, alongside `tablet_device`, not a new live HA preference or helper.

## Behavior and contract

The existing `<prefix>_screen_on` script keeps every screen and brightness command and its order.
For the default package, preserve the existing Companion `app_importance` conditional launch.
For a different package, send its launcher intent at the existing wake point regardless of
Companion importance: that sensor reports Companion, not the selected application. Do not add
polling, periodic launches or an application-to-application foreground race. Never launch the
selected application from the screen-off script. No new entities, events or cross-component
consumption; existing provided entities and helper options remain unchanged.

## Artifacts and ownership

Manifest and managed `templates/package.yaml.j2` in the catalog; installation's input in its home
repository. README, UPGRADE and tablet setup explain the required already-installed app and
Companion permissions. No changes to HA `.storage`, dashboard editor, mappings or native pairing.

## Compatibility

Additive optional input, no migration for existing homes, no deprecation bridge needed. Record in
UPGRADE and the compatibility ledger. A home choosing Frame changes only this input and renders
and deploys through the normal ownership/plan safeguards. Never patch generated packages by hand.

## Tests and acceptance

- Regression tests for omitted/null/explicit default, custom package and malformed input.
- Compare rendered wake commands and all other package content against the default: only the
  target-launch branch may differ; off command and radar timings must remain unchanged.
- Catalog checks, full check-all and fresh HA configuration validation.
- Isolated staging verifies both launcher branches; physical pilot verifies wake restores Frame,
  assistant close returns to the classic dashboard and subsequent listening works.
- Native concise speech has separate PL/EN tests and internal Play release evidence.

## Out of scope and website

No automatic app installation, new permissions, boot service, change to app language, radar policy,
brightness, delay, settings UX or model C. No HACS release required. Website impact: document the
optional wake target in the Ramka setup material after its component tag exists; no new visual.
An absent app or Android blocking background launches remains an explicit setup error, not a
fallback that silently launches a different dashboard. Physical reliability is unverified until tested.
