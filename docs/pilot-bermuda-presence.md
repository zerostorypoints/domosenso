# Pilot: the catalog format tried on `bermuda-presence`

A prototype of the catalog layout from [research/2026-10-20-domosenso-architecture.md](research/2026-10-20-domosenso-architecture.md)
(§3.1–3.5), tried on one component, `bermuda-presence`, on 2026-10-20 in the author's own home.
This page is the pilot's write-up, moved here from the home repository when the catalog became its
own repository. It names the fictional demo home (Alex and Sam; Living room, Dining, Kitchen,
Office, Bedroom, Kids' room, Hall) where the original named a real household. Nothing was deployed:
no board was flashed and no live Home Assistant was touched.

```
components/bermuda-presence/
  component.yaml                         manifest (§3.2 plus the fields marked "pilot:")
  esphome/ble-proxy.yaml                 remote package: the Atom Lite proxy, project: domosenso.bermuda-presence
  esphome/ld2410.yaml                    remote package, feature "radar"
  esphome/ble-proxy.factory.yaml         factory image for unconfigured boards: Improv + dashboard_import
  ha/blueprints/template/domosenso/presence_room.yaml       one room's presence sensor
  ha/blueprints/automation/domosenso/ble_proxy_offline.yaml the proxy-offline push
  cards/presence-rooms.yaml              markdown card, finds the sensors by attribute
examples/demo-home/                      a home as an instance: what `domosenso add` would write once
  inputs/bermuda-presence.yaml           the values the home supplies
  esphome/ble-proxy-<room>.yaml          thin device files, github:// package @bermuda-presence/0.1.0
  ha/packages/bermuda_presence.yaml      7 room sensors + the alert, as blueprint instances
tools/esphome-check.sh                   device files against a git remote at the tag; config + compile
tools/ha-check.sh                        check_config on a fresh home with the component and the instance
```

Run from the repository root:

```bash
tools/esphome-check.sh bermuda-presence compile ble-proxy-dining.yaml ble-proxy.factory.yaml
tools/ha-check.sh bermuda-presence
```

## What worked

**ESPHome remote package.** All device files validate with ESPHome 2026.9.1 when the package comes
from a real git clone (a throwaway local repo tagged `bermuda-presence/0.1.0`, reached over
`file://`; `github://` is the same code path with another URL). In the pilot home, seven device
files validated; a plain proxy, two proxies with radar and the factory image compiled:

| Build | RAM | Flash |
|---|---|---|
| plain proxy | 56.0 % | 66.0 % |
| proxy with radar | 59.7 % | 67.4 % |
| factory image | 56.4 % | 69.6 % |

The plain proxy matches the numbers the firmware it was derived from reports (66 % / 56 %). The
validated config of old file against new differed only in key order, the new `project:` block and
how secrets are printed: flashing the new files would change nothing on the boards except the
project name and version they report to HA.

A slash in the tag works: ESPHome's shorthand regex allows `/` in the ref, and git resolved
`bermuda-presence/0.1.0`. One monorepo can carry per-component versions this way.

**HA side.** Template blueprints (`domain: template`, in core; present in 2026.9.2) replace a
generator that wrote one copy of a template per room; the instance is now one short
`use_blueprint` entry per room, with the people map written once and reused through YAML anchors.
`check_config` (HA 2026.9.2, in the container image) passes for a fresh minimal home, and the pilot
home's own config gave 0 errors both before and after swapping its two presence packages for the
component.

**ha-staging.** The blueprints and the instance were loaded on a staging HA (2026.9.2), never on
production:

- all ten of the pilot home's entities came up as `sensor.presence_<area>` and
  `automation.ble_proxy_offline` — the entity ids production had, because names and unique_ids are
  kept;
- with Bermuda states posted on staging (two people in one room, a phone in another, a tablet
  in a third), each sensor's state equalled what the original template rendered for the same
  states, in all rooms, icons included;
- a second instance of the offline blueprint with a one-minute delay fired 60 s after a proxy's
  Wi-Fi sensor went `unavailable`, and the staging stub received the notification — "BLE Proxy
  <area> has not answered for 1 minute";
- the card's template rendered the three occupied rooms as a list.

Afterwards the files were removed, the entity-registry entries deleted (otherwise the staging sync
would treat `sensor.presence_*` as staging's own and stop mirroring production's), and the
container stopped, as it was found.

## What failed or surprised

1. **`dashboard_import` is not refuted — the research's 0-3 vote was wrong.** ESPHome's own
   `esphome/bluetooth-proxies` uses exactly this split: `m5stack-atom-lite.yaml` as the package and
   `m5stack-atom-lite.factory.yaml` with `dashboard_import: package_import_url:
   github://esphome/bluetooth-proxies/m5stack/m5stack-atom-lite.yaml@main`. In the 2026.9.1 source
   the URL goes into the device's mDNS TXT record, and the **ESPHome Device Builder** (not HA)
   offers Adopt and writes a device file with `substitutions: {name, friendly_name}`,
   `packages: {<project name>: <url>}`, a new API key and `wifi: !secret`. `dashboard_import`
   requires `api` and `esphome.project`; `import_full_config: true` requires a ref. On a Container
   install the Device Builder must run as its own container. Not tried on a board (no flashing
   without asking).
2. **`!secret` in a remote package works in 2026.9.1**, against the docs ("Remote packages cannot
   have secret lookups"): the loader falls back to the `secrets.yaml` next to the device file.
   Tested with `wifi: ssid: !secret wifi_ssid` inside the cloned package. The package still keeps
   secrets out, as the docs ask, since the fallback is undocumented.
3. **OTA encryption cannot live in the package.** `ota: encryption:` (bare, inheriting the API key)
   fails validation on the factory image, which has no key yet. It moved to the device file; ESPHome
   merges same-port OTA blocks. Consequence for adoption: the file the Device Builder writes has an
   API key but no `ota: encryption:`, so an adopted board accepts unauthenticated uploads until
   someone adds it.
4. **The package does not validate on its own** — no Wi-Fi network, on purpose (the pilot home has no
   fallback AP, to keep RAM for Bluetooth). Catalog CI has to validate instances, not packages.
   The factory image adds the AP, a captive portal and Improv, and `logger.baud_rate` back to
   115200, because `improv_serial` refuses a disabled UART.
5. **`check_config` misses invalid automation blueprints.** A broken template-blueprint input is
   an error; a broken automation-blueprint input (`notify_action: [1, 2]`) is only an `ERROR:` log
   line, and the exit code is 0 even with `--fail-on-warnings`. `ha-check.sh` counts those lines;
   CI built on `frenck/action-home-assistant` alone would pass the broken config.
6. **The research's consumer example was wrong.** A wall-tablet dashboard in the pilot home read only
   the dining-room **radar** (`binary_sensor.<area>_ble_proxy_<room>_presence`, its detection
   distance), not the room presence sensors. The room sensors' only consumer was a floor-plan
   dashboard.
7. **Entity ids are not the component's to promise.** `light.living_room_ble_proxy_living_room_led` is built by
   HA from the device's area, its friendly name and the entity name; the component only feeds that
   rule. The manifest can declare the pattern; an HA release can change it.
8. Small: `area` had to leave the package (an adopted board would otherwise land in an area named
   after a default), and the name of the BSSID text sensor became a substitution, since the
   catalog cannot name a home's mesh.

## What the manifest format needs changed

The §3.2 sketch held up for `devices`, `integrations`, `artifacts` and `provides`. It was missing:

- **`inputs:`** — rooms, the people map, proxies, the notify target. Nothing home-specific fits in a
  managed file, so every component with per-home data needs typed inputs that `domosenso add` asks
  for.
- **Three ownership layers, not two.** §3.1 had `ha/packages/<component>/` (managed) and
  `ha/local/` (the user's). The pilot needed a third: the **instance** — thin device files and a
  thin HA package written once from the inputs and owned by the home after that — beside the
  **managed** artifacts (remote packages, blueprints) that `domosenso update` replaces. With
  template blueprints, `ha_packages` ended up empty for this component.
- **`features:`** — optional hardware on the same device (the LD2410 radar) with its own provides.
  The radar might be its own component; it shares the board, the device file and the entity
  prefix with the proxy, so here it is a feature.
- **Placeholders in `provides`** (`sensor.presence_<area slug>`), with the slug rule written
  down: HA transliterates (`Küche` → `kuche`), it does not strip diacritics.
- **`upstream:`** — entities another integration owns that the component's files read
  (`sensor.<device>_area` from Bermuda). Not ours to freeze, but CI should check they still exist
  after a Bermuda upgrade.
- **A machine-readable marker on provided entities.** The presence sensors carry
  `attributes: {component: bermuda-presence, area}`; the card finds them by that, without a room
  list. Worth making a rule for every template entity a component provides.
- **`artifacts.esphome.factory`** and **`ha_blueprints`** as their own artifact kinds;
  `tested.esphome` next to `tested.ha`; `host.ha_min` for features such as template blueprints.
- **A schema and a load check.** The first draft of this manifest had a YAML syntax error
  (`list[{...}]` unquoted) that nothing caught until it was loaded; CI should validate
  `component.yaml` against a schema and check that every artifact path exists.
- **Tag scheme** `<component>/<version>`, used by every github:// URL in the device files and in
  `dashboard_import`. `package_import_url` is limited to 255 characters; the current one is 102.

## Not done

- No home repo was generated from the catalog (§5 of the research): the instance files in
  `examples/demo-home/` are written by hand, standing in for what `domosenso add` would write.
- No `github://` fetch against GitHub (nothing is published) and no adoption on a real board.
- The card was rendered as a template on staging, not as a dashboard screenshot.
- Moving a production home onto these files (flashing the proxies, swapping its packages) needs
  the owner's go-ahead; the entity ids would stay the same.
