#!/usr/bin/env python3
"""Validate the Domosenso catalog: manifests, artifact paths, translations, scenes, devices, kinds.

Usage: uv run tools/catalog_check.py [--catalog DIR] [--strict]

Exits 1 on any error, and with --strict on any warning as well.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

REPO = Path(__file__).resolve().parent.parent
SCHEMAS = REPO / "schemas"

# What a scene may ask of the Ramka (the wall tablet). Other tools and tests import these.
RAMKA_MODES = ["off", "ambient", "controls", "calendar"]
RAMKA_PAGES = ["climate", "air", "plants", "photos", "status"]

LANGUAGES = ["en", "de", "pl"]
SOURCE_LANGUAGE = "en"


def _schema_errors(schema_name: str, data, label: str) -> list[str]:
    schema = json.loads((SCHEMAS / f"{schema_name}.schema.json").read_text())
    validator = Draft202012Validator(schema)
    errors = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        where = ".".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"{label}: {where}: {err.message}")
    return errors


def _load_yaml(path: Path):
    """Return (data, error). Error is a message when the file is unreadable or not YAML."""
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")), None
    except (OSError, yaml.YAMLError) as exc:
        return None, f"{path}: cannot read: {exc}"


CATALOG_REPO_URL = "https://github.com/zerostorypoints/domosenso"


class _EsphomeLoader(yaml.SafeLoader):
    """Reads an ESPHome file for its structure: `!secret`, `!include` and friends are kept as text."""


_EsphomeLoader.add_multi_constructor("!", lambda loader, suffix, node: loader.construct_scalar(node)
                                     if isinstance(node, yaml.ScalarNode) else None)


def _external_component_refs(path: Path) -> list[str]:
    """The `ref` of every git external_components source in the file that points at this repository."""
    try:
        data = yaml.load(path.read_text(encoding="utf-8"), Loader=_EsphomeLoader)
    except (OSError, yaml.YAMLError):
        return []  # not valid YAML for this purpose; ESPHome's own check owns that
    items = data.get("external_components") if isinstance(data, dict) else None
    refs = []
    for item in items if isinstance(items, list) else []:
        source = item.get("source") if isinstance(item, dict) else None
        if isinstance(source, dict) and source.get("type") == "git" and \
                str(source.get("url", "")).removesuffix(".git").rstrip("/") == CATALOG_REPO_URL:
            refs.append(str(source.get("ref")))
    return refs


def _catalog_root(component_yaml: Path) -> Path:
    # <catalog>/components/<id>/component.yaml
    return component_yaml.resolve().parent.parent.parent


def flatten(data, prefix: str = "") -> dict[str, object]:
    """Nested JSON object -> {"a.b.c": leaf}."""
    flat: dict[str, object] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            flat.update(flatten(value, path))
    else:
        flat[prefix] = data
    return flat


def _load_translation(path: Path):
    """Return (flat dict | None, error | None)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        return None, f"{path}: cannot read: {exc}"
    except json.JSONDecodeError as exc:
        return None, f"{path}: invalid JSON: {exc}"
    if not isinstance(data, dict):
        return None, f"{path}: top level must be an object"
    return flatten(data), None


def _artifact_paths(artifacts: dict) -> list[tuple[str, str, bool]]:
    """(label, path, repo_relative). Paths holding <placeholders> are checked by their directory."""
    out: list[tuple[str, str, bool]] = []
    esphome = artifacts.get("esphome") or {}
    for pkg in esphome.get("packages") or []:
        out.append(("artifacts.esphome.packages", pkg["file"], False))
    if esphome.get("factory"):
        out.append(("artifacts.esphome.factory", esphome["factory"], False))
    if esphome.get("instance"):
        out.append(("artifacts.esphome.instance", esphome["instance"], True))
    if esphome.get("devices"):
        out.append(("artifacts.esphome.devices.template", esphome["devices"]["template"], False))
    for key in ("ha_blueprints", "ha_packages", "dashboard_cards", "templates", "shell", "themes"):
        for item in artifacts.get(key) or []:
            out.append((f"artifacts.{key}", item, False))
    if artifacts.get("ha_instance"):
        out.append(("artifacts.ha_instance", artifacts["ha_instance"], True))
    for item in artifacts.get("services") or []:
        if isinstance(item, str):
            out.append(("artifacts.services", item, False))
        else:
            for rel in service_files(item):
                out.append((f"artifacts.services.{item['name']}", rel, False))
    return out


