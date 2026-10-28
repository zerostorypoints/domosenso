# Local catalog demo

The catalog demo runs the real Ramka package and cards from the current worktree against a
fictional Home Assistant Container. It needs no home repository, production token, cloud login,
radio or physical device. It is separate from a private home's existing staging target.

## Prepare once

Use Python satisfying `pyproject.toml`, uv, Docker and Node 22 or later. Install the repository's
Python dependencies. The browser harness uses the existing website's Playwright dependency:

```sh
uv sync --frozen
npm ci
npm ci --prefix website
cd website
npx playwright install --with-deps chromium
```

Return to the repository root. Pull the pinned image **before** starting the isolated runtime:

```sh
docker pull homeassistant/home-assistant:2026.9.2
```

The launcher never pulls an image or installs HA requirements at runtime. Missing Docker,
the pinned image, browser dependencies or Chromium is a failure, never a passing full check.

## Run and inspect

Run from this catalog checkout:

```sh
uv run tools/dev-home.py up --name review
uv run tools/dev-home.py status --name review
uv run tools/dev-home.py scenario morning --name review
uv run tools/dev-home.py check --name review
uv run tools/dev-home.py down --name review
uv run tools/dev-home.py up --name review
uv run tools/dev-home.py reset --name review --confirm review
```

`up` prints the loopback URL, pinned image/version, source commit and dirty status.
For interactive login, read the generated username/password from its printed `login_file` path.
That private file has mode 0600; API/browser tokens are also kept locally and refreshed on expiry. By default the OS
allocates a free port; `up --name review --port 18321` requests one explicitly. An occupied port
fails without stopping its owner. A stopped instance reuses its port, refreshes rendered files
from this worktree and preserves HA's `.storage` and recorder. Running `up` on an already running
instance leaves that render in place; use `down` then `up` after changing catalog code.

The instance identity combines the canonical checkout path with a validated name. Names are
1–32 lowercase letters, digits or hyphens, starting with a letter. All runtime files, authentication,
screenshots and reports are under ignored `.domosenso/dev/<identity>/`. These files are disposable
and must not be committed. A checkout-wide lifecycle lock prevents conflicting operations in the
same worktree. Different worktrees and named instances have separate resources and ports.

`down` stops HA and its UI relay, preserving state for restart tests. `reset` requires the exact
name and deletes only that generated instance and its labelled Docker resources. Ownership-marker,
label or symlink mismatches stop the operation. There are no production-target, token-import,
home-input or remote-URL options.

## Isolation and synthetic boundaries

HA has exactly one Docker **internal** network, no published port and no default route. It has
one writable mount: its own generated `/config`. It has no device mounts, extra capabilities,
host networking or real home data. Automatic discovery and default/cloud integrations are not
configured. Ramka's photo helper scripts operate only on generated media inside the container.

Docker does not publish ports from internal networks. A small Python TCP relay using the same
pinned HA image publishes `127.0.0.1:<port>` on a separate UI bridge and connects to the HA network.
Its only destination is that HA container's fixed internal address, port 8123. It has a read-only
root filesystem and script mount, no capabilities, no secrets and IP forwarding disabled. It
passes HTTP/WebSocket bytes unchanged; it implements neither CONNECT nor a forward proxy. The UI
bridge is an ingress transport, not an additional network on HA. This is an isolation boundary
for the generated HA workload; it is not a sandbox against someone with local Docker access.

The demo integration owns fictional light/media/weather/calendar entities and records notify,
cover, lock and scene actions. Light and media services change synthetic entities. Weather uses
a real `WeatherEntity`, daily forecasts and HA's forecast subscription protocol. Calendar serves
relative-date fictional events. Other upstream sensor/plant/contact values come from the existing
fixture. Ramka helpers, templates, automations, scripts and cards run unchanged. Tablet wake/sleep
notifications are recorded intentions; no physical screen action is claimed. There is no radio,
firmware, hardware, speaker streaming or historical statistics emulation.

