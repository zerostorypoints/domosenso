# audio-sensor: field notes

A room sound sensor on an M5Stack Atom EchoS3R: the sound level and a third-octave spectrum from
the board, a calibrated level in dB SPL and the music aliases from the Home Assistant package, and
two dashboard cards, `ambient-wave-card` and `room-meter-card` (SPEC-018). There is no dashboard of
its own: the Ramka (0.4.0) shows the music visual and its settings. Room acoustics figures are not
part of it (dropped 2026-10-29: the Ramka's live settings cover the tuning).

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
| Spectrum | 31 comma-separated third-octave levels in dBFS (20 Hz to 20 kHz), as often as Spectrum rate says |
| Spectrum rate | `eco`, `normal`, `fast` (below); `normal` after a boot and an hour after `fast` |
| Octave 31.5 Hz to 16 kHz | ten sensors, the 1-minute Leq of each octave |
| Spectrum load | how much of one core the spectrum worker uses |
| Wi-Fi signal, Uptime, Connected AP (BSSID), Mic gain | diagnostics |
| Restart, Safe mode boot | buttons |

Levels stay in dBFS on the board (0 dBFS is clipping). Home Assistant adds a per-board SPL offset to
get dB SPL, so calibrating against a reference microphone needs no flash.

Measured on one board at `normal`: 31 bands about five times a second (4.71), the spectrum worker at about 19 % of one
core (measured with the earlier 8192-point FFT; 4096 points: about 22 %). The FFT is 4096 points
(Hann window, 50 % overlap) at 48 kHz, bins 11.7 Hz wide: the bands below about 80 Hz share bins
(25 and 31.5 Hz move together), approximate, adequate for a visual, not for measurement. 4096
rather than 8192 halves the time a hit needs to reach the screen (see Latency). The band sum
matches Sound level within about 1 dB.

## The microphone gain

`mic_gain` (default `24DB`, M5Stack's value) is one gain for the life of a calibration: changing it
moves every reading by the same step, so the SPL offset has to be measured again. If loud music
brings Sound peak to 0 dBFS, the microphone clips; step down to `18DB` and calibrate again.

## Placement

Where the board stands changes what the music visual shows, not how the firmware works: the 31
bands are correct anywhere, and the shape of the picture is corrected in the card (the Ramka's
response profiles and EQ presets, SPEC-024), not on the board. The figures below come from
loudspeaker and room-acoustics practice; the per-position level gains are computed from them for a
furnished living room (inference), not measured in every room.

| where | level against the listening position | spectrum | headroom at `24DB` |
|---|---|---|---|
| **At the listening position** (the default) | 0 dB; the board hears the room's reverberant field, as the listener does | what you hear there, room modes included | loud music can already reach 0 dBFS |
| **Between the speakers**, about 1 m from each | about +3 to +5 dB (up to +8.6 dB in free field) | mild bass gain near a wall or cabinet; the treble a little lower, as the speakers aim at the listener (inference) | less; a loud test decides |
| **Behind a speaker, near the wall** | the bass 6 to 12 dB up against the treble | pressure-zone bass, the treble shadowed by the cabinet, a dip at c/(4d) for a wall d away (286 Hz at 0.3 m, 172 Hz at 0.5 m) | the least, more so near a rear port |
| **On the amplifier**, between the speakers | about +10 to +13 dB at 0.3 m, most of it below 250 Hz | bass-heavy, the mids flat, the highs a few dB down (cabinet shadow) | less; also hum, vibration and heat (below) |

- **Why the level grows less than the distance says.** In free field the direct sound gains 6 dB
  per halving of the distance; in furnished rooms the level falls only about 3 dB per doubling,
  because the listening position sits beyond the critical distance, in the reverberant field
  ([NRC study, OSTI](https://www.osti.gov/biblio/653237);
  [QSC](https://blogs.qsc.com/live-sound/?p=2960);
  [Arup](https://strutt.arup.com/help/Electroacoustics/DCritical.htm)). Near a boundary the bass
  rises by about 6 dB, more in a corner
  ([Sonarworks](https://www.sonarworks.com/blog/glossary/acoustic-space-loading);
  [audioXpress](https://audioxpress.com/article/VC-Spotlight-Boundary-Effects-on-Sources-at-Low-Frequencies)),
  and the wall's reflection cuts a dip whose frequency depends on the distance to it
  ([Stereophile on Roy Allison](https://stereophile.com/content/glorious-time-ars-edgar-villchur-and-roy-allison-allison-part-2)).
- **Dynamics.** Close to the speakers the direct sound dominates the room's reverberant tail: the
  quiet-to-loud swing widens and decays fall away faster, so the picture looks punchier. A kick
  several dB louder also crosses the card's neutral-to-hot window earlier in its attack
  (inference; no source tests this for a near-field sensor).
- **Not lower latency.** Sound travels about 3 ms per metre: moving the board 2 to 3 m closer saves
  under 10 ms, well under one 85 ms frame on `fast` and a few percent of the measured sound-to-screen
  time ("Latency and update rate", below). A near board feels faster because of the louder, more
  direct bass, not because it is earlier.
- **One microphone cannot leave voices out.** The MSM381A3729H9BPC is omnidirectional
  ([MEMSensing datasheet, M5Stack mirror](https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/docs/products/atom/Atomic%20Echo%20Base/MEMS.pdf)):
  it hears people talking in the room as it hears the music, and the spectrum cannot tell them
  apart. Near the speakers the music is louder against the room, so voices weigh less; that is the
  only lever (inference). The EQ shapes the picture's colour, not what the board hears.
- **On the amplifier.** Vibration of the top plate is small: miniature MEMS microphones respond to
  acceleration at about 60 to 66 dB SPL equivalent per g ([Walsh & Miles, engrXiv](https://engrxiv.org/preprint/view/2074);
  measured on other MEMS parts, an order of magnitude here), and the music causes it, so it adds
  correlated bass rather than false beats (inference). Mains hum is the larger risk: a transformer
  hums at twice the mains frequency (100 Hz on 50 Hz mains) with harmonics
  ([IET Engx](https://engx.theiet.org/f/discussions/32305/have-you-ever-walked-past-a-transformer-and-noticed-that-steady-humming-sound/158489)),
  and an analog microphone line can pick up a magnetic field (the board's differential microphone
  input rejects most of it, inference from the
  [schematic](https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1182/Sch_M5_AtomEchoS3R_Audio_v1.0_20250716.pdf)).
  Check the 31.5 to 125 Hz bands with the amplifier on and nothing playing; a foam pad helps. The
  board is rated 0 to 40 °C ([M5Stack](https://docs.m5stack.com/en/core/Atom_EchoS3R)): read how
  warm the amplifier's top gets during a long film before leaving the board there.

### The microphone and the codec

The MSM381A3729H9BPC is an analog MEMS microphone (−38 dBV/Pa, 65 dB(A) SNR, 0.15 % THD at
94 dB SPL, acoustic overload 123 dB SPL at 10 % THD; datasheet above), not an I2S part such as the
INMP441 or ICS-43434. It goes through the ES8311 codec: ESPHome's driver sets the analog
amplifier to its maximum, and `mic_gain` is the ADC's digital gain in 6 dB steps
([ESPHome ES8311](https://esphome.io/components/audio_dac/es8311/)). The clip point is that digital
full scale, far below the capsule's overload (inference from the datasheet and the driver): loud
music at the listening position can already bring Sound peak to 0 dBFS at `24DB`, and a near
placement adds the gains of the table. There is no AGC, no squelch and no clip flag other than
Sound peak at 0 dBFS. Lowering `mic_gain` scales signal and noise together after the ADC, so a step
to `18DB` or `12DB` raises the clip point by 6 or 12 dB at no usable cost to the signal-to-noise
ratio (inference from the driver); then calibrate again.

**The firmware stays as it is for any placement.** Spectral shape, ballistics and the colour
window live in Home Assistant and the card. A loud test at the new spot (the loudest scene at the
loudest volume used) decides the gain: Sound peak at or below −6 dBFS with no clipped seconds
passes; otherwise `18DB`. Only a home that wants to switch the gain with its placement would need
a runtime gain select (writing the codec's gain register, as `Spectrum rate` switches its
profile); ESPHome's driver sets the gain only at boot, and no such select exists.

### What the community does, and the Ramka's profiles

No surveyed visualizer ships a placement mode as one switch; each part of one exists:

- **WLED Sound Reactive** ([audio_reactive.cpp](https://raw.githubusercontent.com/wled/WLED/main/usermods/audioreactive/audio_reactive.cpp);
  [kno.wled.ge](https://kno.wled.ge/advanced/audio-reactive/)): a 512-point FFT into 16 channels
  with pink-noise multipliers, a squelch gate, manual gain or an AGC with **Normal, Vivid and Lazy**
  presets, a limiter and a microphone high-pass near 90 Hz. Its docs give no placement guidance for
  a room microphone.
- **MoonModules WLED-MM** ([WLED-AudioReactive-Usermod](https://github.com/MoonModules/WLED-AudioReactive-Usermod);
  [sound settings](https://mm.kno.wled.ge/soundreactive/Sound-Settings/)): a frequency-profile
  dropdown per microphone and placement, among them "Generic Line-In", "INMP441 – big speakers,
  strong bass" and "ICS-43434 – big speakers", which cut bass weight and lift the highs, the same
  direction as a near-speaker correction. Its calibration: the microphone in line of sight 1 to
  2 m from the speaker, pink noise, the bars at 50 to 75 % of their range.
- **MSGEQ7 analysers** (the AliExpress spectrum analysers and VU clocks): seven fixed bands
  peak-detected in hardware, so an instant attack and a release set by the read rate, a microphone
  and an AUX input, at most one sensitivity knob ([MSGEQ7 datasheet](https://proto-pic.co.uk/content/MSGEQ7_datasheet.pdf)).
- **Peak programme meters**: an integration of 5 to 10 ms and a return of 20 to 24 dB in 1.7 to
  2.8 s ([Wikipedia](https://en.wikipedia.org/wiki/Peak_programme_meter)).
- **Govee** "Dynamic" and "Calm" music modes ([Govee](https://uk.govee.com/blogs/product-review-blog/govee-rgbic-striplights-taking-rgb-home-illumination-to-the-next-level));
  host tools avoid the microphone and take a digital stream ([LedFx](https://docs.ledfx.app/en/latest/settings/directing_audio.html);
  [HyperHDR](https://github.com/awawa-dev/hyperhdr/wiki/Audio-reactive)).

The Ramka's profiles map onto them: **Lively** is WLED's Vivid and Govee's Dynamic (a 50 / 300 ms
limiter, the ICS-43434 big-speakers curve), **Calm** WLED's Lazy and Govee's Calm (a 4.2 s decay,
the INMP441 big-speakers curve), **Analyser** an MSGEQ7 analyser or a PPM (instant attack, short
release, flat), **Behind speakers** the near-speaker correction (EQ preset `behind_speakers`: one
measurement on an amplifier as a starting point, or the home's own). The WLED-MM curves were tuned
for I2S microphones: on this analog one they carry the community's placement intent, not a
calibration. The derivation and the reasons: SPEC-024.

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

`input_select.audio_sensor_music_source` lists the boards' areas, the `music: true` board first and
the others in input order, then `—` (no sensor). Without a `music: true` board the list is `—`
first, then the boards in input order. The select, the aliases, the calibration inputs and the
script are always rendered. The music aliases (`sensor.music_spectrum`,
`sensor.music_spl_offset`, `sensor.music_level`, `sensor.music_mic_gain`,
`sensor.music_spl_calibration`, `binary_sensor.music_sensor_online`) read the board whose area the
select holds, so another board can feed a music visual without a render. With `—` every alias is
`unavailable` (and `binary_sensor.music_sensor_online` is off): a home can choose to have no music
source. A select that is `unknown` (a first start) or unavailable reads the `music: true` board, or
nothing when no board is marked, so the aliases never depend on the helper being there.
Two boards cannot share an area.
There is no `initial:` on any helper: a restart keeps the choice.

Every board has `input_boolean.<id_prefix>_spl_calibrated` (off = the offset is an estimate) and
`input_text.<id_prefix>_spl_note`. To calibrate the selected board: put a reference meter next to
it, play steady pink noise or music at a talking level, read both; the measured offset is the
reference minus the board's level without offset. Type it into
`input_number.audio_sensor_measured_offset`, add a note to `input_text.audio_sensor_calibration_note`
and run `script.audio_sensor_apply_calibration`: it writes the offset and the note into that
board's helpers and turns its flag on. Typing the offset straight into
`input_number.<id_prefix>_spl_offset` works as before. With `—` selected the
script does nothing, and the spectrum rate goes back to `normal` on the board the select left.

## The music source contract

SPEC-025, unreleased. Consumers (the Ramka, any later component) read only the music aliases, never a
board's own entities. The aliases are the interface, version 1:

| alias | shape | ability |
|---|---|---|
| `sensor.music_spectrum` | 31 comma-separated dBFS values, third octaves 20 Hz to 20 kHz | `spectrum` |
| `sensor.music_level` | one number, dBFS | `level` |
| `sensor.music_spl_offset` | dB; attribute `calibrated` | `calibration` (with `level`) |
| `input_select.audio_sensor_music_spectrum_rate`, forwarded to the board's select with options eco, normal, fast | | `rate` |
| `sensor.music_mic_gain` | the board's gain, read only | `gain` |

A board meets the contract when it gives `spectrum` or `level`; the other abilities are optional. A
board that is not this catalog's firmware meets it by giving the same shapes, mapped by
`sensors[].entities`.

`sensor.music_source` holds the selected board's area (`none` for `—`) and the attributes
`interface: 1` and `capabilities`, the abilities in the order spectrum, level, rate, calibration,
gain. `binary_sensor.music_source_spectrum`, `_level`, `_rate` and `_calibration` are on while the
selected board has the ability (one entity per ability, because a visibility condition tests a state,
not an attribute). They are `on` or `off`, never `unavailable`.

An ability is what the board can do, not whether it sends data now. An existing entity that is
`unavailable` or `unknown` keeps its ability, so a board that is rebooting does not flicker the
page; a missing entity has none. `spectrum` needs a spectrum entity whose state, while it has one,
is 31 numbers; `level` one whose state is a number; `rate` a select whose options include eco,
normal and fast; `calibration` follows `level`; `gain` is the mic-gain entity existing. They are
re-read on start, on a change of the select and every minute, never on a spectrum frame.

## The cards

Both are Lovelace resources of type `module`, installed with the component (`domosenso render` and a
deploy) and served from `/local/domosenso/audio-sensor/<version>/cards/ambient-wave-card.js` and
`.../cards/room-meter-card.js`; `domosenso status` and the deploy keep the resource URLs in step
with the version. Their configuration keys are a contract (docs/COMPATIBILITY.md, STABLE: new
optional keys only).

### `ambient-wave-card`

The live wave: a spectrum or one value drawn as calm waves that swell and warm with the level.

| key | default | what |
|---|---|---|
| `source.kind` | (required) | `spectrum` (31 third-octave bands, comma-separated) or `scalar` (one number) |
| `source.entity` | (required, unless `source.demo`) | the entity read, for example `sensor.music_spectrum` or `sensor.music_level` |
| `source.attribute` | none | read this attribute instead of the state |
| `source.offset` | `0` | dB added to every reading: dBFS plus the SPL offset is dB SPL (`sensor.music_spl_offset`) |
| `source.axis` | `third_octave` | the only axis there is |
| `source.show` | `[31.5, 16000]` | the lowest and highest band shown, Hz |
| `source.history` | `40` | readings a time-based flavour keeps |
| `source.demo`, `source.scenario` | `false`, `electronic` | draw generated data (`electronic`, `jazz`, `vocal`, `orchestra`, `quiet`) |
| `flavour` | spectrum `dune`, scalar `centre` | spectrum: `still`, `swell`, `dune`, `veil`, `voices`, `halo`, `afterglow`, `bars`; scalar: `still`, `tide`, `centre`, `timeline`, `clocks`, `ripples`, `tint`, `bars` |
| `flavour_options` | `{}` | options of the flavour itself |
| `colour.palette` | `series` | `zones`, `series`, `calm`, or a list of colour stops `[[dB, colour], ...]` |
| `colour.neutral` / `colour.hot` | `30` / `70` | dB SPL where the wave is neutral and fully warm; hot must be above neutral |
| `colour.neutral_color` | `var(--primary-color)` | the neutral colour |
| `dynamics.rise` / `fall` | `200` ms / `4` s | how fast the wave follows a louder and a quieter level |
| `dynamics.hold` | `1.5` s | how long a band's peak holds before it sinks (afterglow) |
| `dynamics.tilt` | `true` | spectrum only: weight the lowest and highest bands up when colouring, so the mids do not dominate |
| `dynamics.eq.<range>` | `0` | a gain in dB, -18 to +12, for each of six ranges: `sub`, `bass`, `low_mid`, `mid`, `presence`, `air`; a number or an entity |
| `look` | none | a `sensor.` entity whose attributes set a whole look (`rise` ms, `fall` s, `hold` s, `tilt`, `eq`, `spectrum` and `level` as `{neutral, hot}`); it overrides the options it names, and is ignored while unavailable |
| `style.line_width` | `4` | CSS px, 0.5 to 12 |
| `fps` | `30` | frames a second, 1 to 60 |
| `height` | the card's | CSS height of the drawing area |
| `controls` | `false` | a console on the card for trying options (a session only, nothing saved) |
| `active` | none | an entity: while it is not `on` the card draws `still`, then its loop sleeps |
| `fallback` | `none` | `classic`: while the source is `unavailable`, `unknown`, never seen, or a spectrum is older than 5 s, draw Ramka's classic wave with an info icon; `none` keeps the flavour, calming |

Every number, boolean or choice above except `source.kind`, `source.entity`, `source.attribute`,
`source.axis`, `source.show`, `active`, `fallback` and `height` may instead name an `input_number`,
`input_select`, `input_boolean`, `number`, `select` or `sensor` entity: the card reads its state on
every update, and an unusable state gives that option's default. `fallback` is a literal; entity
support may come later as an addition.

```yaml
type: custom:ambient-wave-card
source: {kind: spectrum, entity: sensor.music_spectrum, offset: sensor.music_spl_offset}
fallback: classic
```

### `room-meter-card`

An analogue meter of the room's level in dB SPL: needle, peak hold, zones, the clip mark, a strip of
recent readings and, on request, live tracking at 100 ms.

| key | default | what |
|---|---|---|
| `level` | (required) | 1 s RMS in dB SPL, for example `sensor.music_level` |
| `peak` | none | the loudest sample in that second, dB SPL |
| `leq` | none | a marker on the scale (an Leq sensor of the home's own) |
| `offset` | none | the SPL offset entity: its state places the clip mark (0 dBFS); its attribute `calibrated`, when true, drops the "estimated" note (the package's `sensor.<id_prefix>_spl_offset` and `sensor.music_spl_offset` carry it, from the board's calibrated flag) |
| `live_switch`, `live_level`, `live_peak` | none | the board's Live tracking switch and its fast level and peak (dBFS; the card adds the offset) |
| `min` / `max` | `20` / `120` | the scale, dB |
| `seconds` / `live_seconds` | `120` / `20` | length of the strip, normally and in live tracking |

The entity keys take entity ids only. The board's own level and peak are dBFS; the package's
`sensor.music_level` is the music board's level in dB SPL, and a peak in dB SPL (or a level for
another board) is a template sensor of the home's own: the board's Sound peak plus
`sensor.<id_prefix>_spl_offset`.

```yaml
type: custom:room-meter-card
level: sensor.music_level
offset: sensor.music_spl_offset
live_switch: switch.living_room_audio_sensor_living_room_live_tracking
live_level: sensor.living_room_audio_sensor_living_room_fast_sound_level
live_peak: sensor.living_room_audio_sensor_living_room_fast_sound_peak
```

## Latency and update rate

How late the visual follows a bass hit is the sum of these stages. The times are read from the
code, not measured yet (inference); the measurement below replaces them.

| stage | `normal` | `fast` |
|---|---|---|
| FFT window (4096 points at 48 kHz, Hann; 8192 before): a hit reaches full weight | about 43 ms | about 43 ms |
| wait for the publish, which happens when a frame lands and the interval has passed | 0 to 200 ms | 0 to about 5 ms |
| what goes out | the mean of the frames since the last publish: a kick in one of two or three frames loses about 4 dB | the newest frame alone |
| ESPHome API (`batch_delay: 10ms`; the default 100 ms halved `fast`), Home Assistant, the `sensor.music_spectrum` alias, the websocket | tens of ms (not timed) | same |
| the card's rise (default 200 ms, never shorter than the gap between pushes) | about 200 ms to 90 % | about 200 ms to 90 %; a shorter rise works now |

The board's **Spectrum rate** select sets the profile:

| profile | interval | what goes out | cost |
|---|---|---|---|
| `eco` | 500 ms | mean of the frames | the lightest: two state changes a second |
| `normal` | 200 ms | mean of the frames | today's rate: five a second |
| `fast` | 85 ms (every other 43 ms frame hop; with 50 % overlap every sample is in a sent frame) | the newest frame | about twelve state changes a second, one websocket message per open dashboard each |

The intervals are measured (below). Each publish is one CSV of 31 values over the API,
one state change and one alias render in Home Assistant, and one websocket message per open
dashboard; the recorder excludes the spectrum in every profile. The
package adds the choice `input_select.audio_sensor_music_spectrum_rate` (a fresh one starts on
`normal`, its first option; a state that is no option reads as `normal`) and the flag `input_boolean.audio_sensor_music_watching`. Its automation sets
the selected board's select to the choice, but `fast` only while the flag is on and back to `normal`
10 s after it turns off, so a board is fast only while someone looks. The Ramka sets the flag
while its music view shows. The automation re-applies the profile when Home Assistant starts, when
the music source changes (the board it leaves goes back to `normal`), and on any change of a
board's select: a board coming back online, a change made on the board, and the board's own
safety, which drops `fast` to `normal` after an hour.

The card's `fps` (the Ramka's "Redraw rate") is how often the browser draws. It cannot make the
data newer; on a weak tablet a lower value still saves work.

**Measurement** (2026-10-30, one board, ESPHome 2026.9.1; the rest after a flash, results here):

| what | method | result |
|---|---|---|
| publish rate per profile | 60 s each; count the board's spectrum `state_changed` events in Home Assistant; within 10 % of 500 / 200 / 85 ms | `eco` 2.02/s, mean 499 ms (p90 569); `normal` 5.00/s, mean 200 ms (p90 304); `fast` 11.52/s, mean 87 ms (p90 163), 98 % of the frames. Before, with the API's default `batch_delay` of 100 ms, `fast` gave 5.97/s, mean 168 ms; the old firmware's fixed 200 ms gave 4.70/s, mean 212 ms |
| load, `eco` against `normal` | Spectrum load and the Home Assistant event rate over 10 min each | |
| sound to screen, `fast` and `normal` | a tone burst or kick near the microphone, 10 trials filmed at 240 fps beside the tablet; median and 90th percentile; target under 300 ms in 9 of 10 on `fast` | `fast`, rise 50 ms, the card before the no-stepping change, one track filmed at 120 fps, time from the kick in the soundtrack to half of the wave's colour change at its bass end: FFT 8192, median 333 ms, 0 of 8 under 300; FFT 4096, median 280 ms (225–362), 9 of 12 under 300. `normal` not filmed yet |
| the fallbacks | a restart gives `normal`; `fast` alone falls back after 60 min; the music view closed gives `normal` after 10 s | |

What is left (the untimed stages, the skipped measurements, the fall, bass detail, a measuring
tool) is collected in #126.

A long `fall` (default 4 s) with kicks twice a second keeps the low bands high between kicks, which
also reads as "not following" (inference); try a shorter fall on the Music page while measuring.

## In the Ramka

With `music_visual: spectrum` or `level` in the Ramka's inputs (0.4.0), its now-playing view draws
`ambient-wave-card` from the music aliases in its wave strip, with `fallback: classic`. Its look is
live: the Ramka's settings dashboard, Music page, sets the visual, the flavours, palette, dynamics,
line width and redraw rate through the Ramka's helpers, and its Advanced part holds this
component's sensor update rate (above), its music source select and the calibration (`input_number.audio_sensor_measured_offset`,
`input_text.audio_sensor_calibration_note`, `script.audio_sensor_apply_calibration`). The Ramka's
README ("Music visual", "Live settings", "Settings page") has the details. Its response profiles
bind the card's `look` and `dynamics.eq` options (SPEC-024); where to put the board for them:
"Placement", above.

## Moving from a local copy

A home that already runs its own copy of this firmware, package or cards keeps its entity ids:

1. `domosenso add audio-sensor@<version>`; in `domosenso/audio-sensor.inputs.yaml` give each board
   the values it runs today: `name` and `friendly_name` (the ESPHome substitutions, which fixed
   the ids Home Assistant built when the board was adopted), `mic_gain`, and `id_prefix` (the prefix
   of the home's own SPL offset helper, `input_number.<id_prefix>_spl_offset`).
2. Set `entities` to the ids the board has in Home Assistant (Settings, Devices, the board), key by
   key (`spectrum`, `level`, `peak`, ...); the default is only a guess from the names, and a renamed
   device keeps its old ids. The text sensors (Mic gain, Connected AP) are `sensor.*` too.
3. Point the device file at the remote package (the thin file `add` wrote) and keep the
   substitutions; flash once over Wi-Fi.
4. Remove the home's own copies the component now owns (package, cards and their Lovelace
   resources), `domosenso render`, `deploy <target> --plan`: the plan must show the component's
   files and no removed entity. A helper whose id is the same keeps its value, so a calibrated
   offset survives.

## The spectrum component

`esphome/components/audio_spectrum/` is an ESPHome external component. The package loads it from
this repository at the component's tag, so the `ref` in `external_components` is a literal that
`tools/catalog_check.py` compares with the manifest's version. The band maths are in
`spectrum_bands.h` with no ESPHome dependency, so `tests/test_audio_spectrum_bands.py` builds and
checks them on the host. When the spectrum goes out (the profiles and the publish rule) is in
`publish_policy.h`, host-tested the same way.

## Limits

- Not a measurement microphone: an analog MEMS capsule on a small board, one gain, no frequency
  correction curve. The SPL offset is one number per board.
- Tested on one board in one home. A second board in the same home is assumed to work, not tested.
