# audio-sensor: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.2.0 (2026-10-30): a faster spectrum, an update rate, the board set by Home Assistant

The music visual follows a bass hit in about 0.3 s instead of up to about 1 s (#99, #110; README,
"Latency and update rate").

**Firmware.** A `Spectrum rate` select (`eco` 500 ms, `normal` 200 ms, `fast` every 85 ms as the
newest frame alone) replaces the fixed 200 ms; a publish waits for a new frame, never for a clock of
its own. The board starts on `normal` after a boot and drops `fast` to `normal` after an hour. The
FFT is 4096 points instead of 8192, so a hit reaches the screen about 55 ms sooner; the bins widen
to 11.7 Hz and the lowest thirds share bins. `api: batch_delay: 10ms`: the API's default 100 ms let
`fast` through only every other frame.

**Package, with a `music: true` board.** The choice `input_select.audio_sensor_music_spectrum_rate`
(`normal`, `eco`, `fast`), the flag `input_boolean.audio_sensor_music_watching` and the automation
`audio_sensor_music_spectrum_rate`, which sets the music board's select: `fast` only while the flag
is on, `normal` 10 s after it turns off. The Ramka sets the flag while its music view shows (0.6.0).
The board's select is the new entity key `spectrum_rate` (guessed from the board's names when
absent).

**Cards.** The engine never rises faster than the gap between pushes, so the picture glides from
push to push instead of moving in steps.

### What a home does

1. `domosenso update audio-sensor`; name the select under `entities: spectrum_rate:` if its id is
   not the guessed one, then deploy. The restart creates the helpers; a fresh choice starts on
   `normal`.
2. Point the device file's package at `audio-sensor/0.2.0`, `esphome compile`, and flash the board
   (a human). Until then the board has no `Spectrum rate` select and the automation has nothing to
   set; the spectrum keeps the old 200 ms.
3. For `fast` while watching, set the choice to `fast` (the Ramka's Music page, Advanced, with 0.6.0).

## 0.1.0: first release

The firmware package `esphome/audio-sensor.yaml`, the `audio_spectrum` external component and the
hardware entries (the `m5stack-atom-echos3r` device, the `sound-sensor` kind). A home that already
runs its own copy of this firmware moves to the component by pointing its device file at the
package and keeping its `name`, `friendly_name` and `mic_gain` substitutions: the entity ids follow
from the names, so they do not change. Nothing else is required.

With a board marked `music: true`, `input_select.audio_sensor_music_source` lists the boards'
areas, that board first; the music aliases follow it, so another board can feed the Ramka's music
visual without a render. Each board gains a calibrated flag and a note; the music board's
calibration can be applied from the Ramka's settings (`script.audio_sensor_apply_calibration`).
`music: true` stays the default.
