"""Lovelace resources, reconciled in place (SPEC-002 section 1.5).

Matching is by file name: a second resource for the same card would define its custom element twice,
so an existing resource is updated under its `resource_id`, never replaced by a delete and a create.
`plan` is pure; `apply` talks to Home Assistant.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from domosenso_cli.build import file_sha, sha256
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock

LOCAL = "/local/"
HASH_LENGTH = 8


@dataclass
class Resource:
    url: str
    type: str = "module"


@dataclass
class Action:
    kind: Literal["update", "create", "unwanted"]
    url: str
    resource_id: str | None = None
    old_url: str | None = None
    type: str = "module"


def _version_sha(card: Path, cid: str) -> str:
    """A dev card's hash: of every file in its component's version directory
    (`www/domosenso/<cid>/<version>/`) when the card is in one, else of the card alone. A card imports
    its lib/ modules and translations with its own `?v=`, so a change to any of them must change the
    card's URL too; one hash for the whole version also gives its cards one module instance of each."""
    parts = card.parts
    for i in range(len(parts) - 3):
        if parts[i] == "domosenso" and parts[i + 1] == cid and i + 3 < len(parts):
            root = Path(*parts[:i + 3])
            files = sorted(f for f in root.rglob("*") if f.is_file())
            return sha256("".join(f"{f.relative_to(root).as_posix()}\0{file_sha(f)}\n" for f in files).encode())
    return file_sha(card)


def _bare(url: str) -> str:
    return url.split("?", 1)[0].split("#", 1)[0]


def _name(url: str) -> str:
    """The file name a resource is matched by: after the last `/`, query ignored."""
    return _bare(url).rsplit("/", 1)[-1]


def wanted(home: HomeConfig, lock: Lock, dev: dict[str, list[str]] | None = None) -> list[Resource]:
    """Every locked component's cards, then the home's own resources. `dev` (component -> URLs, from
    `.domosenso/dev-render.json`) replaces a locked component's URLs, or adds a component not locked.

    A home resource under `/local/` gets `?v=<sha8>` of its file in `config_dir/www`, so that a changed
    file is a new URL; any other URL (a third party's) passes through unchanged. So does a dev-rendered
    card: it keeps its version's path, so without the hash browsers would keep the old card for the 31
    days /local/ is cached; its hash covers its version directory (`_version_sha`). A locked card's URL
    changes with its version directory."""
    got: list[Resource] = []
    owners: dict[str, str] = {}  # file name -> where it was wanted from
    dev = dev or {}
    by_component = {cid: entry.resources for cid, entry in lock.components.items()}
    by_component.update({cid: dev[cid] for cid in sorted(dev)})
    for cid, urls in by_component.items():
        for url in urls:
            _claim(owners, url, f"component {cid}")
            if cid in dev and _bare(url).startswith(LOCAL) and ".." not in _bare(url).split("/"):
                path = home.config_dir / "www" / _bare(url)[len(LOCAL):]
                if path.is_file():
                    url = f"{_bare(url)}?v={_version_sha(path, cid)[:HASH_LENGTH]}"
            got.append(Resource(url))
    for raw in home.resources:
        url, kind = raw["url"], raw.get("type", "module")
        _claim(owners, url, "the home's resources")
        if _bare(url).startswith(LOCAL):
            relative = _bare(url)[len(LOCAL):]
            if ".." in relative.split("/"):
                raise DomosensoError(f"resource {url}: '..' is not allowed in a /local/ path")
            path = home.config_dir / "www" / relative
            if not path.is_file():
                raise DomosensoError(f"resource {url}: file not found: {path}")
            url = f"{_bare(url)}?v={file_sha(path)[:HASH_LENGTH]}"
        got.append(Resource(url, kind))
    return got


def _claim(owners: dict[str, str], url: str, source: str) -> None:
    name = _name(url)
    if name in owners:
        raise DomosensoError(f"{name} is wanted twice: by {owners[name]} and by {source} ({url})")
    owners[name] = f"{source} ({url})"


def plan(existing: list[dict], wanted: list[Resource]) -> list[Action]:
    """What to do to `existing` (Home Assistant's `lovelace/resources`) to reach `wanted`."""
    by_name: dict[str, list[dict]] = {}
    for item in existing:
        by_name.setdefault(_name(item["url"]), []).append(item)
    wanted_names = {_name(w.url) for w in wanted}
    for name in sorted(wanted_names):
        found = by_name.get(name, [])
        if len(found) > 1:
            raise DomosensoError(f"duplicate resources for {name}: {', '.join(str(i['id']) for i in found)}")
    actions: list[Action] = []
    for w in wanted:
        match = by_name.get(_name(w.url))
        if not match:
            actions.append(Action("create", w.url, type=w.type))
        elif match[0]["url"] != w.url or match[0].get("type") != w.type:
            actions.append(Action("update", w.url, match[0]["id"], match[0]["url"], w.type))
    for item in existing:
        if _name(item["url"]) not in wanted_names:
            actions.append(Action("unwanted", item["url"], item["id"]))
    return actions


async def apply(ha, actions: list[Action], prune: bool) -> None:
    """Updates first, then creates, then (only with `prune`) deletes; `unwanted` is otherwise left alone."""
    for a in (a for a in actions if a.kind == "update"):
        await ha.call("lovelace/resources/update", resource_id=a.resource_id, url=a.url, res_type=a.type)
    for a in (a for a in actions if a.kind == "create"):
        await ha.call("lovelace/resources/create", url=a.url, res_type=a.type)
    if prune:
        for a in (a for a in actions if a.kind == "unwanted"):
            await ha.call("lovelace/resources/delete", resource_id=a.resource_id)
