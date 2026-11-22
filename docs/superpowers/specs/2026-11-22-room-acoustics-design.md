# Room acoustics: HiFiSync measurement engine and the Domosenso adapter

- Status: draft 2026-11-22, for the maintainer's approval. Not a component spec: the Domosenso
  parts below each get their own `SPEC-NNN` (or an amendment) before implementation.
- Source: the maintainer's request in a design session on 2026-11-22, a consultation with the
  Home Assistant architecture analysis session, web research on Home Assistant 2026 and comparable
  services, and the catalog as of `7c1c7bb` (audio-sensor 0.5.0, SPEC-015, SPEC-050, SPEC-051,
  SPEC-052).
- Facts marked *(inference)* come from documentation or code reading, not from a run.

## Intent

A HiFiSync owner wants to know how their room sounds at the listening position, and why: room
modes, decay time, frequency response, and what speaker placement changes. HiFiSync already
knows the room (RoomPlan geometry in the native app, the room in the user's account), the speaker
and listening positions and the equipment. It does not measure sound; its decision log so far
leaves acoustic measurement to partners.

The maintainer has inexpensive measurement nodes (ESP32-S3 with an IM73D122 PDM microphone, the
`esp32-s3-im73d122` assembly of SPEC-051) and a reference microphone (miniDSP UMIK-1). What
matters most to him is that **something manages the measurements and the calibration of the
microphones**: which node is where, which calibration it carries, which session produced which
result. Domosenso manages the home's infrastructure and should support this, at least by showing
live loudness in the room view during playback. The measurement module does not have to live
inside Home Assistant.

The work also gives Domosenso a hi-fi specialization: the best home installation for HiFiSync,
rather than its own acoustics product.

## Goals

1. A measurement engine, `hifisync-acoustics`, that runs a measurement session over several nodes,
   computes impulse response, frequency response, RT60 per octave band and room modes per
   measurement point, and keeps nodes, calibrations, sessions and results.
2. Node calibration against a reference microphone, stored per node and versioned, with the
   broadband offset also written to the node's existing audio-sensor calibration helpers.
3. The HiFiSync native app can start a session and receive results directly from the engine on the
   local network, supplying room geometry, speaker and listening positions and equipment.
4. Home Assistant can start a session and shows result summaries; Domosenso deploys the engine and
   wires nodes, player and integration from a home's inputs.
5. Live loudness per node in the Ramka room view during playback, independent of the engine.
6. Usable by other homes and by HiFiSync users without Domosenso.

## Non-goals

- Room correction or DSP filters sent to equipment. Results may later feed recommendations in
  HiFiSync; generating filters is a separate product decision.
- A general measurement GUI competing with REW. REW is used only to validate the engine.
- Calibrated absolute SPL below the node's verified range, or claims about 20 Hz accuracy before
  calibration shows it.
- Time synchronization between nodes over the network.
- Wave-based room simulation (FEM, BEM). The model is geometric: image sources and the box
  modes.

## Anti-goals

- Live levels in Ramka that stop working when the engine is down or not installed.
- Recordings or room data leaving the local network without the owner's explicit action.
- A Domosenso-only engine that a HiFiSync user without Home Assistant cannot run.
- Household data in any public repository: no room dimensions, names, positions or recordings from
  a real home in `domosenso` or `hifisync-acoustics`; examples use the fictional demo home.

## Constraints

- **Domosenso is a distribution layer, not a runtime.** It renders configuration and files; a
  container service is rendered under `services/<name>/` and listed as manual by `status`
  (SPEC-015). Automatic service deployment is not in the CLI.
- **audio-sensor 0.5.0 exists and is stable.** It supports the `esp32-s3-im73d122` board (PDM,
  GPIO4 clock, GPIO5 data, right channel, 48 kHz), a third-octave spectrum, a 1 s level in dB SPL
  as `sensor.music_level`, and per-board SPL offset helpers
  (`input_number.<id_prefix>_spl_offset`, `input_boolean.<id_prefix>_spl_calibrated`,
  `script.audio_sensor_apply_calibration`). Its contracts are frozen or stable: anything new is
  additive and needs a SPEC-051 amendment or a new spec.
- **HiFiSync's Home Assistant integration exists** (`zerostorypoints/hifisync-home-assistant`,
  domain `hifisync`, public, SPEC-050). It reads a system and room snapshot from the HiFiSync
  service with a scoped read-only installation token and binds it to a `media_player`. Frame
  Studio shows System and Room screens during playback (SPEC-052).
