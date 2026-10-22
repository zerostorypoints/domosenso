# SPEC-010: `domosenso recommend --from-ha`, a hardware scan of a running Home Assistant

Status: approved 2026-10-22 by the maintainer, typed in the session that wrote it ("OK dla SPEC-010, zgoda na odczyt z produkcji"; draft 2026-10-22).
Source: the maintainer's request (2026-10-22) to let onboarding read the hardware from the person's
Home Assistant instead of asking for it; SPEC-009 (`recommend`, `onboard-home`); the first outside
home (Home Assistant Container on a Synology NAS, Tapo sensors, a Naim Uniti Star).

## Goal

A person who already runs Home Assistant should not have to name their hardware in catalog terms.
`recommend --from-ha` reads their Home Assistant read-only, maps what it finds to catalog device ids
and kinds, prints what it found, how it matched and what it could not match, and then assesses the
components exactly as `--have` does. Matches it is not sure of are printed for the person to confirm,
not counted. Nothing is written to their Home Assistant, the home or the catalog.

## 1. Command line

```
domosenso recommend [--catalog <path or URL>] [--from-ha <target or URL> [--token-file <file>]]
                    [--have <device id or kind>...] [--json]
```

- `--from-ha <target>`: a target in the home's `domosenso.yaml` (its `url` and `token_file`), for a
  home that exists.
- `--from-ha <URL> --token-file <file>`: before `init`, when there is no home yet (onboarding step 2
  runs before step 3). `--token-file` is required with a URL and refused with a target name. The
  token is read from the file, never from the command line, never printed.
- `--have` still works and adds to what the scan found (devices not in Home Assistant yet, or a
  `maybe` the person confirmed). Without `--from-ha` the command is unchanged.

## 2. What it reads from Home Assistant

Websocket, read-only, the same client as `snapshot` (`ha_api.HA`):

| read | used for |
|---|---|
| `config_entries/get` | `entry_id` → integration `domain`; entry-level rules (`mqtt` → `mqtt-broker`) |
| `config/device_registry/list` | `manufacturer`, `model`, `model_id`, `config_entries`, `name`, `name_by_user`, `entry_type`, `disabled_by` |
| `config/entity_registry/list` | entity → `device_id`, `original_name` (and `device_class` / `original_device_class` where an entry has them) |
| REST `GET /api/states` | `device_class` of an entity (on HA 2026.9.2 the registry list carries no device class, so this is the source) |

Skipped: devices with `entry_type: service` (integration services, not hardware) and devices
`disabled_by` anything. A device's integrations are the domains of its `config_entries`.

## 3. Match data in the catalog

### 3.1 `devices/<id>.yaml`: a new optional `match:` list

```yaml
match:
  - integration: [tplink, tapo]   # the device belongs to a config entry of any of these domains
    model: "T315*"
```

A rule matches a device when **every** field it gives matches:

| field | matches when |
|---|---|
| `integration` | one of the device's integration domains equals one of these (string or list) |
| `with_integration` | the device also belongs to every one of these domains (string or list) |
| `manufacturer`, `model`, `model_id` | the device's field matches one of these globs, case-insensitively (string or list) |
| `unless_manufacturer` | the device's manufacturer matches none of these globs |
| `entity_domain` | the device has an entity in one of these domains (`media_player`) |
| `device_classes` | the device has entities with every one of these device classes |
| `entity_names` | the device has entities whose `original_name` matches each of these globs |
| `entry` | (instead of device fields) a config entry of this domain exists; counts entries, not devices |
| `certainty` | `found` (default) or `maybe` |
| `note` | free text, shown in `--json` only |

A device matches a device id when any of its rules matches. The rule language is the same for kinds.

### 3.2 `kinds/<kind>.yaml`: kind-level rules, new

```yaml
id: mqtt-broker
match:
  - entry: mqtt
```

One file per kind that has rules (`schemas/kind.schema.json`: `id`, `match`). `catalog_check
--strict` validates both schemas and fails on a kind file whose `id` no manifest names as a `kind`.
`kinds/` joins the privacy scan.

### 3.3 First rules (implemented with this spec)

Checked on 2026-10-22 against one real registry (HA 2026.9.2, read-only, section 7). "Seen" = the
registry showed exactly this; "inference" = kept without a device to confirm it.

Device ids:

