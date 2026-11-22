# hifisync-acoustics engine (steps 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public Python package and service, `hifisync-acoustics`. It turns sweep recordings
into frequency response, RT60 and room modes, validated against REW. It keeps rooms, nodes,
points, calibrations, sessions and results behind a versioned HTTP API, shipped as a container
image.

**Architecture:**
- An analysis library (`hifisync_acoustics.analysis`) works on numpy arrays only and has no I/O.
- A CLI analyses WAV files and compares results with REW exports.
- A service adds the following on top of the library:
  - SQLite storage plus a data directory;
  - an ASGI HTTP API under `/api/v1` with bearer tokens;
  - zeroconf discovery.
- In this plan, recordings reach a session by upload, through the API or the CLI. Node capture
  comes in step 3.

**Tech Stack:**
- Python 3.13, uv;
- numpy ≥ 2.3, scipy ≥ 1.16;
- Starlette + uvicorn, sqlite3 from the standard library, `zeroconf`;
- pytest and httpx for tests;
- Docker (linux/amd64 and linux/arm64).

**Spec:** `docs/superpowers/specs/2026-11-22-room-acoustics-design.md` in `zerostorypoints/domosenso`
(sections "Engine", "Measurement session", "Level and safety", "Calibration", "Plan scope").

## Global Constraints

