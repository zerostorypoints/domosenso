# Integrate a device

For a device the catalog does not know yet. Four steps; most devices stop at the first or the
second. The example task throughout is a **Naim Uniti Star** streamer for the `media` component (the
Ramka's music view). Nobody has run the Naim through this guide yet: every Naim value below that
nobody has seen is marked *not tried yet*, and the first home that has one fills them in with its
pull request. The worked example for step 3 is the Hegel H400 amplifier and its integration,
[hegel-home-assistant](https://github.com/zerostorypoints/hegel-home-assistant).

Domosenso never installs integrations itself. Home Assistant's own integrations come with it, and
custom ones are installed through [HACS](https://hacs.xyz); a component's manifest only names the
integration it needs.

## 1. What Home Assistant already has

Ask Home Assistant what it found on your network and what it has set up:

```bash
uv run --project <catalog> domosenso discover --catalog <catalog> --from-ha <HA URL> --token-file <token file>
uv run --project <catalog> domosenso recommend --catalog <catalog> --from-ha <HA URL> --token-file <token file>
```

`discover` lists the integrations Home Assistant discovered and has set up; `recommend` lists the
devices it matched to the catalog and the ones it could not place (`unmatched`, per integration).
The same discoveries are in Home Assistant under Settings → Devices & services → Discovered.

Look for a built-in integration first. For an audio player that means Google Cast, DLNA (`dlna_dmr`),
Spotify Connect or the maker's own integration. The `media` component needs a `media_player` that
meets the Ramka's contract (`media_player_contract` in [the Ramka's manifest](../components/ramka/component.yaml)):

- required: `state`, `turn_on`, `turn_off`, `media_play`, `media_pause`, `volume_level`, `volume_set`;
- optional: `volume_step`, `previous_track`, `next_track`, `media_title`, `media_artist`,
  `media_album_name`, `entity_picture`, `media_position`.

Check it in Developer tools → States (the entity's `supported_features` and attributes) and by
trying each action from Developer tools → Actions, once while the player is playing and once from
standby. Turning on from standby is where generic integrations most often fall short.

*Naim, not tried yet:* the Uniti Star has Chromecast built in and plays as a UPnP renderer, so Home
Assistant may offer it through Google Cast and DLNA. Whether either turns it on from standby and sets
its volume is the first thing to find out.

**Done when:** you know which integration gives the device's `media_player` and whether it meets the
contract. If a built-in one does, skip to step 4.

## 2. HACS

Search HACS (its Integrations list) and GitHub for the device's name with "home assistant". Before
installing, read:

- the README: which models it was tried on, local or cloud, what it needs from you;
- the tests and CI: a `tests/` folder and a passing workflow;
- the last release and the open issues: a year without a release, while Home Assistant changes
  monthly, is a risk.

Install it through HACS, restart Home Assistant, add it under Settings → Devices & services, and
check it against the contract as in step 1.

*Naim, not tried yet:* the candidate is `naim_media_player` from
[jorourke/naim-atom-home-assistant](https://github.com/jorourke/naim-atom-home-assistant), a HACS
custom repository written for the Uniti Atom and not yet tried on a Uniti Star. Two others exist for
other Naim lines (`peteS-UK/naim_streamer`, `blitzkopf/naim_muso`).

**Done when:** an integration from HACS gives the device's `media_player`, you noted the version you
tested, and it meets the contract; or you found nothing that does.

## 3. Write one

Only if nothing fits. A Home Assistant integration is a Python package under
`custom_components/<domain>/`, published as its own public repository so that HACS can install it.
The Hegel integration is a small, complete example (about 1,300 lines of Python); every link below
points at its release `v0.1.7`.

| Part | In Hegel | What to take from it |
|---|---|---|
| Layout and HACS | [`hacs.json`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/hacs.json), [`custom_components/hegel_streaming/`](https://github.com/zerostorypoints/hegel-home-assistant/tree/v0.1.7/custom_components/hegel_streaming) | One integration per repository, at that path. `hacs.json` names it and the oldest Home Assistant it supports. |
| Manifest | [`manifest.json`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/manifest.json) | `domain`, `config_flow: true`, `integration_type: device`, `iot_class: local_push`, `version` (HACS requires it), and a `zeroconf` entry so Home Assistant offers the device when it appears on the network. |
| API client | [`api.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/api.py) | All network talk in one class over Home Assistant's shared `aiohttp` session, no extra requirements. Two kinds of error: the device did not answer (`HegelConnectionError`), or it answered something unexpected (`HegelError`). The module docstring records the device's API as found. |
| Config flow and discovery | [`config_flow.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/config_flow.py) | Set up by address or from zeroconf. The device's own id is the unique id, so a new IP address is followed instead of creating a second device, and a repair issue suggests reserving the address. `reconfigure` changes the address and refuses a different device. |
| Coordinator: push or poll | [`coordinator.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/coordinator.py) | The amp keeps an event queue: a background task long-polls it and applies each change at once; a full refresh every 30 s is the safety net, and an expired queue is re-created with a refresh. A device without events would poll only. |
| Entities | [`media_player.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/media_player.py), [`sensor.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/sensor.py), [`binary_sensor.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/binary_sensor.py), [`entity.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/entity.py) | The `media_player`; sensors for the stream (quality, codec, sample rate, bit depth, bitrate, streaming service); a connectivity sensor. A shared base entity holds the device info. |
| Off versus not responding | [`coordinator.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/coordinator.py), [`__init__.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/__init__.py) | An amp switched off at the mains does not answer. It is reported as off, not unavailable, so dashboards and automations keep working, and the device info cached in the entry lets setup succeed while it is off. The log says once that it stopped answering and once that it is back. |
| Options | [`config_flow.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/config_flow.py) (`HegelOptionsFlow`) | A volume cap, inputs to hide, input names; the entry reloads when they change. |
| Translations | [`translations/`](https://github.com/zerostorypoints/hegel-home-assistant/tree/v0.1.7/custom_components/hegel_streaming/translations) | Every string the user sees, `en.json` first. |
| Diagnostics | [`diagnostics.py`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/custom_components/hegel_streaming/diagnostics.py) | The file behind "Download diagnostics": entry, device, inputs, last state. Ask for it in bug reports. |
| Tests with a fake device | [`tests/`](https://github.com/zerostorypoints/hegel-home-assistant/tree/v0.1.7/tests) | `pytest-homeassistant-custom-component`; `conftest.py` holds answers trimmed from a real H400, so the tests run without the amp. |
| CI | [`validate.yml`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/.github/workflows/validate.yml), [`tests.yml`](https://github.com/zerostorypoints/hegel-home-assistant/blob/v0.1.7/.github/workflows/tests.yml) | `hassfest` and the HACS action on every push and weekly; ruff and pytest on every push. |
| Releases | [releases](https://github.com/zerostorypoints/hegel-home-assistant/releases) | A tag `vX.Y.Z` matching `manifest.json`'s `version`, with a GitHub release; HACS offers releases as updates. |

**Done when:** the repository is public, its CI is green, a tagged release exists, and HACS installs it
as a custom repository on your own Home Assistant, where the player meets the contract.

## 4. Bring the device into the catalog

Now the catalog learns the device, so `recommend --from-ha` finds it in the next home. This is a pull
request from your fork into this repository (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

**A device file**, `devices/<id>.yaml`, like [`devices/hegel-h400.yaml`](../devices/hegel-h400.yaml):

```yaml
id: hegel-h400
names: {en: Hegel H400, de: Hegel H400, pl: Hegel H400}
description_key: meta.devices.hegel-h400.description
does_key: meta.devices.hegel-h400.does
photo: null
component: media
tested: {homes: 1}
# Seen on HA 2026.9.2: manufacturer Hegel, model H400, through hegel_streaming.
match:
  - integration: hegel_streaming
    model: "*H400*"
```

`match` rules compare the integration domain, `manufacturer`, `model` and `model_id` that Home
Assistant reports for the device (glob patterns, case-insensitive). Take them from `recommend
--from-ha --json`, where the device shows up under `unmatched`, and write down the Home Assistant
version you saw them on. The description and "does" texts go into the component's
`translations/en.json`, `de.json` and `pl.json`.

*Naim, not tried yet:* the integration domain, manufacturer and model strings Home Assistant reports
for a Uniti Star are unknown until someone runs `recommend --from-ha` with one.

**The component** that uses the device, here [`components/media/component.yaml`](../components/media/component.yaml),
gets the device id under `devices.requires[].recommend`. If the device needs an integration from
HACS, the manifest lists it under `integrations` with `source: hacs`, `repo` and the `tested` version.

**A second integration is a contract change.** `integrations` is a flat list that means "all of
these": adding `naim_media_player` next to `hegel_streaming` would read as a home needing both. An
alternative integration for an existing component needs a new way to say it in the manifest (for
example integrations tied to a device, or a "one of" group). That is spec first: write it with the
`write-component-spec` skill, in your own pull request, before the manifest changes.

What the Ramka shows for a player without Hegel's extra sensors: the quality, source and details
fields stay empty, and previous/next are always shown (the Ramka hides them only while
`media_service_sensor` reads a service that cannot skip). All of these inputs are optional.

Then `tools/check-all.sh` green and a pull request into `main`. The device is tested in one home:
yours.

**Done when:** the pull request is merged and `recommend --from-ha` on your Home Assistant lists the
device under the component instead of under `unmatched`.
