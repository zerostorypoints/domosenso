"""`domosenso discover`: what a running Home Assistant found on the network and what it has set up
(SPEC-011 section 4).

Read-only. Home Assistant's own discovery (zeroconf, SSDP, DHCP, Bluetooth, ...) leaves a flow in
progress for every device it found and the person has not added yet; those flows, the config entries
and the manifests of the integrations asked about are all this command reads. Device names and
addresses, which flows carry in `title_placeholders`, go into `--json` only, never into a text line.
"""
from __future__ import annotations

import argparse
import asyncio
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import yaml

from domosenso_cli import recommend
from domosenso_cli.build import CACHE_DIR
from domosenso_cli.catalog import Catalog, is_url
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HOME_FILE, HomeConfig
from domosenso_cli.report import Reporter

# Config entry states that mean the integration is set up but not working.
FAILING = ("migration_error", "setup_error", "setup_retry")


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--from-ha", metavar="<target or URL>",
                        help="the Home Assistant to read: a target in domosenso.yaml, or a URL with --token-file")
    parser.add_argument("--token-file", metavar="<file>", help="the long-lived access token for a --from-ha URL")
    parser.add_argument("--domain", nargs="*", default=[], metavar="<domain>",
                        help="integration domains to look up in Home Assistant (does it have them)")
    parser.add_argument("--catalog", metavar="<path or URL>",
                        help="the catalog whose components to link (default: the home's; none without a home)")


async def read(ha: Any, domains: list[str]) -> dict[str, Any]:
    async with ha:
        flows = await ha.call("config_entries/flow/progress")
        entries = await ha.call("config_entries/get")
        wanted = sorted({f["handler"] for f in flows} | set(domains))
        manifests: dict[str, dict | None] = {}
        for domain in wanted:
            try:
                manifests[domain] = await ha.call("manifest/get", integration=domain)
            except DomosensoError as exc:
                if "not_found" not in str(exc):
                    raise
                manifests[domain] = None
    return {"flows": flows, "entries": entries, "manifests": manifests}


def catalog_integrations(catalog: Catalog) -> dict[str, list[str]]:
    """Integration domain -> the components whose manifest (at its newest tag) names it."""
    found: dict[str, list[str]] = defaultdict(list)
    for cid in catalog.component_ids():
        manifest = yaml.safe_load(catalog.show(cid, catalog.versions(cid)[-1], "component.yaml")) or {}
        for integration in manifest.get("integrations") or []:
            if isinstance(integration, dict) and integration.get("name"):
                found[integration["name"]].append(cid)
    return dict(found)


def _catalog(args: argparse.Namespace, cache: Path) -> Catalog | None:
    if args.catalog:
        source = args.catalog if is_url(args.catalog) else Path(args.catalog).expanduser().resolve()
        return Catalog(source, cache)
    if (args.home / HOME_FILE).exists():
        return Catalog(HomeConfig.load(args.home).catalog_source(), args.home / CACHE_DIR)
    return None


def _manifest_summary(manifest: dict) -> dict:
    return {
        "name": manifest.get("name"),
        # Home Assistant reads a manifest without `integration_type` as a hub.
        "integration_type": manifest.get("integration_type", "hub"),
        "iot_class": manifest.get("iot_class"),
        "config_flow": bool(manifest.get("config_flow")),
        "documentation": manifest.get("documentation"),
    }


def report(raw: dict[str, Any], links: dict[str, list[str]], domains: list[str], rep: Reporter) -> None:
    sources: dict[str, set[str]] = defaultdict(set)
    discovered: Counter[str] = Counter()
    for flow in raw["flows"]:
        discovered[flow["handler"]] += 1
        sources[flow["handler"]].add((flow.get("context") or {}).get("source") or "-")
    ignored = Counter(e["domain"] for e in raw["entries"] if e.get("source") == "ignore")
    configured = Counter(e["domain"] for e in raw["entries"] if e.get("source") != "ignore")
    failing = Counter((e["domain"], e.get("state")) for e in raw["entries"] if e.get("state") in FAILING)

    for domain in sorted(discovered):
        rep.line("discovered", domain, str(discovered[domain]), "via", ",".join(sorted(sources[domain])))
    for domain in sorted(ignored):
        rep.line("ignored", domain, str(ignored[domain]))
    for domain in sorted(configured):
        rep.line("configured", domain, str(configured[domain]))
    for (domain, state), n in sorted(failing.items()):
        rep.line("failing", domain, str(n), state)
    for domain in sorted((set(discovered) | set(configured)) & set(links)):
        rep.line("catalog", domain, ",".join(links[domain]))
    for domain in sorted(set(domains)):
        manifest = raw["manifests"].get(domain)
        if manifest is None:
            rep.line("absent", domain)
        else:
            summary = _manifest_summary(manifest)
            rep.line("integration", domain, summary["iot_class"] or "-", summary["integration_type"],
                     "config-flow", "yes" if summary["config_flow"] else "no")

    rep.extra["data"] = {
        "flows": [{"handler": f["handler"], "source": (f.get("context") or {}).get("source"),
                   "step_id": f.get("step_id"),
                   "title_placeholders": (f.get("context") or {}).get("title_placeholders") or {}}
                  for f in raw["flows"]],
        "entries": [{k: e.get(k) for k in ("domain", "source", "state", "disabled_by", "title")}
                    for e in raw["entries"]],
        "manifests": {d: None if m is None else _manifest_summary(m) for d, m in raw["manifests"].items()},
    }


def run(args: argparse.Namespace, rep: Reporter) -> int:
    if not args.from_ha:
        raise DomosensoError("discover needs --from-ha <target or URL>")
    ha = recommend.open_ha(args)
    raw = asyncio.run(read(ha, list(args.domain)))
    with tempfile.TemporaryDirectory(prefix="domosenso-discover-") as cache:
        catalog = _catalog(args, Path(cache))
        links = catalog_integrations(catalog) if catalog is not None else {}
    report(raw, links, list(args.domain), rep)
    return rep.ok()
