"""`domosenso init`, `add`, `update` and `status`: start a home, put components into it, move them, look at it.

The four commands share this module (`COMMANDS` names them `cmd_home:<name>`), each as a namespace
with `run` and `add_arguments`. Ownership of files follows SPEC-002 section 1.2: `domosenso.yaml`
and the inputs files belong to the home once written; `templates/instance/**` is rendered once by
`add` (a file that exists is never overwritten) and recorded in the lock with layer `instance`;
everything else a component writes is managed and moves with the lock.
"""
from __future__ import annotations

import argparse
import os
import posixpath
import re
from pathlib import Path
from types import SimpleNamespace

import yaml

from domosenso_cli import dev_render, inventory
from domosenso_cli.build import (
    file_records, file_sha, git_short_head, is_dashboard_template, load_manifest, open_catalog, parse_spec,
    plan_outputs, sha256,
)
from domosenso_cli.catalog import SEMVER, TagMoved, dev_dir
from domosenso_cli.cmd_render import apply_component, render_ids, write_inventory
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HOME_FILE, ComponentEntry, HomeConfig
from domosenso_cli.lock import LOCK_FILE, Lock, LockEntry
from domosenso_cli.report import Reporter
from domosenso_cli.upgrade_notes import sections_between, version_key

COMPONENT_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
CONFIGURATION = "configuration.yaml"
# Files that belong to Home Assistant or to this tool and are on no component's or local list.
BUILT_IN_UNMANAGED = {CONFIGURATION, "secrets.yaml", HOME_FILE, LOCK_FILE}
# Neither the `.domosenso/` cache nor anything under it is the home's config.
TOOL_DIR = ".domosenso"

DECLARATION = """\
# The home's declaration for `domosenso`: written once by `domosenso init`, then edited by hand
# and by `domosenso add`. Reference: SPEC-002 section 1.2.
catalog: {catalog}
config_dir: home-assistant
esphome_dir: esphome
targets: {{}}
# To declare targets, replace `targets: {{}}` with the block below, filled in. `staging` is a
# Home Assistant container whose config directory is on this machine; `production` is one on another
# host, reached over ssh. Each needs every field shown for its kind.
#
# targets:
#   staging:
#     kind: local-docker
#     container: <name of the container>
#     config: <the config directory, relative to this file>
#     url: <http://127.0.0.1:8124>
#     token_file: <a file holding a long-lived access token, outside this repository>
#   production:
#     kind: ssh-docker
#     host: <user@host>
#     docker: <the docker command on the host; default: docker>
#     container: <name of the container>
#     config: <the config directory on the host>
#     url: <http://host:8123>
#     token_file: <a file holding a long-lived access token, outside this repository>
components: {{}}
"""


def _scalar(text: str) -> str:
    """`text` as one YAML scalar, quoted only when it has to be."""
    return yaml.safe_dump(text, width=10**6, allow_unicode=True).splitlines()[0]


def _write(path: Path, text: str, shown: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    except OSError as exc:
        raise DomosensoError(f"cannot write {shown}: {exc.strerror or exc}") from exc


# --- init -------------------------------------------------------------------------------------


def _init_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--catalog", required=True, metavar="<path or URL>",
                        help="the catalog repository, written to domosenso.yaml as given "
                             "(a relative path is relative to the home)")


def _init_run(args: argparse.Namespace, rep: Reporter) -> int:
    root = args.home
    for name in (HOME_FILE, LOCK_FILE):
        if (root / name).exists():
            raise DomosensoError(f"{name} exists: {root / name}")
    if not args.catalog.strip():
        raise DomosensoError("--catalog is empty")
    declaration = root / HOME_FILE
    _write(declaration, DECLARATION.format(catalog=_scalar(args.catalog)), HOME_FILE)
    try:
        Lock().save(root)
    except OSError as exc:
        declaration.unlink(missing_ok=True)
        raise DomosensoError(f"cannot write {LOCK_FILE}: {exc.strerror or exc}") from exc
    rep.line("write", HOME_FILE)
    rep.line("write", LOCK_FILE)
    return rep.ok()


