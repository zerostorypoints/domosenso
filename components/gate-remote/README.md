# gate-remote: field notes

A garage door or gate opened from Home Assistant by sending the code of its own handset (SPEC-034).
Board, wiring and the module's DIP switches: [devices/m5stack-module-cc1101.md](../../devices/m5stack-module-cc1101.md).

Use it only for a door or gate the home is allowed to open with the handset it already has. A shared
gate (a building's garage) opens for everyone who can press the button in Home Assistant: decide that
deliberately.

## Capture

1. Wire the board and the module, set the DIP switches, screw the antenna on.
2. Flash the capture firmware over USB from a catalog checkout:

   ```bash
   uvx --from esphome==2026.9.1 esphome run components/gate-remote/esphome/capture.factory.yaml --device /dev/cu.usbserial-XXXX
   ```

   It sets the radio to the frequency in `capture.yaml`'s substitutions (433.92 MHz unless changed):
   for an 868.3 MHz handset, copy the file and set `frequency: 868.3MHz` first.
3. In the log at boot: `CC1101 found! Chip ID: 0x0014`, then the frequency and `ASK/OOK`.
   `Failed to verify CC1101.` means one of the SPI wires (MOSI, MISO, SCK, CS) does not seat.
4. Hold the handset about a metre from the antenna, press its button, wait five seconds, press again.
   A press shows as one long `Received Raw:` block of alternating positive and negative numbers in
   microseconds, the frame repeated with a gap of several thousand microseconds between repeats.
   Short lines between presses (a single number such as `4178`, or three to five numbers) are other
   transmitters and noise.
5. Compare the two presses. The same frame both times: a fixed code, go on. Different frames: a
   rolling code, which this component cannot send; stop here.
6. Copy one whole frame, from its first number up to the first long gap (about −9000), into the
   gate's code file next to the home's device file, as a YAML list:

   ```yaml
   # <name>-<slug>.code.yaml: one captured frame, microseconds, + on, - off. Not in git.
   [2032, -1016, 1016, -2032, 1016]
   ```

   A frame cut by noise (a value far off the others, such as −126 among thousands) is the wrong one
   to copy; take another repeat. Rounding each value to the handset's grid (all values are about a
   multiple of one unit) is optional; the tested frame was rounded to 1016 µs.
7. Move the file into the home's private folder (SPEC-035); a link stays in its place:

   ```bash
   uv run --project <catalog checkout> domosenso private adopt esphome/<name>-<slug>.code.yaml
   ```

   The code opens the gate: it never sits in the repository, nor only in a worktree or clone that can
   be deleted. A home whose `.gitignore` predates the home template's `*.code.yaml` line adds it.

## Send

1. Flash the device file `domosenso add` wrote (`<name>.yaml`) over USB or OTA.
2. Adopt the node in Home Assistant (Settings → Devices & services → Discovered → ESPHome).
3. One press of the gate's button sends the frame `repeat` times (5) with `gap` (9150 µs)
   between, as the tested handset does; the board's LED shows blue while it sends. Holding the
   board's own button for a second presses the first gate. Home Assistant names the button from the
   node's area, friendly name and the gate's label: `button.hall_gate_remote_garage` for the demo
   home's node (`area: Hall`), `button.gate_remote_garage` without an area. Home Assistant 2026.9.2
   did so in the first home.

Tested in one home on 2026-11-05: an 868.3 MHz handset, 75 pulses per frame on a 1.016 ms grid, about
9.15 ms between repeats. A press sent over the native API from the home's own firmware opened the gate,
and the same evening a press from Home Assistant through this component's transmit package (0.1.0)
opened it too, with the node in a room of the flat. A 4.2 ms pulse once a second from some other transmitter showed up in that home's capture
log and was harmless.

## From the phone and the car

The gate's button is a plain `button` with no entity category, so the Home Assistant app on iOS
offers it everywhere it offers buttons. It presses blind: the transmission is one-way, and nothing
tells Home Assistant whether the gate moved.

- **CarPlay.** In the app, Settings → Companion app → CarPlay → Add item → Entity, or in the car
  Quick access → Add item → Areas (the node's area) or Control → Button. Turn on **Require
  confirmation** for the item: without it one touch opens the gate, and CarPlay does not ask for
  buttons by default. A press from the Areas or Control tabs runs at once, whatever that setting.
- **Control Center** (iOS 18 and later): add the Home Assistant app's button control and pick the
  gate's button. It presses with no confirmation; keep it off the Lock Screen if that matters.
- **A dashboard tile** whose tap presses the button (with a `confirmation:`) never opens the entity
  dialog, and the dialog's ⋮ menu is where the app's "Add to" (CarPlay, Apple Watch) lives. Give such
  a tile `hold_action: {action: more-info}`. The dialog's own press button does not ask first.

If the app's entity list lacks the button, search for the friendly name ("<friendly name> <label>"),
not the entity id. Used in one home on 2026-11-08 from CarPlay and Control Center with the Home
Assistant iOS app over a remote connection.

## Why the radio never listens in the transmit firmware

The CC1101's GDO0 is the data input while it transmits and a data output in receive mode. With the
board's transmitter pin on GDO0, a receiving chip and the board would both drive that wire. The
transmit firmware therefore puts the radio to idle at boot and after every send; the capture
firmware, which needs receive mode, reads GDO2 and leaves GDO0 alone.
