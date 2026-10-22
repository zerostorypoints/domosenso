# Home Assistant notes: lessons that belong to no component

Learned running Home Assistant 2026.9 as a Container on a NAS (2026-09 and 2026-10). Component
specific notes are in each `components/<id>/README.md`; integrations without a component in
[integration-notes.md](integration-notes.md).

## Files in a Container install

- `custom_components` (and other files the container wrote) can be owned by root on the host while
  the login user has no root. Write through the container instead:
  `docker exec -i <container> tar -C /config/custom_components -xf - < release.tar`, or for one
  file `docker exec -i <container> sh -c 'cat > /config/<path>' < <file>`. rsync or tar over ssh
  into those directories fails.
- Check on the host before a restart:
  `docker exec <container> python3 -m homeassistant --script check_config -c /config`, and count
  the `ERROR:` lines as well as the errors (an invalid automation-blueprint instance is only a log
  line, exit code 0; see AGENTS.md, Validation).
- Without a token, state can be read from a copy of the recorder database
  (`home-assistant_v2.db` with its `-wal` and `-shm` files) in a temporary directory; never query
  the live file.
- Exclude high-rate diagnostic sensors from the recorder (Bermuda's distance and RSSI sensors were
  88 % of one home's rows).

## State that lives outside the files

Areas, devices, the entity registry and integrations added in the UI live in `.storage`, which a
Domosenso home never replaces.

- Edit them through the websocket API with a long-lived token (`config/device_registry/update`,
  `config/entity_registry/update`, `config/area_registry/delete`), never by editing `.storage` by
  hand while Home Assistant runs.
- A discovered config flow can be confirmed over REST:
  `POST /api/config/config_entries/flow/<flow id>` with `{}`.
- Persistent notifications are listed only over the websocket (`persistent_notification/get`);
  templates and `python_script` cannot see them. Dismissing old ones takes a small script with a
  token, run by a `shell_command`.
- Integrations disable some entities by default (battery and signal on Tapo, the air-quality score
  on Ruuvi): check `disabled_by` before putting an entity on a dashboard.
- A config flow may build the entity id from a device code rather than the name typed in the
  wizard; rename it in the entity registry.

## Behaviour worth knowing

- A reload of `input_select` keeps a current state that is no longer an option; a restart sets it to
  the first option.
- A templated `delay_off` is rendered after the state changes, with the old value.
- A command to a cloud or Wi-Fi appliance may be confirmed later: an automation that reads the state
  right after the command can still see the old one.

## Reading Home Assistant from outside

- Behind a Cloudflare tunnel, REST calls with Python's default user agent (`Python-urllib/...`) get
  HTTP 403, Cloudflare error 1010; the websocket and `curl` pass. The `domosenso` command sends
  `User-Agent: domosenso` (seen 2026-10-22).
- Discovered devices waiting to be added are `config_entries/flow/progress` (admin only); Home
  Assistant leaves the flows a user started out of it. A dismissed discovery is a config entry with
  `source: ignore`.
- The Android Companion app registers the device with `sw_version` = the Android API level (a
  tablet on Android 16 shows `36`; inference from the API table, seen 2026-10-22). Its own app version
  is stored only in the config entry's data, which no API returns.

- Home Assistant serves `/local/` only if `config/www/` existed when it started: a file put into a new
  `www/` is a 404 until a restart (seen on 2026.9.2). `domosenso probe --install` warns about it.

## Staging

- A staging Home Assistant that mirrors production by posting its states over REST starts its own
  helpers (`input_number`, `input_boolean`) at their defaults; copy their values too, or behaviour
  under test differs from production.
- Entities created on staging land in staging's entity registry; remove them afterwards, or a
  mirror stops treating those ids as production's.
- Judge a dashboard from screenshots at the target screen's CSS size and pixel ratio.
