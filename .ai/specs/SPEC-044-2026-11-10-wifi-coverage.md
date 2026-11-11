# SPEC-044 — Wi-Fi coverage on the floor plan: predicted, checked by devices, refined by a survey walk

**Status:** approved 2026-11-10 by the maintainer ("Approve, write plan").

**Source:** the maintainer, 2026-11-10, while troubleshooting a mesh network in a real home (calls
dropping when walking between rooms after a phone change): "can we somehow get the wifi coverage on
the Floor Plan (I placed the deco routers on the locations where they really are)?", then: a
general feature for every home; prediction first, then validated by devices and a survey; the
validation may raise or lower the coverage; materials matter, window types included; every source
of signal strength counts (ESPHome, ATOM, Tapo, … if they report it); an interactive survey walk
with a laptop, marking the exact spot on the plan; the bands (2.4, 5, 6 GHz) in the calculation.
The design was challenged in three iterations in that session (recorded under **Design record**).

Extends [SPEC-028](SPEC-028-2026-11-01-floorplan.md) (the plan document, its maps, openings and
open spaces). No catalog component is added: this is the `floorplan` component and the
`domosenso floorplan` command.

## Goal

A home sees on its floor plan, per Wi-Fi band, how strong its Wi-Fi is everywhere, which access
point serves each place and where a moving client hands over between access points: first as a
**prediction** from where its access points stand and what its walls, windows and doors are made
of, then **corrected** by what its Wi-Fi devices already report and, when the owner wants more
accuracy, by a **survey walk** with a laptop. The map says how much of it rests on measurements.

Placement test (`docs/PRINCIPLES.md`):

1. Home Assistant offers no coverage map, no plan with materials and no survey. Routers' own apps
   show per-client signal at best, never a map. Desktop survey tools (Ekahau, NetSpot, iBwave) are
   separate products with their own drawing of the home and no link to Home Assistant's devices.
