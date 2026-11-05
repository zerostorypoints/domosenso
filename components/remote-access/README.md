# remote-access: field notes

Home Assistant from outside the home through a Cloudflare Tunnel (SPEC-012). What a home does once,
in this order, what protects it, and what an agent may and may not do. The public guide is the
website's how-to "Reach Home Assistant from outside the home" (`website/content/how-to/`).

## What protects the home, and what does not

The tunnel puts Home Assistant's login page on the internet. Every layer below is needed; none of
them alone is enough.

| layer | stops | does not stop |
|---|---|---|
| no inbound port: the connector dials out to Cloudflare | scans and attacks on the home's IP address; the router keeps every port closed | anything that comes through the published host name |
| Cloudflare WAF rule: block every country outside `allowed_countries` | the bulk of password guessing and scanners from other countries | anyone in an allowed country, or behind a VPN exit there; it is noise reduction, not authentication |
| Home Assistant login with two-factor (TOTP) for **every** user | a stolen or guessed password | a stolen long-lived access token: tokens skip the login and two-factor |
| `login_attempts_threshold` 5 and `ip_ban_enabled` | repeated failed logins from one address; the ban uses the real client address from `X-Forwarded-For` | guessing spread over many addresses |
| `local_only` on users that never leave the home (a wall tablet's kiosk user) | that login being used through the tunnel | — |

Trust that remains, for the owner to accept knowingly:

- **Cloudflare ends TLS** and sees the traffic unencrypted: passwords, tokens, camera images. A home
  that cannot accept that needs a VPN instead (Tailscale, WireGuard), and then the Companion app
  works only with the VPN up.
- **The Cloudflare account** can add a route to any address the connector host reaches (on the host
  network: the whole LAN, the NAS's own admin page included), remove the WAF rule or read the
  traffic. It needs its own strong password and two-factor, ideally a hardware key, and belongs to
  the household, not to the installer.
- **The tunnel token** lets whoever holds it run a connector for this host name, and so serve their
  own page under it. It stays in `token_file` on the Docker host, mode 600, outside every repository;
  the compose service reads it as a file (`TUNNEL_TOKEN_FILE`), so `docker inspect` does not show it.
  A token passed with `-e TUNNEL_TOKEN=` is visible to everyone who can run `docker inspect`.
  When it may have leaked, rotate it in the tunnel's settings (or delete the tunnel and create a new
  one) and put the new one in `token_file`.
- **Long-lived access tokens** (an agent's, a script's) work through the tunnel from an allowed
  country and skip two-factor. Each holds the rights of its user: an administrator's token is an
  administrator. Name each after its holder, keep it in a mode 600 file outside every repository,
  and delete those no longer used (profile → Security → Long-lived access tokens).
- **Webhooks** (`/api/webhook/<id>`) need no login; the id is the secret. A webhook trigger keeps
  `local_only: true` (the default) unless it must be reached from outside.

## 1. Cloudflare (the owner, in the Cloudflare dashboard)

0. Two-factor on the Cloudflare account, before anything else.
1. Zero Trust → Networks → Tunnels → create a tunnel of type Cloudflared. From the `docker run` line
   the wizard shows, copy only the token (the string after `--token`) into the `token_file` on the
   Docker host, `chmod 600`. Do not run the wizard's command: the compose service is the connector.
2. In the tunnel, a published application route: the `hostname`, service `HTTP`, URL
   `localhost:8123` (the connector runs on the host network). The DNS record is created with it.
   One route, to Home Assistant only: every other route publishes another service of the home.
3. Security → WAF → a custom rule on the domain: block when the host is the `hostname` and the source
   country is not one of `allowed_countries`, e.g.
   `(http.host eq "<hostname>" and not ip.src.country in {"DE" "AT"})`, action **Block**.
4. **No challenge and no Access application** on the `hostname`. A managed or JS challenge breaks the
   Companion app (it falls back to looking for a local instance, and its location updates are read
   as bot traffic: home-assistant/core#147190; the iOS app does not send its own user agent during
   login, home-assistant/iOS#2512). An Access login page stops the app as well. Without them, Home
   Assistant's own login with two-factor is the gate: section 4 comes before the host name goes public.
5. Travelling outside `allowed_countries`: edit the rule first (it works from a phone), and put it
   back on return.

## 2. The connector (on the Docker host, after the owner's yes)

Copy `services/cloudflared/compose.yaml` into the home repository and to the host, then
`TUNNEL_TOKEN_HOST_FILE=<token_file> docker compose -f compose.yaml up -d`. The log shows
`Registered tunnel connection` four times. The image is pinned and `--no-autoupdate` is set, so a
new version comes only when the home changes the tag: `pull`, `up -d`. The connector logs
`Your version ... is outdated` when one exists.

## 3. Home Assistant's HTTP settings: `domosenso http`

Since 2026.9 Home Assistant keeps the `http` settings in `.storage/http`; an `http:` block in
`configuration.yaml` is read by `check_config` and ignored by the running server (it only raises a
repair issue). Without `use_x_forwarded_for` and `trusted_proxies` every request through the tunnel
gets 400 and the log says a request from a reverse proxy was received but the HTTP integration is
not set up for reverse proxies.

```bash
domosenso http production --plan                     # read-only: what would change, and a hash
domosenso http production --apply --confirm <hash>   # pending config, Home Assistant restarts
curl -s -o /dev/null -w '%{http_code}' https://<hostname>/manifest.json   # 200 through the tunnel
domosenso http production --promote                  # within 5 minutes, or it reverts by itself
```

A pending config that is not promoted within 5 minutes goes back to the stable one by itself; stable
is what recovery mode starts with. `trusted_proxies` `127.0.0.1/32` and `::1/128` are right only while
the connector is on the host network; on a bridge network put that network's subnet there, and
nothing wider: an address in `trusted_proxies` may set the client address Home Assistant believes,
which decides `local_only`, the ban and the log.

## 4. Before the host name goes public

- Two-factor (TOTP) for **every** Home Assistant user: profile → Security → Multi-factor
  authentication. Each user enables it from their own profile (the QR code binds to their phone), so
  the agent can only ask, and check. A user without it is the weakest login on the internet: until
  they enable it, the owner decides between that and setting the user `local_only`.
- A wall tablet's kiosk user, and any user that never leaves the home: `local_only` (Settings →
  People → the user → "Local access only").
- Review the long-lived access tokens of every administrator, and delete those no one uses.
- Home Assistant up to date: its login page is now on the internet.
- `ip_ban_enabled` writes `ip_bans.yaml` in the config directory; a ban survives a restart and is
  lifted by deleting its line and restarting.
- Companion app → Settings → Companion app → the server: internal URL `http://<host>:8123` with the
  home Wi-Fi selected, external URL `https://<hostname>`.

## 5. Checks (read-only; after setup, and whenever asked whether it is safe)

```bash
domosenso http production --plan                                          # nothing to change
curl -s -o /dev/null -w '%{http_code}\n' -A domosenso-check https://<hostname>/manifest.json   # 200
curl -s -o /dev/null -w '%{http_code}\n' -A domosenso-check https://<hostname>/api/            # 401: the API wants a token
curl -sI -A domosenso-check https://<hostname>/ | grep -i '^location'     # nothing: no Access redirect
docker inspect <connector> --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1   # names only; no TUNNEL_TOKEN
```

Who has two-factor, who is `local_only`, and which long-lived tokens each user has. The files read
hold secrets (token signing keys, TOTP seeds): never `cat` them; this prints names and flags only.

```bash
docker exec -i <home assistant container> python3 - <<'EOF'
import json
a = json.load(open('/config/.storage/auth'))['data']
try:
    totp = json.load(open('/config/.storage/auth_module.totp'))['data'].get('users', {})
except FileNotFoundError:
    totp = {}
for u in a['users']:
    if u.get('system_generated'):
        continue
    tokens = [t.get('client_name') for t in a['refresh_tokens']
              if t['user_id'] == u['id'] and t.get('token_type') == 'long_lived_access_token']
    print(u['name'], 'admin' if 'system-admin' in u.get('group_ids', []) else 'user',
          'totp' if u['id'] in totp else 'NO-TOTP', 'local_only' if u.get('local_only') else 'remote', tokens)
EOF
```

Read on Home Assistant 2026.9.2. A user that is `remote` and `NO-TOTP` is a finding; so is an
administrator's token whose holder no one can name.

What the agent cannot check, and says so instead of assuming: the WAF rule and the Cloudflare
account's two-factor (the owner looks in the dashboard), and the block itself, which needs a request
from outside `allowed_countries` (a VPN exit gets 403 with Cloudflare's block page; one in an allowed
country proves nothing).

## What the agent does and does not do

- It never logs in at Cloudflare, never types a password, never reads, prints or copies the tunnel
  token or a Home Assistant token into a chat, a log, a commit or a pull request.
- It writes to Home Assistant (`http --apply`, `--promote`, a user's `local_only`, deleting a token)
  and starts or updates the connector only after the owner's yes.
- It never weakens a layer on its own: no wider `allowed_countries`, no second route on the tunnel,
  no `trusted_proxies` wider than the connector's network, no user without two-factor made `remote`.
  When the owner asks for one of these, it names the layer it removes before doing it.
- It reports what section 5 found, including what it could not check.

## Reading Home Assistant through the tunnel

Cloudflare answers Python's default user agent with 403 (error 1010); the `domosenso` command sends
its own, and the checks above send `-A domosenso-check`.