# --- add --------------------------------------------------------------------------------------


def _add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("spec", metavar="<id>@<version>", help="the component and the tag to start from")
    parser.add_argument("--catalog-dev", type=Path, metavar="<path>",
                        help="read the component from a catalog working tree (the version is then optional): "
                             "dirty stamp, no lock entry")


def _add_run(args: argparse.Namespace, rep: Reporter) -> int:
    dev = args.catalog_dev
    home = HomeConfig.load(args.home)
    lock = Lock.load(args.home)
    cid, version = (args.spec, None) if dev and "@" not in args.spec else parse_spec(args.spec)
    if not COMPONENT_ID.match(cid):
        raise DomosensoError(f"{cid!r} is not a component id (lower case, digits and hyphens)")
    if cid in lock.components:
        raise DomosensoError(f"{cid} is already locked at {lock.components[cid].version}: use update")

    commit = None
    if dev:
        component_dir = dev_dir(dev, cid)
        found = load_manifest(component_dir).get("version")
        if version is not None and version != found:
            raise DomosensoError(f"{cid}: the working tree has version {found}, not {version}")
        version = found
    else:
        catalog = open_catalog(home)
        commit = catalog.tag_commit(cid, version)
        component_dir = catalog.checkout(cid, version, commit)
    manifest = load_manifest(component_dir)

    declared = home.components.get(cid)
    entry = declared or ComponentEntry(cid, home.root / "domosenso" / f"{cid}.inputs.yaml")
    inputs_rel = entry.inputs.relative_to(home.root).as_posix()
    declaration = None
    if declared is None:
        declaration = _with_component(home.root / HOME_FILE, cid, inputs_rel)

    made_inputs = not entry.inputs.exists()
    if made_inputs:
        _write(entry.inputs, inputs_skeleton(manifest, cid, version), inputs_rel)
    try:
        instance = _instance_outputs(
            home, lock, entry, component_dir, version, git_short_head(dev) if dev else commit, dev is not None
        )
    except BaseException:
        if made_inputs:
            entry.inputs.unlink(missing_ok=True)
            _rmdir_if_empty(entry.inputs.parent)
        raise

    if declaration is not None:
        _write(home.root / HOME_FILE, declaration, HOME_FILE)
        rep.line("write", HOME_FILE)
    rep.line("write" if made_inputs else "keep", inputs_rel)
    for output in instance:
        if os.path.lexists(home.root / output.dest):
            rep.line("instance-kept", output.dest)  # the home's already: kept as it is, and recorded in the lock
        else:
            _write(home.root / output.dest, output.content.decode("utf-8"), output.dest)
            rep.line("instance", output.dest)
    home = HomeConfig.load(args.home)  # now with the component in it
    if dev:
        render_ids(home, lock, [cid], False, dev, rep)
        # No lock entry carries the instance files of a dev add: the inventory does, for `deploy`.
        dev_render.add_files(home.root, cid, {o.dest: {"sha256": file_sha(home.root / o.dest), "layer": "instance"}
                                              for o in instance})
        return rep.ok()
    # The entry exists in memory only until `apply_component` has written everything and saved the
    # lock: a failed add leaves no lock entry, so it can be retried.
    lock.components[cid] = LockEntry(
        version=version, tag=f"{cid}/{version}", commit=commit, files=file_records(home, instance),
    )
    apply_component(home, lock, cid, component_dir, version, commit, False, rep,
                    released=catalog.commit_date(commit))
    write_inventory(home, lock, rep, catalog)
    return rep.ok()