All eight IDs in `scenes/` are supported: `away`, `evening`, `home`, `morning`, `night`, `rain`,
`sun`, `wind`. Applying one merges its upstream state/attribute overrides over the existing baseline,
then requests its Ramka mode/page through registered helper services. Derived Ramka entities still
come from the real package. A scene's `time` is descriptive: it does not change HA's clock or replay
an entire day. Fictional calendar entries are relative to today. The full catalog's other component
integrations and unrelated scene automations are outside this initial Ramka demo.

## Checks and evidence

```sh
uv run pytest -q tests/test_dev_home.py
uv run tools/dev-home.py check --name review --runtime-only
uv run tools/dev_home/ci.py --runtime-only
uv run tools/dev_home/ci.py
```

`check` needs an already running named instance. It verifies generated HA configuration using the
existing error parser, registered service effects, all existing scene upstream states, internal
network ownership, rejected egress to a controlled live test endpoint, two simultaneous instances,
helper persistence after restart, and reset isolation. The positive network control runs on the
separate UI bridge; HA's request to that endpoint must fail, and HA must have no default route.
It never probes a household device or external internet host. Config checks and readiness have
bounded timeouts. The startup reconciliation observation waits 60 seconds.

The full check additionally drives the **actual HA frontend** in Chromium at 1440×1000 desktop
and the declared 1100×720 tablet viewport, in en/de/pl. It verifies the real cards, forecast, a
light-toggle click and calendar, and leaves a page open across an HA restart. A demo-only
`weather_delay` setting delays the synthetic weather entity for 20 seconds in that restart test;
the generated configuration is restored afterwards. The browser must reconnect without a page
reload and operate the light again; a fresh page must receive the ready forecast. Native HA
navigation remains visible; kiosk-mode and a physical Companion app are not installed or tested.
Screenshots wait for the launch overlay to disappear. New installations have no historical
statistics yet, so empty historical charts are expected.

`--runtime-only` explicitly reports **browser not run** and does not claim full frontend acceptance.
The repository static/configuration gate and this runtime/browser acceptance are different layers.
The coordinator wires the bounded runtime-only runner into the full `tools/check-all.sh` gate;
`tools/check-all.sh --local`, where available, is a partial local check. The separate
[demo workflow](../.github/workflows/demo.yml) prepares dependencies and runs full runtime/browser
acceptance. Creating that workflow does not itself change branch-protection required checks.

The CI runner owns a fresh uniquely named instance and removes its containers and networks even
after a check fails. It preserves only allowlisted reports and PNG screenshots in
`.domosenso/dev/<identity>/evidence/`; authentication, generated home config, storage and databases
are excluded from upload. Interactive `check` writes `check.json`, `browser.json`, config-check
output and `screenshots/` in its own runtime directory. The CI workflow uploads the safe evidence
directory only. A report names every failed required check and exits nonzero.

## Existing component failures

These observations are separate from the launcher's required infrastructure cases. They are not
fixed, silently seeded or counted as component passes here:

- [#51](https://github.com/zerostorypoints/domosenso/issues/51): fresh Ramka tuning helpers start at
  their minimum instead of the documented starting values. Acceptance records all seven values
  before any tuning. Browser test setup then explicitly lengthens controls/off timers and disables
  approach/music switching so UI cases can be inspected predictably; it does not change templates.
- [#52](https://github.com/zerostorypoints/domosenso/issues/52): a restored `off` mode can stay off
  with radar presence already `on`. Acceptance records the state 60 seconds after restart. It does
  not add a reconciliation automation. This initial fixture exercises the wake case; it does not
  claim coverage of every night/sleep timing case.
- [#53](https://github.com/zerostorypoints/domosenso/issues/53): under the delayed-weather restart,
  the existing page can reconnect and control lights while its forecast stays empty. Acceptance
  records that observation separately and verifies that a newly opened page has four forecast days.
  Console errors during the simulated outage are retained in `browser.json`; normal en/de/pl cases
  require no frontend exceptions. Forecast recovery is not presented as a passing component gate.

When separately reviewed component fixes land, promote their regression expectations to required
runtime cases. This demo supplies reproducible upstream boundaries, not evidence of hardware or a
private home's staging/production readiness.
