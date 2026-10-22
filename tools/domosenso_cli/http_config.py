"""`domosenso http`: Home Assistant's HTTP settings for a reverse proxy in front of it (SPEC-012
section 3).

Since 2026.9 these settings are not YAML: Home Assistant keeps them in `.storage/http` as a `stable`
and a `pending` slot and changes them over the websocket. `http/config/configure` stores a pending
config and restarts; a pending config that is not promoted within 5 minutes reverts to stable by
itself, and `http/config/promote` makes it stable (the one recovery mode starts with). `--plan` only
reads; `--apply` and `--promote` write and need the owner's yes.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time

import yaml

from domosenso_cli import recommend
from domosenso_cli.build import sha256
from domosenso_cli.deploy import HASH_LENGTH
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HOME_FILE
from domosenso_cli.report import Reporter

# The keys `http/config/configure` accepts (HTTP_STORAGE_SCHEMA on 2026.9.2); the stored slots also
# carry created_at, error and error_message, which it refuses.
CONFIG_KEYS = ("server_host", "server_port", "ssl_certificate", "ssl_peer_certificate", "ssl_key",
               "cors_allowed_origins", "use_x_forwarded_for", "trusted_proxies", "login_attempts_threshold",
               "ip_ban_enabled", "ssl_profile", "use_x_frame_options")
# The connector on the host network: requests arrive from the loopback addresses.
HOST_NETWORK_PROXIES = ["127.0.0.1/32", "::1/128"]
INPUTS = "domosenso/remote-access.inputs.yaml"
LOGIN_ATTEMPTS = 5
NO_THRESHOLD = -1  # Home Assistant's "no login attempt threshold"
RESTART_WAIT_S = 300
POLL_S = 5


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", metavar="<target or URL>",
                        help="a target in domosenso.yaml, or a URL with --token-file (--plan only)")
    parser.add_argument("--token-file", metavar="<file>", help="the long-lived access token for a URL")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--plan", action="store_true", help="what would change (read-only)")
    action.add_argument("--apply", action="store_true", help="store the planned config as pending and restart")
    action.add_argument("--promote", action="store_true", help="make the pending config stable")
    parser.add_argument("--confirm", metavar="<hash>", help="the plan's hash, required with --apply")
    parser.add_argument("--trusted-proxy", nargs="+", metavar="<cidr>",
                        help=f"the proxies to trust (default: trusted_proxies in {INPUTS}, else the host network's)")


def _ha(args: argparse.Namespace):
    args.from_ha = args.target
    return recommend.open_ha(args)


def _proxies(args: argparse.Namespace) -> list[str]:
    if args.trusted_proxy:
        return list(args.trusted_proxy)
    inputs = args.home / INPUTS
    if (args.home / HOME_FILE).exists() and inputs.is_file():
        given = (yaml.safe_load(inputs.read_text()) or {}).get("trusted_proxies")
        if given:
            return [str(p) for p in given]
    return list(HOST_NETWORK_PROXIES)


def active_slot(config: dict) -> dict:
    """The config the running server started with."""
    kind = config.get("active_config_type")
    if kind in ("stable", "pending") and config.get(kind):
        return config[kind]
    return config.get("default") or config["stable"]


def plan(config: dict, proxies: list[str]) -> tuple[dict, dict, str]:
    """(wanted config, {key: (old, new)} changes, hash). Every key the home set is kept; a login
    attempt threshold it chose stays."""
    current = {k: v for k, v in active_slot(config).items() if k in CONFIG_KEYS}
    wanted = {**current, "use_x_forwarded_for": True, "trusted_proxies": proxies, "ip_ban_enabled": True}
    if current.get("login_attempts_threshold", NO_THRESHOLD) == NO_THRESHOLD:
        wanted["login_attempts_threshold"] = LOGIN_ATTEMPTS
    changes = {k: (current.get(k), v) for k, v in wanted.items() if current.get(k) != v}
    digest = sha256(json.dumps({"wanted": wanted, "changes": sorted(changes)}, sort_keys=True,
                               separators=(",", ":")).encode())[:HASH_LENGTH]
    return wanted, changes, digest


def _show(value) -> str:
    return json.dumps(value, separators=(",", ":"))


async def _read(ha) -> dict:
    async with ha:
        return await ha.call("http/config")


def _report_plan(config: dict, changes: dict, digest: str, rep: Reporter) -> None:
    pending = config.get("pending")
    if pending and not pending.get("error"):
        rep.line("pending", "waiting", "revert-at", str(config.get("revert_at") or "-"))
    if not changes:
        rep.line("nothing", "to", "change")
        return
    for key, (old, new) in sorted(changes.items()):
        rep.line("http", key, _show(old), "->", _show(new))
    rep.line("restart:", "yes")
    rep.line("hash", digest)


def _wait_for_restart(args: argparse.Namespace) -> dict:
    """http/config once Home Assistant answers again after the restart."""
    deadline = time.monotonic() + RESTART_WAIT_S
    last = None
    time.sleep(POLL_S)  # the restart takes the server down only after the result was sent
    while time.monotonic() < deadline:
        try:
            return asyncio.run(_read(_ha(args)))
        except DomosensoError as exc:
            last = exc
            time.sleep(POLL_S)
    raise DomosensoError(f"Home Assistant did not answer within {RESTART_WAIT_S} s after the restart: {last}")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    if args.confirm and not args.apply:
        raise DomosensoError("--confirm goes with --apply")
    config = asyncio.run(_read(_ha(args)))

    if args.promote:
        pending = config.get("pending")
        if not pending:
            rep.line("nothing", "to", "promote")
            return rep.ok()
        if pending.get("error"):
            raise DomosensoError(f"the pending config failed its trial: {pending.get('error_message') or pending['error']}")
        if config.get("active_config_type") != "pending":
            raise DomosensoError("the pending config is not the one running; restart before promoting")

        async def promote():
            async with _ha(args) as ha:
                await ha.call("http/config/promote")
                return await ha.call("http/config")

        after = asyncio.run(promote())
        if after.get("pending"):
            raise DomosensoError("http/config still holds a pending config after the promotion")
        rep.line("stable")
        return rep.ok()

    wanted, changes, digest = plan(config, _proxies(args))
    if args.plan:
        _report_plan(config, changes, digest, rep)
        return rep.ok()

    if not changes:
        rep.line("nothing", "to", "change")
        return rep.ok()
    if not args.confirm:
        raise DomosensoError(f"--apply needs --confirm {digest} (the hash of --plan)")
    if args.confirm != digest:
        raise DomosensoError(f"the plan changed: its hash is now {digest}, not {args.confirm}")

    async def configure():
        async with _ha(args) as ha:
            return await ha.call("http/config/configure", config=wanted)

    result = asyncio.run(configure()) or {}
    rep.line("configured", "restart:", "yes" if result.get("restart") else "no")
    after = _wait_for_restart(args) if result.get("restart") else asyncio.run(_read(_ha(args)))
    pending = after.get("pending") or {}
    if pending.get("error"):
        raise DomosensoError(f"the pending config failed its trial: {pending.get('error_message') or pending['error']}")
    rep.line("active", str(after.get("active_config_type")))
    rep.line("revert-at", str(after.get("revert_at") or "-"))
    if after.get("active_config_type") != "pending":
        raise DomosensoError(f"Home Assistant started with {after.get('active_config_type')}, not the pending config")
    return rep.ok()
