"""Entry point of `domosenso`: parses the command line and runs one subcommand.

Each subcommand is a module that exposes `run(args, rep) -> int` and may expose
`add_arguments(parser)` for its own options; `"<module>:<name>"` names an object inside a module
that holds several commands instead. COMMANDS is the one place that knows where they are:
a task that builds a command adds its module and replaces the `None` here. A `None` entry is a
stub that fails with `not implemented`.
"""
from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path
from types import ModuleType

from domosenso_cli.errors import DomosensoError
from domosenso_cli.report import Reporter

COMMANDS: dict[str, str | None] = {
    "init": "domosenso_cli.cmd_home:init",
    "add": "domosenso_cli.cmd_home:add",
    "adopt": "domosenso_cli.cmd_adopt",
    "render": "domosenso_cli.cmd_render",
    "update": "domosenso_cli.cmd_home:update",
    "status": "domosenso_cli.cmd_home:status",
    "deploy": "domosenso_cli.cmd_deploy:deploy",
    "rollback": "domosenso_cli.cmd_deploy:rollback",
    "snapshot": "domosenso_cli.snapshot",
    "compare": "domosenso_cli.compare",
    "verify": "domosenso_cli.verify",
    "recommend": "domosenso_cli.recommend",
    "discover": "domosenso_cli.discover",
    "probe": "domosenso_cli.probe",
}

SUMMARIES = {
    "init": "start a home repository",
    "add": "add a component to the home",
    "adopt": "take over files already rendered by hand",
    "render": "render components into the home",
    "update": "move a component to a newer version",
    "status": "classify the home's files and list component versions",
    "deploy": "copy the home to a target and restart",
    "rollback": "restore a target from its last backup",
    "snapshot": "record the entities of a running home",
    "compare": "compare two snapshots",
    "verify": "check a running home against a snapshot",
    "recommend": "list the components the home's devices satisfy",
    "discover": "list what Home Assistant discovered and has set up",
    "probe": "measure a wall tablet's screen through a temporary page",
}


def load_command_module(path: str) -> ModuleType:
    return importlib.import_module(path)


def load_command(path: str):
    """The module, or the object after `:` in `<module>:<name>`."""
    module_path, _, name = path.partition(":")
    module = load_command_module(module_path)
    return getattr(module, name) if name else module


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="domosenso", description="Install, render, deploy and compare a Domosenso home."
    )
    parser.add_argument(
        "--home", type=Path, default=None, help="the home repository (default: current directory)"
    )
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="print one JSON document")
    sub = parser.add_subparsers(dest="command", metavar="<command>", required=True)
    for name, module_path in COMMANDS.items():
        command = sub.add_parser(name, parents=[common], help=SUMMARIES[name], description=SUMMARIES[name])
        if module_path is not None:
            add_arguments = getattr(load_command(module_path), "add_arguments", None)
            if add_arguments:
                add_arguments(command)
    return parser


def run_command(name: str, args: argparse.Namespace, rep: Reporter) -> int:
    module_path = COMMANDS[name]
    if module_path is None:
        raise DomosensoError("not implemented")
    return load_command(module_path).run(args, rep)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    args.home = (args.home or Path.cwd()).resolve()
    rep = Reporter(args.json)
    try:
        code = run_command(args.command, args, rep)
    except DomosensoError as exc:
        return rep.fail(str(exc))
    except Exception as exc:  # noqa: BLE001 - `--json` must print one document whatever goes wrong
        return rep.fail(f"unexpected: {exc!r}")
    if not isinstance(code, int) or isinstance(code, bool):
        return rep.fail("command returned no exit code")
    return code


if __name__ == "__main__":
    sys.exit(main())
