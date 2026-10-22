"""`domosenso compare <a> <b> [--explain <equivalence.yaml>]`: two snapshots side by side.

SPEC-002 section 3.1. Only entities from files are compared (staging has no integrations). The
`(platform, unique_id)` pairs are a part of their own: production keeps entity ids by `unique_id`,
staging derives them from names, so a changed `unique_id` must fail even where the entity id matches.
Every difference must match an entry of the home's `domosenso/equivalence.yaml`; an entry that
matches nothing is a warning.
"""
from __future__ import annotations

import argparse
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Union

from domosenso_cli.home import HOME_FILE, HomeConfig
from domosenso_cli.report import Reporter
from domosenso_cli.schema import load_validated
from domosenso_cli.snapshot import load

PARTS = ("entities", "unique_ids", "automations", "scripts", "helpers", "dashboards", "resources")
EQUIVALENCE_FILE = Path("domosenso") / "equivalence.yaml"
# The kinds of difference each kind of explanation covers.
COVERS = {
    "removed": {"only-in-a"},
    "added": {"only-in-b"},
    "config": {"config-differs", "options-differ"},
}


@dataclass
class Diff:
    part: str
    id: str
    # compare: only-in-a, only-in-b, unavailable-in-a, unavailable-in-b, config-differs,
    # options-differ, not-loaded, unique-id-differs;
    # verify adds its own (see verify.py).
    kind: str
    detail: str = ""


def _from_files(snapshot: dict, other: dict) -> dict[str, dict]:
    """The entities of `snapshot` that come from files. A registry-less entity (no unique_id) that the
    other side knows as an integration's is a state posted over the REST API, such as staging's mirror
    of production, and is left out: only the pair of snapshots can tell it from a YAML entity without
    a unique_id, which stays in."""
    theirs = other["entities"]
    return {
        eid: e for eid, e in snapshot["entities"].items()
        if e["from_files"] and not (e["unique_id"] is None and eid in theirs and not theirs[eid]["from_files"])
    }


def _pairs(entities: dict[str, dict]) -> dict[str, str]:
    """`platform:unique_id` -> entity id, for entities that have a unique_id."""
    return {f"{e['platform']}:{e['unique_id']}": eid for eid, e in entities.items() if e["unique_id"] is not None}


def _presence(part: str, a: dict, b: dict) -> list[Diff]:
    return [Diff(part, key, "only-in-a") for key in sorted(set(a) - set(b))] + [
        Diff(part, key, "only-in-b") for key in sorted(set(b) - set(a))
    ]


def _differing(a: dict, b: dict, keys) -> list[str]:
    return [key for key in keys if a.get(key) != b.get(key)]


def _entities(a: dict[str, dict], b: dict[str, dict]) -> list[Diff]:
    """Presence, and availability: an entity both sides define that only one side has unavailable.
    A package Home Assistant refused keeps its registry entries, so its ids and unique_ids still match;
    only its entities' `unavailable` gives it away. `unknown` (a value still to come, as for the
    `after_restart: unknown` entries) is not unavailable."""
    out = _presence("entities", a, b)
    for eid in sorted(set(a) & set(b)):
        if eid.split(".", 1)[0] in ("automation", "script"):
            continue  # their own parts report them as not-loaded
        down_a, down_b = a[eid]["state_class"] == "unavailable", b[eid]["state_class"] == "unavailable"
        if down_a != down_b:
            where = "a" if down_a else "b"
            other = "b" if down_a else "a"
            out.append(Diff("entities", eid, f"unavailable-in-{where}", f"available in {other}, unavailable in {where}"))
    return sorted(out, key=lambda d: d.id)


def _unique_ids(a: dict[str, dict], b: dict[str, dict]) -> list[Diff]:
    pairs_a, pairs_b = _pairs(a), _pairs(b)
    out: list[Diff] = []
    moved = set()  # entity ids on both sides whose pair changed: one unique-id-differs, not two only-in lines
    for eid in sorted(set(a) & set(b)):
        pa = f"{a[eid]['platform']}:{a[eid]['unique_id']}"
        pb = f"{b[eid]['platform']}:{b[eid]['unique_id']}"
        if pa != pb:
            out.append(Diff("unique_ids", eid, "unique-id-differs", f"a {pa}, b {pb}"))
            moved.add(eid)
    for pair in sorted(set(pairs_a) - set(pairs_b)):
        if pairs_a[pair] not in moved:
            out.append(Diff("unique_ids", pair, "only-in-a", pairs_a[pair]))
    for pair in sorted(set(pairs_b) - set(pairs_a)):
        if pairs_b[pair] not in moved:
            out.append(Diff("unique_ids", pair, "only-in-b", pairs_b[pair]))
    return sorted(out, key=lambda d: d.id)


