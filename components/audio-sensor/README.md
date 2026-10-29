# audio-sensor: field notes

A room sound sensor on an M5Stack Atom EchoS3R: the sound level, a third-octave spectrum and, in
later parts of this component, a calibrated level in dB SPL, two dashboard cards and an optional
Room acoustics dashboard. This page holds the hardware and the first flash; the rest follows with
those parts (SPEC-018).

## The board

- **M5Stack Atom EchoS3R**: ESP32-S3-PICO-1-N8R8 (8 MB flash, 8 MB PSRAM), an ES8311 audio codec,
  an analog MEMS microphone read through the codec (not a PDM microphone), and an NS4150B
  speaker amplifier. The firmware keeps the amplifier off: an idle class-D amplifier is noise in the
  microphone.
- It only measures. There is no Bluetooth, no voice assistant and no speaker in the package, so the
  radio and the CPU stay free for a clean audio stream. A Bluetooth proxy on the same board is not
  tested together with the spectrum worker; a home that wants one adds `bluetooth_proxy:` to its
  own device file and watches the Spectrum load sensor (inference: the S3 has room for it).
- Power: 5 V USB. Wi-Fi power saving is off in the package, because the radio waking up pulses the
  supply rail the microphone shares and shows up as noise in the quiet range.

## What it reports

| entity | what |
|---|---|
| Sound level, Sound peak | every second: RMS and the loudest sample, in dBFS, unweighted (no A or C weighting) |
| Fast sound level, Fast sound peak | every 100 ms, published only while **Live tracking** is on; the switch is off after a boot and turns itself off after an hour |
| Spectrum | 31 comma-separated third-octave levels in dBFS (20 Hz to 20 kHz), about five times a second |
| Octave 31.5 Hz to 16 kHz | ten sensors, the 1-minute Leq of each octave |
| Spectrum load | how much of one core the spectrum worker uses |
| Wi-Fi signal, Uptime, Connected AP (BSSID), Mic gain | diagnostics |
| Restart, Safe mode boot | buttons |

Levels stay in dBFS on the board (0 dBFS is clipping). Home Assistant adds a per-board SPL offset to
get dB SPL, so calibrating against a reference microphone needs no flash.

Measured on one board: 31 bands about five times a second, the spectrum worker at about 19 % of one
core. The bands below about 50 Hz hold one or two FFT bins: approximate, adequate for a visual, not
for measurement. The FFT is 8192 points (Hann window, 50 % overlap) at 48 kHz, and the band sum
matches Sound level within about 1 dB.

## The microphone gain

`mic_gain` (default `24DB`, M5Stack's value) is one gain for the life of a calibration: changing it
moves every reading by the same step, so the SPL offset has to be measured again. If loud music
brings Sound peak to 0 dBFS, the microphone clips; step down to `18DB` and calibrate again.

## First flash

The package is a remote ESPHome package; a home's device file is thin (its header is in
[esphome/audio-sensor.yaml](esphome/audio-sensor.yaml)). A human flashes the first time:

1. Put the board in download mode: hold its button while plugging in the USB-C cable.
2. From the home's repository: `uvx esphome@2026.9.1 run <the device file>` and pick the serial port.
3. In Home Assistant, confirm the discovered ESPHome device (the API key is the one in the home's
   ESPHome `secrets.yaml`). Later updates go over Wi-Fi with the same command.

Wi-Fi and the API key come from the device file, never from the package: a remote package cannot
read a home's secrets. With wrong Wi-Fi credentials the fix is a USB flash again (no fallback AP).

## The music source and calibration

With a board marked `music: true`, `input_select.audio_sensor_music_source` lists the boards' areas,
that board first and the others in input order. The music aliases (`sensor.music_spectrum`,
`sensor.music_spl_offset`, `sensor.music_level`, `sensor.music_mic_gain`,
`sensor.music_spl_calibration`, `binary_sensor.music_sensor_online`) read the board whose area the
select holds, so another board can feed a music visual without a render. One board gives a
one-option select. A select that is `unknown` (a first start) or unavailable reads the `music: true`
board, so the aliases never depend on the helper being there. Two boards cannot share an area.
There is no `initial:` on any helper: a restart keeps the choice.

Every board has `input_boolean.<id_prefix>_spl_calibrated` (off = the offset is an estimate) and
`input_text.<id_prefix>_spl_note`. To calibrate the selected board: put a reference meter next to
it, play steady pink noise or music at a talking level, read both; the measured offset is the
reference minus the board's level without offset. Type it into
`input_number.audio_sensor_measured_offset`, add a note to `input_text.audio_sensor_calibration_note`
and run `script.audio_sensor_apply_calibration`: it writes the offset and the note into that
board's helpers and turns its flag on. Typing the offset straight into
`input_number.<id_prefix>_spl_offset` works as before. Without a `music: true` board there is no
select, no alias, no measured-offset or note input and no script; the per-board flag and note stay.

## The spectrum component

`esphome/components/audio_spectrum/` is an ESPHome external component. The package loads it from
this repository at the component's tag, so the `ref` in `external_components` is a literal that
`tools/catalog_check.py` compares with the manifest's version. The band maths are in
`spectrum_bands.h` with no ESPHome dependency, so `tests/test_audio_spectrum_bands.py` builds and
checks them on the host.

## Limits

- Not a measurement microphone: an analog MEMS capsule on a small board, one gain, no frequency
  correction curve. The SPL offset is one number per board.
- Tested on one board in one home. A second board in the same home is assumed to work, not tested.
