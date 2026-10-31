#!/usr/bin/env python3
"""Render a component's Jinja templates for one instance.

Every templates/**/*.j2 renders to <out>/<same path without .j2>.
*.lang.yaml.j2 renders once per language to <name>.<lang>.yaml.
Other (plain) templates render once, with lang = "en".

Delimiters: the renderer uses [[ ... ]] for expressions, [% ... %] for blocks
and [# ... #] for comments. The default {{ }} and {% %} are left alone because
the files rendered here are Home Assistant YAML full of its own Jinja
templates; those pass through byte-identical, while [[ ... ]] still substitutes
inside them, e.g. "{{ is_state('input_select.[[ inputs.prefix ]]_mode', 'on') }}".

A nested YAML flow list needs spaces, `[ [ 80 ] ]`: `[[80]]` would read as an
expression, so a `[[` followed by anything but a letter or underscore is an error.

Template globals: t(key), inputs, lang, fail(message), component (id, version: the manifest's;
SPEC-023). Filter: yaml (a YAML-safe scalar).
An input whose value is null counts as absent (`is defined` is false), at every depth.

--stamp puts a first line on every file written:
    # Rendered by Domosenso from <component>@<short commit of the catalog> — do not edit
with "-dirty" after the commit when the component directory has uncommitted changes.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateError, Undefined

from catalog_check import flatten

DEFAULT_LANGS = ["en", "de", "pl"]
LANG_SUFFIX = ".lang.yaml.j2"


class RenderError(Exception):
    pass


def yaml_scalar(value) -> str:
    """JSON is valid YAML: quotes and escapes any string safely, keeps diacritics."""
    if isinstance(value, Undefined):
        value._fail_with_undefined_error()  # names the missing input
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except TypeError as exc:
        raise RenderError(f"yaml filter cannot serialise {value!r}: {exc}") from exc


def drop_none(value):
    """A copy without the mappings' None-valued keys, at every depth: `key: null` reads as absent."""
    if isinstance(value, dict):
        return {k: drop_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [drop_none(v) for v in value]
    return value


def _load_translations(component_dir: Path, lang: str) -> dict[str, object]:
    path = component_dir / "translations" / f"{lang}.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RenderError(f"{path}: {exc}") from exc
    if not isinstance(data, dict):
        raise RenderError(f"{path}: top level must be an object")
    return flatten(data)


def _make_env(
    component_dir: Path, inputs: dict, lang: str, en: dict, current: dict, root: str = "templates"
) -> Environment:
    def t(key: str):
        if key in current:
            return current[key]
        if key in en:
            return en[key]
        raise RenderError(f"translation key {key!r} is missing in {lang} and en")

    env = Environment(
        loader=FileSystemLoader(str(component_dir / root)),
        undefined=StrictUndefined,
        keep_trailing_newline=True,
        variable_start_string="[[",
        variable_end_string="]]",
        block_start_string="[%",
        block_end_string="%]",
        comment_start_string="[#",
        comment_end_string="#]",
    )
    def fail(message: str):
        # A template refuses inputs it cannot render well (ramka: a screen no tested layout fits).
        raise RenderError(message)

    env.filters["yaml"] = yaml_scalar
    env.globals.update(t=t, inputs=inputs, lang=lang, fail=fail)
    return env


# `[[` followed (after optional whitespace, possessively) by anything but a letter
# or underscore in any script: a literal, not an expression.
_LITERAL_AFTER_OPEN = re.compile(r"\[\[\s*+(?![^\W\d])")


def _check_nested_list_literals(env: Environment, name: str) -> None:
    source = env.loader.get_source(env, name)[0]
    match = _LITERAL_AFTER_OPEN.search(source)
    if match:
        number = source.count("\n", 0, match.start()) + 1
        raise RenderError(
            f"line {number}: '[[' starts an expression here, not a YAML list; "
            "write a nested YAML list as `[ [ \u2026 ] ]`"
        )


def stamp_line(component_dir: Path) -> str:
    """The first line --stamp writes, naming the component and the catalog commit."""
    component_dir = Path(component_dir).resolve()
    manifest = component_dir / "component.yaml"
    cid = (yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}).get("id") if manifest.is_file() else None

    def git(*args):
        result = subprocess.run(["git", "-C", str(component_dir), *args], capture_output=True, text=True)
        if result.returncode:
            raise RenderError(f"--stamp needs {component_dir} in a git repository: {result.stderr.strip()}")
        return result.stdout.strip()

    sha = git("rev-parse", "--short", "HEAD")
    if git("status", "--porcelain", "--", "."):
        sha += "-dirty"
    return f"# Rendered by Domosenso from {cid or component_dir.name}@{sha} — do not edit\n"


def _render(env: Environment, name: str, dest: Path, stamp: str = "") -> Path:
    try:
        _check_nested_list_literals(env, name)
        text = env.get_template(name).render()
    except (TemplateError, RenderError) as exc:
        raise RenderError(f"{name}: {exc}") from exc
    except (TypeError, ValueError) as exc:
        exc.add_note(name)  # the library raises it unchanged; the CLI names the file
        raise
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(stamp + text, encoding="utf-8")
    return dest