def _runnables(part: str, a: dict, b: dict) -> list[Diff]:
    out = _presence(part, a, b)
    for eid in sorted(set(a) & set(b)):
        ra, rb = a[eid], b[eid]
        if ra["loaded"] != rb["loaded"]:
            where = "b" if ra["loaded"] else "a"
            out.append(Diff(part, eid, "not-loaded", f"not loaded in {where} (state {rb['state'] if where == 'b' else ra['state']})"))
            continue
        if not ra["loaded"]:
            continue  # not loaded on either side: nothing to compare beyond presence
        what = []
        if ra["id"] != rb["id"]:
            what.append(f"id {ra['id']} → {rb['id']}")
        if ra["config_sha256"] != rb["config_sha256"]:
            what.append("config")
        # An automation's on / off is whether it is enabled; a script's is whether it is running right
        # now (a loop started a minute after the restart), so only automations compare it.
        if part == "automations" and ra["state"] != rb["state"]:
            what.append(f"state {ra['state']} → {rb['state']}")
        if what:
            out.append(Diff(part, eid, "config-differs", ", ".join(what)))
    return sorted(out, key=lambda d: d.id)


def _helpers(a: dict, b: dict) -> list[Diff]:
    # Presence is the entities part's business; here only what both sides have.
    out = []
    for eid in sorted(set(a) & set(b)):
        keys = _differing(a[eid], b[eid], sorted(set(a[eid]) | set(b[eid])))
        if keys:
            out.append(Diff("helpers", eid, "options-differ", ", ".join(keys)))
    return out


def _dashboards(a: dict, b: dict) -> list[Diff]:
    out = _presence("dashboards", a, b)
    for url_path in sorted(set(a) & set(b)):
        keys = _differing(a[url_path], b[url_path], ("title", "icon", "require_admin", "config_sha256"))
        if keys:
            out.append(Diff("dashboards", url_path, "config-differs", ", ".join(k.replace("_sha256", "") for k in keys)))
    return sorted(out, key=lambda d: d.id)


def _resources(a: list[dict], b: list[dict]) -> list[Diff]:
    ta = {r["url_no_query"]: r["type"] for r in a}
    tb = {r["url_no_query"]: r["type"] for r in b}
    out = _presence("resources", ta, tb)
    for url in sorted(set(ta) & set(tb)):
        if ta[url] != tb[url]:
            out.append(Diff("resources", url, "config-differs", f"type {ta[url]} → {tb[url]}"))
    return sorted(out, key=lambda d: d.id)


def diff(a: dict, b: dict) -> list[Diff]:
    """Every difference between snapshots `a` and `b`, in PARTS order, sorted by id within a part."""
    ea, eb = _from_files(a, b), _from_files(b, a)
    return [
        *_entities(ea, eb),
        *_unique_ids(ea, eb),
        *_runnables("automations", a["automations"], b["automations"]),
        *_runnables("scripts", a["scripts"], b["scripts"]),
        *_helpers(a["helpers"], b["helpers"]),
        *_dashboards(a["dashboards"], b["dashboards"]),
        *_resources(a["resources"], b["resources"]),
    ]


def sizes(a: dict, b: dict) -> dict[str, int]:
    """How many things each part compared: the union of both sides."""
    ea, eb = _from_files(a, b), _from_files(b, a)
    return {
        "entities": len(set(ea) | set(eb)),
        "unique_ids": len(set(_pairs(ea)) | set(_pairs(eb))),
        "automations": len(set(a["automations"]) | set(b["automations"])),
        "scripts": len(set(a["scripts"]) | set(b["scripts"])),
        "helpers": len(set(a["helpers"]) & set(b["helpers"])),
        "dashboards": len(set(a["dashboards"]) | set(b["dashboards"])),
        "resources": len({r["url_no_query"] for r in a["resources"]} | {r["url_no_query"] for r in b["resources"]}),
    }


# The commit a `config` entry must have been reviewed at: one for every entry, or one per entry.
CommitOf = Union[str, None, Callable[[dict], Union[str, None]]]


def _reviewed(entry: dict, commit_of: CommitOf) -> bool:
    reviewed_at = entry.get("reviewed_at")
    head_commit = commit_of(entry) if callable(commit_of) else commit_of
    if head_commit is None:
        return reviewed_at is None
    return reviewed_at is not None and len(reviewed_at) >= 7 and head_commit.startswith(reviewed_at)


def _matches(entry: dict, d: Diff, head_commit: CommitOf) -> bool:
    if entry["part"] != d.part:
        return False
    kind = entry["kind"]
    if kind == "ignore":
        return entry["id"] == d.id
    if kind == "renamed":
        return (d.kind == "only-in-a" and d.id == entry["id"]) or (d.kind == "only-in-b" and d.id == entry["to"])
    if kind == "config" and not _reviewed(entry, head_commit):
        return False
    return entry["id"] == d.id and d.kind in COVERS[kind]


