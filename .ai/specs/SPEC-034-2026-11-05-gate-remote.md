# SPEC-034: gate-remote, a fixed-code gate handset replayed from an ESP32 + CC1101, and gate buttons on the Ramka

- Status: draft 2026-11-05.
- Source: maintainer request after a working prototype in his home: capture a gate handset's code,
  send it from Home Assistant, put the button on the Ramka's controls. The prototype is that home's
  own firmware (not in this repository); everything below that is marked tested was tested there on
  2026-11-05, nothing else.

## Goal and placement

A home gets a button in Home Assistant that does what the handset of its garage door or gate does:
an ESP32 board with a sub-GHz CC1101 transceiver sends the handset's code, captured once from the
handset itself. The Ramka gets an optional row of such buttons on its controls, behind a
confirmation.

Placement test:

1. Home Assistant has no way to send a sub-GHz OOK code. ESPHome has the parts (`cc1101`,
   `remote_receiver`, `remote_transmitter`) but no capture-then-send recipe, no wiring and no
   handling of the CC1101's GDO0 pin, which the chip drives in receive mode and reads in transmit
   mode. The Ramka has no surface for a one-shot action.
2. A second home with a fixed-code handset needs the same board, wiring, two firmwares and button,
   only with its own code and frequency. → a component.
3. The code, the frequency and the button's label are the home's: instance layer.

Not in scope: rolling-code handsets (KeeLoq, Marantec bi-linked, Hörmann BiSecur and the like).
Capture tells the two apart (two presses, identical frames or not); a rolling code ends at capture
with a note in the README.

## Devices

| role | requires | recommended | tested |
|---|---|---|---|
| board | `esp32-board`, count 1 | `m5stack-atom-lite` | yes |
| transceiver | `radio-transceiver` with the handset's band, ASK/OOK | new device `m5stack-module-cc1101` (M146, E07-900M10S, 855–925 MHz) for 868 MHz handsets; the existing `cc1101` (E07-M1101D, 433 MHz) for 433 MHz handsets | M146 at 868.3 MHz yes; 433 MHz inference |
| handset | `gate-handset`, fixed code, 300–928 MHz OOK | — | Marantec Digital 302, 868.3 MHz, yes |

