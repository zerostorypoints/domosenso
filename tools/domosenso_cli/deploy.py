"""What a deploy changes on a target, changing it with a backup, and putting it back (SPEC-002 1.6, 4.3).

The deploy carries the lock's files under config_dir (managed and instance) and the home's files
matching a `local:` glob; a component rendered with `--catalog-dev` is carried from its entry in
`.domosenso/dev-render.json` instead (SPEC-019 B). Every path here is relative to config_dir on both sides. The target keeps
`.domosenso/deployed.json`, the record of what the last deploy wrote; a path in it that the repository
no longer has is removed. Nothing else is written or deleted: a file on the target that matches a
`local:` glob but is in neither the repository nor the record is an orphan, and blocks `apply` until
it is named in `remove_orphans`; `unmanaged_on_target` and the files Home Assistant keeps for itself
(`secrets.yaml`, `.storage/`, the recorder database) are never touched. `configuration.yaml` is the
home's instance file: carried whenever the repository has it, whatever the globs say, and never an
orphan or a removal (a repository without it means "keep the target's").

`apply` backs up every file it will replace or remove (and the resource list) before it writes, on
the target and in the home, and puts the backup back itself when the copy, check_config or the
resources fail. The record travels in the same `put` as the files, so it describes the target
whenever the files are there, and a backup holds the record it replaced. A deploy whose copy was
cut off and whose restore failed too has no record on the target; `rollback` finds it by the
previous deploy id its backup names.
"""
from __future__ import annotations

import asyncio
import io as _io
import json
import os
import re
import tarfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import yaml

from check_config_parse import NO_JSON, summarize
from domosenso_cli import dev_render, inventory, resources
from domosenso_cli.build import file_sha, sha256
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock
from domosenso_cli.stamps import parse as parse_stamp
from domosenso_cli.targets import TargetIO, check_relative, match_globs

TOOL_DIR = ".domosenso/"
RECORD = TOOL_DIR + "deployed.json"
BACKUP_FILES = ("files.tar", "resources.json", "added.json", "plan.json")
RESTORED = "restored"  # beside the home's copy of a backup once it has been put back
LOCAL_DEPLOYS = Path(".domosenso") / "deploys"
PRODUCTION = "production"
# Files Home Assistant keeps for itself: no command writes them, whatever a `local:` glob says.
NEVER_CARRIED = {"secrets.yaml"}
NEVER_CARRIED_PREFIXES = (TOOL_DIR, ".storage/", "home-assistant_v2.db")
CONFIGURATION = "configuration.yaml"  # carried when the repository has one; never deleted from a target
# Home Assistant serves these without a restart (YAML dashboards are read when they load).
NO_RESTART_PREFIXES = ("www/", "dashboards/")
CHECK_CONFIG = ["python3", "-m", "homeassistant", "--script", "check_config", "-c", "/config", "--json"]
CHECK_CONFIG_TIMEOUT_S = 600
RESTART_TIMEOUT_S = 120
API_WAIT_S = 180
API_POLL_S = 2
ID_WAIT_S = 1
HASH_LENGTH = 12
OUTPUT_TAIL = 400
DEPLOY_ID = re.compile(r"^\d{8}T\d{6}Z$")


@dataclass
class Plan:
    add: list[str]
    change: list[str]
    remove: list[str]
    orphan: list[str]
    keep: list[str]
    resources: list[resources.Action]
    restart: bool
    hash: str
    record: dict[str, dict] = field(default_factory=dict)  # deployed.json `files` after this deploy
    sources: dict[str, Path] = field(default_factory=dict)  # the repository file behind each carried path
    dirty: list[str] = field(default_factory=list)  # carried files rendered with --catalog-dev
    prune: bool = False  # unwanted resources are deleted (and shown as `resource delete`)
    recorded: dict[str, dict] = field(default_factory=dict)  # deployed.json `files` on the target now
    running_dev: dict | None = None  # deployed.json `dev_render` on the target now, with its `deploy_id`