def service_files(service: dict) -> list[str]:
    """The files a `container` service puts into a home (SPEC-015): compose file, the files built or
    mounted with it, the env example. A `firmware` service has none."""
    if service.get("kind") != "container":
        return []
    return [service["compose"], *(service.get("files") or []), *([service["env_example"]] if service.get("env_example") else [])]


def check_component(path: Path) -> list[str]:
    path = Path(path)
    data, err = _load_yaml(path)
    if err:
        return [err]
    errors = _schema_errors("component", data, str(path))
    if errors:
        return errors
    comp_dir = path.parent
    if data["id"] != comp_dir.name:
        errors.append(f"{path}: id '{data['id']}' does not match directory '{comp_dir.name}'")
    root = _catalog_root(path)
    for label, rel, repo_relative in _artifact_paths(data["artifacts"]):
        base = root if repo_relative else comp_dir
        target = base / rel
        if "<" in rel:
            target = target.parent
        if not target.exists():
            errors.append(f"{path}: {label}: path does not exist: {rel}")
    # The tag a package pulls its external components from is the component's own version; it is a
    # literal in the file (a remote package cannot take a substitution there), so it is checked here.
    esphome = data["artifacts"].get("esphome") or {}
    tag = f"{data['id']}/{data['version']}"
    for rel in [pkg["file"] for pkg in esphome.get("packages") or []] + ([esphome["factory"]] if esphome.get("factory") else []):
        if (comp_dir / rel).is_file():
            for ref in _external_component_refs(comp_dir / rel):
                if ref != tag:
                    errors.append(f"{path}: {rel}: external_components ref '{ref}' must be '{tag}' (the manifest's version)")
    install = data["artifacts"].get("install_path")
    if install and install.split("/")[2] != data["id"]:
        errors.append(f"{path}: artifacts.install_path: '{install}' must be www/domosenso/{data['id']}/<version>/")
    if not install and any(c.endswith(".js") for c in data["artifacts"].get("dashboard_cards") or []):
        errors.append(f"{path}: artifacts.install_path: required with JavaScript dashboard_cards")
    if data.get("photo") and not (root / data["photo"]).exists():  # from the catalog root, like a device's
        errors.append(f"{path}: photo: path does not exist: {data['photo']}")
    for group in ("requires", "optional"):
        for n, item in enumerate(data["devices"].get(group) or []):
            for device_id in item.get("recommend") or []:
                if not _exists_device(root, device_id):
                    errors.append(f"{path}: devices.{group}.{n}.recommend: unknown device '{device_id}' "
                                  f"(no devices/{device_id}.yaml)")
    en, en_err = _load_translation(comp_dir / "translations" / f"{SOURCE_LANGUAGE}.json")
    if en is None:
        errors.append(f"{path}: description_key '{data['description_key']}' cannot be resolved: {en_err}")
    elif data["description_key"] not in en:
        errors.append(f"{path}: description_key '{data['description_key']}' is not in translations/en.json")
    return errors


def install_dir(manifest: dict) -> str | None:
    """artifacts.install_path with <version> filled in, e.g. www/domosenso/ramka/0.1.0/ (None without one)."""
    install = (manifest.get("artifacts") or {}).get("install_path")
    return install.replace("<version>", manifest["version"]) if install else None


def install_files(component_dir: Path, manifest: dict) -> list[str]:
    """What goes under install_dir, as paths from the component directory: every file in the
    directories that hold the dashboard cards (with their lib/), and translations/*.json. Tests
    (*.test.mjs) and test helpers (testing/) stay behind."""
    component_dir = Path(component_dir)
    cards = [c for c in (manifest.get("artifacts") or {}).get("dashboard_cards") or [] if c.endswith(".js")]
    roots = sorted({Path(c).parts[0] for c in cards})
    files = set()
    for top in roots:
        for f in (component_dir / top).rglob("*"):
            rel = f.relative_to(component_dir)
            if f.is_file() and "testing" not in rel.parts and not f.name.endswith(".test.mjs"):
                files.add(rel.as_posix())
    if cards:
        files |= {f.relative_to(component_dir).as_posix() for f in (component_dir / "translations").glob("*.json")}
    return sorted(files)