2. Every home with Wi-Fi and a floor plan needs it, and the inputs (positions, materials, the
   devices' signal entities) are already the catalog's floor plan and Home Assistant's entities.
   **A component: floorplan.**
3. Nothing in it is specific to one home; a home's materials and survey stay in its own plan file.

## Devices

- **Access points:** any. Routers, mesh nodes and access points whose integration reports their
  per-band BSSIDs give the best matching (verified: TP-Link Deco through the HACS `tplink_deco`
  integration exposes `bssid 2.4 GHz` and `bssid 5 GHz` sensors per node, not 6 GHz, and per client
  the node and the band it is connected on). Without an integration an access point is placed by
  hand as a point (Amendment 5's `entity_id` points, or a device of any integration).
- **Wi-Fi signal sources** (optional; each one sharpens the map):
  - ESPHome devices with `wifi_signal` (dBm) and `wifi_info` `bssid` (verified in a real home:
    `sensor.<node>_wi_fi_signal` in dBm with `state_class: measurement`, and
    `sensor.<node>_connected_ap_bssid`, on ESP32 and an M5Stack ATOM);
  - Shelly, Tasmota, WLED, TP-Link Kasa/Tapo Wi-Fi devices (plugs, hubs, cameras) through their
    integrations' signal sensors in dBm, often disabled by default (inference from those
    integrations' documentation; S2 verifies each rule against a fixture);
  - the Android Companion app's Wi-Fi signal strength and BSSID sensors (iOS reports the BSSID only,
    no signal: it gives the serving access point, not a level).
- **Not Wi-Fi, and left out** (verified in a real home): Bluetooth devices' `signal_strength` in dBm
  (a RuuviTag through the `bluetooth` integration), and the Tapo T310/T315 `signal_level` 0–3, which
  is their sub-GHz link to a Tapo hub. Zigbee LQI likewise.
- **Survey:** a laptop with Wi-Fi running the `domosenso` command: macOS (verified: without admin
  rights `system_profiler SPAirPortDataType` gives the connected link's signal and noise in dBm,
  channel, band and width in about 5 s; other networks' signal and every BSSID are redacted),
  Linux (`iw dev <if> link`, `iw dev <if> scan` as root; inference), Windows
  (`netsh wlan show interfaces`, signal in %; inference).

## Integrations

None new. The signal sources are the entities of integrations a home already has. The survey reads
the laptop's own Wi-Fi from the operating system. Enabling an integration's disabled signal sensors
is the owner's step (Settings → Entities); the card lists the ones that would help (S2).

## The model

### Prediction (S1)

Per access point *a*, band *b* and grid cell *p*, the received signal in dBm:

```
P(a,b,p) = T(a,b) − L0(b) − 10·n·log10(max(d, 0.5)) − Σ walls crossed L(m,b)·k(θ) − Σ slabs L(s,b)
```

- `T(a,b)`: the access point's transmit power (EIRP) on the band. Defaults (the EU limits for
  indoor use, the common case): 2.4 GHz 20 dBm, 5 GHz 23 dBm, 6 GHz 23 dBm; per access point
  overridable. Prior uncertainty ±4 dB.
- `L0(b)`: free-space loss at 1 m, `20·log10(f_MHz) − 27.55`: 2.4 GHz 40.2 dB (2437 MHz), 5 GHz
  47.3 dB (5500 MHz), 6 GHz 48.7 dB (6500 MHz); the channel's centre when a reading names it.
- `n`: the distance exponent, 2.0 (free space; the walls carry the rest, the COST 231 multi-wall
  model). Prior ±0.3.
- `d`: the 3D distance in metres, with each floor's `height` and the access point's `mount` height
  (default 1.0 m above its floor; a client at 1.0 m).
- `L(m,b)`: the loss of a wall or an opening of material *m* on band *b* (the materials table);
  an open door or window (live, Amendment 9) costs nothing; a wall between two rooms of one open
  space (Amendment 7) is not a wall.
- `k(θ)`: oblique crossing, `min(1/cos θ, 2)` (a ray at a slant crosses more material; capped
  because the real path then diffracts round instead).
- Slabs: the floors between the access point and the cell, each `floors[].slab`'s loss.
- Grid: 0.15 m (the maps' `STEP_M`), 0.3 m when the card is narrower than 600 px (the Ramka).
  Computed only inside rooms; outside the outer walls is not drawn.
- **Serving access point** of a cell on a band: the strongest *P*. **Handover zone**: cells where
  the strongest two access points on the shown band are within 6 dB of each other.

### Materials (`components/floorplan/cards/lib/materials.json`, data, changes freely)

Per material and band: the loss in dB and its uncertainty (one standard deviation) for the fit.
Homogeneous materials are computed from ITU-R P.2040-3's permittivity and conductivity (Table 3,
`η' = a·f^b`, `σ = c·f^d`) for a slab of the stated thickness at normal incidence, averaged over
±20 % thickness to remove the standing-wave ripple (the script is part of S1:
`tools/materials_table.py`), then rounded and widened to field values where real walls lose more
than an ideal slab (mortar, plaster, moisture, studs). Coated glass comes from measurements. The
values are **priors**, not truths: calibration moves them.

| id | what | 2.4 GHz | 5 GHz | 6 GHz | ± | basis |
|---|---|---|---|---|---|---|
| `drywall` | plasterboard partition | 3 | 4 | 4 | 2 | P.2040 slab 1–2 dB, widened for studs and cavity |
| `wood` | wooden wall or door, 40 mm | 2 | 3 | 3 | 2 | P.2040 0.7 / 1.6 / 1.9 |
| `aerated_block` | aerated concrete block | 5 | 8 | 9 | 3 | inference between drywall and brick |
| `brick` | brick or masonry, 12–25 cm | 7 | 10 | 11 | 3 | P.2040 3.8–7.6, widened for mortar and plaster |
| `concrete` | concrete, 10–20 cm | 12 | 20 | 23 | 5 | P.2040 8.1–14.7 / 13.9–26.5 / 15.7–29.9 |
| `reinforced_concrete` | load-bearing wall or slab, 20–25 cm | 18 | 30 | 34 | 6 | P.2040 concrete 14.7–18.0 / 26.5–32.7 / 29.9–37.1, plus rebar |
| `glass` | single pane | 2 | 3 | 3 | 1 | P.2040 1.1 / 2.9 / 3.2 |
| `double` | double glazing, uncoated | 3 | 3 | 3 | 2 | P.2040 2×4 mm |
| `low_e` | double glazing with a low-E coating | 20 | 27 | 30 | 8 | measurements: single-silver low-E about 27 dB at 5 GHz; coating changes moved 7–9 dB at 2.4 and 14–17 dB at 5 GHz |
| `triple_low_e` | triple glazing, multi-silver coatings | 35 | 40 | 42 | 10 | vendor data: about 40 dB for one triple-silver laminate |
| `metal` | metal door, foil-backed insulation, lift shaft | 30 | 35 | 35 | 10 | cap; diffraction round it carries the signal |
| `interior` | an interior wall of unknown material (default) | 5 | 7 | 8 | 4 | between drywall and brick, wide on purpose |
| `exterior` | an outer wall of unknown material (default) | 10 | 15 | 17 | 6 | brick to concrete, wide on purpose |
| `slab` | a floor slab of unknown material (default) | 15 | 25 | 28 | 8 | reinforced concrete, widened |

Sources: ITU-R P.2040-3 Table 3 as reproduced in MathWorks' `buildingMaterialPermittivity`
documentation (the coefficients; S1 checks them against the ITU text); low-E measurements in
*Lithuanian Journal of Physics* (shielding of energy-saving windows in the Wi-Fi range) and
Ding, SVC 2021 (single-silver low-E about 27 dB at 5 GHz); triple-silver from a PPG figure quoted by
Graham Windows. The table's last three rows are defaults, chosen so an unset home predicts
something sensible with honest uncertainty.

### Calibration (S2, S3)

An **observation** is: floor, position, band, access point (or unknown), dBm, weight, source,
and for a device its device id. Sources and their weights:

| source | position | access point and band from | value | prior device offset |
|---|---|---|---|---|
| survey (laptop) | the tap | the BSSID when the OS gives it, else the router's client tracker for the laptop's MAC at that time, else the band from the channel and the access point unknown | mean of 5 readings | 0 ± 3 dB |
| manual reading | the tap | typed band; access point chosen or unknown | typed | 0 ± 5 dB |
| device sensor (ESPHome, Shelly, …) | its placed point | its BSSID sensor matched to an access point's BSSID sensor, else the router's client tracker by MAC, else unknown | the 24 h mean from hourly statistics (state when it has none) | 0 ± 6 dB, one offset per device |

- An observation with an unknown access point is compared with the strongest predicted access
  point on its band, at half weight (a sticky client may be on a weaker one).
- **The fit** is a regularised least-squares (maximum a posteriori) estimate of: each access
  point's `T` offset per band, the distance exponent `n`, each material's loss per band (only
  materials some observation's path crosses) and each device's offset, every one pulled towards
  its prior by its uncertainty. Gauss–Newton on a few dozen unknowns, in the card on the main
  thread (measured: a few milliseconds for a home's readings, so no worker).
- **Guards:** fewer than 5 observations on a band: only the `T` offsets of that band move; fewer
  than 3 distinct rooms with observations: materials keep their priors. Bands share the materials'
  ratios: a 2.4 GHz-only device moves a material's 5 and 6 GHz loss by the prior's ratio, at a
  third of the weight. The rooms are counted among the observations of bands with 5 or more.
- **Robustness (final review, R25):** on a band with fewer than 5 observations a reading's
  uncertainty also carries its source's frozen offset, `sd = hypot(4, offset sd)` (device 7.2,
  survey 5, manual 6.4 dB). On every band each reading is Huber-weighted at 1.5 sd: with
  `z = |prediction − reading| / sd`, beyond 1.5 its weight is multiplied by `sqrt(1.5 / z)`. One
  reading 30 dB off moves a transmit power by less than 4 dB.
- **Residuals:** what the fit leaves at each observation is spread to the grid by inverse distance
  squared with a 3 m range, each wall between an observation and a cell halving its weight. The
  calibrated map is prediction-with-fit plus residuals, so a measurement can raise or lower the
  map near it and the fit can raise or lower it everywhere.
- **Confidence** of a cell: high within 2 m of an observation of its serving access point and band,
  medium where the fit moved parameters its paths depend on, low where only priors apply.
- Determinism: the same plan, observations and table give the same map (fixed iteration count,
  sorted inputs). Cached by a hash of them.

## The plan document (`schemas/floorplan.schema.json`, `schema: 1`, new optional keys)

```jsonc
{
  "schema": 1,
  "wifi": {                                  // optional; absent: defaults below
    "defaults": {"interior": "interior", "exterior": "exterior"},
    "samples": [                             // survey and manual readings, at most 2000
      {"floor_id": "ground", "x": 3.4, "y": 2.1, "t": "2026-11-10T19:30:00Z",
       "band": "5", "channel": 36, "dbm": -58, "noise": -92,
       "ap": "a1b2…", "bssid": "02:00:00:00:00:01", "source": "survey"}
    ]
  },
  "floors": [{
    "floor_id": "ground",
    "height": 2.7,                           // metres, default 2.7
    "slab": "slab",                          // the floor under this one, a material id
    "walls": [{"at": [4.2, 0.0], "material": "brick"}],
    "openings": [{"kind": "window", "rooms": ["living_room", null], "at": [2.0, 0.0],
                  "material": "low_e"}],
    "access_points": [{"device_id": "a1b2…", "bands": ["2.4", "5", "6"],
                       "tx": {"5": 20}, "mount": 1.0}]
  }]
}
```

- `walls[]`: the material of the straight wall segment through `at` (between the corners on either
  side, the segment Amendment 9's free-wall measure finds), within 0.05 m. A wall is interior when
  two rooms share it, exterior when one room has it alone; unset walls take `wifi.defaults`.
- `openings[].material`: window and fixed glass `glass`, `double`, `low_e`, `triple_low_e`
  (default `double`); door `wood`, `glass`, `metal` (default `wood`); a doorway has none.
- `access_points[]`: a device or entity point of the floor; its position is the point's. `bands`
  the bands it serves; `tx` per-band EIRP overrides in dBm; `mount` its height above its floor.
- `wifi.samples[]`: `band` one of `2.4`, `5`, `6`; `ap` a device id of an access point or absent;
  `source` `survey` or `manual`. Positions in metres like points. Device sensors are never stored:
  the card reads them live.
- Floors order by Home Assistant's floor `level` (null last, then by id).
- **Validation** (`push`, `preview`, `survey`): material ids exist in the table; a wall's `at` lies
  on a room edge of its floor; an opening's material fits its kind; an access point is a point of
  its floor and appears once; `bands` non-empty and known; `tx` keys among `bands`, −10 to 36;
  `mount` 0–5; `height` 2–10; samples on a floor of the document, `dbm` −110 to 0, at most 2000.
- `push --plan` prints `wifi change <floor>` when a floor's walls, access points or opening
  materials differ, and `wifi samples <n>` when the samples differ (their count after the push).

## Card (`custom:floorplan-card`)

- **Layer:** maps on the `radio` layer (its access points are already radio devices):

  | map | shows |
  |---|---|
  | 2.4 GHz, 5 GHz, 6 GHz (those some access point serves) | the strongest signal per cell, dBm |
  | Serving | each cell in its serving access point's colour on the band chosen beside it; handover zones hatched |
  | Confidence | high, medium, low |

  The 2.4/5/6 and serving maps get a **Predicted / Calibrated** switch in place of Now / 24 h
  (hidden while there is nothing to calibrate with); Calibrated is the default once observations
  exist. Fixed scale −90 to −30 dBm with marks at −67 dBm (the usual floor for calls) and −75 dBm.
- **Labels:** an access point shows its bands; a signal source its dBm, band and the access point it
  is on; a survey sample a small dot with its dBm (only on the Confidence map and in edit mode).
- **Edit mode:**
  - **Walls** tool: a tap on a wall selects its segment; the panel sets its material; two buttons
    set the defaults for interior and exterior walls.
  - The opening panel (Amendment 9) gains **Material**.
  - A point's panel gains **Access point** (on/off), its bands, transmit power per band and mount
    height. Points matched by the rules (below) are offered "Use as access point?" once.
  - **Add reading**: a tap places a manual sample; the panel takes dBm, band and the access point
    (or unknown), for a reading from a phone's Wi-Fi scanner.
  - The floor panel sets `height` and `slab`.
- **Rules** (`components/floorplan/cards/lib/wifi-rules.json`, data, changes freely): access point
  integrations and how to read their BSSIDs and clients (`tplink_deco` first; `unifi`,
  `tplink_omada`, `fritz` when a fixture proves them); signal entities (device class
  `signal_strength`, unit dBm) counted as Wi-Fi by integration (`esphome`, `shelly`, `tasmota`,
  `wled`, `tplink`, `mobile_app`) or by a `wi_fi`/`wifi` object id; left out when the device has a
  `bluetooth` or `zigbee` connection or its integration is `bluetooth`, `zha`, `mqtt` with a Zigbee
  model, and every non-dBm `signal_level`.
- **Disabled sources:** in edit mode (admins only, as edit mode is), the edit-mode panel (edit
  mode shows no maps, so not the Confidence legend; R15) lists signal entities the rules would use that are disabled, read with
  `config/entity_registry/list` (an admin call; view mode and the kiosk user never make it), so the
  owner can enable them.
- Card config: `wifi` (boolean, default `true`): `false` draws no Wi-Fi maps or tools.

## Command: `domosenso floorplan survey <target> [--port <n>] [--no-open] [--interface <if>]`

- Serves the rendered card on 127.0.0.1 behind a random key like `preview` (Amendment 6), reading
  the target read-only, with the radio layer's Wi-Fi maps and a **Survey** panel.
- Reads the laptop's Wi-Fi link every 2 s: macOS `system_profiler SPAirPortDataType` (and the
  BSSID from CoreWLAN when Location permission allows it, S3's spike), Linux `iw`, Windows
  `netsh wlan show interfaces` (signal % converted, `dBm = % / 2 − 100`, an approximation; inference).
- A tap on the plan, then **I'm here**: the next 5 readings (10 s) are averaged into one sample with
  band, channel, noise and the serving access point (the BSSID, else the router's client tracker for
  the laptop's MAC read from the target, else unknown). The page shows the live reading, the
  samples so far and the next suggested spots.
- **Next spots:** the three cells farthest from any sample of their serving access point and band,
  the handover zones without a sample, and rooms without one.
- Every sample is written at once to `domosenso/floorplan.json`'s `wifi.samples`; nothing is written
  to Home Assistant. The owner pushes with `floorplan push --plan` and, after the go-ahead,
  `--apply`.
- Prints `read <target>: …` as `preview`, `survey <url>`, `link <band> <channel> <dbm> dBm` every
  30 s, `sample <floor> <x> <y> <band> <dbm> dBm <ap or ->` per sample, `wrote domosenso/floorplan.json`
  per sample, `stopped`. `FAIL` reasons add `no Wi-Fi interface` and `Wi-Fi is off`.

### Survey walk (README, and the Survey panel's help)

1. Run the survey on the laptop you carry; keep it on the home's own network, not a hotspot.
2. Hold it at chest height with the lid open, in front of you, the way a phone is held on a call.
3. Start at an access point, then walk room by room. Stop about every 2 m and in every doorway.
4. At each stop: tap exactly where you stand, press **I'm here**, stand still for 10 s.
5. Visit the suggested spots, above all the handover zones between access points.
6. The laptop reports the band it is on; a mesh with one network name chooses it. To survey another
   band, rerun with a network name that has only that band, if the router offers one, or accept the
   fit's carry-over between bands.
7. Push the samples to Home Assistant (`floorplan push`), and repeat the walk after moving an access
   point or changing a wall's or window's material.

## Provides and consumes

- Provides: the document keys above (ADDITIVE-ONLY), the card's `wifi` config key and its maps
  (ADDITIVE-ONLY), `floorplan survey` and its lines (ADDITIVE-ONLY), `push` lines `wifi change` and
  `wifi samples` (ADDITIVE-ONLY). The materials and rules files are data.
- Consumes (read only): device and entity registries, states, `recorder/statistics_during_period`
  (hourly `mean`, as Amendment 7), the router integration's client trackers and BSSID sensors.

## Artifacts and ownership

| artifact | layer |
|---|---|
| `components/floorplan/cards/lib/wifi.js`, `materials.json`, `wifi-rules.json` | managed (rendered with the card) |
| the plan's `wifi`, `walls`, `access_points`, opening materials, `height`, `slab` | instance (`domosenso/floorplan.json` and the `floorplan` dashboard) |
| `tools/materials_table.py` | catalog tool |

## Compatibility

- Additive: a plan without the new keys behaves as today; a Wi-Fi map with no access point shows
  the hint "Mark your access points in edit mode".
- `docs/COMPATIBILITY.md`: the `floorplan.schema.json` row gains `wifi`, `walls`,
  `access_points`, `height`, `slab` and `openings[].material`; the `floorplan` command row gains
  `survey`, `wifi change`, `wifi samples`. No `UPGRADE.md` step: nothing to migrate.
- The floorplan version: the maintainer's call (no version is bumped by this spec).

## Stages (each a pull request into `feature/wifi-coverage`)

1. **S1 Prediction:** schema keys and validation, `push` lines, `materials.json` with
   `tools/materials_table.py`, `lib/wifi.js` (prediction, serving, handover), the 2.4/5/6 and
   Serving maps, the Walls tool, opening material, access point panel, floor height and slab,
   the rules' access point part. Usable alone.
2. **S2 Device calibration:** source discovery by the rules, access point and band matching, 24 h
   values, the fit with its guards, residuals, Confidence map, Predicted / Calibrated, the disabled
   sources list.
3. **S3 Survey:** the spike on macOS BSSID access first, then `floorplan survey`, readers for macOS,
   Linux and Windows, suggested spots, manual readings in edit mode, the README walk.
4. Later, each with its own amendment: live readings from the Android Companion app while walking
   with the card; obstacles (metal furniture, appliances); per-room coverage as Home Assistant
   sensors; a roaming log from the client trackers' history.

## Tests

- `tools/materials_table.py` regenerates `materials.json`'s computed columns (pytest compares).
- `lib/wifi.test.mjs`: free-space loss per band; one wall of each material on each band; oblique
  cap; open door costs nothing; open-space edge is no wall; slabs between floors; serving and
  handover on a two-access-point fixture; the fit recovers a known `T` offset and a known wall
  loss from synthetic observations within 1 dB; the guards (few observations move only `T`);
  residuals raise and lower the map near an observation and fade across a wall; determinism.
- `lib/wifi-rules` tests: an ESPHome Wi-Fi sensor counts; a Bluetooth dBm and a Tapo
  `signal_level` do not; BSSID matching to an access point's BSSID sensor; client tracker fallback.
- `test_cli_floorplan.py`: validation failures for each new key; `wifi change`, `wifi samples`;
  `survey` with a fake reader (sample averaging, writing the file, no Home Assistant write).
- `floorplan-card.test.mjs`: the maps, switch, legend, Walls tool, access point panel, Add reading.
- Staging: a home's plan with three access points, a screenshot per map for the pull request.

## Out of scope

- Throughput, SNR or roaming-time prediction; channel planning, interference and neighbours'
  networks; antenna patterns (every access point is omnidirectional).
- Furniture and obstacles inside rooms (later stage).
- Zigbee, Thread, Bluetooth or sub-GHz coverage maps (the engine could serve them later).
- Writing to routers or changing their settings.

## Design record (three iterations, 2026-11-10)

1. *Interpolate the devices' dBm like the climate maps.* Walls stop that interpolation and most
   rooms have no Wi-Fi device, so it predicts nothing; Bluetooth and sub-GHz readings would pollute
   it. Rejected: the map needs a propagation model.
2. *Prediction with measurements overriding nearby cells.* Breaks on device antenna offsets
   (5–10 dB low in an enclosure), on sticky clients reporting a far access point, on single-band
   devices, on noise and on bullseyes round each sensor. Changed to: observations tied to their
   access point and band, parameters fitted rather than cells painted, 24 h means, smooth
   residuals.
3. *Challenge the fit.* Few sensors in one room overfit materials; a laptop cannot see other access
   points' BSSIDs; the owner's real question (calls dropping while walking) is about handover, not
   level. Changed to: priors with uncertainties and guards, a Confidence map, router-tracker
   fallback for the serving access point, the Serving map with handover zones, and suggested
   survey spots.

## Open questions

- **macOS BSSID** (S3 spike, 2026-11-11, macOS 27.2): verified that without Location permission
  CoreWLAN gives a command-line tool the connected link's signal, noise, channel and band at once
  (no 5 s wait), and a scan with each network's signal and channel, but every SSID and BSSID is
  nil; `system_profiler` redacts them too. Not verified: CoreWLAN with Location permission (a
  command-line tool cannot ask for it; the terminal would have to be granted it by hand).
  **Decision:** the macOS reader uses a small CoreWLAN helper compiled with `swiftc` on first use
  when the Xcode command-line tools are there, else `system_profiler`; neither gives the BSSID, so
  the serving access point comes from the router's client tracker (30 s polling: the sample keeps
  the tracker's value at its time), else it is unknown.
- **6 GHz BSSIDs:** `tplink_deco` does not expose them (verified); a 6 GHz observation's access point
  then comes from the client tracker only.
- **Material values:** the coefficients are from a secondary reproduction of P.2040-3; S1 checks
  them against the ITU text. Coated glass varies widely by product (inference from the spread of
  the measurements); the wide uncertainty is deliberate.
- **Layer:** maps on `radio` (this spec) or a separate `wifi` layer chip. `radio` keeps the layer
  list short; a separate chip would show Wi-Fi devices without hubs.

## Amendment 1 (outdoor rooms)

- Status: approved 2026-11-11 by the maintainer ("yes"). Source: the maintainer, 2026-11-11: "Balcony in
  the current setup is drawn as a room, so it must be included in the calculation and
  visualisations. Typically, this is the most problematic place, depending on the type of glass /
  wall and distance to the wifi station." A balcony drawn as a room was already computed, but its
  wall to the home counted as interior, its glazed doors defaulted to wood (glazing was offered for
  windows only) and a door between two rooms without a sensor defaulted to open.
- Document: `wifi.outdoor` (optional): a list of area ids of rooms that are outdoors (balcony,
  terrace, winter garden); each a room of some floor, once.
- Prediction: a wall between an indoor and an outdoor room is exterior (its default is
  `wifi.defaults.exterior`); an opening between an indoor and an outdoor room defaults to
  `state: closed` like one to the outside; a door to an outdoor room defaults to material `double`.
  An outdoor room's own edges that no other room shares (a railing) are no wall and cost nothing
  until the owner sets a material for them in the Walls tool (`floor.walls`; R24, final review).
  An outdoor room's cells are computed and drawn like any room's; next spots include it.
- Materials: `double`, `low_e`, `triple_low_e` are also door materials (a glazed door is glazing).
- Card: the Walls tool's floor panel lists the floor's rooms with an **Outdoors** switch each.
- Validation and `push --plan`: unknown or repeated area ids refused (`outdoor: <id> is not a room`,
  `outdoor: <id> twice`); a change prints `wifi change <floor>` for the floors of the rooms concerned.
- Tests: a balcony behind its wall with a closed low-E door loses the exterior wall's and low-E's
  loss; marking it outdoors changes the shared wall's default; an unmarked room behaves as before.

## Amendment 2 (wall types: thin and thick concrete, glass walls; defaults)

- Status: approved 2026-11-11 by the maintainer. Source: the maintainer, 2026-11-11: "we may need to
  include the type of wall, like concrete thin, concrete thick or glass (independently from
  windows) with corresponding coefficients. In the pure simulation mode … we can assume that all
  external / outer walls are thick and all internal ones - thin. Then in the survey, we will
  validate the assumptions based on the measurements."
- Materials (priors; P.2040-3 slabs as in the Materials section):

  | id | what | 2.4 GHz | 5 GHz | 6 GHz | ± | basis |
  |---|---|---|---|---|---|---|
  | `concrete_thin` | concrete, about 10 cm | 9 | 14 | 16 | 4 | P.2040 8.1 / 13.9 / 15.7 |
  | `concrete_thick` | reinforced concrete, about 25 cm | 20 | 33 | 37 | 6 | P.2040 18.0 / 32.7 / 37.1, plus rebar |

  The glazing materials `glass`, `double`, `low_e`, `triple_low_e` are also wall materials (a glass
  wall or facade, independent of windows).
- Defaults: `wifi.defaults` absent means interior `concrete_thin` and exterior `concrete_thick`
  (was `interior` and `exterior`, which stay selectable as "unknown"). A home sets its own defaults
  in the Walls tool as before.
- Calibration: unchanged; the wide uncertainties let device readings and survey samples move each
  wall type's loss per band, and the Confidence map shows where they did.
- Tests: the defaults; a thick exterior wall costs 20/33/37 dB per band before calibration; a glass
  wall material on a wall; the materials table test pins the two new rows.

## Amendment 3 (thick walls, half-height walls, wall weights, ranges)

- Status: approved 2026-11-11 by the maintainer ("build all"). Source: the maintainer, 2026-11-11,
  after the first prototype on a real home: doors looked like strong beams, a small room behind
  the hallway had no signal, and the access points' reach was hard to see. "It would be good to
  differentiate the wall thickness on the floor plan … I want to quickly spot the differences and
  not to have it as an architectural diagram"; a half wall "with working assumptions that it takes
  1/2 of the height", for balcony frames and staircases.
- **Thick walls (a fix of the model).** A plan traced with real wall thickness leaves a gap between
  neighbouring rooms; each room's edge then counted as an exterior wall, so one interior wall cost
  two exterior walls (measured on the first home: 23 of 39 "exterior" segments had another room's
  edge within 0.5 m). Two edges of different rooms that are parallel within 10°, overlap along
  their length and lie at most `WALL_GAP_M` = 0.6 m apart are **one interior wall**: the stretch
  where they overlap is charged once (on the edge of the room listed first), at the interior
  default or the material set on either edge; the rest of each edge is classified as before.
  Outdoor rules (Amendment 1) apply to the pair as to a shared edge. A remainder no longer than
  `WALL_GAP_M` that lies between two such pairs, or between a pair and another room's edge (where
  traced walls meet in a T), bridges the gap and is interior too.
- **Half-height walls.** `walls[].height` (optional): `"half"`; absent means full. A half wall costs
  `HALF_WALL` = 0.5 of its material's loss on every band (working assumption: part of the signal
  passes over it); calibration fits the material, not the factor. New material `railing` (open bars
  or a mesh) 2 / 3 / 3 dB ± 2, for `wall`. The Walls panel gains a **Half height** switch; the
  open edge of an outdoor room stays no wall until a material is set.
- **Wall weights on the plan.** Every map draws the walls as lines (shared walls once) instead of
  room outlines, in three weights by the wall's 5 GHz loss after the half factor: **light** below
  10 dB (1.5 px), **solid** 10 to 25 dB (3 px), **heavy** above 25 dB (5 px); glazing materials
  (`glass`, `double`, `low_e`, `triple_low_e`) are tinted light blue; a half wall is dashed; an
  edge with no wall is a faint dotted line. Widths do not scale with zoom. A three-entry key
  (light, solid, heavy) shows on the Wi-Fi maps and in edit mode.
- **Ranges.** The 2.4/5/6 GHz maps gain a **Ranges** switch: each access point gets its own colour
  (the Serving map's), a ringed marker at its place with its name, and its outline at −67 dBm
  (solid) and −75 dBm (dashed) on the map's band and mode (Predicted or Calibrated), so where
  access points overlap shows directly.
- Smoothing: each access point's level is smoothed with a Gaussian of `SMOOTH_M` σ 0.5 m (in dB, on
  the floor's grid, a point outside every room taking the nearest room's level) before the map's
  strongest and serving pick and for the Ranges outlines alike (map and outlines agree; outline pieces
  under 1 m dropped), since waves blur the sharp shadows and door beams of straight rays; calibration
  compares readings with the unsmoothed point prediction.
- Validation and `push --plan`: `height` other than `"half"` refused (`wall at <x>,<y>: height must
  be half`); a change prints `wifi change <floor>`.
- Tests: two rooms 0.3 m apart cost one interior wall, not two exterior ones; 0.7 m apart stay two;
  a half wall costs half; `railing` in the table; the weight of each material and of a half wall;
  the ranges outline of one access point in an empty room is closed and nearer than −75's.
- Out of scope (later): a what-if mode that moves an access point without saving and drops that
  access point's local corrections.

## Amendment 4 (band steering: a reading on 2.4 GHz bounds 5 GHz)

- Status: approved 2026-11-11 by the maintainer ("Approve, build it"). Source: the maintainer, 2026-11-11,
  after a phone survey (SPEC-045): where the phone dropped to 2.4 GHz the 2.4 GHz map was red, while the
  5 GHz map, with no 5 GHz reading there, looked better in the same corner than it can be. "How to
  address it?" Three options were offered (a steering bound, carrying values over between bands,
  leaving the model as is); the maintainer chose the steering bound.
- **Why.** On one network name a dual-band client is kept on 5 GHz while 5 GHz is good and moved to
  2.4 GHz when it gets weak (band steering; routers use thresholds around −70 to −75 dBm, inference
  from vendor documentation). A survey reading taken on 2.4 GHz therefore says, beyond its own level,
  that **5 GHz at that spot was below the steering threshold**. The model used only the level.
- **Document.** `wifi.steering_dbm` (optional number, −90 to −55, default −75): the 5 GHz level below
  which the home's router moves a client to 2.4 GHz. Validation refuses `steering_dbm out of range`;
  `push --plan` prints `wifi change <floor>` for each floor when it changes. The Walls tool's defaults
  panel gains **Band steering below** (dBm).
- **The bound.** Each survey or phone sample (`source` `survey` or `phone`; not `manual`, not a device
  sensor: those clients may be 2.4 GHz only) on band `2.4`, on a floor where some access point serves
  `5`, becomes a **ceiling** on 5 GHz at its point: the strongest predicted 5 GHz level of any access
  point there should be at most `steering_dbm`. A 5 GHz reading bounds nothing on 2.4 GHz.
- **Fit.** A ceiling is one-sided: it adds a row only while the strongest 5 GHz prediction at its point
  is above the ceiling (prediction − ceiling, at half weight like a reading without an access point,
  Huber-weighted as the others); below it, it adds nothing. Ceilings do not count towards the 5
  readings a band needs, nor towards the rooms the materials need.
- **Map.** After the fit, each ceiling still exceeded by the calibrated 5 GHz map at its point by `e` dB
  adds a residual of `+e` at that point to the 5 GHz residuals (only downward), spread like any
  residual (3 m, inverse distance squared, halved per wall): the 5 GHz map comes down to the ceiling
  around the spot and fades back with distance. A ceiling already met adds nothing. The Ranges
  outlines follow (they use the same residuals per access point: the bound applies to every access
  point's 5 GHz level at the spot).
- **Shown.** With Readings on, the 5 GHz map shows such a sample as a hollow dot labelled `≤ −75`; its
  hover tells "on 2.4 GHz: 5 GHz below −75 dBm here (band steering)". The 2.4 GHz map shows it as before.
- **Not done:** 6 GHz (a phone without 6 GHz support would bound it wrongly); bounds from device
  sensors; learning the threshold from the data (the default and the setting stand).
- **Tests:** a 2.4 GHz survey sample in a corner lowers the calibrated 5 GHz map there to the ceiling
  and fades over 3 m; a ceiling below the prediction already changes nothing; manual and device
  readings make no ceiling; a home with no 5 GHz access point makes none; `steering_dbm` validation and
  default; the fit's transmit power moves down, not up, from ceilings alone; the hollow dot and its
  hover on the 5 GHz map.