- **ESPHome cannot send a binary recording over HTTP** with its own components. Recording into
  PSRAM and uploading needs an external C++ component *(inference from ESPHome 2026.9 docs)*.
  ESPHome's UDP audio streaming exists but drops packets.
- **Home Assistant 2026**: add-ons are "Apps" on HAOS only; from 2026.11 the Marketplace replaces
  HACS for custom integrations on every install type; core pins numpy 2.3.2; blocking work goes to
  the executor. Areas have no field for a sound sensor *(inference from release notes and the
  area registry code)*.
- **NAS and standalone tablet parity** is the default for a home that runs both. The tablet runs
  Home Assistant in a Linux ARM64 guest (`domosenso-ha-server`); a second Python service there is
  feasible but unverified.
- **REW's licence does not allow embedding.** Its local API is fine for validation runs.
- `hifisync` and `hifisync-app` are private repositories; the engine must be public (decided
  2026-11-22) so that a public Domosenso component can depend on it.
- `hifisync-acoustics` is licensed Apache-2.0, like `domosenso` (decided 2026-11-22): its ESPHome
  component is compiled into audio-sensor firmware. The repository is created by a human or on the
  maintainer's explicit go-ahead in the session doing it.

## Approaches

**A. Inside Home Assistant (a custom integration with the analysis).** One install, entities for
free, Recorder history. Against: numpy/scipy versions are bound to HA core, a long analysis
blocks the executor of a home automation server, recordings and calibrations don't fit entity
state, and a HiFiSync user without HA gets nothing. The HiFiSync app would need an HA token.

**B. A separate engine service with a thin HA integration (chosen).** The pattern of Music
Assistant, Wyoming and Frigate: own process, own HTTP API, zeroconf discovery, a small HA
integration as a client. Free choice of dependencies, its own storage, usable without HA, and the
app talks to it with its own credentials. Against: one more process to install and update, and
Domosenso can only render its files, not start it.

**C. In the HiFiSync native app.** The phone records nothing (the nodes do), but it could
orchestrate and compute. Against: no persistent registry of nodes and calibrations when the phone
is away, no HA integration, results tied to one device, and iOS background limits during a
session.

Within B, two ownerships were considered. **B1: `domosenso-acoustics`**, owned by the framework.
**B2: `hifisync-acoustics`**, owned by HiFiSync, with Domosenso as the adapter. The maintainer
chose B2 on 2026-11-22: measurement is valuable through HiFiSync's knowledge of room and
equipment; HiFiSync users without HA can use it; Domosenso has no runtimes of its own; and
`hifisync-home-assistant` already sets the precedent of a HiFiSync-owned piece the catalog
consumes. Analysis code is not HiFiSync's competitive edge; the room and equipment model and
recommendations stay in the private app.

## Decided design

### Ownership

| Piece | Repository | Visibility |
|---|---|---|
| Engine: API, sessions, analysis, storage, node protocol | `zerostorypoints/hifisync-acoustics` (new) | public |
| ESPHome external component for capture and upload | `hifisync-acoustics` (`esphome/components/...`) | public |
| HA client of the engine | `hifisync-home-assistant`, a second config entry type of domain `hifisync` *(my call, see below)* | public |
| Node firmware option that pulls the capture component | `domosenso`, audio-sensor (additive) | public |
| Domosenso component `room-acoustics`: service files, inputs, HA package | `domosenso` | public |
| Room screen overlay of live node levels | `domosenso-frame-ha` and/or `domosenso-frame` | public |
| App client, room/equipment model, recommendations | `hifisync`, `hifisync-app` | private |
| A home's nodes, positions, calibrations, results | the engine's storage in that home; inputs in the home repository | private |

### Data flow

```
                     HiFiSync app (iOS)
             geometry, positions, equipment │ ▲ results
                                            ▼ │
 audio-sensor nodes ──capture upload──▶ hifisync-acoustics ◀──client── HA integration (hifisync)
   │  (ESPHome, PSRAM)  ◀──arm/record──    (engine, NAS or tablet)        │  start, status, summaries
   │                                         │ serves sweep WAV            │
   │                                         └────────▶ media_player ◀─────┘ (plays the sweep)
   └── live level, spectrum (ESPHome API) ──▶ Home Assistant ──▶ Ramka / Frame Room screen
```