def check_translations(component_dir: Path) -> tuple[list[str], list[str]]:
    """Errors: invalid JSON, a key in de/pl that en lacks, ß in de. Warnings: a key en has that de/pl lack."""
    component_dir = Path(component_dir)
    tdir = component_dir / "translations"
    errors: list[str] = []
    warnings: list[str] = []
    en, en_err = _load_translation(tdir / f"{SOURCE_LANGUAGE}.json")
    if en is None:
        return [en_err], []
    for key, value in en.items():
        if not isinstance(value, str):
            errors.append(f"{tdir / 'en.json'}: {key}: value must be a string")
    for lang in LANGUAGES:
        if lang == SOURCE_LANGUAGE:
            continue
        file = tdir / f"{lang}.json"
        if not file.exists():
            warnings.append(f"{file}: missing, every key falls back to en")
            continue
        flat, err = _load_translation(file)
        if flat is None:
            errors.append(err)
            continue
        for key, value in flat.items():
            if key not in en:
                errors.append(f"{file}: key '{key}' is not in en.json")
            if not isinstance(value, str):
                errors.append(f"{file}: {key}: value must be a string")
            elif lang == "de" and "ß" in value:
                errors.append(f"{file}: {key}: Swiss Standard German writes 'ss', never 'ß'")
        for key in en:
            if key not in flat:
                warnings.append(f"{file}: key '{key}' missing, falls back to en")
    return errors, warnings


def _exists_component(catalog: Path, component_id: str) -> bool:
    return (catalog / "components" / component_id / "component.yaml").is_file()


def _exists_device(catalog: Path, device_id: str) -> bool:
    return (catalog / "devices" / f"{device_id}.yaml").is_file()


def check_scene(path: Path, catalog: Path) -> list[str]:
    path, catalog = Path(path), Path(catalog)
    data, err = _load_yaml(path)
    if err:
        return [err]
    errors = _schema_errors("scene", data, str(path))
    if errors:
        return errors
    if data["id"] != path.stem:
        errors.append(f"{path}: id '{data['id']}' does not match file name '{path.stem}'")
    for cid in data["components"]:
        if not _exists_component(catalog, cid):
            errors.append(f"{path}: components: unknown component '{cid}'")
    for did in data["devices"]:
        if not _exists_device(catalog, did):
            errors.append(f"{path}: devices: unknown device '{did}'")
    for entity in data.get("attributes") or {}:
        if entity not in data["states"]:
            errors.append(f"{path}: attributes: '{entity}' has attributes but no state in states")
    tablet = data["tablet"]
    if tablet:
        if tablet["mode"] not in RAMKA_MODES:
            errors.append(f"{path}: tablet.mode '{tablet['mode']}' is not one of {RAMKA_MODES}")
        if "page" in tablet:
            if tablet["mode"] != "ambient":
                errors.append(f"{path}: tablet.page is only valid with mode 'ambient', not '{tablet['mode']}'")
            if tablet["page"] not in RAMKA_PAGES:
                errors.append(f"{path}: tablet.page '{tablet['page']}' is not one of {RAMKA_PAGES}")
    return errors


