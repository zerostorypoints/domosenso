---
slug: reach-home-assistant-from-outside
title: Reach Home Assistant from outside the home
description: Use Home Assistant and its phone app away from home through a Cloudflare Tunnel, with no open port, a country rule and two-factor for every user.
components: []
devices: []
status: draft
updated: '2026-11-05'
sources:
- https://github.com/zerostorypoints/domosenso/tree/af0d3f27a30a04e9fd5cb3cf9b5458deb182753f/components/remote-access
- https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- https://www.home-assistant.io/integrations/http/
- https://github.com/home-assistant/core/issues/147190
- https://github.com/home-assistant/iOS/issues/2512
branches:
- situation: Home Assistant Container on a Docker host, and a domain whose DNS is on Cloudflare
  needs: A Cloudflare account (the free plan is enough) with two-factor on, a host name under your domain, and Home Assistant 2026.9 or later.
  wiring: None.
  supported: 'yes'
  prompt: Add the remote-access component to my home for the host name I give you, with my list of allowed countries. Walk me through the Cloudflare steps I do myself, prepare the connector's compose service, show me the domosenso http plan before anything is written, and run the read-only checks, including who still has no two-factor.
- situation: Home Assistant OS or Supervised
  needs: The component targets Container installs, where every service is its own container. On Home Assistant OS a Cloudflared app does the same job; the security steps on this page still apply.
  wiring: —
  supported: 'no'
- situation: Only you, from your own devices, and nobody needs the phone app away from home
  needs: A VPN (WireGuard, Tailscale) keeps the login page off the internet and keeps your traffic away from Cloudflare. Domosenso has no component for it.
  wiring: —
  supported: 'no'
---

With a Cloudflare Tunnel, Home Assistant and its Companion app work from anywhere under a host name
of yours, such as `ha.example.org`. A small connector on the Docker host holds an outbound
connection to Cloudflare; the router opens no port, and nothing at the home's address answers from
the internet.

The price is that Home Assistant's login page is now on the internet, and Cloudflare sees the
traffic unencrypted. This page is about making that safe enough, and about what remains.

## How a request reaches Home Assistant

1. The phone connects to your host name over HTTPS. Cloudflare holds the certificate and ends TLS.
2. A WAF rule blocks every country outside your list with a 403, before anything reaches the home.
3. Cloudflare passes the request down the tunnel to the connector, which runs on the host network
   and forwards it to `localhost:8123`.
4. Home Assistant trusts only the connector's address as a proxy, reads the real client address from
   `X-Forwarded-For`, and asks for a password and a one-time code.

## What protects the home, and what does not

| layer | stops | does not stop |
|---|---|---|
| No open port | scans and attacks on the home's address | anything that comes through the host name |
| Country rule in Cloudflare | most password guessing and scanners | anyone in an allowed country, or behind a VPN exit there |
| Password and two-factor for every user | a stolen or guessed password | a stolen long-lived access token, which skips both |
| Failed-login ban (5 attempts) | repeated guessing from one address | guessing spread over many addresses |
| Local access only for users that stay home | a wall tablet's login being used from outside | — |

The country rule is noise reduction. Home Assistant's own login is the gate, so two-factor for every
user comes before the host name goes public: one user with a password only is the weakest login on
the internet.

Three things hold more power than any single login and are kept accordingly:

- **The Cloudflare account** can route the tunnel to any address the connector reaches, the NAS's own
  admin page included, and can remove the country rule. Give it its own strong password and
  two-factor, ideally a hardware key, and keep it in the household's name.
- **The tunnel token** lets whoever holds it run a connector for your host name and serve their own
  page under it. It lives in one file on the Docker host, readable by its owner only, and the
  connector reads it from there, so it does not show in the container's settings.
- **Long-lived access tokens**, the kind scripts and agents use, work through the tunnel and skip
  two-factor. Name each after whoever holds it, keep it in a file outside every repository, and
  delete the ones nobody uses.

## Why no Cloudflare challenge or Access login

Both are the obvious extra layer, and both break the Companion app. After a managed or JavaScript
challenge the app falls back to looking for a local instance, and Cloudflare reads its location
updates as bot traffic (Home Assistant core issue 147190). An exception for the app's user agent
does not help, because the iOS app does not send it while logging in (iOS issue 2512). A
Cloudflare Access login page stops the app the same way. The rule therefore blocks outright instead
of challenging, and the login with two-factor carries the rest.

If nobody in the home needs the app away from home, a VPN is the stronger choice: the login page
never reaches the internet.

## What you do, and what your agent does

**In the Cloudflare dashboard, yourself:** turn on two-factor for the account; create a tunnel and
copy only its token into a file on the Docker host (`chmod 600`); add one published route, your
host name to `localhost:8123`, and no other; add a WAF custom rule that blocks your host name for
every country outside your list, for example
`(http.host eq "ha.example.org" and not ip.src.country in {"DE" "AT"})` with the action Block.

**In Home Assistant, each person:** enable two-factor from their own profile (Security →
Multi-factor authentication); the code binds to their own phone, so nobody can do it for them. Set
the wall tablet's user to local access only.

**Your agent**, after your yes for every step that writes: adds the
remote-access component, starts the connector from its pinned compose
service, and sets Home Assistant's reverse-proxy settings with `domosenso http`. Since 2026.9 these
settings live in Home Assistant's storage, not in `configuration.yaml`; the command shows a plan,
applies it as a pending configuration, and promotes it once a request through the tunnel answers.
A pending configuration nobody promotes reverts by itself after five minutes.

The agent never logs in at Cloudflare, never handles a password, and never copies the tunnel token
or a Home Assistant token anywhere.

## Checks

After setup, and whenever you ask whether it is still safe, the agent checks without writing:

- the reverse-proxy settings match the plan;
- the host name answers, the API without a token answers 401, and no Access redirect is in the way;
- the connector's token is not in its environment;
- which users have two-factor, which are local access only, and which long-lived tokens exist.

Two things only you can check: the WAF rule and the account's two-factor in the Cloudflare
dashboard. The block itself shows only from outside your countries: a VPN exit elsewhere should get
Cloudflare's 403 page.

## Travelling

Before a trip outside your countries, add the destination to the rule (it works from a phone), and
take it out again when you are back.

## Hints from real installations

- The maintainer's home has run this setup since September 2026, the tunnel, rule and proxy
  settings made by hand; the component's compose file and `domosenso http` have not run in a home
  yet. On 12 October 2026 a request from a US exit got Cloudflare's 403 and the home line got 200.
  An earlier test proved nothing, because every request of that session left through the home's own
  country.
- An `http:` block in `configuration.yaml` looked applied, because the configuration check reads it,
  and changed nothing in the running server. The reverse-proxy settings have to go through
  `domosenso http`.
