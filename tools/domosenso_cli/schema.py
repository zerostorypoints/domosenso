"""Read a YAML file of the home repository and check it against one of `schemas/`."""
from __future__ import annotations

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from domosenso_cli.errors import DomosensoError

SCHEMAS = Path(__file__).resolve().parent.parent.parent / "schemas"


def key_path(path) -> str:
    return ".".join(str(part) for part in path)


def describe(error) -> str:
    """Name the offending key; an unknown key is named even though the schema flags its parent."""
    where = key_path(error.absolute_path)
    if error.validator == "additionalProperties":
        unknown = sorted(set(error.instance) - set(error.schema.get("properties", {})))
        if unknown:
            names = ", ".join(f"{where}.{name}" if where else name for name in unknown)
            return f"unknown key {names}"
    if error.validator == "required":
        missing = [name for name in error.validator_value if name not in error.instance]
        names = ", ".join(f"{where}.{name}" if where else name for name in missing)
        return f"missing key {names}"
    return f"{where or '(top level)'}: {error.message}"


def load_validated(path: Path, schema_name: str, *, missing_ok: bool = False) -> dict | None:
    """The mapping in `path`, valid against `schemas/<schema_name>.schema.json`.
    Returns None for an absent file when `missing_ok`. Every failure is a DomosensoError that
    names the file and the key."""
    if not path.exists():
        if missing_ok:
            return None
        raise DomosensoError(f"{path.name}: not found at {path}")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (yaml.YAMLError, UnicodeDecodeError) as exc:
        raise DomosensoError(f"{path.name}: not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise DomosensoError(f"{path.name}: expected a mapping at the top level")
    schema = json.loads((SCHEMAS / f"{schema_name}.schema.json").read_text(encoding="utf-8"))
    errors = sorted(
        Draft202012Validator(schema).iter_errors(data),
        key=lambda e: (len(e.absolute_path), key_path(e.absolute_path)),
    )
    if errors:
        raise DomosensoError(f"{path.name}: {describe(errors[0])}")
    return data
