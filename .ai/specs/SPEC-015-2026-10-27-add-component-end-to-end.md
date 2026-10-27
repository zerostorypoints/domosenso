# SPEC-015: a component end to end — services, firmware, ESPHome device files and the `add-component` skill

Status: approved 2026-10-27 by the maintainer, typed in the session that wrote it ("zrob wszystko w
jednym pr": the spec and its implementation in one pull request; the review of that pull request is
the review of this spec).
Source: the first outside user, onboarding a home on 2026-10-26, asked whether ESPHome runs inside
Home Assistant or as a container on the NAS, and whether a WebView channel had to be installed.
The table "What runs where" (`docs/getting-started.md`, PR #44) lists every part a released
component uses; this spec makes the tools and a skill act on it.

Facts marked **verified** were read in this repository at `12c4e84` or in the field notes named;
**inference** is marked.

## Goal

After onboarding, an agent can take a home from "this component fits" to "it works" without
improvising: what to install inside Home Assistant, which containers go next to it, which firmware
goes on which board and with what command, which ESPHome device files the home needs and which
secrets they read. The manifest says it as data; `add` writes the home's own copies; `status` says
what is still manual; one skill walks the order.

## What was missing (verified at `12c4e84`)

- `onboard-home` adds only `backup`; "After onboarding" is one sentence (`add`, inputs, `render`,
  `--plan`). No skill covers HACS on a Container install, a broker, a compose service, an ESPHome
  device file or a flash.
- `artifacts.services` is an untyped list: `awnings` mixes a firmware mapping with four file paths,
  `remote-access` names one compose file. `deploy` and `add` ignore it; `status` does not mention it.
- `add` writes no ESPHome device file: `bermuda-presence` points `artifacts.esphome.instance` at the
  demo home's hand-written files, and its inputs comment says "the ESPHome device files under
  esphome/ are still written by hand".
- `awnings` names the ESPSomfy-RTS release but not how to flash it; the steps exist only in the
  maintainer's home notes (`esptool erase-flash`, `write-flash 0x0 <bin>`, verified there).
- The catalog ships no broker. `awnings` requires kind `mqtt-broker` ("the home provides it").
- `render-and-stage` still uses `tools/domosenso_render.py` and `tools/domosenso_install.py` from
  before the `domosenso` command.

## 1. Manifest: typed `artifacts.services`

Each item is a mapping with `name` (slug) and `kind`. A plain string (a path) stays valid for a tag
published before this spec and is ignored by the tools (bridge, no removal planned).

| kind | fields | meaning |
|---|---|---|
| `container` | `compose` (path), `files` (paths copied with it, may be empty), `image` (a pinned reference) **or** `build: true`, optional `env_example` (path) | a compose service next to Home Assistant on the Docker host, host network |
| `firmware` | `repo` (GitHub `owner/name`), `version`, `asset` (the release file), `flash` (the command, with `<port>` and `<asset>` placeholders), optional `setup` | a binary from the project's releases, flashed over USB from the owner's computer |

`catalog_check` checks the shape (schema) and that every path exists. Example (`awnings`):

```yaml
services:
  - {name: espsomfy-rts, kind: firmware, repo: rstrouse/ESPSomfy-RTS, version: 2.4.6,
     asset: SomfyController.onboard.esp32.bin,
     flash: "uv run --with esptool esptool --port <port> --baud 500000 write-flash 0x0 <asset>",
     setup: "erase-flash first; then Wi-Fi and the radio pins in its own web page"}
  - {name: frame-bridge, kind: container, compose: services/frame-bridge/compose.yaml,
     files: [services/frame-bridge/Dockerfile, services/frame-bridge/bridge.py],
     env_example: services/frame-bridge/bridge.env.example, build: true}
```

## 2. Manifest: ESPHome device files and secrets

Two optional fields under `artifacts.esphome`:

| field | meaning |
|---|---|
| `devices: {template, each, file}` | `template` a Jinja file outside `templates/` (`esphome/device.yaml.j2`); `each` the name of a list input; `file` the device file name with `<field>` placeholders from each item (`ble-proxy-<room>.yaml`) |
| `secrets: [<key>, ...]` | the keys the device files read with `!secret` |

The device template renders with the renderer's delimiters and globals plus `item` (one element of
the list) and `component` (`id`, `version`), so the package URL carries the tag:
`github://zerostorypoints/domosenso/components/[[ component.id ]]/esphome/ble-proxy.yaml@[[ component.id ]]/[[ component.version ]]`.