@dataclass
class Backup:
    files: dict[str, bytes]  # what the target held at each path the deploy replaced or removed
    added: list[str]  # paths the deploy created
    resources: list[dict]  # lovelace/resources before the deploy
    plan: dict  # plan.json: what the deploy did (created resources, whether it restarted)


class _Quiet:
    def line(self, *fields: str) -> None:
        pass


# --- plan -------------------------------------------------------------------------------------


def _never(path: str) -> bool:
    return path in NEVER_CARRIED or path.startswith(NEVER_CARRIED_PREFIXES)


def _untouchable(home: HomeConfig, path: str) -> bool:
    return _never(path) or bool(match_globs([path], home.unmanaged_on_target))


def _kept(home: HomeConfig, path: str) -> bool:
    """Never planned as a removal or an orphan."""
    return path == CONFIGURATION or _untouchable(home, path)


def _dirty(path: Path, cid: str | None = None) -> bool:
    with path.open("rb") as f:
        first = f.readline().decode("utf-8", "replace")
    found = parse_stamp(first)
    return found is not None and found.dirty and (cid is None or found.cid == cid)


def _carried(home: HomeConfig, lock: Lock, dev: dict[str, dict]) -> tuple[dict[str, dict], dict[str, Path], list[str]]:
    """(record entries, sources, dirty paths) for everything the deploy takes from the repository.

    A component with a dev render entry (`.domosenso/dev-render.json`) is carried from it: its managed
    files are the entry's, every one a `dev-render`, and a locked managed file the entry does not have
    is not carried (the record then removes it from the target, as an update would)."""
    record: dict[str, dict] = {}
    sources: dict[str, Path] = {}
    dirty: list[str] = []

    def carry(cid: str, dest: str) -> tuple[str, Path] | None:
        source = home.root / dest
        if not source.is_relative_to(home.config_dir):
            return None  # an ESPHome device file, or anything else that is not Home Assistant's config
        rel = check_relative(source.relative_to(home.config_dir).as_posix())
        if _untouchable(home, rel):
            raise DomosensoError(f"{rel}: {cid} ships it, but it is listed under unmanaged_on_target "
                                 "or belongs to Home Assistant; the deploy never writes it")
        return rel, source

    for cid, entry in lock.components.items():
        for dest, locked in entry.files.items():
            if cid in dev and locked.layer == "managed":
                continue  # the dev render's files stand in for these
            found = carry(cid, dest)
            if found is None:
                continue
            rel, source = found
            if not source.is_file():
                raise DomosensoError(f"{dest}: in domosenso.lock but not in the repository: run domosenso render")
            digest = file_sha(source)
            if locked.layer == "managed" and digest != locked.sha256:
                if not _dirty(source, cid):
                    raise DomosensoError(f"hand-edited: {dest}")
                dirty.append(rel)
            record[rel] = {"sha256": digest, "layer": locked.layer, "component": cid}
            sources[rel] = source
    for cid, entry in dev.items():
        for dest, rendered in sorted(entry["files"].items()):
            found = carry(cid, dest)
            if found is None:
                continue
            rel, source = found
            if rendered.get("layer") == "instance":  # the home's own (a dev add): carried as it is now
                if rel not in record and source.is_file():
                    record[rel] = {"sha256": file_sha(source), "layer": "instance", "component": cid}
                    sources[rel] = source
                continue
            if not source.is_file() or file_sha(source) != rendered.get("sha256"):
                raise DomosensoError(f"dev render changed: {rel}: render again")
            dirty.append(rel)
            record[rel] = {"sha256": rendered["sha256"], "layer": "managed", "component": cid}
            sources[rel] = source
    # The command's own package (SPEC-022): derived from the lock and the dev renders, so a copy that
    # says otherwise is out of date, never a hand edit to keep.
    listing = inventory.path(home)
    wanted = inventory.content(lock, dev)
    if wanted is not None or listing.is_file():
        if wanted is None or not listing.is_file() or file_sha(listing) != sha256(wanted):
            raise DomosensoError(f"inventory out of date: {inventory.PACKAGE}: run domosenso render")
        record[inventory.PACKAGE] = {"sha256": sha256(wanted), "layer": "managed", "component": None}
        sources[inventory.PACKAGE] = listing
        if dev:
            dirty.append(inventory.PACKAGE)
    configuration = home.config_dir / CONFIGURATION
    if CONFIGURATION not in record and configuration.is_file() and not _untouchable(home, CONFIGURATION):
        record[CONFIGURATION] = {"sha256": file_sha(configuration), "layer": "instance", "component": None}
        sources[CONFIGURATION] = configuration
    for rel in _local_files(home):
        if rel in record or _untouchable(home, rel):
            continue
        source = home.config_dir / rel
        if _dirty(source):
            dirty.append(rel)
        record[rel] = {"sha256": file_sha(source), "layer": "local", "component": None}
        sources[rel] = source
    return record, sources, sorted(dirty)


