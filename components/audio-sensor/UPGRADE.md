# audio-sensor: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

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
