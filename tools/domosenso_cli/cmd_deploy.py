"""`domosenso deploy <target> --plan | --apply` and `domosenso rollback <target> [<deploy id>]`.

The work is in `deploy.py`; this module reads the home, opens the target and Home Assistant, prints
the plan and asks for the production confirmation. `deploy production --apply` needs the word
`production` typed on the terminal, or `--confirm <hash>` with the hash of a plan that is still what
a plan made now gives. The prompt is a second lock, not the permission (AGENTS.md).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import asdict
from types import SimpleNamespace

from domosenso_cli.deploy import PRODUCTION, Plan, apply, make_plan, plan_lines, rollback as rollback_target
from domosenso_cli.errors import DomosensoError
from domosenso_cli.ha_api import HA
from domosenso_cli.home import HomeConfig, Target
from domosenso_cli.lock import Lock
from domosenso_cli.report import Reporter
from domosenso_cli.targets import open_target


def connect(t: Target) -> HA:
    return HA.for_target(t)


def _target(home: HomeConfig, name: str) -> Target:
    if name not in home.targets:
        raise DomosensoError(f"no target {name} in domosenso.yaml")
    return home.targets[name]


def _deploy_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", help="a target named in domosenso.yaml")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", action="store_true", help="show what would change; write nothing")
    mode.add_argument("--apply", action="store_true", help="back up, copy, check, restart")
    parser.add_argument("--remove-orphans", nargs="+", default=[], metavar="PATH",
                        help="orphans (files on the target the repository does not know) to delete")
    parser.add_argument("--prune-resources", action="store_true", help="delete Lovelace resources nobody wants")
    parser.add_argument("--confirm", metavar="HASH", help="the hash of the plan, instead of typing 'production'")


async def _confirm(plan: Plan, given: str | None, target: str, json_mode: bool) -> None:
    if given is not None:
        if given != plan.hash:
            raise DomosensoError(f"the plan changed: its hash is now {plan.hash}, not {given}")
        return
    if target != PRODUCTION:
        return
    if json_mode or not sys.stdin.isatty():  # in JSON mode the plan is printed only at the end
        raise DomosensoError(f"deploy production needs --confirm {plan.hash} when it does not run on a terminal")
    print("Type 'production' to deploy this plan: ", end="", file=sys.stderr, flush=True)
    answer = await asyncio.to_thread(sys.stdin.readline)
    if answer.strip() != PRODUCTION:
        raise DomosensoError("not confirmed")


async def _deploy(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    lock = Lock.load(args.home)
    t = _target(home, args.target)
    io = open_target(t)
    async with connect(t) as ha:
        plan = make_plan(home, lock, io, await ha.call("lovelace/resources"))
        for line in plan_lines(plan):
            rep.line(*line)
        rep.data.append({"plan": {
            "add": plan.add, "change": plan.change, "remove": plan.remove, "orphan": plan.orphan,
            "keep": plan.keep, "dirty": plan.dirty, "resources": [asdict(a) for a in plan.resources],
            "restart": plan.restart, "hash": plan.hash,
        }})
        if args.plan:
            return rep.ok()
        await _confirm(plan, args.confirm, args.target, rep.json_mode)
        deploy_id = await apply(home, lock, plan, io, ha, args.remove_orphans, args.prune_resources,
                                target=args.target, rep=rep)
    rep.line("deployed", deploy_id)
    return rep.ok()


def _rollback_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("target", help="a target named in domosenso.yaml")
    parser.add_argument("deploy_id", nargs="?", metavar="<deploy id>",
                        help="the deploy to undo (default: the last one the target's record names)")


async def _rollback(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    t = _target(home, args.target)
    io = open_target(t)
    async with connect(t) as ha:
        deploy_id = await rollback_target(home, io, ha, args.deploy_id, target=args.target, rep=rep)
    rep.line("rolled-back", deploy_id)
    return rep.ok()


deploy = SimpleNamespace(run=lambda args, rep: asyncio.run(_deploy(args, rep)), add_arguments=_deploy_arguments)
rollback = SimpleNamespace(run=lambda args, rep: asyncio.run(_rollback(args, rep)), add_arguments=_rollback_arguments)