def _local_files(home: HomeConfig) -> list[str]:
    if not home.local or not home.config_dir.is_dir():
        return []
    found = []
    for base, dirs, names in os.walk(home.config_dir):
        dirs.sort()
        rel = Path(base).relative_to(home.config_dir).as_posix()
        found.extend(n if rel == "." else f"{rel}/{n}" for n in names if (Path(base) / n).is_file())
    return match_globs(found, home.local)


def read_record(io: TargetIO) -> dict | None:
    raw = io.read(RECORD)
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise DomosensoError(f"{RECORD} on the target is not JSON: {e}") from e
    if not isinstance(data, dict) or not isinstance(data.get("files"), dict):
        raise DomosensoError(f"{RECORD} on the target has no `files` mapping")
    for path in data["files"]:
        check_relative(path)
    return data


def needs_restart(paths: list[str]) -> bool:
    return any(not p.startswith(NO_RESTART_PREFIXES) for p in paths)


def dev_renders(home: HomeConfig) -> dict[str, dict]:
    """The home's dev render entries, each for a component domosenso.yaml declares."""
    dev = dev_render.load(home.root)
    for cid in dev:
        if cid not in home.components:
            raise DomosensoError(f"dev render of {cid}, not in domosenso.yaml")
    return dev


def make_plan(home: HomeConfig, lock: Lock, io: TargetIO, existing_resources: list[dict],
              prune: bool = False) -> Plan:
    dev = dev_renders(home)
    record, sources, dirty = _carried(home, lock, dev)
    previous = read_record(io)
    recorded = previous["files"] if previous else {}
    stale = sorted(p for p in recorded if p not in record and not _kept(home, p))
    there = io.hashes(sorted(set(record) | set(stale) | {CONFIGURATION}))
    add = sorted(p for p in record if there[p] is None)
    change = sorted(p for p in record if there[p] not in (None, record[p]["sha256"]))
    remove = [p for p in stale if there[p] is not None]
    keep = {p for p in record if there[p] == record[p]["sha256"]}
    listed = io.glob(home.local) if home.local else []
    orphan = sorted(p for p in listed if p not in record and p not in recorded and not _kept(home, p))
    keep |= {p for p in listed if _kept(home, p) and p not in record}
    if CONFIGURATION not in record and there[CONFIGURATION] is not None:
        keep.add(CONFIGURATION)  # not carried: the target's own stays as it is
    if home.unmanaged_on_target:
        keep |= set(io.glob(home.unmanaged_on_target))
    keep = sorted(p for p in keep if not p.startswith(TOOL_DIR))
    wanted = resources.wanted(home, lock, {cid: entry.get("resources", []) for cid, entry in dev.items()})
    actions = resources.plan(existing_resources, wanted)
    restart = needs_restart(add + change + remove)
    hashed = {
        "add": add, "change": change, "remove": remove, "orphan": orphan, "keep": keep,
        "resources": [asdict(a) for a in actions], "prune": prune, "restart": restart,
        "content": {p: record[p]["sha256"] for p in add + change},
    }
    if dirty:  # only then, so a plan without dev renders keeps its hash; covers a dirty file in `keep` too
        hashed["dev_render"] = dirty
    digest = sha256(json.dumps(hashed, sort_keys=True, separators=(",", ":")).encode())[:HASH_LENGTH]
    running = None
    if previous and isinstance(previous.get("dev_render"), dict):
        running = {**previous["dev_render"], "deploy_id": previous.get("deploy_id")}
    return Plan(add, change, remove, orphan, keep, actions, restart, digest, record, sources, dirty, prune, recorded,
                running)


