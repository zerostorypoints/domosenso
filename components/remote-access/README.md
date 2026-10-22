# remote-access: field notes

Home Assistant from outside the home through a Cloudflare Tunnel (SPEC-012). What a home does once,
in this order. The agent never logs in at Cloudflare and never types a password; every write to Home
Assistant waits for the owner's yes.

## 1. Cloudflare (the owner, in the Cloudflare dashboard)

1. Zero Trust → Networks → Tunnels → create a tunnel of type Cloudflared. From the `docker run` line
   the wizard shows, copy only the token (the string after `--token`) into the `token_file` on the
   Docker host, `chmod 600`. Do not run the wizard's command: the compose service is the connector.
2. In the tunnel, a published application route: the `hostname`, service `HTTP`, URL
   `localhost:8123` (the connector runs on the host network). The DNS record is created with it.
3. Security → WAF → a custom rule on the domain: block when the host is the `hostname` and the source
   country is not one of `allowed_countries`, e.g.
   `(http.host eq "<hostname>" and not ip.src.country in {"DE" "AT"})`, action **Block**.
4. **No challenge and no Access application** on the `hostname`. A managed or JS challenge breaks the
   Companion app (it falls back to looking for a local instance, and its location updates are read
   as bot traffic: home-assistant/core#147190; the iOS app does not send its own user agent during
   login, home-assistant/iOS#2512). An Access login page stops the app as well.
5. Travelling outside `allowed_countries`: edit the rule first (it works from a phone).

## 2. The connector (on the Docker host, after the owner's yes)

Copy `services/cloudflared/compose.yaml` into the home repository and to the host, then
`TUNNEL_TOKEN_HOST_FILE=<token_file> docker compose -f compose.yaml up -d`. The log shows
`Registered tunnel connection` four times. A new image: change the tag, `pull`, `up -d`.

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
the connector is on the host network; on a bridge network put that network's subnet there.

## 4. Before the host name goes public

- Two-factor (TOTP) for **every** Home Assistant user: profile → Security → Multi-factor
  authentication. Each user enables it from their own profile (the QR code binds to their phone). A
  user without it is the weakest login on the internet.
- `ip_ban_enabled` writes `ip_bans.yaml` in the config directory; a ban survives a restart and is
  lifted by deleting its line and restarting.
- Companion app → Settings → Companion app → the server: internal URL `http://<host>:8123` with the
  home Wi-Fi selected, external URL `https://<hostname>`.

## Reading Home Assistant through the tunnel

Cloudflare answers Python's default user agent with 403 (error 1010); the `domosenso` command sends
its own. A check from another country (a VPN exit) gets 403 with Cloudflare's block page.