New device `devices/m5stack-module-cc1101.yaml` + `.md` and `devices/wiring/m5stack-cc1101-atom-lite.svg`:
the module takes 5 V on M-Bus pin 28 (VRH3301 LDO on the board, M5Stack schematic SCH V0.1
2024-12-30), so its 5 V comes from the Atom's 5V socket, not 3V3; DIP switches route CSN (SW1-1 → pin
8), GDO2 (SW2-2 → pin 22) and GDO0 (SW2-6 → pin 20); pins 7/9/11 are MOSI/MISO/SCK. Atom sockets as
the existing `cc1101-atom-lite.svg`: GND, 5V, G23, G19, G33, G21 (CS), G22 (GDO0), G25 (GDO2).
Tested: chip ID 0x0014 read over SPI at 1 MHz with eight Dupont jumpers on the module's short
M-Bus pins (they seat shallowly; a fix for that is the home's enclosure, not this spec).

## Integrations

ESPHome 2026.9.1 (core `esphome` integration in HA). No HACS. A human: flashes the first firmware
over USB, adopts the node in HA (Settings → Devices & services → Discovered), presses the handset
twice during capture.

## Firmware: two remote packages and the thin device file

- `esphome/capture.yaml` (package): SPI, `cc1101` at `${frequency}` ASK/OOK, `remote_receiver` on
  GDO2 with `dump: raw`. Listen only; GDO0 is left unconfigured (an input) because the chip drives it
  in receive mode. Tested: two presses gave five identical frames (75 pulses, 1.016 ms grid, ~9.15 ms
  apart); a 4.2 ms pulse once a second from some other transmitter is also logged and is ignored.
- `esphome/transmit.yaml` (package): the same radio, `remote_transmitter` on GDO0 with
  `carrier_duty_percent: 100%`, `on_transmit: cc1101.begin_tx`, `on_complete: cc1101.set_idle`, and
  `on_boot` (priority −100) `cc1101.set_idle`: the radio never enters receive mode, so GDO0 is never
  driven by both sides. A script `gate_send(code: int[])` sends one frame `${repeat}` times with
  `${gap}` between (defaults 5 and 9150 µs, the tested handset's). The Atom's own button held 1 s
  presses the first gate button (a fallback without HA; a short press does nothing). The LED shows
  blue while sending. Tested: one press over the native API opened the gate, with the node in a room of the flat.
- Thin device file (instance layer, rendered once by `domosenso add` from `templates/esphome/device.yaml.j2`):
  substitutions (`name`, `frequency`, pins), the package, and one template `button` per gate whose
  `on_press` runs `gate_send` with `code: !include <slug>.code.yaml`. The code files are the home's
  secret: `domosenso add` writes `<slug>.code.yaml.example` and adds `*.code.yaml` to the home's
  `esphome/.gitignore`; the README tells how to paste one captured frame into it.

## Inputs

| name | type | default | example |
|---|---|---|---|
| `node` | `{name: slug, friendly_name?: string}` | required | `{name: gate-remote}` |
| `frequency` | `frequency` (300–928 MHz) | required | `868.3MHz` |
| `gates` | `list[{slug, label}]` | required, ≥ 1 | `[{slug: garage, label: Garage}]` |
| `repeat` | int | 5 | |
| `gap_us` | int | 9150 | |
| `pins` | `{cs, gdo0, gdo2, clk, mosi, miso}` | the Atom Lite wiring above | |

## Provides / consumes

- Provides (from ESPHome): `button.<node>_<slug>` per gate, stability `stable`; `light.<node>_led`,
  `sensor.<node>_wi_fi_signal`, `button.<node>_restart`, `stable`. No helper, no package in HA.
- Consumes: nothing.
- ESPHome entities cannot carry a marker attribute; the Ramka gets the buttons by entity id through
  its input.

## Ramka 0.16.0: `actions`

New optional input (ADDITIVE-ONLY under `docs/COMPATIBILITY.md`; no existing home changes):

| name | type | default |
|---|---|---|
| `actions` | `list[{entity: button.* | input_button.* | script.* | scene.*, label, icon?, confirm?: bool, room?}]` | `[]` |

Each item is a Home Assistant `button` card on the controls with `tap_action: perform-action`
(`button.press`, `input_button.press`, `script.turn_on` or `scene.turn_on` by the entity's domain)
and, unless `confirm: false`, Home Assistant's own `confirmation` text (`ui.actions.confirm`, with the
label), so a stray tap on a wall tablet in a family room does not open a gate. An inert greyed twin
while the entity is unavailable, as for awnings and lights. Placement: a block under the awnings
when `covers` is set, else its own column; decided by the staging screenshots at 1100 × 720,
1024 × 720 and 1280 × 800 (the controls must not scroll at 1100 × 720 with the demo's covers,
lights and two actions). Translations `ui.actions.{heading,confirm}` in en, de, pl. The status page
and the preview list actions under the controls. Voice control of gates stays excluded (SPEC-033).

## Artifacts and layers

| artifact | layer |
|---|---|
| `components/gate-remote/component.yaml`, `translations/`, `README.md` (capture steps, rolling-code check, legal note: only a handset the home may use), `esphome/{capture,transmit}.yaml`, `esphome/factory.yaml` | managed (remote packages) |
| `templates/esphome/device.yaml.j2`, `<slug>.code.yaml.example` | instance |
| `devices/m5stack-module-cc1101.{yaml,md}`, `devices/wiring/m5stack-cc1101-atom-lite.svg` | catalog |
| `examples/demo-home/esphome/gate-remote.yaml` + a fake `garage.code.yaml` | demo |
| ramka: `templates/dashboard.lang.yaml.j2`, translations, `component.yaml` 0.16.0, `UPGRADE.md` (nothing to do) | managed |

## Compatibility

New component; ramka's change is a new optional input. No bridge, no breaking change.

## Tests

- `catalog_check --strict`; `tests/test_catalog_content.py` (`COMPONENTS`, `DEVICES`, privacy);
  `CONTRIBUTING.md` table and README "What's in the box" line.
- `esphome-check gate-remote` (config) and `compile` of the demo device file and the factory image.
- pytest: the device template renders one button per gate; the `.gitignore` line; a code file
  missing → `esphome config` names it.
- Ramka: render tests with and without `actions` (domain → action mapping, confirm on by default),
  `ha-check ramka`, staging screenshots at the three viewports; the controls do not scroll at
  1100 × 720.
- Demo: `Demo: skip` for the component (no HA runtime change), ramka by the screenshots.

## Delivery and website

Two pull requests into a feature branch `feature/gate-remote` (this session coordinates): (1) the
component, device and wiring; (2) ramka 0.16.0 `actions`. Then one PR into `main`. After merge the
Release workflow tags `gate-remote/0.1.0` and `ramka/0.16.0` and opens the website PR
(`publish_release.py`): a component page and a device page, the Ramka page's controls text; content
stays draft until the tags exist (website audit skill).

## Open questions

- 433 MHz with the existing `cc1101` device: the same packages should work (inference, untested).
- The confirmation dialog in the Companion app's WebView on the tested tablet: HA's own dialog,
  expected to work (inference until the staging/tablet check).
- Whether `script` parameters of type `int[]` pass a 75-element list from `!include` in ESPHome
  2026.9.1 (expected; checked at the first compile).