def plan_lines(plan: Plan) -> list[list[str]]:
    """The plan as report lines: files, resources, `restart: yes|no`, the hash."""
    lines = [[kind, p] for kind in ("add", "change", "remove", "orphan", "keep") for p in getattr(plan, kind)]
    lines += [["dev-render", p] for p in plan.dirty]
    for a in plan.resources:
        fields = ["resource", "delete" if a.kind == "unwanted" and plan.prune else a.kind, a.url]
        lines.append([*fields, "from", a.old_url] if a.kind == "update" else fields)
    if plan.running_dev:
        lines.append(["warning", f"target runs a dev render: {len(plan.running_dev.get('paths', []))} files "
                                  f"(deploy {plan.running_dev.get('deploy_id')})"])
    lines.append(["restart:", "yes" if plan.restart else "no"])
    lines.append(["hash", plan.hash])
    return lines


# --- apply ------------------------------------------------------------------------------------


class _Lenient(yaml.SafeLoader):
    """safe_load, with Home Assistant's tags (`!include`, `!secret`, ...) accepted and not resolved."""


_Lenient.add_multi_constructor("!", lambda loader, tag, node: None)


def _contents(plan: Plan) -> dict[str, bytes]:
    out = {}
    for rel in plan.add + plan.change:
        data = plan.sources[rel].read_bytes()
        if sha256(data) != plan.record[rel]["sha256"]:
            raise DomosensoError(f"{rel} changed in the repository since the plan: plan again")
        out[rel] = data
    return out


def _parse_dashboards(contents: dict[str, bytes]) -> None:
    for rel, data in contents.items():
        if rel.startswith("dashboards/") and rel.endswith((".yaml", ".yml")):
            try:
                yaml.load(data.decode("utf-8"), Loader=_Lenient)
            except (UnicodeDecodeError, yaml.YAMLError) as e:
                raise DomosensoError(f"{rel}: not valid YAML: {' '.join(str(e).split())}") from e


def _backup_dir(deploy_id: str) -> str:
    return f"{TOOL_DIR}predeploy-{deploy_id}"


def _local_dir(home: HomeConfig, target: str, deploy_id: str) -> Path:
    return home.root / LOCAL_DEPLOYS / target / deploy_id


def _tar(files: dict[str, bytes]) -> bytes:
    buf = _io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for path, data in sorted(files.items()):
            info = tarfile.TarInfo(path)
            info.size, info.mode = len(data), 0o644
            tar.addfile(info, _io.BytesIO(data))
    return buf.getvalue()


def _untar(data: bytes) -> dict[str, bytes]:
    out = {}
    with tarfile.open(fileobj=_io.BytesIO(data), mode="r") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                raise DomosensoError(f"files.tar: {member.name} is not a regular file")
            out[check_relative(member.name)] = tar.extractfile(member).read()
    return out


def _backup_bytes(backup: Backup) -> dict[str, bytes]:
    return {
        "files.tar": _tar(backup.files),
        "resources.json": json.dumps(backup.resources, indent=2).encode(),
        "added.json": json.dumps(backup.added, indent=2).encode(),
        "plan.json": json.dumps(backup.plan, indent=2).encode(),
    }