| device | rule | verified |
|---|---|---|
| `tapo-t315` | `integration: [tplink, tapo]`, `model: T315*` | seen (tplink, model `T315`); `tapo` (HACS) inference |
| `hue-bridge` | `integration: hue`, `model_id: BSB00*`; or `model: "Hue Bridge*"` | seen (`Hue Bridge`, `BSB002`) |
| `m5stack-atom-lite` | `integration: esphome`, `model: m5stack-atom*`; `integration: [mqtt, espsomfy_rts]`, `manufacturer: rstrouse*`, `model: "*M5Stack Atom Lite*"`; `integration: esphome`, `manufacturer: domosenso`, `model: bermuda-presence` | seen (ESPHome: manufacturer `Espressif`, model `m5stack-atom`, shared by the Atom Matrix and Echo; ESPSomfy names the board in its model); the `domosenso` project rule inference |
| `hlk-ld2410c` | `integration: esphome`, `entity_names: ["Still distance", "Detection distance"]` | seen (the names of the catalog's `ld2410.yaml`) |
| `mi-flora` | `integration: xiaomi_ble`, `model: HHCCJCY01*` | seen |
| `ruuvi-air` | `integration: ruuvitag_ble`, `model: "*Air*"` | seen (`Ruuvi Air`) |
| `hegel-h400` | `integration: hegel_streaming`, `model: "*H400*"` | seen; the same player also shows through `cast` and `dlna_dmr`, which count as `maybe network-audio-player` |
| `cc1101` | `integration: [mqtt, espsomfy_rts]`, `manufacturer: rstrouse*` (ESPSomfy-RTS always drives a CC1101) | seen over MQTT; `espsomfy_rts` inference |

Kinds (`found` unless marked `maybe`):

| kind | rule | verified |
|---|---|---|
| `mqtt-broker` | `entry: mqtt` | seen |
| `temperature-humidity-sensor` | `integration: [tplink, tapo]`, `model: T31*`; `maybe`: `device_classes: [temperature, humidity]` | seen (T310, T315) |
| `plant-sensor` | `device_classes: [moisture, conductivity]` | seen (Mi Flora) |
| `air-quality-sensor` | `maybe`: `device_classes: [carbon_dioxide]`; `maybe`: `[pm25]` | seen (Ruuvi Air) |
| `ble-proxy` | `integration: bluetooth`, `manufacturer: esphome` | seen: each ESPHome proxy is a second device of the `bluetooth` integration, manufacturer `esphome`; the draft's `with_integration` guess was wrong |
| `esp32-board` | `integration: esphome`, `model: [esp32*, m5stack*]`; `integration: esphome`, `manufacturer: domosenso`; `integration: [mqtt, espsomfy_rts]`, `manufacturer: rstrouse*`; `maybe`: any `esphome` device | seen, except the `domosenso` rule |
| `android-tablet` | `maybe`: `integration: mobile_app`, `unless_manufacturer: apple*` (phone or tablet cannot be told apart) | seen |
| `network-audio-player` | `maybe`: `entity_domain: media_player` (televisions and speakers match too; the person confirms) | seen |
| `mains-meter` | `maybe`: `device_classes: [power, voltage]` | seen |
| `wind-sensor` | `maybe`: `device_classes: [wind_speed]` | inference (nothing to see) |
| `rts-awning` | `integration: [mqtt, espsomfy_rts]`, `manufacturer: rstrouse*`, `entity_domain: cover` | seen over MQTT |
| `mmwave-radar`, `radio-transceiver`, `hue-bridge` | covered by `hlk-ld2410c`, `cc1101`, `hue-bridge`; no kind file | |

### 3.4 Where `devices/` and `kinds/` are read from

Components are read at their tags; `devices/` and `kinds/` have no tags. The match data says what
hardware is, not what gets installed, so it does not need a component's version: it is read from
the catalog repository's `HEAD` commit through git (`git ls-tree HEAD devices/ kinds/`, `git show
HEAD:<path>`) — for a local clone the commit it has checked out, for a URL the mirror's `HEAD` (the
remote's default branch). Never the working tree, like everything else `recommend` reads. The commit
is printed (`rules <commit>`), so a result can be traced to its rules.

## 4. Output (additive to the `recommend` row of `docs/COMPATIBILITY.md`)

With `--from-ha`, before the existing lines:

| line | meaning |
|---|---|
| `rules <commit> devices <n> kinds <m>` | where the match data came from, how many files have rules |
| `scan devices <n> integrations <m>` | hardware devices read (services and disabled ones left out), integration domains among them |
| `found <device id or kind> <n> via <domain>[,<domain>...]` | `n` devices (or entries) matched with `found`; counted as `--have` |
| `maybe <device id or kind> <n> via <domain>[,...]` | a likely match, not counted; confirm and pass it with `--have` |
| `unmatched <domain> <n>` | `n` devices of that integration that no printed `found` or `maybe` line accounts for (a `maybe` hidden because the same token is `found` does not count) |

Then `fits` / `missing` / `needs` / `optional` / `describes` / `unknown` exactly as today, with
`have` = the `found` tokens plus `--have`. A token that is both `found` and `maybe` prints `found`;
a `maybe` token also given with `--have` is confirmed: no `maybe` line, and its devices are not
`unmatched` (added 2026-10-22 after the first real run).
`unknown` applies to `--have` values only.

`--json`: the document gains a top-level `scan` object: `rules_commit`, `found` and `maybe`
(`{token: {count, via, devices}}`, `devices` as indexes, empty for an `entry` rule), `unmatched`
(`{domain: [device indexes]}`) and `devices`: one object
per device with `name`, `name_by_user`, `manufacturer`, `model`, `model_id`, `integrations`,
`matches` (`[{token, certainty, source}]`, `source` = `devices/<id>.yaml#<rule>` or
`kinds/<kind>.yaml#<rule>`). `data` is unchanged.

