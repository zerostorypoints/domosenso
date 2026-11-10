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
  its prior by its uncertainty. Gauss–Newton on a few dozen unknowns; in the card, in a worker
  when available.
- **Guards:** fewer than 5 observations on a band: only the `T` offsets of that band move; fewer
  than 3 distinct rooms with observations: materials keep their priors. Bands share the materials'
  ratios: a 2.4 GHz-only device moves a material's 5 and 6 GHz loss by the prior's ratio, at a
  third of the weight.
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
- **Disabled sources:** in edit mode (admins only, as edit mode is), the Confidence map's legend
  lists signal entities the rules would use that are disabled, read with
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

- **macOS BSSID** (S3 spike): whether CoreWLAN gives the connected BSSID and a scan's per-BSSID
  signal to a command-line tool once Location permission is granted. Verified only that
  `system_profiler` redacts them. If not, the router tracker is the fallback (30 s polling: the
  sample keeps the tracker's value at its time).
- **6 GHz BSSIDs:** `tplink_deco` does not expose them (verified); a 6 GHz observation's access point
  then comes from the client tracker only.
- **Material values:** the coefficients are from a secondary reproduction of P.2040-3; S1 checks
  them against the ITU text. Coated glass varies widely by product (inference from the spread of
  the measurements); the wide uncertainty is deliberate.
- **Layer:** maps on `radio` (this spec) or a separate `wifi` layer chip. `radio` keeps the layer
  list short; a separate chip would show Wi-Fi devices without hubs.