def _save_backup(home: HomeConfig, io: TargetIO, target: str, deploy_id: str, backup: Backup) -> None:
    """In the home first (nothing remote can fail there), then on the target; both before any other write."""
    data = _backup_bytes(backup)
    local = _local_dir(home, target, deploy_id)
    try:
        local.mkdir(parents=True)
        for name, content in data.items():
            (local / name).write_bytes(content)
    except OSError as e:
        raise DomosensoError(f"cannot write the backup {local}: {e.strerror or e}; nothing was deployed") from e
    try:
        io.put({f"{_backup_dir(deploy_id)}/{name}": content for name, content in data.items()})
    except DomosensoError as e:
        raise DomosensoError(f"cannot write the backup on the target: {e}; nothing was deployed") from e


def _load_backup(home: HomeConfig, io: TargetIO, target: str, deploy_id: str) -> Backup:
    local = _local_dir(home, target, deploy_id)
    data: dict[str, bytes] = {}
    for name in BACKUP_FILES:
        path = local / name
        content = path.read_bytes() if path.is_file() else io.read(f"{_backup_dir(deploy_id)}/{name}")
        if content is None:
            raise DomosensoError(f"no backup of {deploy_id}: {name} is in neither {local} nor the target's "
                                 f"{_backup_dir(deploy_id)}")
        data[name] = content
    try:
        return Backup(_untar(data["files.tar"]), json.loads(data["added.json"]), json.loads(data["resources.json"]),
                      json.loads(data["plan.json"]))
    except (ValueError, tarfile.TarError) as e:
        raise DomosensoError(f"the backup of {deploy_id} cannot be read: {e}") from e


def _restore_files(io: TargetIO, backup: Backup, where: str, retry: str) -> None:
    try:
        if backup.files:
            io.put(backup.files)
        io.delete(backup.added)
    except Exception as e:
        raise DomosensoError(f"restore failed, the target is half deployed: {e}; "
                             f"run `{retry}` once the target answers; the backup is {where}") from e


def _mark_restored(home: HomeConfig, target: str, deploy_id: str) -> None:
    """Best effort: without the mark the default rollback may only repeat a restore already done."""
    try:
        (_local_dir(home, target, deploy_id) / RESTORED).write_text("")
    except OSError:
        pass


def _is_restored(home: HomeConfig, target: str, deploy_id: str) -> bool:
    return (_local_dir(home, target, deploy_id) / RESTORED).is_file()


def _incomplete(home: HomeConfig, target: str, last: str | None) -> str | None:
    """The newest local deploy after `last` that started from it and was never put back: its copy was
    cut off and its own restore failed, so the target's record still names `last`."""
    base = home.root / LOCAL_DEPLOYS / target
    names = sorted((d.name for d in base.iterdir() if DEPLOY_ID.match(d.name)), reverse=True) if base.is_dir() else []
    for name in names:
        if last is not None and name <= last:
            break
        if _is_restored(home, target, name):
            continue
        try:
            plan = json.loads((base / name / "plan.json").read_text())
        except (OSError, ValueError):
            continue
        if "previous_deploy_id" in plan and plan["previous_deploy_id"] == last:
            return name
    return None


async def _restore_resources(ha, backup: Backup) -> None:
    """Back to the list before the deploy: URLs by `resource_id`, deleted ones created again, created ones deleted."""
    now = {str(i["id"]): i for i in await ha.call("lovelace/resources")}
    for item in backup.resources:
        current = now.get(str(item["id"]))
        kind = item.get("type", "module")
        if current is None:
            await ha.call("lovelace/resources/create", url=item["url"], res_type=kind)
        elif current["url"] != item["url"] or current.get("type") != kind:
            await ha.call("lovelace/resources/update", resource_id=item["id"], url=item["url"], res_type=kind)
    before = {str(i["id"]) for i in backup.resources}
    created = set(backup.plan.get("created_resources", []))
    for rid, item in now.items():
        if rid not in before and item["url"] in created:
            await ha.call("lovelace/resources/delete", resource_id=item["id"])