def render_component(
    component_dir: Path,
    inputs: dict,
    out_dir: Path,
    langs: list[str] = DEFAULT_LANGS,
    stamp: bool = False,
    stamp_text: str | None = None,
) -> list[Path]:
    """`stamp_text` is written verbatim as the first line of every file (the caller includes the newline)
    and wins over `stamp`: the `domosenso` command writes its own form of the stamp."""
    component_dir, out_dir = Path(component_dir), Path(out_dir)
    first_line = stamp_text if stamp_text is not None else stamp_line(component_dir) if stamp else ""
    inputs = drop_none(inputs)  # so that `is defined` in a template means "the home gave a value"
    templates_dir = component_dir / "templates"
    names = sorted(p.relative_to(templates_dir).as_posix() for p in templates_dir.rglob("*.j2"))
    en = _load_translations(component_dir, "en")
    manifest_file = component_dir / "component.yaml"
    manifest = (yaml.safe_load(manifest_file.read_text(encoding="utf-8")) or {}) if manifest_file.is_file() else {}
    envs = {}
    for lang in set(langs) | {"en"}:
        current = en if lang == "en" else _load_translations(component_dir, lang)
        envs[lang] = _make_env(component_dir, inputs, lang, en, current)
        envs[lang].globals["component"] = {"id": manifest.get("id"), "version": manifest.get("version")}

    written: list[Path] = []
    for name in names:
        if name.endswith(LANG_SUFFIX):
            stem = name[: -len(LANG_SUFFIX)]
            for lang in langs:
                written.append(_render(envs[lang], name, out_dir / f"{stem}.{lang}.yaml", first_line))
        else:
            written.append(_render(envs["en"], name, out_dir / name[: -len(".j2")], first_line))
    return written


_PLACEHOLDER = re.compile(r"<([a-z_]+)>")


def render_device_files(component_dir: Path, inputs: dict) -> list[tuple[str, str]]:
    """The ESPHome device files of `artifacts.esphome.devices` (SPEC-015): `(file name, text)` per item of
    the list input `each`, the template rendered with `item` and `component` (`id`, `version`) besides the
    usual globals, and `<field>` in `file` replaced by that item's field."""
    component_dir = Path(component_dir)
    manifest = yaml.safe_load((component_dir / "component.yaml").read_text(encoding="utf-8")) or {}
    devices = ((manifest.get("artifacts") or {}).get("esphome") or {}).get("devices")
    if not devices:
        return []
    inputs = drop_none(inputs)
    items = inputs.get(devices["each"])
    if not isinstance(items, list):
        raise RenderError(f"input {devices['each']!r} must be a list: it names the ESPHome device files")
    en = _load_translations(component_dir, "en")
    template = Path(devices["template"])
    env = _make_env(component_dir, inputs, "en", en, en, root=template.parent.as_posix())
    env.globals["component"] = {"id": manifest.get("id"), "version": manifest.get("version")}
    written: list[tuple[str, str]] = []
    for n, item in enumerate(items):
        if not isinstance(item, dict):
            raise RenderError(f"{devices['each']}[{n}] must be a mapping")

        def field(match: re.Match, item=item, n=n) -> str:
            value = item.get(match.group(1))
            if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", value):
                raise RenderError(f"{devices['each']}[{n}].{match.group(1)} must be a slug for {devices['file']}")
            return value

        name = _PLACEHOLDER.sub(field, devices["file"])
        try:
            _check_nested_list_literals(env, template.name)
            text = env.get_template(template.name).render(item=item)
        except (TemplateError, RenderError) as exc:
            raise RenderError(f"{template}: {exc}") from exc
        written.append((name, text))
    names = [name for name, _ in written]
    if len(set(names)) != len(names):
        raise RenderError(f"two items of {devices['each']} give the same device file name")
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("component_dir", type=Path)
    parser.add_argument("--inputs", type=Path, required=True, help="YAML file with the instance inputs")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--lang", default=",".join(DEFAULT_LANGS), help="comma-separated languages")
    parser.add_argument("--stamp", action="store_true",
                        help="first line of every file: '# Rendered by Domosenso from <component>@<commit> — do not edit'")
    args = parser.parse_args(argv)
    try:
        inputs = yaml.safe_load(args.inputs.read_text(encoding="utf-8")) or {}
        if not isinstance(inputs, dict):
            raise RenderError(f"{args.inputs}: top level must be a mapping")
        langs = [x.strip() for x in args.lang.split(",") if x.strip()]
        written = render_component(args.component_dir, inputs, args.out, langs, stamp=args.stamp)
    except (RenderError, OSError, ValueError, TypeError, yaml.YAMLError) as exc:
        notes = getattr(exc, "__notes__", [])
        print(f"error: {notes[0] + ': ' if notes else ''}{exc}", file=sys.stderr)
        return 1
    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