A Home Assistant that cannot be reached or refuses the token: `FAIL <reason>`, as `snapshot` does.

## 5. Privacy

The scan holds the person's device names. Text lines carry no names (tokens, domains, counts);
the `--json` `scan.devices` does, so the agent can show the person "Living room sensor (TP-Link
T315) → tapo-t315". The command writes the scan nowhere (no cache, no file in the home or the
catalog). The skill shows it in the conversation and never writes it into the catalog checkout, a
pull request or an issue. Test fixtures use the demo home (Alex and Sam). The real check in section 7
is reported in the conversation, never committed.

## 6. `onboard-home` skill

- Interview: the HA URL and token file move first (they are needed for the scan); the hardware
  question becomes "what do you have that Home Assistant does not know yet".
- Step 2 becomes: **scan**, `domosenso recommend --catalog <catalog> --from-ha <URL> --token-file
  <file> --json`; show the person each `found` with their device names, ask about each `maybe`
  (one question per token) and each `unmatched` integration that might matter for what they want;
  then **run again** with `--from-ha ... --have <confirmed maybes and hardware not in HA>` and
  present the result as today.
- After `init` (step 3) the target exists, so later runs use `--from-ha production`.

## 7. Tests

- `tests/test_cli_recommend.py`, with `FakeHA` (no network) and a throwaway git catalog carrying
  `devices/` and `kinds/` with rules: a device rule by integration and model glob, case-insensitive;
  `with_integration`; `unless_manufacturer`; `entity_names`; `device_classes` from the registry and
  from states; `entry` rules; service and disabled devices skipped; `found` counted into the
  assessment, `maybe` not; `found` wins over `maybe`; `unmatched` per domain; `rules <commit>` reads
  `HEAD`, not the working tree; `--from-ha <URL>` without `--token-file` fails; `--token-file` with a
  target name fails; a target from `domosenso.yaml`; an unreachable HA → `FAIL`; `--json` `scan`
  document; `--have` adds to the scan; nothing written to the home.
- `tests/test_catalog_content.py`: `kinds/` in the privacy scan; every kind file names a manifest kind.
- `catalog_check --strict`: device `match` and kind files against their schemas.
- Real check, read-only, once: `recommend --from-ha production` from the maintainer's home
  repository; the rules in 3.3 are corrected from what it shows; the result is reported in the
  conversation only.
- `tools/check-all.sh` green.

## Compatibility

Additive. New: the options `--from-ha`, `--token-file`; the lines `rules`, `scan`, `found`, `maybe`,
`unmatched` (only with `--from-ha`); the JSON key `scan`; the optional `match` in device files
(device files are ADDITIVE-ONLY); `kinds/` and `schemas/kind.schema.json`. All STABLE from now on,
added to `docs/COMPATIBILITY.md` (the `recommend` rows; a row for kind files next to device files).
No component, manifest or entity changes; no `UPGRADE.md` entry.

## Out of scope

- Writing anything to Home Assistant, the home's inputs from the scan (a later step could fill
  inputs such as `climate-air`'s sensors from the found devices).
- Matching hardware Home Assistant does not see (the Somfy awnings themselves, an unpaired tablet):
  those stay `--have`.
- Version-pinning the match data to a component tag.

## Open questions

- Model strings for every row marked "inference" in 3.3 (settled by the real check; any rule it
  cannot confirm stays, marked `inference` in a comment, or becomes `maybe`).
- Whether ESPHome Bluetooth proxies carry a `bluetooth` config entry on HA 2026.9.2 (inference;
  settled by the real check).
- The Naim Uniti Star appears through `cast` or `dlna_dmr` (inference); it yields only `maybe
  network-audio-player` until the Ramka's player contract is written.