`artifacts.esphome.instance` (the demo home's committed device files) stays; a test renders the
template with the demo home's inputs and compares each file with it, as `ha_instance` is compared
(`tests/test_instance_templates.py`), and `esphome-check` keeps validating those files.

## 3. `domosenso add`

Additive; the lines are the existing STABLE `instance` / `instance-kept`.

- Renders `artifacts.esphome.devices` once per item into `<esphome_dir>/<file>`, layer `instance`.
- Copies each `container` service's `compose`, `files` and `env_example` into the home at
  `services/<name>/<file name>`, layer `instance` (SPEC-012 already called the cloudflared compose
  file an instance file; nothing copied it).
- Firmware is not a file of the home: nothing is written.
- A file that exists stays (`instance-kept`), as for `templates/instance/`. Two components naming
  the same service `name` is refused (`owned by <id>: <path>`).

## 4. `domosenso status`

New lines, after the `integration` lines, for every locked component read at its tag (additive to
the STABLE list in `docs/COMPATIBILITY.md`):

| line | when |
|---|---|
| `service <id> <name> image <reference> (manual)` / `service <id> <name> build (manual)` | each `container` service |
| `firmware <id> <name> <version> (manual)` | each `firmware` service |
| `esphome-secret <key> missing` | a key in `artifacts.esphome.secrets` of a locked component that `<esphome_dir>/secrets.yaml` does not define (the file is parsed for its keys only; values are never printed or kept) |

`status` stays `ok` with these lines; they say what a human still has to do, as `integration ...
(manual)` does. `deploy` is unchanged: it copies Home Assistant's config, never services or
firmware (inference: a service on the Docker host needs a compose run with its own go-ahead, which
the skill asks for).

## 5. Home template: a broker

`examples/home-template/services/mosquitto/`: `compose.yaml` (`eclipse-mosquitto` pinned, host
network, config and data under the directory) and `mosquitto.conf` (listener 1883, no anonymous
login, a password file), as `services/home-assistant/compose.yaml` is shipped. The home copies it
when a component requires kind `mqtt-broker` and `discover` shows no `mqtt` entry. The password file
is made by the owner with `mosquitto_passwd` in the container; the agent never types a password.

## 6. Skills

- New `add-component`: one component into an onboarded home, in the order of "What runs where":
  read the manifest and README; inputs; Home Assistant integrations (built in: the UI; HACS on a
  Container: HACS itself or the release copied into `custom_components/`, restart, UI — the human
  clicks); services (broker first if needed; `add` has copied the compose files; to the host, `.env`,
  `compose up -d [--build]` with the owner's yes); ESPHome (`add` wrote the device files; secrets
  from `status`; `esphome config` / `compile`; the flash command for the owner); firmware (the
  command for the owner); `render`, staging if the home has one, `deploy production --plan`, their
  yes, `verify`. Every write to their host, Home Assistant or a device is asked for.
- `onboard-home` "After onboarding" names `add-component`.
- `render-and-stage` rewritten for the command: `domosenso render <id> --catalog-dev <catalog>`,
  `deploy staging --plan` / `--apply`, then a tag and `update` in the home; the old scripts stay for
  the catalog's own checks.

## 7. Components

| component | change | version |
|---|---|---|
| `bermuda-presence` | `esphome/device.yaml.j2`, `artifacts.esphome.devices` (`each: proxies`, `file: ble-proxy-<room>.yaml`) and `secrets`; the demo home's device files rendered from it; the inputs comment updated | 0.2.0 → 0.2.1; `UPGRADE.md`: nothing to do, `add` now writes the device files of a new home |
| `awnings` | typed `services` (§1); README "Flashing the node" | 0.2.0 → 0.2.1; `UPGRADE.md`: nothing to do |
| `remote-access` | typed `services` | stays 0.1.0, unreleased |

No entity, input or dashboard changes. Tags are made with `tools/release.py` after the merge, with
the maintainer's go-ahead.

## Tests

- `tests/test_cli_home_cmds.py`: `add` writes device files per item and copies container services;
  an existing file is kept; `status` prints `service`, `firmware`, `esphome-secret ... missing` (and
  not for a key that is present); a legacy string service prints nothing.
- `tests/test_instance_templates.py`: the device template against the demo home's files.
- `catalog_check --strict`: the schema and every path; `esphome-check bermuda-presence` unchanged.
- `tools/check-all.sh` green.

## Out of scope

- Starting, updating or checking containers from the command (a `services` command): the skill does
  it with the owner's yes. Worth a spec once a second home runs a service.
- Publishing the frame bridge image (GHCR). Until then `build: true`.
- Flashing from the command. Flashing stays the owner's step (AGENTS.md, Boundaries).
- HAOS add-ons.
