---
slug: open-a-garage-door-or-gate
title: Open a garage door or gate from Home Assistant
description: Copy a fixed-code gate handset once with a small radio node, then open the gate from a button in Home Assistant and on a wall tablet.
components:
- gate-remote
- ramka
devices:
- m5stack-atom-lite
- m5stack-module-cc1101
status: published
updated: '2026-11-05'
sources:
- https://github.com/zerostorypoints/domosenso/tree/10364b429c878830af61f3da2256fff98d0dcf84/components/gate-remote
- https://github.com/zerostorypoints/domosenso/blob/10364b429c878830af61f3da2256fff98d0dcf84/devices/m5stack-module-cc1101.md
branches:
- situation: A fixed-code handset at 868 MHz
  needs: An M5Stack Atom Lite with the M5Stack Module CC1101 (868 MHz) and its antenna, running the gate-remote component's ESPHome firmware.
  wiring: None at the gate. Eight jumpers between the module and the Atom, on the desk.
  supported: 'yes'
  prompt: Add the gate-remote component to my home for my 868 MHz gate handset, prepare the capture firmware and the node's device file (I will wire the node, capture the handset and flash it myself), put the gate's button on my Ramka controls behind a confirmation, and stop before production so I can check it on staging.
- situation: A fixed-code handset at 433 MHz
  needs: The same Atom Lite with the 433 MHz CC1101 module (Ebyte E07-M1101D), on the same signal sockets but powered from 3V3, never 5V. Untested; expected to work (inference).
  wiring: None at the gate. Eight jumpers between the module and the Atom, on the desk.
  supported: 'yes'
  prompt: Add the gate-remote component to my home for my 433 MHz gate handset with the E07-M1101D CC1101 module, prepare the capture firmware and the node's device file (I will wire the node, capture the handset and flash it myself), and stop before production so I can check it on staging.
- situation: A rolling-code handset (two presses send different frames)
  needs: A rolling code (KeeLoq, Marantec bi-linked, Hörmann BiSecur and the like) changes with every press. The node cannot send it.
  wiring: —
  supported: 'no'
---

If your garage door or gate opens with a handset that sends the same code on every press, a small
radio node can record that code once and then send it from a button in Home Assistant, on your
phone and on a wall tablet. Nothing changes at the gate, and the handset keeps working.

Use it only for a door or gate you are allowed to open with the handset you already have. A shared
gate, such as a building's garage, opens for everyone who can press the button in your Home
Assistant: decide that deliberately. Rolling codes are out of scope; step 1 tells the two apart.

## What to buy

- One [M5Stack Atom Lite](/devices/m5stack-atom-lite/).
- For an 868 MHz handset, one [M5Stack Module CC1101 (868 MHz)](/devices/m5stack-module-cc1101/),
  M5Stack SKU M146. It ships with a 2.5 dBi rubber antenna. For a 433 MHz handset, the
  [CC1101 radio module](/devices/cc1101/) instead (untested for gates).
- Eight Dupont jumpers, female at the module's end and male at the Atom's.
- A USB cable for flashing and a USB power supply for the node.
- A multimeter with a continuity test, to find the module's pin 1 before power.

**What your agent does, and what you do.** The agent adds the
[gate-remote component](/components/gate-remote/) to your home, which writes the node's device
file, and, if you have the Ramka, puts the button on its controls and shows it on staging first.
You wire the node, flash it over USB, press the handset during the capture and adopt the node in
Home Assistant.

## 1. Check that the handset has a fixed code

Only a handset that sends the same frame on every press can be copied. You find out by capturing
two presses and comparing them, with the node wired (step 2) and running the capture firmware
(step 3): hold the handset about a metre from the antenna, press its button, wait five seconds and
press again.

- The same frame both times: a fixed code. Go on.
- Different frames: a rolling code. The node cannot send it; stop here.

## 2. Wire the boards and set the DIP switches