async def wait_for_api(ha) -> None:
    deadline = time.monotonic() + API_WAIT_S
    last = "no answer"
    while True:
        try:
            status = await ha.http_status("/api/")
            if status == 200:
                return
            last = f"HTTP {status}"
        except DomosensoError as e:  # refused while Home Assistant starts
            last = str(e)
        if time.monotonic() >= deadline:
            raise DomosensoError(f"Home Assistant did not answer /api/ within {API_WAIT_S:g} s ({last})")
        await asyncio.sleep(API_POLL_S)


def _new_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


async def apply(home: HomeConfig, lock: Lock, plan: Plan, io: TargetIO, ha, remove_orphans: list[str],
                prune: bool, *, target: str, rep=None, allow_dirty: bool = False) -> str | None:
    """Deploy `plan` to `target`; returns the deploy id, or None when there is nothing to do (nothing
    is written then). Any failure before the restart leaves the target as it was, or raises naming
    the backup and the rollback command when even that fails."""
    rep = rep or _Quiet()
    removed_orphans = sorted(set(remove_orphans))
    if unknown := [p for p in removed_orphans if p not in plan.orphan]:
        raise DomosensoError(f"not an orphan: {', '.join(unknown)}")
    if blocking := [p for p in plan.orphan if p not in removed_orphans]:
        raise DomosensoError(f"orphan {', '.join(blocking)}")
    if target == PRODUCTION and plan.dirty and not allow_dirty:
        raise DomosensoError(f"dev render: {', '.join(plan.dirty)}: production takes only files rendered from a tag "
                             "(--allow-dirty with --confirm deploys them)")
    if prune != plan.prune:
        raise DomosensoError("--prune-resources differs from the plan's: plan again with the same options")
    resource_work = [a for a in plan.resources if a.kind != "unwanted" or prune]
    if not (plan.add or plan.change or plan.remove or removed_orphans or resource_work) and plan.recorded == plan.record:
        return None
    contents = _contents(plan)
    _parse_dashboards(contents)

    deploy_id = _new_id()
    while _local_dir(home, target, deploy_id).exists():  # the last deploy ran within this second
        await asyncio.sleep(ID_WAIT_S)
        deploy_id = _new_id()
    record = {"deploy_id": deploy_id, "files": plan.record}
    dev_render = {"paths": plan.dirty, "allowed": target == PRODUCTION and allow_dirty} if plan.dirty else None
    if dev_render:  # a clean deploy writes no key, which clears it
        record["dev_render"] = dev_render
    writes = {**contents, RECORD: json.dumps(record, indent=2, sort_keys=True).encode()}
    deletes = plan.remove + removed_orphans
    restart = plan.restart or needs_restart(removed_orphans)
    # What is there now, not what the plan saw: a file that appeared since is backed up too.
    there = io.hashes(sorted(set(writes) | set(deletes)))
    added = sorted(p for p in writes if there[p] is None)
    files = {}
    for path in sorted(p for p, digest in there.items() if digest is not None):
        current = io.read(path)
        if current is None:
            raise DomosensoError(f"{path} vanished from the target while it was backed up: nothing was deployed")
        files[path] = current
    try:
        previous_id = json.loads(files[RECORD])["deploy_id"] if RECORD in files else None
    except (ValueError, TypeError, KeyError) as e:
        raise DomosensoError(f"target record changed or unreadable: re-run --plan ({e!r})") from e
    backup = Backup(files, added, await ha.call("lovelace/resources"), {
        "deploy_id": deploy_id, "previous_deploy_id": previous_id,
        "target": target, "hash": plan.hash, "add": plan.add, "change": plan.change,
        "remove": deletes, "restart": restart,
        "created_resources": [a.url for a in plan.resources if a.kind == "create"],
        "allow_dirty": allow_dirty, **({"dev_render": dev_render} if dev_render else {}),
    })
    _save_backup(home, io, target, deploy_id, backup)
    where = f"{_local_dir(home, target, deploy_id)} and {_backup_dir(deploy_id)} on the target"
    retry = f"domosenso rollback {target} {deploy_id}"

    def restore() -> None:
        _restore_files(io, backup, where, retry)
        _mark_restored(home, target, deploy_id)

    rep.line("backup", deploy_id)

    try:
        io.put(writes)
        io.delete(deletes)
    except Exception as e:
        restore()
        raise DomosensoError(f"copy failed ({e}); the target is restored from the backup") from e
    rep.line("copied", str(len(contents)), "removed", str(len(deletes)))

    try:
        rc, out = io.exec(CHECK_CONFIG, timeout_s=CHECK_CONFIG_TIMEOUT_S)
    except Exception as e:
        restore()
        raise DomosensoError(f"check_config did not run ({e}); the target is restored from the backup") from e
    n, details = summarize("check_config", out)
    if rc != 0 or n:
        if n == NO_JSON:  # check_config did not get as far as its report: show why
            rep.line("error", details[0].split(": ", 1)[1])
            rep.line("output", " ".join(out.split())[-OUTPUT_TAIL:])
        for line in details[1:]:  # `  error [domain] message`, `  warning [domain] message`
            rep.line(*line.strip().split(" ", 1))
        restore()
        raise DomosensoError(f"check_config: {n} errors" + (f" (exit {rc})" if rc else ""))
    rep.line("check_config", "0 errors")

    try:
        await resources.apply(ha, plan.resources, prune)
    except Exception as e:
        try:
            await _restore_resources(ha, backup)
            restored = "files and resources are restored from the backup"
        except Exception as again:  # noqa: BLE001 - the files must go back even so
            restored = f"files are restored; resources are not ({again}): {retry}"
            _restore_files(io, backup, where, retry)  # not marked: the rollback still has resources to do
        else:
            restore()
        raise DomosensoError(f"resources failed ({e}); {restored}") from e

    if restart:
        rep.line("restart", target)
        try:
            io.restart(RESTART_TIMEOUT_S)
            await wait_for_api(ha)
        except DomosensoError as e:
            raise DomosensoError(f"{e}; the files are deployed: domosenso rollback {target} {deploy_id}") from e
    return deploy_id