The live-level path does not pass through the engine.

### Engine (`hifisync-acoustics`)

- Python service, no Home Assistant dependency. numpy and scipy; own analysis: exponential sweep
  generation, deconvolution by the inverse sweep, impulse response windowing, frequency response
  with fractional-octave smoothing, Schroeder integration for EDT/T20/T30 per octave band, mode
  detection below the Schroeder frequency. Each analysis step has a test against a synthetic
  signal with a known answer and a validation set against REW on the same recordings.
- *(My call)* Validation: public CI runs synthetic signals and openly licensed impulse responses
  with REW's results stored beside them. Recordings from a real room stay in that home's private
  repository and are run there by hand. Pass thresholds for step 1: frequency response within
  ±0.5 dB of REW at 1/6-octave smoothing from 30 Hz to 10 kHz; T20 and T30 within 5 % per octave
  band from 125 Hz to 4 kHz; mode peaks within 1 Hz below 200 Hz.
- Storage: SQLite for registry and results, files for recordings and impulse responses, in one
  data directory (a volume). Export of a session as a ZIP of WAV and JSON.
- Registry: rooms (dimensions, speaker and listening positions), nodes (identity from ESPHome,
  capture capability, firmware version, an install position), measurement points (coordinates in
  the room, in the coordinate convention of the HiFiSync room snapshot), the node-to-point
  assignment per session (a node at its install position or moved to a point for one session), and
  calibrations per node (versioned, with the reference microphone and its calibration file
  identity).
- The engine's registry owns rooms, points and node positions; where they come from, and what
  each level of room detail enables, is in Room model below.
- HTTP API, versioned (`/api/v1`), JSON; binary uploads as WAV. Bearer tokens issued by the engine;
  the first token comes from a CLI command or the setup of the HA integration. Discovery over
  zeroconf `_hifisync-acoustics._tcp`.
- Deployment targets in order: Docker container (NAS); a process in the tablet's Linux guest; an
  HAOS App. A CLI that analyses local WAV files without the service comes first, so analysis can be
  validated before any node or network exists.

### Room model

Proposal of 2026-11-22, written after reading HiFiSync's native capture (`hifisync` PR #410
branch: `packages/lib/system/room-capture.ts`, `ScanArchive.swift`, `PlacementRegistration.swift`,
`docs/superpowers/specs/2026-09-14-room-placement-split-design.md`). Changes to HiFiSync's own
decisions are its owner's.

**What HiFiSync has today.**

- The phone keeps Apple's full `CapturedRoom` in the room file. That includes:
  - walls as planar polygons with transforms, sloped tops included, and the floor polygon;
  - doors, windows and openings, each with its position and size on its wall, which gives sill
    and head height;
  - objects as oriented boxes with a category (sofa, storage, table, television and others) and
    attributes;
  - sections and per-element confidence.

  There is no mesh and no USDZ. The ARKit world map and one viewpoint photo stay on the phone.
- Placement is done:
  - speakers: position, measured top height, toe-in by a phone press;
  - one to three seats with a 3D head position, and a main seat;
  - up to two subwoofers.

  All of these are stored in the scan session's frame, together with the registration from that
  frame to the fitted room.
- The HiFiSync server receives only the fitted rectangle, the ceiling shape, open edges and a
  2D placement. The 3D data leaves the phone only in a share zip the user sends.
- HiFiSync's lib computes axial modes and SBIR on the box. Its decision log notes that treatment
  modelling needs a 3D room view that does not exist yet.

**Three levels of room data.** The engine accepts three levels of detail. Each analysis states
which level it needs and withholds its result when that level is missing.