def explain(diffs: list[Diff], entries: list[dict], head_commit: CommitOf) -> tuple[list[Diff], list[dict]]:
    """`(unexplained differences, stale entries)`. A `config` entry counts only while its `reviewed_at`
    is the commit `head_commit` gives (the string, or the callable's answer for that entry; a prefix of
    7 or more hex digits is enough), or, when no commit is known, only without `reviewed_at`. A `renamed` entry counts only when both halves are there (`id`
only in a, `to` only in b); with one half it explains nothing and is stale. Entries without a `kind`
(`after_restart` only) are for `verify`."""
    explanations = [e for e in entries if "kind" in e]
    used: set[int] = set()
    explained: set[int] = set()
    for i, entry in enumerate(explanations):
        hits = [j for j, d in enumerate(diffs) if _matches(entry, d, head_commit)]
        # A rename is the old id gone and the new one there; one half alone is something else.
        if entry["kind"] == "renamed" and {diffs[j].kind for j in hits} != {"only-in-a", "only-in-b"}:
            continue
        if hits:
            used.add(i)
            explained.update(hits)
    unexplained = [d for j, d in enumerate(diffs) if j not in explained]
    return unexplained, [e for i, e in enumerate(explanations) if i not in used]


def load_entries(path: Path) -> list[dict]:
    data = load_validated(path, "equivalence")
    return list(data.get("entries") or [])


def _id_line(ids: set[str]) -> re.Pattern[str]:
    """A YAML line `id: <one of ids>` (also `- id:`, quoted, with a comment after it)."""
    alternatives = "|".join(re.escape(i) for i in sorted(ids))
    return re.compile(rf"^\s*(?:-\s*)?id:\s*([\"']?)({alternatives})\1\s*(?:#.*)?$", re.M)


class FileCommits:
    """The commit each `config` entry is bound to: the last commit of the files that define the thing
    it explains, so a change elsewhere in the config tree (another component's migration) leaves it
    valid. The files are the entry's `file:` (paths under config_dir); for an automation without one,
    the YAML files whose `id:` is the automation's id in either snapshot; otherwise the whole config
    tree. A file with uncommitted changes binds to no commit, so no reviewed entry matches it.
    Outside a git repository (or a home without domosenso.yaml) every entry gets None."""

    def __init__(self, home: Path, snapshots: list[dict]):
        self.home = home
        self.snapshots = snapshots
        self.config_dir = HomeConfig.load(home).config_dir if (home / HOME_FILE).is_file() else None
        self._texts: dict[Path, str] | None = None

    def _git(self, *args: str) -> str | None:
        proc = subprocess.run(["git", "-C", str(self.home), *args], capture_output=True, text=True)
        return proc.stdout if proc.returncode == 0 else None

    def _defining(self, entry: dict) -> list[Path]:
        named = entry.get("file")
        if named:
            return [self.config_dir / f for f in ([named] if isinstance(named, str) else named)]
        if entry["part"] != "automations":
            return []
        ids = {s["automations"].get(entry["id"], {}).get("id") for s in self.snapshots} - {None}
        if not ids:
            return []
        if self._texts is None:
            self._texts = {}
            for path in sorted(self.config_dir.rglob("*.yaml")):
                try:
                    self._texts[path] = path.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    continue
        pattern = _id_line(ids)
        return [path for path, text in self._texts.items() if pattern.search(text)]

    def __call__(self, entry: dict) -> str | None:
        if self.config_dir is None:
            return None
        paths = [str(p) for p in (self._defining(entry) or [self.config_dir])]
        status = self._git("status", "--porcelain", "--", *paths)
        if status is None:
            return None
        if status.strip():
            return ""  # uncommitted: matches no reviewed_at
        return (self._git("log", "-1", "--format=%H", "--", *paths) or "").strip() or None


def report(rep: Reporter, parts: dict[str, int], unexplained: list[Diff], stale: list[dict]) -> int:
    """Per part `ok <part> (<n>)` or `FAIL <part>: <n> differences` and its lines; then the stale warnings.
    Returns the number of unexplained differences."""
    for part, n in parts.items():
        mine = [d for d in unexplained if d.part == part]
        if not mine:
            rep.line("ok", part, f"({n})")
            continue
        rep.line("FAIL", f"{part}:", f"{len(mine)} differences")
        for d in mine:
            rep.line(d.kind, d.part, d.id, *([d.detail] if d.detail else []))
    for entry in stale:
        rep.line("warning", "stale explanation", entry["part"], entry["id"])
    return len(unexplained)


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("a", type=Path, help="snapshot a (e.g. production)")
    parser.add_argument("b", type=Path, help="snapshot b (e.g. staging)")
    parser.add_argument("--explain", type=Path, metavar="<file>",
                        help=f"explained differences (default: {EQUIVALENCE_FILE} in the home, when present)")


def run(args: argparse.Namespace, rep: Reporter) -> int:
    a, b = load(args.a), load(args.b)
    path = args.explain
    if path is None and (args.home / EQUIVALENCE_FILE).is_file():
        path = args.home / EQUIVALENCE_FILE
    entries = load_entries(path) if path else []
    if path:
        rep.line("explanations", str(path), f"({len(entries)})")
    diffs = diff(a, b)
    unexplained, stale = explain(diffs, entries, FileCommits(args.home, [a, b]))
    rep.data.append({
        "unexplained": [asdict(d) for d in unexplained],
        "explained": [asdict(d) for d in diffs if d not in unexplained],
        "stale": stale,
    })
    n = report(rep, sizes(a, b), unexplained, stale)
    if n:
        return rep.fail(f"not equivalent: {n} unexplained")
    rep.line("equivalent")
    return rep.ok()

