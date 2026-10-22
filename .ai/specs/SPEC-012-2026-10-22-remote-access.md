# SPEC-012: `remote-access` — Home Assistant from outside the home through a Cloudflare Tunnel

Status: approved 2026-10-22 by the maintainer, typed in the session that wrote it ("OK dla SPEC-012,
push i PR-y do feature/onboard-v2"; draft 2026-10-22).
Source: SPEC-011 §2.2 (onboarding v2 names this component); the tunnel that has run in the
maintainer's home since 2026-09 and its notes in that home's repository (read 2026-10-22; nothing of
that home is copied here: no host name, address, account or rule value).

Facts marked **verified** were read in the Home Assistant 2026.9.2 image's source or seen in the
maintainer's home; **inference** is marked.

## Goal

A home reaches its Home Assistant from anywhere — browser and Companion app — without opening a port
on the router: a `cloudflared` connector on the Docker host holds an outbound connection to Cloudflare,
which serves one public host name. Home Assistant accepts the proxied requests, keeps its own login
(with two-factor) as the gate, and Cloudflare blocks every country the household is not in.

## Devices

None. A Cloudflare account with a domain on it (the person's, set up by them).

## What changed against SPEC-011 §2.2

SPEC-011 assumed a rendered `http:` package (marked inference). **That does not work on 2026.9:**
Home Assistant moved the `http` domain out of YAML into `.storage/http` (verified: `components/http/
config.py`, `async_load_config` — once `yaml_migration_done` is set, YAML is read by `check_config`
but ignored by the running server; seen in the maintainer's home, where an `http:` block looked
applied and did nothing). The settings are changed over the websocket instead (§3).

## 1. The component

`components/remote-access/`, version 0.1.0, `host.installs: [container]`, `ha_min: "2026.9"`.

| artifact | layer | what |
|---|---|---|
| `services/cloudflared/compose.yaml` (`artifacts.services`) | instance (copied once, the home owns it) | `cloudflare/cloudflared:<pinned version>`, `network_mode: host`, `restart: always`, `command: tunnel --no-autoupdate run`, `TUNNEL_TOKEN` from an env file outside every repository |
| `README.md` | — | the Cloudflare panel steps (§2), the Companion app settings, TOTP |

No package, no dashboard, no card. The image tag is pinned (the maintainer's home runs `latest`;
pinning is the catalog's rule for what it checks).

**Inputs** (`domosenso/remote-access.inputs.yaml`):

| input | type | default | example |
|---|---|---|---|
| `hostname` | string | — (required) | `ha.example.org` |
| `token_file` | path on the host | `/volume1/docker/cloudflared/token.txt` | |
| `trusted_proxies` | list of CIDR | `["127.0.0.1/32", "::1/128"]` (connector on the host network: requests arrive from `::1`, verified) | |
| `allowed_countries` | list of ISO codes | — (required) | `[DE, AT]` |

**Provides**: no entities. **Consumes**: nothing. **Integrations**: `http` (core).

## 2. What the person does in Cloudflare (once, by hand; the agent never logs in there)

1. Zero Trust → Networks → Tunnels → create a tunnel of type Cloudflared; copy only the token from
   the `docker run` line the wizard shows, into `token_file` on the host (`chmod 600`). Do not run
   the wizard's command: the compose service is the connector.
2. Published application route: the `hostname`, service `HTTP`, URL `localhost:8123` (the connector
   is on the host network; on a bridge network it would name the service instead).
3. WAF custom rule on the domain: block requests for the `hostname` whose source country is not in
   `allowed_countries`. **Block, never a challenge:** a managed or JS challenge breaks the Companion
   app (it falls back to looking for a local instance; location updates are read as bot traffic).
   Verified in the maintainer's home; upstream reports: HA community thread on Cloudflare challenges,
   `home-assistant/core#147190`, `home-assistant/iOS#2512`.
4. **No Cloudflare Access application** on the `hostname`: its login page stops the Companion app.
5. Travelling outside `allowed_countries` means editing the rule first.

The skill shows these steps with the person's values filled in and waits; it cannot check them except
from outside (§4).

## 3. Home Assistant's side: `domosenso http` (new, a tool capability)

```
domosenso http <target> --plan | --apply [--confirm <hash>] | --promote
```

Reads and writes Home Assistant's HTTP settings through its own API (verified on 2026.9.2, all
admin-only): `http/config` returns `stable`, `pending`, `revert_at`, `active_config_type`, `default`;
`http/config/configure` stores a **pending** config, checks it can bind and restarts; a pending config
that is not promoted within 5 minutes reverts to stable by itself (`AUTO_REVERT_DELAY`);
`http/config/promote` makes pending stable (the config recovery mode falls back to).

- `--plan` (read-only): the wanted config = the active one with `use_x_forwarded_for: true`,
  `trusted_proxies` from the input, `ip_ban_enabled: true`, `login_attempts_threshold: 5` (inference:
  the values that home runs; any other key is kept as it is). Lines: `http <key> <old> -> <new>` per
  change, `restart: yes|no`, `hash <h>`; `nothing to change` when equal.
- `--apply` (a write, the person's yes; `--confirm <hash>` as `deploy`): `http/config/configure`
  with the wanted config, wait for Home Assistant to come back, read `http/config`: lines `pending`,
  `active pending`, `revert-at <time>`. Then the skill checks from outside (§4) within the 5 minutes.
- `--promote` (a write): `http/config/promote`; line `stable`. Without it the pending config reverts by
  itself — that is the safety net, and the skill says so.

`deploy` is not involved: these settings are not files. The same command serves any home that puts a
reverse proxy in front of Home Assistant, not only this component.

## 4. Checks from outside

- `curl -s -o /dev/null -w '%{http_code}' https://<hostname>/manifest.json` from the person's computer:
  200 through the tunnel; 400 means the proxy settings are not active (Home Assistant logs "A request
  from a reverse proxy was received ... not set-up for reverse proxies", verified).
- From a country outside the list (a VPN exit, the person's choice): 403 with Cloudflare's block page.
- REST through the tunnel needs a named user agent: Cloudflare answers urllib's default one with 403,
  error 1010 (seen 2026-10-22; `domosenso` sends `User-Agent: domosenso`).

## 5. Security the skill asks for

- Two-factor (TOTP) for **every** Home Assistant user before the host name goes public: profile →
  Security → Multi-factor authentication. Each user enables it from their own profile (the QR code
  binds to their phone); the skill lists the users without it (`config/auth/list`, read-only) and
  says that a user without it is the weakest link.
- `ip_ban_enabled` writes `ip_bans.yaml`; a ban survives restarts and is lifted by deleting its line
  and restarting.
- The Companion app: internal URL `http://<host>:8123` with the home Wi-Fi selected, external URL
  `https://<hostname>`.

## Compatibility

Additive: a new component, a new command `http` (its lines STABLE, a row in COMPATIBILITY.md). No
change to other components. `artifacts.services` is used as `awnings` uses it.

## Tests

- `catalog_check --strict`, `tests/test_catalog_content.py` (`COMPONENTS`, translations), privacy.
- The compose file: valid (`docker compose config`), image pinned, host network (a test like
  `tests/test_home_template.py`).
- `tests/test_cli_http.py` with `FakeHA`: plan lines and hash, no change → `nothing to change`, apply
  sends `http/config/configure` with only the wanted keys changed, refuses a changed plan hash,
  promote; read-only `--plan` writes nothing.
- Staging: a throwaway Home Assistant container behind a local `cloudflared`-like proxy is not
  possible without a Cloudflare account; instead a local reverse proxy (any HTTP proxy container on
  the host network) checks the 400 → 200 change after `--apply` (inference: equivalent for the
  `X-Forwarded-For` handling).
- Real check, read-only, possible now: `domosenso http production --plan` over the maintainer's tunnel
  must print `nothing to change`. Anything that writes waits for the maintainer.

## Out of scope

- Nabu Casa, Tailscale, WireGuard (the skill names them; no component).
- Creating the tunnel, the route, the DNS record or the WAF rule through Cloudflare's API.
- An installer's remote access to clients' homes (its own project).

## As built (2026-10-22)

- `cloudflare/cloudflared:2026.10.1` (a week old; 2026.10.3 was a day old). The token is mounted as a
  file and read through `TUNNEL_TOKEN_FILE` (verified in cloudflared's source at that tag), so it is in
  no environment listing.
- `tested.homes: 0`: the maintainer's tunnel was set up by hand; this compose file and `domosenso
  http` have not run there.
- `domosenso http` keeps a login-attempt threshold the home chose and sets 5 only where there is none
  (open question 3); `--trusted-proxy` overrides the input.
- Checked: `--plan` read-only against the maintainer's production over the tunnel prints `nothing to
  change`; on a throwaway local Home Assistant 2026.9.2 a request with `X-Forwarded-For` from loopback
  got 400 before `--apply` and 200 after it, `--promote` made the config stable.

## Open questions

1. Pin which `cloudflared` version (the newest at implementation time, checked to run).
2. Whether `http` should refuse to apply while the connector is not running (it cannot tell from
   Home Assistant; inference: leave it to the skill's outside check).
3. Whether the defaults `login_attempts_threshold: 5` and `ip_ban_enabled: true` are right for every
   home, or inputs.