| Level | Source | Content | Enables |
|---|---|---|---|
| 0, none | none | none | frequency response, RT60, measured low-frequency peaks, early reflections as peaks in the energy-time curve without a surface |
| 1, box | HiFiSync room snapshot (from the HA integration or the app), or typed in | width, length, average height, ceiling shape, open edges, 2D speaker and seat placement | Schroeder frequency, modes predicted from dimensions and matched to measured peaks, predicted vs measured SBIR notch, volume for decay |
| 2, surfaces | HiFiSync app, over the local network | level 1's frame, plus: every wall, floor and ceiling as a polygon; windows, doors and openings as polygons on them; objects as boxes with a category; speakers, seats and nodes in 3D | reflections attributed to a surface (glass, wall, door, ceiling, floor), first-reflection points for treatment, absorption estimated per kind of surface, predictions of a change |

**Rules for the model.**

- **A simplified model, decided by the maintainer on 2026-11-22.** The 3D data that leaves the
  phone is a simplified room model, `hifisync.room-model.v1`, made for visualisation and
  acoustics. It is not Apple's scan. The app derives it from `CapturedRoom` and the placement
  registration.

  It contains:
  - **The frame.** The fitted room frame: x and y as in HiFiSync, z up from the floor, metres
    rounded to 1 cm.
  - **Boundary surfaces.** Walls, floor and ceiling as planar polygons, each with its kind and
    the per-edge provenance. A curved wall becomes straight segments.
  - **Openings.** Windows, doors and openings as rectangles on their host wall: offset along the
    wall, sill height, width and height.
  - **Large objects.** Only objects that matter to sound or are needed to read the drawing, as
    boxes with a coarse kind: sofa, bed, storage, table, television. Small items and chairs are
    left out.
  - **Placement.** Speakers (acoustic centre if known, top, aim), seats with head position and
    the main seat, subwoofers and measurement nodes.
  - **Provenance.** One coarse confidence per surface and the scan and placement ids.

  It leaves out:
  - Apple's element identifiers, attributes and opaque `coreModel`;
  - sections outside the room and other stories;
  - the world map, the photo, any mesh or image.

  The same model drives the engine's analysis, HiFiSync's 3D or plan views and Frame's Room
  screen. The schema is published in `hifisync-acoustics`, because a public engine consumes it;
  HiFiSync's lib writes it.
- **Path, decided on 2026-11-22.** The model goes from the phone to the user's own engine on the
  local network only, when the user chooses to send it, with an engine token. It does not go
  through the HiFiSync server. This amends HiFiSync's decision of 2026-09-06, which lets only the
  wall summary leave RoomPlan. The amendment is recorded in HiFiSync's decision log.
- **One scan per room model.** Level 1 is a projection of level 2. The engine stores the scan id,
  the placement id and the model version. Every result names the model version it was computed
  from. The engine refuses a level 1 and a level 2 from different scans in the same room.
- **Node positions.**
  - *(My call)* In the app, a node is placed like a speaker: a press of the phone on the node.
    The node shows its identity as a QR code on its OLED, and the app reads it, so the press is
    bound to that node.
  - The capsule's offset from the node face is a property of the board in audio-sensor.
  - Without the app, the user types x, y and z.
  - The measurement points of a session are the node positions in it. A node moved for one
    session gets a new press or typed point.
- **Uncertainty.** HiFiSync's per-edge provenance (`measured`, `inferred`, `stated`, `open`) and
  RoomPlan's confidence carry into the model. An analysis that depends on an open or
  low-confidence surface says so instead of naming the surface.

**What the engine computes at level 2.**

- **Reflections.** For each speaker and node, the direct path and image sources up to second
  order, each with its delay after the direct sound and the surfaces it reflects from.
  - Matching these against the measured energy-time curve in the first 20 to 30 ms names the
    surface behind each early reflection and gives its level relative to the direct sound.
  - Delays are relative to the direct sound, so node clocks need no synchronisation.
  - The measured direct-path distance cross-checks the geometry. A large mismatch flags a wrong
    node or speaker position.
- **First-reflection points** for the main seat on side walls, ceiling and floor, as points on
  each surface polygon, each marked as falling on glass, a door, an opening or a wall.