def _instance_outputs(
    home: HomeConfig, lock: Lock, entry: ComponentEntry, component_dir: Path, version: str, sha: str, dev: bool
) -> list:
    """The component's `templates/instance/**` as rendered with the home's inputs. A file that exists
    is refused for a `--catalog-dev` add; for a tagged add it is the home's own and stays (unless
    another component's lock entry owns it)."""
    outputs = plan_outputs(home, entry, component_dir, version, sha, instance=True, dirty=dev)
    instance = [o for o in outputs if o.layer == "instance"]
    for output in instance:
        other = lock.owner(output.dest)
        if other is not None:
            raise DomosensoError(f"owned by {other}: {output.dest}")
        path = home.root / output.dest
        if os.path.lexists(path) and (dev or not path.is_file()):
            raise DomosensoError(f"instance file exists: {output.dest}")
    return instance


def _rmdir_if_empty(path: Path) -> None:
    try:
        path.rmdir()
    except OSError:
        pass


def inputs_skeleton(manifest: dict, cid: str, version: str) -> str:
    """An inputs file for the home to complete: a required input (no `default`) uncommented with its
    `example`, an optional one commented with its `example` (else its `default`), each with its type."""
    lines = [
        f"# Inputs of {cid} {version}: what is specific to this home.",
        "# Uncommented lines are required. Uncomment and edit an optional one to change its default.",
        "",
    ]
    for name, spec in (manifest.get("inputs") or {}).items():
        spec = spec if isinstance(spec, dict) else {}
        required = "default" not in spec
        value = spec["example"] if "example" in spec else spec.get("default")
        text = yaml.safe_dump({name: value}, default_flow_style=True, width=10**6, allow_unicode=True).strip()[1:-1]
        kind = f"  # {_one_line(spec['type'])}" if "type" in spec else ""
        lines.append(f"{'' if required else '# '}{text}{kind}")
    return "\n".join(lines) + "\n"


def _one_line(value) -> str:
    return " ".join(str(value).split())