Eight jumpers connect the module to the Atom. The [module's guide](/devices/m5stack-module-cc1101/)
has the diagram and the pin table: G, 5V, G23, G19, G33, G21, G22 and G25 on the Atom go to the
module's M-Bus pins 1, 28, 7, 9, 11, 8, 20 and 22.

- Power from the Atom's 5V socket, never 3V3. The module has its own 5 V to 3.3 V regulator; its
  3.3 V pin is not connected to anything.
- The labels on the module's top side are the GPIOs of M5Stack's Core controllers, not the Atom's.
  Use them only to find a pin.
- Find pin 1 before power: with the multimeter on continuity and one probe on the antenna socket's
  shell, the top three pins of the column at the board edge (1, 3 and 5, ground) must beep.
- DIP switches, on the top side (ON is the side printed "ON"): SW1 1 ON routes CSN to pin 8; SW2 2
  ON routes GDO2 to pin 22; SW2 6 ON routes GDO0 to pin 20. All the others stay off. GDO0 and GDO2
  must never be switched onto the same pin.
- Screw the 868 MHz antenna onto the SMA socket before the node transmits.
- The module's pins are short and Dupont sockets seat only part-way. The node works that way, but
  an enclosure or a strip of tape that holds the eight housings keeps them from working loose.

## 3. Flash the capture firmware and read the frames

From a catalog checkout, flash the capture factory image over USB:

```bash
uvx --from esphome==2026.9.1 esphome run components/gate-remote/esphome/capture.factory.yaml --device /dev/cu.usbserial-XXXX
```

It listens at the frequency in `capture.yaml`'s substitutions, 433.92 MHz unless changed; for an
868.3 MHz handset, copy the file and set `frequency: 868.3MHz` first. The frames are logged over
the same USB cable (`esphome logs <file> --device <port>`).

At boot the log shows `CC1101 found! Chip ID: 0x0014`, then the frequency and `ASK/OOK`.
`Failed to verify CC1101.` means one of the SPI wires (MOSI, MISO, SCK) or CSN does not seat.

Now press the handset twice, as in step 1. A press shows as one long `Received Raw:` block of
alternating positive and negative numbers in microseconds: the frame, repeated with a gap of
several thousand microseconds between repeats. Short lines between presses, a single number or
three to five numbers, are other transmitters and noise.

## 4. Paste one frame into the code file

Copy one whole frame, from its first number up to the first long gap (about −9000), into the
gate's code file next to the node's device file in your home's ESPHome directory,
`<name>-<slug>.code.yaml`, as a YAML list:

```yaml
# <name>-<slug>.code.yaml: one captured frame, microseconds, + on, - off. Not in git.
[2032, -1016, 1016, -2032, 1016]
```

A frame cut by noise, with one value far off the others (such as −126 among thousands), is the
wrong one to copy; take another repeat. Rounding each value to the handset's grid is optional.

The code opens the gate, so move the file out of the repository into your home's private folder;
a git-ignored link stays in its place, and a new clone or worktree gets it back with
`domosenso private link`:

```bash
uv run --project ~/path/to/domosenso domosenso private adopt esphome/<name>-<slug>.code.yaml
```

## 5. Flash the device file and adopt the node

Flash the device file `domosenso add` wrote (`<name>.yaml`) over USB or over the air. Then adopt
the node in Home Assistant: Settings → Devices & services → Discovered → ESPHome.

One press of the gate's button in Home Assistant sends the frame five times with 9150 µs between,
as the tested handset does, and the board's LED shows blue while it sends. Holding the board's own
button for a second presses the first gate, without Home Assistant.

## 6. Optionally, put the button on the Ramka

With the [Ramka](/components/ramka/) wall tablet (0.16.0 or later), list the button in its
`actions` input:

```yaml
actions:
  - {entity: button.gate_remote_garage, label: Garage, icon: mdi:garage-variant}
```

Home Assistant names the button from the node's area, its friendly name and the gate's label:
`button.gate_remote_garage` for a node without an area, `button.hall_gate_remote_garage` with
`area: Hall`. Use the id Settings → Entities shows.

The button sits on the controls under the awnings, or in a column of its own without covers. A tap
asks Home Assistant's confirmation before it acts, so a stray tap on the tablet does not open the
gate; keep that default for a gate. While the node is unreachable a greyed button shows instead.

## Hints from real installations

- Tested in one home on 5 November 2026 with an 868.3 MHz handset: 75 pulses per frame on a
  1.016 ms grid, about 9.15 ms between repeats. Two presses gave identical frames. The home's own
  firmware, the precursor of the component's packages, opened the gate with a press sent over the
  native API; the same evening the component's transmit package (0.1.0), pressed from Home Assistant,
  opened it too, with the node in a room of the flat.
- The same capture log showed a 4.2 ms pulse once a second from some other transmitter. It was
  harmless.