- **Absorption estimate.** The engine inverts the measured RT60 per band, with the volume and
  surface areas from the model (Eyring), and splits the result across kinds of surface using
  priors (glass, wall, floor finish from HiFiSync's surface answers, upholstered objects). The
  result is labelled an estimate.
- **Modes.** From level 1: axial, tangential and oblique modes, matched to measured peaks. In a
  room that is not a box, the measured peaks are the result and the prediction is labelled
  approximate. Wave-based simulation is out of scope.
- **One source at a time.** Naming the surface needs one source at a time. The session therefore
  plays the sweep through the left and right channels separately: a stereo WAV with silence on
  the other channel. The engine records which source each sweep used.
  - In a 2.1 system the subwoofer plays with each channel and is not isolated. Measuring it
    alone needs the player's own controls, and only the user changes those.
- **Speaker data.** Predicting reflection levels needs each speaker's acoustic centre (tweeter
  height) and directivity. HiFiSync knows the model and the measured top height. Where its
  catalogue has no tweeter height or directivity, reflections are named by timing only and no
  level is predicted.

**Ownership of the results.**

- **Engine (public).** The analysis above.
- **HiFiSync (private).** Recommendations built on it: where to treat, which speaker or seat move
  helps, and what a rug or curtain would change.
- **Home Assistant.** Summaries only, for example the strongest early reflection at the main seat
  as surface, delay and level.
- **Frame Room screen.** Can draw first-reflection points on the 2D plan, through the same scoped
  channel as node positions. Geometry never becomes entity state.

### Measurement session

1. A client (app or HA) creates a session: room snapshot (dimensions, speakers, listening position)
   or a reference to one already stored, measurement points, node assignment, the player to use,
   sweep parameters (default 20 Hz to 20 kHz, 48 kHz, several seconds, a few repeats) and the
   sources to sweep (both channels, or left and right separately; see Room model).
2. The engine arms every assigned node: record for the sweep length plus margins.
3. The sweep plays through the home's system (see Sweep playback).
4. Each node uploads its recording; the engine aligns each recording to the sweep by
   deconvolution, so node clocks only need to be stable over one sweep, not synchronized.
5. The engine applies each node's calibration, computes results per point and stores them.
6. The client fetches results. HA gets summaries; the app gets the full set.

A failed or missing node fails only its point; the session reports which.

### Node capture

- `hifisync-acoustics` ships an ESPHome external component: on an arm command, record N seconds of
  the existing `mic` PCM stream (48 kHz, 16-bit mono) into PSRAM, then upload it to the engine
  (chunked HTTP POST via `esp_http_client`). 8 MB PSRAM holds about 87 s of such audio.
- Command channel: the node keeps an outbound connection to the engine it found over zeroconf or
  was configured with; the engine sends arm commands on it. No Home Assistant in the measurement
  path *(my call; it keeps the engine usable without HA)*.
- A node's name and room come from Home Assistant when HA is present: the HA integration syncs
  them one way, HA to engine, and the engine marks them `install_source: home_assistant` and
  does not let its own API change them (catalog principle 4). Without HA they are set in the
  engine. Positions, measurement points and calibration stay in the engine.
- audio-sensor gets an additive per-board input (for example `capture: true`) that adds the
  package. Existing boards, entities and the spectrum stay unchanged.

### Sweep playback

The engine serves the sweep as a lossless WAV over HTTP. The client that starts the session says
how it plays: the HA integration calls `media_player.play_media` on the player bound in
`hifisync`; the app plays it by its own route; a manual mode waits for the user to play a file.
Any resampling, DSP or loudness processing in the playback chain changes the result; the engine
records the chain the client declares and flags a sample-rate mismatch it can detect from the
recordings *(my call)*.

### Level and safety

Decided by the maintainer on 2026-11-22: neither the engine nor HA changes the player's volume. The
user sets it and confirms before a session. A pre-flight plays a short low-level sweep, checks
that every node hears it above the noise floor and none clips, and refuses to start otherwise,
saying which node and why. The sweep starts with a fade-in and is capped at −12 dBFS in the file.

### Calibration

- Co-located method: the reference microphone and the node at the same spot record the same
  sweeps. The engine computes the node's correction as the difference of their responses, using
  the reference microphone's own calibration file. Stored per node with date, conditions and
  reference identity; a node with no calibration has results marked uncalibrated.
- The reference recording reaches the engine as an upload (from a laptop running the engine's CLI
  with the UMIK-1, or from REW export). USB passthrough of the UMIK-1 into the engine's container is
  not required.
- The broadband offset at 1 kHz is written to the node's audio-sensor helpers through
  `script.audio_sensor_apply_calibration`, so the live dB SPL in Ramka uses the same calibration.

