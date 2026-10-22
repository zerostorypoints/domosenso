"""`domosenso recommend`: which components the devices a home has satisfy (SPEC-009 section 2).

Read-only. Every component is read at its newest tag, as `add` would take it, never from a working
tree. A requirement is met when `--have` names its `kind` or one of its `recommend` device ids; the
device ids known are those the manifests name (`devices/` is not tagged, so it is not read).
"""
from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import yaml

from domosenso_cli.build import CACHE_DIR
from domosenso_cli.catalog import Catalog, is_url
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HOME_FILE, HomeConfig
from domosenso_cli.report import Reporter

# `install_path` names where cards would go; it installs nothing by itself.
NOT_AN_INSTALL = {"install_path"}


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--catalog", metavar="<path or URL>",
                        help="the catalog to read (default: the one in the home's domosenso.yaml)")
    parser.add_argument("--have", nargs="*", default=[], metavar="<device id or kind>",
                        help="the devices the home has: catalog device ids (tapo-t315) or kinds (android-tablet)")


def _installs(value) -> bool:
    if isinstance(value, dict):
        return any(_installs(v) for v in value.values())
    if isinstance(value, list):
        return bool(value)
    return bool(value)


def describes_only(manifest: dict) -> bool:
    """True for a component whose artifacts install nothing (it describes what another one reads)."""
    artifacts = manifest.get("artifacts") or {}
    return not any(_installs(v) for k, v in artifacts.items() if k not in NOT_AN_INSTALL)


def _met(requirement: dict, have: set[str]) -> bool:
    return requirement["kind"] in have or bool(have & set(requirement.get("recommend", [])))


def assess(cid: str, version: str, manifest: dict, have: set[str]) -> dict:
    devices = manifest.get("devices") or {}
    describes = describes_only(manifest)
    needs = [{"kind": r["kind"], "recommend": list(r.get("recommend", []))}
             for r in devices.get("requires", []) if not _met(r, have)]
    optional = [{"feature": o.get("feature"), "kind": o["kind"], "have": _met(o, have),
                 "recommend": list(o.get("recommend", []))} for o in devices.get("optional", [])]
    return {
        "id": cid, "version": version,
        "fits": None if describes else not needs,
        "describes": describes,
        "tested_homes": (manifest.get("tested") or {}).get("homes"),
        "needs": needs, "optional": optional,
    }


def known_tokens(manifest: dict) -> set[str]:
    devices = manifest.get("devices") or {}
    found = set()
    for requirement in [*devices.get("requires", []), *devices.get("optional", [])]:
        found.add(requirement["kind"])
        found.update(requirement.get("recommend", []))
    return found


def _report(result: dict, rep: Reporter) -> None:
    name = f"{result['id']}@{result['version']}"
    homes = "unknown" if result["tested_homes"] is None else str(result["tested_homes"])
    if result["describes"]:
        rep.line("describes", name)
    elif result["fits"]:
        rep.line("fits", name, "tested-homes", homes)
    else:
        rep.line("missing", name, "tested-homes", homes, "needs", str(len(result["needs"])))
    if not result["describes"]:
        for need in result["needs"]:
            rep.line("needs", name, need["kind"], *([",".join(need["recommend"])] if need["recommend"] else []))
        for opt in result["optional"]:
            rep.line("optional", name, opt["feature"] or "-", opt["kind"], "have" if opt["have"] else "lacks",
                     *([",".join(opt["recommend"])] if opt["recommend"] else []))


def _catalog_source(args: argparse.Namespace) -> str | Path:
    if args.catalog:
        return args.catalog if is_url(args.catalog) else Path(args.catalog).expanduser().resolve()
    if not (args.home / HOME_FILE).exists():
        raise DomosensoError(f"no --catalog and no {HOME_FILE} in {args.home}")
    return HomeConfig.load(args.home).catalog_source()


def _read(catalog: Catalog, have: set[str], rep: Reporter) -> int:
    known: set[str] = set()
    for cid in catalog.component_ids():
        version = catalog.versions(cid)[-1]
        raw = catalog.show(cid, version, "component.yaml")
        try:
            manifest = yaml.safe_load(raw)
        except yaml.YAMLError as exc:
            raise DomosensoError(f"{cid}/{version}: component.yaml is not valid YAML: {exc}") from exc
        if not isinstance(manifest, dict):
            raise DomosensoError(f"{cid}/{version}: component.yaml is not a mapping")
        known |= known_tokens(manifest)
        result = assess(cid, version, manifest, have)
        rep.data.append(result)
        _report(result, rep)
    for token in sorted(have - known):
        rep.line("unknown", token)
    return rep.ok()


def run(args: argparse.Namespace, rep: Reporter) -> int:
    source = _catalog_source(args)
    have = set(args.have)
    if isinstance(source, str) and not (args.home / HOME_FILE).exists():
        # A URL needs a mirror; without a home there is nowhere of its own to keep it.
        with tempfile.TemporaryDirectory(prefix="domosenso-recommend-") as cache:
            return _read(Catalog(source, Path(cache)), have, rep)
    return _read(Catalog(source, args.home / CACHE_DIR), have, rep)