# --- rollback ---------------------------------------------------------------------------------


async def rollback(home: HomeConfig, io: TargetIO, ha, deploy_id: str | None, *, target: str, rep=None) -> str:
    """Put the target back as it was before `deploy_id`. Default: a deploy that never completed (its
    copy cut off, its restore failed), else the last deploy the target's record names."""
    rep = rep or _Quiet()
    current = read_record(io)
    last = current.get("deploy_id") if current else None
    chosen = deploy_id or _incomplete(home, target, last) or last
    if chosen is None:
        raise DomosensoError(f"no deploy recorded on {target} ({RECORD})")
    if not isinstance(chosen, str) or not DEPLOY_ID.match(chosen):  # it names a directory, here and there
        raise DomosensoError(f"{chosen!r} is not a deploy id (like 20261021T120000Z)")
    if _is_restored(home, target, chosen):
        raise DomosensoError(f"{chosen} was already rolled back (or restored itself when it failed)")
    backup = _load_backup(home, io, target, chosen)
    # The last deploy, or one that never wrote its record because its copy was cut off: then the
    # record is still the one it started from.
    never_completed = "previous_deploy_id" in backup.plan and backup.plan["previous_deploy_id"] == last
    if chosen != last and not never_completed:
        raise DomosensoError(f"{chosen} is not the last deploy on {target} (that is {last or 'none'}): "
                             "roll back the last one first")
    where = f"{_local_dir(home, target, chosen)} or {_backup_dir(chosen)} on the target"
    _restore_files(io, backup, where, f"domosenso rollback {target} {chosen}")
    rep.line("restored", str(len(backup.files)), "removed", str(len(backup.added)))
    await _restore_resources(ha, backup)
    _mark_restored(home, target, chosen)
    if backup.plan.get("restart", True):
        rep.line("restart", target)
        io.restart(RESTART_TIMEOUT_S)
        await wait_for_api(ha)
    return chosen