### Home Assistant integration

- A second config entry type in the `hifisync` integration: discovered by zeroconf, set up with an
  engine token. It offers an action to start a session for a bound player, a session status
  sensor, and per-point summary sensors (for example RT60 at 500 Hz, the strongest mode). Full
  results and recordings stay in the engine; Recorder gets summaries only.
- *(My call)* one HiFiSync integration rather than two keeps one brand and one set of player
  bindings in HA; the engine repository stays free of HA code.

### Domosenso component `room-acoustics`

- `artifacts.services`: a `container` service for the engine (compose file, env example), rendered
  under `services/hifisync-acoustics/` and installed by a human (SPEC-015).
- `integrations`: `hifisync` from `hifisync-home-assistant` (Marketplace or HACS).
- Inputs: which audio-sensor boards are measurement nodes, the player for sweeps, the engine
  address if not discovered.
- An HA package: a script to start a measurement from a dashboard, the area-to-level mapping that
  HA areas cannot hold, and the marker attribute `component: room-acoustics` on what it provides.
- `consumes`: audio-sensor's level and calibration entities.

### Live loudness in the room view

- Source: audio-sensor's existing per-board level entities, unchanged.
- Display: on the HiFiSync Room screen in Frame (SPEC-052), each node's level drawn at its install
  position. *(My call)* Positions count as room data: they are not entity attributes. The
  integration hands them to the Frame bridge's scoped channel that already carries the room
  drawing during playback (SPEC-052), and the overlay reads the live level entities by node. With no engine, the Room
  screen shows no overlay and Ramka's existing level displays still work.
- On the HA web app configuration (no Frame), the existing Ramka level display is the result; a
  room overlay there is not in scope.

### Parity: NAS and standalone tablet

- Live levels: both installations from the start, since nodes report to each installation's own
  HA over ESPHome (a node can be adopted by both).
- Measurement and calibration: NAS first. The gap on the tablet is recorded in the home's rollout
  record with the reason (engine not yet run in the Linux guest) and the next step (a performance
  check of one session's analysis on the tablet).

### Delivery order

1. Engine analysis library and CLI on WAV files; validation against REW. No nodes, no API.
2. Engine service: registry, sessions, API, storage; container image.
3. Capture component and the audio-sensor additive input; a session with one node, sweep played
   manually.
4. Sweep through HA `media_player`, per channel; calibration with the reference microphone.
5. `hifisync` HA config entry type and the `room-acoustics` component.
6. Room model schema (levels 1 and 2) and the level-2 analysis: reflections, first-reflection
   points, absorption estimate. Developed on synthetic rooms with known image sources, then
   checked on a real room with REW's energy-time curve.
7. HiFiSync app client: session start, room model export, node placement by press.
8. Room screen overlay in Frame; engine on the tablet.

Each Domosenso step goes through its own spec (SPEC-051 amendment for capture, a new spec for
`room-acoustics`), with the website impact named there.

## Plan scope

*(My call)* The first plan covers steps 1 and 2 in detail and the rest as milestones. Interfaces
that cross repositories (API, node protocol, HA entry type) are fixed after step 1's validation,
in the spec of each step. The private HiFiSync repositories are outside the plan.

## Left to the builder

- API resource names and payload shapes, within the session flow above.
- Engine internals: process model, job queue, storage schema, packaging.
- Sweep length, repeats, fade and window parameters, once validated against REW.
- The capture component's protocol on the outbound connection, its framing and retry.
- How the app pairs with the engine (QR code, code entry), as long as tokens never go in URLs.
- Names of the summary entities, following the catalog's English entity id rules.

## Open items

- How the carrier biases the IM73D122's L/R pin; it must be established before nodes are wired
  permanently (SPEC-051).
- Whether the PDM node's low-frequency response is usable down to the room's lowest modes; to be
  read from the first calibration.
- Changing HiFiSync's decision log entry on acoustic measurement belongs to the HiFiSync repository
  and its owner.
- The HiFiSync decision-log entry for the simplified room model (approved 2026-11-22) still has to
  be written in the `hifisync` repository.
- Whether HiFiSync's catalogue holds tweeter height and directivity for enough speakers to
  predict reflection levels.
- The QR code on the node's OLED and its payload (node identity only, no secret).