def check_device(path: Path, catalog: Path | None = None) -> list[str]:
    """Schema; with `catalog`, also the component it belongs to and its translation keys."""
    path = Path(path)
    data, err = _load_yaml(path)
    if err:
        return [err]
    errors = _schema_errors("device", data, str(path))
    if errors:
        return errors
    if data["id"] != path.stem:
        errors.append(f"{path}: id '{data['id']}' does not match file name '{path.stem}'")
    if "tablet" in data and data["component"] != "ramka":
        errors.append(f"{path}: tablet: only a device of component ramka carries a tablet profile")
    if catalog is not None:
        catalog = Path(catalog)
        if not _exists_component(catalog, data["component"]):
            errors.append(f"{path}: component: unknown component '{data['component']}'")
        else:
            en, en_err = _load_translation(
                catalog / "components" / data["component"] / "translations" / f"{SOURCE_LANGUAGE}.json"
            )
            if en is None:
                errors.append(f"{path}: translation keys cannot be resolved: {en_err}")
            else:
                for field in ("description_key", "does_key"):
                    if data[field] not in en:
                        errors.append(f"{path}: {field} '{data[field]}' is not in the component's en.json")
    if data.get("photo") and catalog is not None and not (catalog / data["photo"]).exists():
        errors.append(f"{path}: photo: path does not exist: {data['photo']}")
    return errors


def manifest_kinds(catalog: Path) -> set[str]:
    """Every `kind` a manifest names under `devices.requires` or `devices.optional`."""
    kinds = set()
    for manifest in Path(catalog).glob("components/*/component.yaml"):
        data, _ = _load_yaml(manifest)
        devices = data.get("devices") if isinstance(data, dict) else None
        for group in ("requires", "optional"):
            for item in (devices or {}).get(group) or []:
                if isinstance(item, dict) and isinstance(item.get("kind"), str):
                    kinds.add(item["kind"])
    return kinds


def check_kind(path: Path, catalog: Path) -> list[str]:
    """Schema, file name, and a kind some manifest names (SPEC-010: `kinds/<kind>.yaml`)."""
    path = Path(path)
    data, err = _load_yaml(path)
    if err:
        return [err]
    errors = _schema_errors("kind", data, str(path))
    if errors:
        return errors
    if data["id"] != path.stem:
        errors.append(f"{path}: id '{data['id']}' does not match file name '{path.stem}'")
    if data["id"] not in manifest_kinds(catalog):
        errors.append(f"{path}: no manifest names kind '{data['id']}' under devices")
    return errors


def scenes_for(catalog: Path) -> dict[str, list[str]]:
    """Component or device id -> ids of the scenes that reference it, derived from the scene files."""
    index: dict[str, list[str]] = {}
    scenes_dir = Path(catalog) / "scenes"
    if not scenes_dir.is_dir():
        return index
    for file in sorted(scenes_dir.glob("*.yaml")):
        data, _ = _load_yaml(file)
        if not isinstance(data, dict):
            continue
        scene_id = data.get("id", file.stem)
        for key in ("components", "devices"):
            items = data.get(key)
            for item in items if isinstance(items, list) else []:
                if not isinstance(item, str):
                    continue  # check_scene reports it; the index only holds ids
                scenes = index.setdefault(item, [])
                if scene_id not in scenes:
                    scenes.append(scene_id)
    return {k: sorted(v) for k, v in index.items()}


def check_catalog(catalog: Path) -> tuple[list[str], list[str]]:
    catalog = Path(catalog)
    errors: list[str] = []
    warnings: list[str] = []
    if not (catalog / "components").is_dir():
        return [f"{catalog}: no components/ directory (wrong --catalog path?)"], []
    for manifest in sorted((catalog / "components").glob("*/component.yaml")):
        errors += check_component(manifest)
        t_err, t_warn = check_translations(manifest.parent)
        errors += t_err
        warnings += t_warn
    for sub, check in (("scenes", lambda p: check_scene(p, catalog)), ("devices", lambda p: check_device(p, catalog)),
                       ("kinds", lambda p: check_kind(p, catalog))):
        directory = catalog / sub
        if directory.is_dir():
            for file in sorted(directory.glob("*.yaml")):
                errors += check(file)
    return errors, warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", type=Path, default=REPO, help="catalog root (default: this repository)")
    parser.add_argument("--strict", action="store_true", help="warnings fail the check too")
    args = parser.parse_args(argv)
    errors, warnings = check_catalog(args.catalog)
    for message in errors:
        print(f"ERROR   {message}")
    for message in warnings:
        print(f"WARNING {message}")
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    if errors or (args.strict and warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