def _with_component(path: Path, cid: str, inputs: str) -> str:
    """The text of domosenso.yaml with `cid` added under `components:`, comments and all.

    Handles `components: {}` and a block mapping; anything else is refused rather than rewritten, and
    the result is parsed to make sure it says exactly the old document plus the new entry."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise DomosensoError(f"{HOME_FILE}: {exc.strerror or exc}") from exc
    lines = text.splitlines()
    by_hand = f"add it under components: by hand: {cid}: {{inputs: {_scalar(inputs)}}}"
    starts = [i for i, line in enumerate(lines) if re.match(r"components:", line)]
    if len(starts) != 1:
        raise DomosensoError(f"{HOME_FILE}: cannot find its components: key to add {cid} to; {by_hand}")
    start = starts[0]
    unit = "  "
    if re.fullmatch(r"components:\s*\{\s*\}\s*(#.*)?", lines[start]):
        lines[start] = "components:"
        at = start + 1
    elif re.fullmatch(r"components:\s*(#.*)?", lines[start]):
        at = start + 1
        for j in range(start + 1, len(lines)):
            line = lines[j]
            if not line.strip():
                continue
            if line[0] in " \t":
                if at == start + 1 and not line.lstrip().startswith("#"):
                    unit = line[: len(line) - len(line.lstrip())]
                at = j + 1
            elif not line.startswith("#"):
                break
    else:
        raise DomosensoError(f"{HOME_FILE}: components: is not in block style, not edited; {by_hand}")
    lines[at:at] = [f"{unit}{cid}:", f"{unit}{unit}inputs: {_scalar(inputs)}"]
    result = "\n".join(lines) + "\n"
    expected = yaml.safe_load(text)
    expected["components"] = {**(expected.get("components") or {}), cid: {"inputs": inputs}}
    try:
        if yaml.safe_load(result) != expected:
            raise ValueError("the entry did not land under components:")
    except (yaml.YAMLError, ValueError) as exc:
        raise DomosensoError(f"{HOME_FILE}: could not add {cid} safely ({exc}); {by_hand}") from exc
    return result


# --- update -----------------------------------------------------------------------------------


def _update_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("id", metavar="<id>", help="the component to move")
    parser.add_argument("--to", metavar="<version>", help="the version to move to (default: the newest tag)")
    parser.add_argument("--force", action="store_true", help="overwrite or remove hand-edited and unmanaged files")


def _update_run(args: argparse.Namespace, rep: Reporter) -> int:
    cid = args.id
    home = HomeConfig.load(args.home)
    lock = Lock.load(args.home)
    if cid not in home.components:
        raise DomosensoError(f"{cid} is not in domosenso.yaml")
    if cid not in lock.components:
        raise DomosensoError(f"{cid} is not in domosenso.lock: add it first")
    locked = lock.components[cid]
    catalog = open_catalog(home)
    now = catalog.tag_commit(cid, locked.version)
    if now != locked.commit:
        raise TagMoved(locked.tag, locked.commit, now)
    if args.to:
        if not SEMVER.match(args.to):
            raise DomosensoError(f"{args.to!r} is not a version (x.y.z)")
        target = args.to
    else:
        versions = catalog.versions(cid)
        if not versions:
            raise DomosensoError(f"no tags for {cid}")
        target = versions[-1]
    if target == locked.version:
        rep.line("current", cid, target)
        return rep.ok()
    if version_key(target) < version_key(locked.version):
        raise DomosensoError(f"{cid}: {target} is older than the locked {locked.version}")
    commit = catalog.tag_commit(cid, target)
    component_dir = catalog.checkout(cid, target, commit)
    notes = component_dir / "UPGRADE.md"
    if notes.is_file():
        try:
            text = notes.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise DomosensoError(f"{cid}/{target}: UPGRADE.md: {exc}") from exc
        for section in sections_between(text, locked.version, target):
            for line in section.splitlines():
                if line.strip():
                    rep.line("note", line)
    apply_component(home, lock, cid, component_dir, target, commit, args.force, rep, remove_stale=True,
                    released=catalog.commit_date(commit))
    write_inventory(home, lock, rep, catalog)
    return rep.ok()


# --- status -----------------------------------------------------------------------------------


def _glob(pattern: str) -> re.Pattern:
    """A path glob: `*` and `?` stay inside a directory, `**` crosses them, a trailing `/` takes everything beneath."""
    out, i = [], 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("".join(out) + (".*" if pattern.endswith("/") else ""))


def _matches(globs: list[re.Pattern], *candidates: str) -> bool:
    return any(g.fullmatch(c) for g in globs for c in candidates)


def classify(home: HomeConfig, lock: Lock) -> dict[str, str]:
    """The layer of every file under config_dir and esphome_dir, keyed by its path relative to the home root:
    `managed` (the lock's, unchanged) or `managed-modified`, `managed-dev` (a dev render's, unchanged),
    `instance`, `local` (a `local:` glob),
    `unmanaged` (an `unmanaged_on_target` glob, the files Home Assistant keeps, the tool's own) and
    `unclassified`. Globs are tried against the path under config_dir and against the path from the root."""
    records = {path: record for entry in lock.components.values() for path, record in entry.files.items()}
    # A `--catalog-dev` render's files, as it wrote them (SPEC-019 B): its instance files are the
    # home's, its managed ones `managed-dev` while their sha256 is the recorded one.
    dev = {path: f for entry in dev_render.load(home.root).values() for path, f in entry["files"].items()}
    local = [_glob(g) for g in home.local]
    unmanaged = [_glob(g) for g in home.unmanaged_on_target]
    # The command's own package (SPEC-022): managed while it is what the lock gives.
    listing = inventory.path(home)
    listing_sha = file_sha(listing) if listing.is_file() else None
    wanted = inventory.expected(home, lock)
    result: dict[str, str] = {}
    for base in (home.config_dir, home.esphome_dir):
        if not base.is_dir():
            continue
        for directory, subdirectories, names in os.walk(base):
            subdirectories.sort()
            for name in sorted(names):
                path = Path(directory) / name
                try:
                    from_root = path.relative_to(home.root).as_posix()
                except ValueError:
                    raise DomosensoError(f"{base} is outside the home {home.root}") from None
                in_config = path.is_relative_to(home.config_dir)
                names_to_try = (from_root, path.relative_to(home.config_dir).as_posix()) if in_config else (from_root,)
                record = records.get(from_root)
                developed = dev.get(from_root)
                if path == listing:
                    kind = "managed" if wanted is not None and listing_sha == sha256(wanted) else "managed-modified"
                elif record is not None and record.layer == "instance":
                    kind = "instance"
                elif developed is not None and developed.get("layer") == "instance":
                    kind = "instance"
                elif developed is not None and file_sha(path) == developed.get("sha256"):
                    kind = "managed-dev"
                elif record is not None:
                    kind = "managed" if file_sha(path) == record.sha256 else "managed-modified"
                elif _matches(local, *names_to_try):
                    kind = "local"
                elif (
                    _matches(unmanaged, *names_to_try)
                    or (in_config and names_to_try[1] in BUILT_IN_UNMANAGED)
                    # ESPHome's secrets, read by the device files, git-ignored by the home template
                    or (not in_config and path == home.esphome_dir / "secrets.yaml")
                    or TOOL_DIR in Path(from_root).parts
                ):
                    kind = "unmanaged"
                else:
                    kind = "unclassified"
                result[from_root] = kind
    return result


def _status_run(args: argparse.Namespace, rep: Reporter) -> int:
    home = HomeConfig.load(args.home)
    lock = Lock.load(args.home)
    classes = classify(home, lock)
    for path, kind in sorted(classes.items()):
        if kind != "local":
            rep.line(kind, path)
    ids = sorted(set(home.components) | set(lock.components))
    catalog = open_catalog(home) if ids else None
    for cid in ids:
        locked = lock.components.get(cid)
        rep.line("component", cid, locked.version if locked else "not-locked", "newest", _newest(catalog, cid))
    for name, version in sorted(home.custom_integrations.items()):
        rep.line("integration", name, version, "(manual)")
    _report_outside_ha(home, lock, catalog, rep)
    _check_dashboard_entries(home, lock, rep)
    unclassified = sum(1 for kind in classes.values() if kind == "unclassified")
    return rep.fail(f"{unclassified} unclassified") if unclassified else rep.ok()


def _report_outside_ha(home: HomeConfig, lock: Lock, catalog, rep: Reporter) -> None:
    """What the locked components need outside Home Assistant's config, read at their tags (SPEC-015):
    their container services and firmware, which a human installs, and the ESPHome secrets their device
    files read that the home's secrets.yaml lacks. Only the secrets file's keys are read."""
    wanted: set[str] = set()
    for cid, locked in sorted(lock.components.items()):
        try:
            manifest = load_manifest(catalog.checkout(cid, locked.version, locked.commit))
        except DomosensoError as exc:
            rep.line("unchecked", f"{cid}: {exc}")
            continue
        artifacts = manifest.get("artifacts") or {}
        for service in artifacts.get("services") or []:
            if not isinstance(service, dict):
                continue  # a tag from before SPEC-015: a bare path says nothing to act on
            if service.get("kind") == "container":
                how = ("image", service["image"]) if service.get("image") else ("build",)
                rep.line("service", cid, service["name"], *how, "(manual)")
            elif service.get("kind") == "firmware":
                rep.line("firmware", cid, service["name"], str(service["version"]), "(manual)")
        wanted.update((artifacts.get("esphome") or {}).get("secrets") or [])
    if wanted:
        present = _secret_keys(home.esphome_dir / "secrets.yaml")
        for key in sorted(wanted - present):
            rep.line("esphome-secret", key, "missing")


def _secret_keys(path: Path) -> set[str]:
    """The top-level keys of an ESPHome secrets file with a non-empty value; the values are dropped here."""
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return set()
    except (OSError, yaml.YAMLError, UnicodeDecodeError) as exc:
        raise DomosensoError(f"{path.name}: cannot read its keys: {getattr(exc, 'strerror', None) or type(exc).__name__}") from None
    if not isinstance(data, dict):
        return set()
    return {str(key) for key, value in data.items() if value not in (None, "")}


def _newest(catalog, cid: str) -> str:
    try:
        versions = catalog.versions(cid)
    except DomosensoError:
        return "unknown"  # the catalog cannot be read (offline?): status is still worth printing
    return versions[-1] if versions else "none"


class _Tagged:
    """A value behind a Home Assistant tag (`!include`, `!secret`, ...): kept as a marker, never resolved."""

    def __init__(self, tag: str, value) -> None:
        self.tag, self.value = tag, value


class _TolerantLoader(yaml.SafeLoader):
    pass


def _tagged(loader: yaml.SafeLoader, tag: str, node: yaml.Node) -> _Tagged:
    if isinstance(node, yaml.MappingNode):
        return _Tagged(tag, loader.construct_mapping(node, deep=True))
    if isinstance(node, yaml.SequenceNode):
        return _Tagged(tag, loader.construct_sequence(node, deep=True))
    return _Tagged(tag, loader.construct_scalar(node))


_TolerantLoader.add_multi_constructor("!", _tagged)


def _named_dashboard_files(home: HomeConfig, rep: Reporter) -> set[str] | None:
    """The `filename:` of every dashboard `lovelace: dashboards:` in configuration.yaml names; None when
    that part is included from another file and cannot be read here."""
    path = home.config_dir / CONFIGURATION
    if not path.is_file():
        return set()
    try:
        data = yaml.load(path.read_text(encoding="utf-8"), Loader=_TolerantLoader)
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        raise DomosensoError(f"{CONFIGURATION}: not readable as YAML: {_one_line(exc)}") from exc
    lovelace = data.get("lovelace") if isinstance(data, dict) else None
    if isinstance(lovelace, _Tagged):
        rep.line("unchecked", f"{CONFIGURATION}: lovelace is included from another file")
        return None
    dashboards = lovelace.get("dashboards") if isinstance(lovelace, dict) else None
    if isinstance(dashboards, _Tagged):
        rep.line("unchecked", f"{CONFIGURATION}: lovelace.dashboards is included from another file")
        return None
    if not isinstance(dashboards, dict):
        return set()
    return {
        posixpath.normpath(item["filename"])
        for item in dashboards.values()
        if isinstance(item, dict) and isinstance(item.get("filename"), str)
    }


def _check_dashboard_entries(home: HomeConfig, lock: Lock, rep: Reporter) -> None:
    """A rendered dashboard is a file; Home Assistant shows it only if `lovelace: dashboards:` names it."""
    wanted = []
    for entry in lock.components.values():
        for dest, record in entry.files.items():
            if record.layer == "managed" and record.from_.startswith("templates/") and is_dashboard_template(record.from_):
                relative = Path(os.path.relpath(home.root / dest, home.config_dir)).as_posix()
                if not relative.startswith("../"):
                    wanted.append(relative)
    if not wanted:
        return
    named = _named_dashboard_files(home, rep)
    if named is None:
        return
    for relative in sorted(wanted):
        if relative in named:
            continue
        rep.line("missing-dashboard-entry", relative)
        for text in _dashboard_entry_yaml(relative):
            rep.line("yaml", text)


def _dashboard_entry_yaml(relative: str) -> list[str]:
    stem = re.sub(r"\.ya?ml$", "", Path(relative).name)
    key = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") or "dashboard"
    if "-" not in key:  # Home Assistant wants a hyphen in a dashboard's url path
        key += "-dashboard"
    return [
        "lovelace:",
        "  dashboards:",
        f"    {key}:",
        "      mode: yaml",
        f"      title: {_scalar(re.sub(r'[._-]+', ' ', stem))}",
        f"      filename: {_scalar(relative)}",
        "      show_in_sidebar: true",
    ]


init = SimpleNamespace(run=_init_run, add_arguments=_init_arguments)
add = SimpleNamespace(run=_add_run, add_arguments=_add_arguments)
update = SimpleNamespace(run=_update_run, add_arguments=_update_arguments)
status = SimpleNamespace(run=_status_run, add_arguments=lambda parser: None)