- Repository `zerostorypoints/hifisync-acoustics`, public, Apache-2.0. No Home Assistant dependency.
- Recordings or room data never leave the local network unless the owner acts. The service makes no outbound connections.
- No household data in the repository: no real room dimensions, names, positions or recordings. Examples use the fictional demo home: Living room, Dining, Kitchen.
- Tokens never appear in URLs, logs or error text. Store only their SHA-256 digest.
- Default sweep: 20 Hz to 20 kHz, 48 kHz, fade-in, file peak capped at −12 dBFS.
- Neither the engine nor any client it ships changes a player's volume.
- Coordinates are in the HiFiSync room snapshot convention (metres, origin and axes as SPEC-050's snapshot defines them). Record the convention in `docs/coordinates.md` from the HiFiSync snapshot contract before Task 7.
- Validation thresholds against REW:
  - frequency response within ±0.5 dB at 1/6-octave smoothing, 30 Hz to 10 kHz;
  - T20 and T30 within 5 % per octave band, 125 Hz to 4 kHz;
  - mode peaks within 1 Hz below 200 Hz.
- Without room dimensions, analysis still returns frequency response, RT60 and low-frequency peaks. The Schroeder frequency and the mode-to-dimension mapping need the dimensions.
- One failed or missing node fails only its point. The session reports which point failed and why.
- Commit messages follow the domosenso style and end with the Claude co-author line.

## Review Focus

1. **WAV at 44.1 kHz or another rate than the sweep:** reject with an error that names both rates. No resampling. Test in Task 3 and Task 8.
2. **Clipped or near-silent recording:** the point fails with `clipped` or `no_signal`, and the other points still complete. Test in Task 5 and Task 8.
3. **Recording shorter than the sweep plus a 1 s tail:** reject as `too_short`. Test in Task 3.
4. **Stereo, 24-bit or 32-bit float WAV:** accept all three. Take channel 0 of a multichannel file and record that in the result metadata. Test in Task 3.
5. **Service restart during a session:** a session left in `analysing` returns as `failed` with the reason `interrupted`, and the database stays readable. Test in Task 8.

---

### Task 0: Create the repository (human gate)

The domosenso AGENTS.md lists creating a repository among the actions that need the maintainer's
explicit go-ahead in the session doing it.

- [ ] **Step 1:** Ask the maintainer for the go-ahead, or ask them to create `zerostorypoints/hifisync-acoustics` themselves: public, Apache-2.0, default branch `main`, protected like `domosenso` (PR only, one approval).
- [ ] **Step 2:** Clone it. Work in a linked worktree on `claude/engine-foundation`, and open one PR per task group (Tasks 1–6 analysis, Tasks 7–10 service). Request `docere-priv` as reviewer.

### Task 1: Package skeleton and CI

**Files:**
- Create: `pyproject.toml`, `src/hifisync_acoustics/__init__.py`, `LICENSE` (Apache-2.0), `NOTICE`, `README.md`, `.github/workflows/ci.yml`, `tests/test_package.py`

**Interfaces:**
- Produces: package `hifisync_acoustics` with `__version__ = "0.1.0"`; console script `hifisync-acoustics = hifisync_acoustics.cli:main`.

- [ ] **Step 1:** Write `test_version_is_semver`. It asserts that `hifisync_acoustics.__version__` matches `^\d+\.\d+\.\d+$`.
- [ ] **Step 2:** Run `uv run pytest -q`. Expected: FAIL (import error).
- [ ] **Step 3:** Add `pyproject.toml`: hatchling build, `requires-python = ">=3.13"`, runtime dependencies `numpy>=2.3`, `scipy>=1.16`, dev group `pytest`, `httpx`. Add the package and LICENSE. NOTICE reads `hifisync-acoustics / Copyright 2026 ZeroStoryPoints GmbH`. The README covers purpose, the Apache-2.0 licence and a pointer to the design.
- [ ] **Step 4:** Add CI that runs `uv run pytest -q` on Python 3.13 (ubuntu-latest) on push and PR.
- [ ] **Step 5:** Run `uv run pytest -q`. Expected: PASS. Commit: `Add package skeleton, licence and CI`.

### Task 2: Sweep generation

**Files:**
- Create: `src/hifisync_acoustics/analysis/__init__.py`, `src/hifisync_acoustics/analysis/sweep.py`
- Test: `tests/analysis/test_sweep.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class SweepSpec: f_start: float = 20.0; f_end: float = 20000.0; duration_s: float = 6.0; sample_rate: int = 48000; fade_in_s: float = 0.05; fade_out_s: float = 0.01; peak_dbfs: float = -12.0; repeats: int = 1; gap_s: float = 2.0`
  - `@dataclass(frozen=True) class Sweep: spec: SweepSpec; signal: np.ndarray  # float64, mono, includes repeats and gaps`; `inverse: np.ndarray  # inverse filter of one sweep`
  - `generate_sweep(spec: SweepSpec = SweepSpec()) -> Sweep`

- [ ] **Step 1: Write the failing tests**

```python
def test_peak_is_capped():
    s = generate_sweep()
    assert 20 * np.log10(np.max(np.abs(s.signal))) <= -12.0 + 1e-9

def test_rejects_peak_above_minus_12():
    with pytest.raises(ValueError, match="peak_dbfs"):
        generate_sweep(SweepSpec(peak_dbfs=-6.0))

def test_length_with_repeats():
    spec = SweepSpec(duration_s=2.0, repeats=3, gap_s=1.0)
    assert len(generate_sweep(spec).signal) == (3 * 2.0 + 2 * 1.0) * 48000

def test_fade_in_starts_silent():
    assert abs(generate_sweep().signal[0]) < 1e-6

def test_sweep_convolved_with_inverse_is_impulse():
    s = generate_sweep(SweepSpec(duration_s=2.0))
    one = s.signal[: 2 * 48000]
    ir = scipy.signal.fftconvolve(one, s.inverse)
    peak = np.argmax(np.abs(ir))
    side = np.delete(np.abs(ir), range(peak - 50, peak + 50))
    assert 20 * np.log10(np.max(side) / np.abs(ir[peak])) < -40
```

- [ ] **Step 2:** Run `uv run pytest tests/analysis/test_sweep.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement the exponential (Farina) sweep with an amplitude-compensated time-reversed inverse filter, raised-cosine fades, and gain to `peak_dbfs`. A `peak_dbfs` above −12 raises `ValueError` naming `peak_dbfs`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit: `Add exponential sweep and inverse filter`.

### Task 3: WAV reading and impulse response

**Files:**
- Create: `src/hifisync_acoustics/analysis/ir.py`, `src/hifisync_acoustics/wav.py`
- Test: `tests/analysis/test_ir.py`, `tests/test_wav.py`

**Interfaces:**
- Consumes: `Sweep`, `SweepSpec` (Task 2).
- Produces:
  - `class RecordingError(ValueError): code: str  # "rate_mismatch" | "too_short" | "unsupported_format"`
  - `@dataclass(frozen=True) class Recording: samples: np.ndarray  # float64 mono, -1..1`; `sample_rate: int`; `channel_used: int`; `channels: int`; `subtype: str`
  - `read_wav(path: Path) -> Recording`. Accepts PCM 16 and 24 bit and float 32 via `scipy.io.wavfile`, takes channel 0, and raises `RecordingError("unsupported_format")` otherwise.
  - `@dataclass(frozen=True) class ImpulseResponse: samples: np.ndarray; sample_rate: int; peak_index: int`
  - `impulse_response(rec: Recording, sweep: Sweep, repeat: int | None = None) -> ImpulseResponse`. It deconvolves each repeat, averages the aligned IRs (all repeats when `None`), and windows from 5 ms before the peak to the end of the tail.

- [ ] **Step 1: Write the failing tests**
  - `test_rate_mismatch_names_both_rates`: a 44100 Hz recording raises `RecordingError` with `code == "rate_mismatch"`, and the message contains `44100` and `48000`.
  - `test_too_short`: a recording shorter than `duration_s + 1.0` s raises with `code == "too_short"`.
  - `test_reads_stereo_24bit_and_float32` (parametrised over the three formats from Review Focus 4): the result is mono float64 with `channel_used == 0` and the `channels` value correct.
  - `test_recovers_known_delay_and_gain`: the sweep convolved with a synthetic IR (delta at 480 samples, gain 0.5, plus an exponential tail with RT60 0.4 s) gives `peak_index` equal to `int(0.005 * 48000)` after windowing, and a peak gain within 0.1 dB of −6.02 dB.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `read_wav` and `impulse_response` with the signatures above. Use `scipy.signal.fftconvolve`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit: `Add WAV reading and sweep deconvolution`.

### Task 4: Frequency response and decay times

**Files:**
- Create: `src/hifisync_acoustics/analysis/response.py`, `src/hifisync_acoustics/analysis/decay.py`
- Test: `tests/analysis/test_response.py`, `tests/analysis/test_decay.py`

**Interfaces:**
- Consumes: `ImpulseResponse` (Task 3).
- Produces:
  - `@dataclass(frozen=True) class FrequencyResponse: freqs_hz: np.ndarray; level_db: np.ndarray; smoothing: float | None`
  - `frequency_response(ir: ImpulseResponse, smoothing: float | None = 1/6, f_min: float = 20.0, f_max: float = 20000.0, points_per_octave: int = 48) -> FrequencyResponse`. Log-spaced output; fractional-octave smoothing on power.
  - `OCTAVE_BANDS_HZ = (63, 125, 250, 500, 1000, 2000, 4000, 8000)`
  - `@dataclass(frozen=True) class DecayTimes: band_hz: int; edt_s: float | None; t20_s: float | None; t30_s: float | None; noise_floor_db: float`
  - `decay_times(ir: ImpulseResponse, bands: Sequence[int] = OCTAVE_BANDS_HZ) -> list[DecayTimes]`. Octave filter (Butterworth order 3, zero-phase), Lundeby-style truncation at the noise floor, Schroeder backward integration. EDT fits 0 to −10 dB, T20 fits −5 to −25 dB, T30 fits −5 to −35 dB. The value is `None` when the decay range is not reached above the noise floor.

- [ ] **Step 1: Write the failing tests**
  - `test_flat_ir_is_flat`: a delta IR gives `level_db` within ±0.1 dB of 0 from 30 Hz to 10 kHz.
  - `test_known_peak_survives_smoothing`: a +6 dB biquad peak at 1 kHz with Q 2 gives 1 kHz within 0.5 dB of the analytic 1/6-octave smoothed value.
  - `test_synthetic_rt60_per_band`: exponential-decay noise with RT60 0.6 s in every band gives T20 and T30 within 5 % of 0.6 for bands 125 to 4000 Hz.
  - `test_short_decay_returns_none`: a tail that reaches only −20 dB above the noise floor gives `t30_s is None` and `t20_s` not None.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement both modules with the signatures above.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit: `Add frequency response and Schroeder decay times`.

### Task 5: Modes, pre-flight and calibration

**Files:**
- Create: `src/hifisync_acoustics/analysis/modes.py`, `src/hifisync_acoustics/analysis/preflight.py`, `src/hifisync_acoustics/analysis/calibration.py`
- Test: `tests/analysis/test_modes.py`, `tests/analysis/test_preflight.py`, `tests/analysis/test_calibration.py`

**Interfaces:**
- Consumes: `FrequencyResponse`, `DecayTimes` (Task 4); `Recording`, `Sweep` (Tasks 2–3).
- Produces:
  - `@dataclass(frozen=True) class RoomDimensions: length_m: float; width_m: float; height_m: float`
  - `@dataclass(frozen=True) class Peak: freq_hz: float; level_db: float; prominence_db: float; mode: tuple[int, int, int] | None`
  - `low_frequency_peaks(fr: FrequencyResponse, f_max: float = 200.0, min_prominence_db: float = 3.0) -> list[Peak]`. Peaks are found on the unsmoothed response (`smoothing=None`), with parabolic interpolation of the frequency.
  - `schroeder_frequency(rt60_s: float, dims: RoomDimensions) -> float`, which is `2000 * sqrt(rt60 / V)`.
  - `room_modes(dims: RoomDimensions, f_max: float, c: float = 343.0) -> list[tuple[tuple[int, int, int], float]]`, covering axial, tangential and oblique modes.
  - `assign_modes(peaks: list[Peak], dims: RoomDimensions) -> list[Peak]`. A peak's mode is the nearest within 3 %, else `None`.
  - `@dataclass(frozen=True) class PreflightResult: ok: bool; code: str | None  # "clipped" | "no_signal" | None`; `peak_dbfs: float`; `snr_db: float`
  - `preflight(rec: Recording, sweep: Sweep, clip_dbfs: float = -1.0, min_snr_db: float = 30.0) -> PreflightResult`. SNR is the sweep band power over the noise measured in the gap before the sweep starts.
  - `@dataclass(frozen=True) class CalibrationCurve: freqs_hz: np.ndarray; correction_db: np.ndarray; sensitivity_db: float | None`
  - `read_minidsp_cal(path: Path) -> CalibrationCurve`. Parses the UMIK-1 `.txt` format: an optional quoted header line with `Sens Factor =`, then frequency/dB pairs.
  - `node_correction(node: FrequencyResponse, reference: FrequencyResponse, reference_cal: CalibrationCurve) -> CalibrationCurve`
  - `broadband_offset_db(curve: CalibrationCurve, at_hz: float = 1000.0) -> float`

- [ ] **Step 1: Write the failing tests**
  - `test_peak_at_known_mode`: a response with a 50.0 Hz resonance gives a peak within 1 Hz.
  - `test_axial_modes_of_demo_room`: dimensions 5.0 × 4.0 × 2.5 m give the first axial mode at 34.3 Hz ±0.1 Hz.
  - `test_without_dimensions_no_mode_assignment`: `low_frequency_peaks` alone gives peaks with `mode is None`.
  - `test_clipped` (Review Focus 2): a sample at −0.5 dBFS gives `code == "clipped"`.
  - `test_no_signal` (Review Focus 2): noise with no sweep gives `code == "no_signal"`.
  - `test_reads_minidsp_cal`: a fictional fixture file with a header and 3 rows parses `sensitivity_db` and 3 points.
  - `test_node_correction_inverts_known_tilt`: a node response with a +3 dB shelf above 5 kHz against a flat reference gives a correction of −3 dB ±0.2 above 6 kHz and a `broadband_offset_db` of 0 ±0.1.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules with the signatures above.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit: `Add room modes, level pre-flight and calibration`.

### Task 6: CLI and validation against REW

**Files:**
- Create: `src/hifisync_acoustics/cli.py`, `src/hifisync_acoustics/rew.py`, `src/hifisync_acoustics/report.py`, `tests/validation/README.md`, `tests/validation/cases/<case>/` (IR WAV, REW exports, `SOURCE.md` with licence and attribution), `tests/validation/test_against_rew.py`
- Modify: `NOTICE` (attribution of each IR)

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `analyse_recording(rec: Recording, sweep: Sweep, dims: RoomDimensions | None, calibration: CalibrationCurve | None) -> PointResult`
  - `@dataclass class PointResult: fr: FrequencyResponse; decay: list[DecayTimes]; peaks: list[Peak]; schroeder_hz: float | None; calibrated: bool; preflight: PreflightResult; meta: dict`
  - `PointResult.to_json() -> dict` with stable keys `fr`, `decay`, `peaks`, `schroeder_hz`, `calibrated`, `preflight`, `meta`. Task 8 stores this dict.
  - `read_rew_fr(path) -> FrequencyResponse` and `read_rew_rt60(path) -> list[DecayTimes]`, parsing REW's text exports.
  - CLI:
    - `hifisync-acoustics sweep --out sweep.wav [--duration 6 --repeats 1]`
    - `hifisync-acoustics analyse REC.wav [--dims L W H] [--cal FILE] [--json OUT]`
    - `hifisync-acoustics compare-rew CASE_DIR`, which prints a line per metric and ends with `ok` or `FAIL <metric>`.

- [ ] **Step 1:** Write `test_against_rew`, parametrised over `tests/validation/cases/*`. For each case, the engine against REW's exports passes the Global Constraints thresholds: FR ±0.5 dB at 1/6 octave 30 Hz–10 kHz, T20 and T30 within 5 % 125 Hz–4 kHz, and peaks within 1 Hz below 200 Hz. Add a CLI test, `test_analyse_json_keys`, for the JSON keys.
- [ ] **Step 2:** Pick at least three openly licensed room impulse responses, for example from the OpenAIR library under CC BY, and record the licence and attribution in each case's `SOURCE.md` and in `NOTICE`. Run them through REW by hand: import the IR, then export FR at 1/6 smoothing and RT60 octave bands as text. Store the exports. Whoever has REW installed does this step; the engine never calls REW in CI.
- [ ] **Step 3:** Implement `rew.py`, `report.py` and `cli.py`.
- [ ] **Step 4:** Run `uv run pytest -q`. Expected: PASS, including every validation case. Run `uv run hifisync-acoustics compare-rew tests/validation/cases/<one>`. Expected: last line `ok`.
- [ ] **Step 5:** Write `tests/validation/README.md` on how a home runs its own private recordings, which stay out of this repository, with `compare-rew` against REW. Commit: `Add CLI and REW validation cases`. Open the analysis PR.

### Task 7: Storage and registry

**Files:**
- Create: `src/hifisync_acoustics/store/__init__.py`, `src/hifisync_acoustics/store/schema.sql`, `src/hifisync_acoustics/store/db.py`, `docs/coordinates.md`
- Test: `tests/store/test_db.py`

**Interfaces:**
- Produces:
  - `class Store`, `Store.open(data_dir: Path) -> Store`. It creates `data_dir/engine.sqlite3` (WAL), `data_dir/recordings/`, `data_dir/irs/` and `data_dir/exports/`, and applies migrations by `PRAGMA user_version`.
  - Tables: `rooms(id, name, length_m, width_m, height_m, snapshot_json, updated_at)`; `nodes(id, esphome_name, firmware, capture, install_room_id, install_x, install_y, install_z, updated_at)`; `points(id, room_id, label, x, y, z)`; `calibrations(id, node_id, version, created_at, reference_id, reference_cal_name, curve_json, offset_db, conditions)`; `sessions(id, room_id, state, created_at, updated_at, sweep_json, player_chain, failure)`; `session_points(session_id, point_id, node_id, state, failure, recording_path, result_json)`; `tokens(id, name, digest, created_at, revoked_at)`.
  - Methods: `upsert_room`, `get_room`, `upsert_node`, `list_nodes`, `add_point`, `list_points(room_id)`, `add_calibration(node_id, curve, offset_db, reference_id, reference_cal_name, conditions) -> int`, which returns a version starting at 1 per node, and `latest_calibration(node_id)`. Session methods come from Task 8.
  - IDs are UUID4 strings. Timestamps are UTC ISO-8601.

- [ ] **Step 1: Write the failing tests**
  - `test_open_creates_layout`.
  - `test_calibration_versions_increment_per_node`.
  - `test_reopen_keeps_data` (WAL survives close and reopen).
  - `test_migration_from_empty_sets_user_version_1`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `Store` with stdlib `sqlite3`. Each call takes its own connection with `check_same_thread=False`, and writes are serialised by a lock. Write `docs/coordinates.md` from SPEC-050's snapshot convention.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit: `Add storage and registry`.

### Task 8: Sessions

**Files:**
- Create: `src/hifisync_acoustics/sessions.py`
- Modify: `src/hifisync_acoustics/store/db.py` (session methods)
- Test: `tests/test_sessions.py`

**Interfaces:**
- Consumes: `Store` (Task 7); `analyse_recording`, `PointResult` (Task 6); `read_wav`, `RecordingError` (Task 3).
- Produces:
  - States: `created → recording → analysing → done | failed`. Point states: `pending → uploaded → done | failed`.
  - `create_session(store, room_id: str, assignments: list[tuple[str, str]], sweep: SweepSpec, player_chain: str | None) -> str`. The assignments are point_id and node_id pairs.
  - `add_recording(store, session_id: str, node_id: str, wav_path: Path) -> None`. It validates with `read_wav`, and a `RecordingError` fails only that point with `failure = error.code`. Once every point is `uploaded` or `failed`, it moves the session to `analysing`.
  - `analyse_session(store, session_id: str) -> None`, run in a worker thread. Each point is analysed independently with the node's latest calibration, and a preflight failure marks only that point. The session ends `done` when at least one point is done, else `failed`.
  - `recover_interrupted(store) -> int`, run at startup. Sessions in `analysing` become `failed` with `failure = "interrupted"`, and the count is returned.
  - `export_session(store, session_id) -> Path`, a ZIP with `session.json`, the recordings and `results/<point>.json`.

- [ ] **Step 1: Write the failing tests**
  - `test_one_bad_node_fails_only_its_point` (Review Focus 2): one clipped and one good synthetic recording leave the session `done`, with one point `failed/clipped` and one `done`.
  - `test_rate_mismatch_fails_point` (Review Focus 1).
  - `test_all_points_failed_fails_session`.
  - `test_recover_interrupted` (Review Focus 5): a session in `analysing` written to the DB is `failed/interrupted` after `recover_interrupted`.
  - `test_uncalibrated_node_marked`: a point result from a node without calibration has `calibrated is False`.
  - `test_export_contains_results`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `sessions.py` and the store's session methods.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit: `Add measurement sessions`.

### Task 9: HTTP API, tokens and discovery

**Files:**
- Create: `src/hifisync_acoustics/api/__init__.py`, `src/hifisync_acoustics/api/app.py`, `src/hifisync_acoustics/api/auth.py`, `src/hifisync_acoustics/discovery.py`, `src/hifisync_acoustics/server.py`, `docs/api.md`
- Modify: `src/hifisync_acoustics/cli.py` (`serve`, `token create|list|revoke`), `pyproject.toml` (add `starlette`, `uvicorn`, `zeroconf`)
- Test: `tests/api/test_app.py`, `tests/api/test_auth.py`

**Interfaces:**
- Consumes: `Store` (Task 7); session functions (Task 8); `generate_sweep` (Task 2).
- Produces:
  - `create_app(store: Store, *, analyse_inline: bool = False) -> Starlette`. `analyse_inline` is for tests only.
  - Routes under `/api/v1`, JSON bodies:
    - `GET /health` (no auth; returns `{"version", "api": 1}`);
    - `GET|PUT /rooms/{id}`, `GET /rooms`;
    - `GET /nodes`, `PUT /nodes/{id}`;
    - `GET|POST /rooms/{id}/points`;
    - `GET /nodes/{id}/calibrations`;
    - `POST /nodes/{id}/calibrations` (multipart: node WAV, reference WAV, reference cal file);
    - `POST /sessions`, `GET /sessions/{id}`;
    - `PUT /sessions/{id}/recordings/{node_id}` (body `audio/wav`);
    - `GET /sessions/{id}/results`, `GET /sessions/{id}/export`;
    - `GET /sweep.wav?duration=&repeats=` (16-bit PCM WAV of `generate_sweep`).
  - Errors: `{"error": {"code", "message"}}` with 400, 401, 404 or 409.
  - Auth: `Authorization: Bearer <token>` on every route except `/health`.
    - `auth.issue(store, name) -> str` returns a 32-byte urlsafe token that is shown once; only its digest is stored.
    - `auth.verify(store, token) -> bool` uses a constant-time comparison.
    - A token in a query string gets 400 `token_in_url`.
  - `discovery.advertise(port: int) -> AsyncZeroconf` publishes `_hifisync-acoustics._tcp.local.` with TXT `api=1`, `version=<__version__>`.
  - `hifisync-acoustics serve --data DIR --host 0.0.0.0 --port 8765 [--no-zeroconf]` calls `recover_interrupted` at startup.

- [ ] **Step 1: Write the failing tests**
  - `test_health_without_token`.
  - `test_401_without_token`.
  - `test_token_in_query_rejected`.
  - `test_token_not_logged`, which uses `caplog` around a failing request with a token and asserts the token string is absent.
  - `test_full_session_flow`, using httpx `ASGITransport` with `analyse_inline=True`: create a room and points, create a session, upload two synthetic WAVs, then `GET /results` returns two points.
  - `test_upload_rate_mismatch_is_point_failure` (Review Focus 1).
  - `test_sweep_wav_peak_minus_12`.
  - `test_revoked_token_401`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the API, the auth, discovery, `server.py` (uvicorn runner) and the CLI commands. Write `docs/api.md` from the routes.
- [ ] **Step 4:** Run `uv run pytest -q`. Expected: PASS. Commit: `Add HTTP API, tokens and zeroconf discovery`.

### Task 10: Container image

**Files:**
- Create: `Dockerfile`, `compose.example.yaml`, `.github/workflows/image.yml`, `docs/install.md`
- Test: `tests/test_container.sh`, run by the image workflow

**Interfaces:**
- Produces:
  - image `ghcr.io/zerostorypoints/hifisync-acoustics:<version>` for linux/amd64 and linux/arm64;
  - a non-root user and volume `/data`;
  - port 8765, `HEALTHCHECK` on `/api/v1/health`;
  - `compose.example.yaml` with `network_mode: host`, which zeroconf needs, and a `./data:/data` volume.

- [ ] **Step 1:** Write `tests/test_container.sh`:
  1. build;
  2. run with a temp `/data`;
  3. wait for health;
  4. `docker exec … hifisync-acoustics token create ci`;
  5. upload a synthetic session through the API with that token;
  6. assert `results` has the point;
  7. stop.
- [ ] **Step 2:** Run `bash tests/test_container.sh`. Expected: FAIL (no Dockerfile).
- [ ] **Step 3:** Write the Dockerfile: multi-stage, `python:3.13-slim`, `uv sync --frozen --no-dev`. Add the compose example. The image workflow builds both architectures with buildx, runs the test on amd64, and pushes to GHCR on a `v*` tag only.
- [ ] **Step 4:** Run `bash tests/test_container.sh`. Expected: last line `ok`. Write `docs/install.md`, covering Docker on a NAS, the first token, and the data directory and its backup. Commit: `Add container image and install guide`. Open the service PR.

## Out of this plan

These are milestones, each with its own spec:
- step 3: node capture component and audio-sensor input;
- step 4: sweep through HA, the calibration workflow, and the pre-flight run before a session (Task 5 provides its analysis);
- step 5: the `hifisync` entry type and the `room-acoustics` component;
- step 6: the app client;
- step 7: the Frame overlay and the engine on the tablet.

The cross-repository interfaces (node protocol, HA entry type) are fixed after Task 6's validation.
