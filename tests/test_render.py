import datetime
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

import domosenso_render as dr

FIXTURE = Path(__file__).parent / "fixtures" / "render-comp"
REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def comp(tmp_path):
    dest = tmp_path / "comp"
    shutil.copytree(FIXTURE, dest)
    return dest


INPUTS = {"name": "Hall", "prefix": "ramka", "lights": ["Kids' room", "Hall"]}


def load(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_lang_template_renders_once_per_language(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    titles = {lang: load(out / f"dash.{lang}.yaml")["title"] for lang in ("en", "de", "pl")}
    assert titles == {"en": "Overview", "de": "Übersicht", "pl": "Przegląd"}
    assert load(out / "dash.de.yaml")["lang"] == "de"
    assert not (out / "dash.lang.yaml").exists()


def test_plain_template_renders_once(comp, tmp_path):
    out = tmp_path / "out"
    written = dr.render_component(comp, INPUTS, out)
    assert load(out / "plain.yaml") == {"name": "Hall"}
    assert not list(out.glob("plain.*.yaml"))
    assert out / "plain.yaml" in written
    assert (out / "nested" / "deep.yaml").is_file()
    assert all(p.is_file() for p in written)


def test_compiled_templates_are_reused_until_the_source_changes(comp, tmp_path):
    dr.render_component(comp, INPUTS, tmp_path / "first")
    dr.render_component(comp, {**INPUTS, "name": "Kitchen"}, tmp_path / "second")
    assert load(tmp_path / "second" / "plain.yaml") == {"name": "Kitchen"}  # inputs are not compiled in
    template = comp / "templates" / "plain.yaml.j2"
    template.write_text(template.read_text(encoding="utf-8") + "edited: true\n", encoding="utf-8")
    dr.render_component(comp, INPUTS, tmp_path / "third")
    assert load(tmp_path / "third" / "plain.yaml") == {"name": "Hall", "edited": True}


def test_missing_input_names_it(comp, tmp_path):
    with pytest.raises(dr.RenderError, match="name"):
        dr.render_component(comp, {"prefix": "p", "lights": []}, tmp_path / "out")


def test_missing_pl_key_falls_back_to_en(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    assert load(out / "fallback.pl.yaml")["only_en"] == "English only"
    assert load(out / "fallback.de.yaml")["only_en"] == "Nur Englisch"


def test_key_missing_everywhere_is_an_error_naming_it(comp, tmp_path):
    (comp / "templates" / "bad.lang.yaml.j2").write_text("x: [[ t('ui.nowhere') | yaml ]]\n")
    with pytest.raises(dr.RenderError, match=r"ui\.nowhere"):
        dr.render_component(comp, INPUTS, tmp_path / "out")


@pytest.mark.parametrize("value", ["Kids' room", "Łazienka: dzieci", '"quoted"', "a # b", "- x", "yes", "12"])
def test_yaml_filter_round_trips(comp, tmp_path, value):
    out = tmp_path / "out"
    dr.render_component(comp, {**INPUTS, "name": value}, out)
    assert load(out / "plain.yaml")["name"] == value
    assert load(out / "dash.pl.yaml")["room"] == value
    assert load(out / "nested" / "deep.yaml")["nested"] == value


def test_overwrites_and_creates_out_dir(comp, tmp_path):
    out = tmp_path / "a" / "b"
    dr.render_component(comp, {**INPUTS, "name": "One"}, out)
    dr.render_component(comp, {**INPUTS, "name": "Two"}, out)
    assert load(out / "plain.yaml") == {"name": "Two"}


def test_langs_argument_limits_output(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out, langs=["en"])
    assert (out / "dash.en.yaml").is_file()
    assert not (out / "dash.de.yaml").exists()


def test_cli_with_absolute_paths(comp, tmp_path):
    inputs = tmp_path / "inputs.yaml"
    inputs.write_text("name: \"Łazienka: dzieci\"\nprefix: ramka\nlights: [a]\n", encoding="utf-8")
    out = tmp_path / "out"
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp),
         "--inputs", str(inputs), "--out", str(out), "--lang", "en,pl"],
        capture_output=True, text=True, cwd=tmp_path,
    )
    assert result.returncode == 0, result.stderr
    assert load(out / "plain.yaml") == {"name": "Łazienka: dzieci"}
    assert (out / "dash.pl.yaml").is_file() and not (out / "dash.de.yaml").exists()


def test_cli_missing_input_exits_nonzero(comp, tmp_path):
    inputs = tmp_path / "inputs.yaml"
    inputs.write_text("prefix: x\nlights: []\n", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp),
         "--inputs", str(inputs), "--out", str(tmp_path / "out")],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert "name" in result.stderr


def test_ha_template_with_input_inside_renders_as_stated(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    line = (out / "ha.yaml").read_text(encoding="utf-8").splitlines()[0]
    assert line == "state: \"{{ is_state('input_select.ramka_mode', 'ambient') }}\""


def test_ha_blocks_and_filters_pass_through_byte_identical(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    lines = (out / "ha.yaml").read_text(encoding="utf-8").splitlines()
    assert lines[1] == 'raw_block: "{% if is_state(\'x\', \'on\') %}a{% endif %}"'
    assert lines[2] == 'raw_filter: "{{ states(\'sensor.x\') | float(0) }}"'


def test_loop_produces_yaml_list_items(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    assert load(out / "lights.yaml") == {"lights": ["Kids' room", "Hall"]}


def test_date_input_is_stringified(comp, tmp_path):
    out = tmp_path / "out"
    dr.render_component(comp, {**INPUTS, "name": datetime.date(2026, 10, 20)}, out)
    assert load(out / "plain.yaml") == {"name": "2026-10-20"}


def test_cli_date_input_does_not_traceback(comp, tmp_path):
    inputs = tmp_path / "inputs.yaml"
    inputs.write_text("name: 2026-10-20\nprefix: p\nlights: []\n", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp),
         "--inputs", str(inputs), "--out", str(tmp_path / "out")],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "Traceback" not in result.stderr


def test_unserialisable_value_reports_error_not_traceback(comp, tmp_path):
    with pytest.raises(dr.RenderError):
        dr.render_component(comp, {**INPUTS, "name": {(1, 2): 1}}, tmp_path / "out")


def _add_template(comp, name, text):
    (comp / "templates" / name).write_text(text, encoding="utf-8")


@pytest.mark.parametrize("literal", ["[[80]]", "[[1, 2]]", "[[ 'a' ]]", "[[-1]]", "[[[1]]]", "[[{1: 2}]]"])
def test_nested_flow_list_literal_is_rejected_with_hint(comp, tmp_path, literal):
    _add_template(comp, "levels.yaml.j2", f"a: 1\nlevels: {literal}\n")
    with pytest.raises(dr.RenderError) as exc:
        dr.render_component(comp, INPUTS, tmp_path / "out")
    message = str(exc.value)
    assert "levels.yaml.j2" in message and "line 2" in message
    assert "[ [ \u2026 ] ]" in message


def test_spaced_nested_flow_list_renders_unchanged(comp, tmp_path):
    _add_template(comp, "levels.yaml.j2", "levels: [ [80] ]\nmore: [ [1, 2], [3] ]\n")
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    assert (out / "levels.yaml").read_text() == "levels: [ [80] ]\nmore: [ [1, 2], [3] ]\n"


def test_legitimate_expressions_are_not_flagged(comp, tmp_path):
    _add_template(
        comp, "ok.lang.yaml.j2",
        "a: [[ inputs.name ]]\nb: [[ t('ui.title') ]]\nc: [[ lang ]]\nd: [[_y | default('z')]]\n"
        "[% for item in inputs.lights %]\ne: [[item | yaml]]\n[% endfor %]\n",
    )
    dr.render_component(comp, {**INPUTS, "lights": ["x"]}, tmp_path / "out", langs=["en"])


def test_cli_malformed_translations_json(comp, tmp_path):
    (comp / "translations" / "pl.json").write_text("{not json", encoding="utf-8")
    inputs = tmp_path / "inputs.yaml"
    inputs.write_text("name: a\nprefix: p\nlights: []\n", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp),
         "--inputs", str(inputs), "--out", str(tmp_path / "out")],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert result.stderr.startswith("error:") and "pl.json" in result.stderr
    assert "Traceback" not in result.stderr


def test_cli_non_utf8_inputs_file(comp, tmp_path):
    inputs = tmp_path / "inputs.yaml"
    inputs.write_bytes(b"name: \xff\xfe\n")
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp),
         "--inputs", str(inputs), "--out", str(tmp_path / "out")],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert result.stderr.startswith("error:")
    assert "Traceback" not in result.stderr


def test_type_error_outside_yaml_filter_is_not_swallowed(comp, tmp_path):
    _add_template(comp, "boom.yaml.j2", "x: [[ inputs.name + 1 ]]\n")
    with pytest.raises(TypeError):
        dr.render_component(comp, INPUTS, tmp_path / "out")


def test_multiline_nested_flow_list_is_rejected(comp, tmp_path):
    _add_template(comp, "levels.yaml.j2", "a: 1\nb: 2\nlevels: [[\n  80, 90 ]]\n")
    with pytest.raises(dr.RenderError) as exc:
        dr.render_component(comp, INPUTS, tmp_path / "out")
    assert "line 3" in str(exc.value)


def test_multiline_expression_is_not_flagged(comp, tmp_path):
    _add_template(comp, "ml.yaml.j2", "x: [[\n  inputs.name | yaml ]]\n")
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    assert load(out / "ml.yaml") == {"x": "Hall"}


def test_unicode_identifier_is_not_flagged(comp, tmp_path):
    _add_template(comp, "uni.yaml.j2", "x: [[ \u0142azienka | default('ok') ]]\ny: [[\u00e9t\u00e9|default('e')]]\n")
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    assert load(out / "uni.yaml") == {"x": "ok", "y": "e"}


def test_error_names_the_template_once(comp, tmp_path):
    _add_template(comp, "probe.yaml.j2", "levels: [[80]]\n")
    with pytest.raises(dr.RenderError) as exc:
        dr.render_component(comp, INPUTS, tmp_path / "out")
    assert str(exc.value).count("probe.yaml.j2") == 1


def test_cli_template_type_error_prints_error_line(comp, tmp_path):
    _add_template(comp, "boom.yaml.j2", "x: [[ inputs.name + 1 ]]\n")
    inputs = tmp_path / "inputs.yaml"
    inputs.write_text("name: a\nprefix: p\nlights: []\n", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp),
         "--inputs", str(inputs), "--out", str(tmp_path / "out")],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert result.stderr.startswith("error: boom.yaml.j2:")
    assert "Traceback" not in result.stderr


def test_translations_top_level_must_be_an_object(comp, tmp_path):
    (comp / "translations" / "de.json").write_text("[1, 2]", encoding="utf-8")
    with pytest.raises(dr.RenderError, match="de.json"):
        dr.render_component(comp, INPUTS, tmp_path / "out")


def test_none_valued_inputs_are_absent(comp, tmp_path):
    (comp / "templates" / "opt.yaml.j2").write_text(
        "a: [% if inputs.opt is defined %]present[% else %]absent[% endif %]\n"
        "b: [% if inputs.nest.opt is defined %]present[% else %]absent[% endif %]\n"
        "c: [% if inputs.rows[0].opt is defined %]present[% else %]absent[% endif %]\n"
    )
    inputs = dict(INPUTS, opt=None, nest={"opt": None, "keep": 1}, rows=[{"opt": None, "k": 2}])
    dr.render_component(comp, inputs, tmp_path / "out")
    assert load(tmp_path / "out" / "opt.yaml") == {"a": "absent", "b": "absent", "c": "absent"}
    assert inputs["opt"] is None and inputs["nest"] == {"opt": None, "keep": 1}  # the caller's dict is untouched


def git(path, *args):
    return subprocess.run(["git", "-C", str(path), *args], capture_output=True, text=True, check=True).stdout.strip()


def committed(comp):
    git(comp, "init", "-q")
    (comp / "component.yaml").write_text("id: render-comp\nversion: 0.1.0\n")
    git(comp, "add", "-A")
    git(comp, "-c", "user.name=t", "-c", "user.email=t@localhost", "commit", "-qm", "c")
    return git(comp, "rev-parse", "--short", "HEAD")


def test_stamp_is_the_first_line_of_every_file(comp, tmp_path):
    sha = committed(comp)
    out = tmp_path / "out"
    plain = tmp_path / "plain"
    written = dr.render_component(comp, INPUTS, out, stamp=True)
    dr.render_component(comp, INPUTS, plain)
    assert written
    for path in written:
        first, rest = path.read_text(encoding="utf-8").split("\n", 1)
        assert first == f"# Rendered by Domosenso from render-comp@{sha} — do not edit"
        assert rest == (plain / path.relative_to(out)).read_text(encoding="utf-8")
        yaml.safe_load(path.read_text(encoding="utf-8"))  # still YAML


def test_stamp_marks_uncommitted_changes(comp, tmp_path):
    sha = committed(comp)
    (comp / "translations" / "en.json").write_text((comp / "translations" / "en.json").read_text() + "\n")
    path = dr.render_component(comp, INPUTS, tmp_path / "out", ["en"], stamp=True)[0]
    assert path.read_text(encoding="utf-8").startswith(f"# Rendered by Domosenso from render-comp@{sha}-dirty — do not edit\n")


def test_stamp_text_overrides(comp, tmp_path):
    text = "# Rendered by Domosenso from render-comp/0.1.0 (abc1234) — do not edit\n"
    plain = tmp_path / "plain"
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, plain)
    written = dr.render_component(comp, INPUTS, out, stamp_text=text)  # no git needed: stamp_line is not called
    assert written
    for path in written:
        content = path.read_text(encoding="utf-8")
        assert content == text + (plain / path.relative_to(out)).read_text(encoding="utf-8")
    # stamp=True as well: stamp_text wins, stamp_line (and git) is not consulted
    both = dr.render_component(comp, INPUTS, tmp_path / "both", stamp=True, stamp_text=text)
    assert both[0].read_text(encoding="utf-8").startswith(text)


def test_stamp_outside_git_is_an_error(comp, tmp_path):
    with pytest.raises(dr.RenderError, match="git"):
        dr.render_component(comp, INPUTS, tmp_path / "out", stamp=True)


def test_cli_stamp(comp, tmp_path):
    sha = committed(comp)
    inputs = tmp_path / "in.yaml"
    inputs.write_text(yaml.safe_dump(INPUTS))
    run = subprocess.run([sys.executable, str(REPO / "tools" / "domosenso_render.py"), str(comp), "--inputs", str(inputs),
                          "--out", str(tmp_path / "out"), "--lang", "en", "--stamp"], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    assert (tmp_path / "out" / "plain.yaml").read_text(encoding="utf-8").startswith(f"# Rendered by Domosenso from render-comp@{sha} ")


def test_component_global_in_every_template(comp, tmp_path):
    """`component` (id, version from the manifest) is a global of every template, not only device files (SPEC-023)."""
    (comp / "component.yaml").write_text("id: render-comp\nversion: 1.2.3\n", encoding="utf-8")
    (comp / "templates" / "about.yaml.j2").write_text("about: '[[ component.id ]] [[ component.version ]]'\n", encoding="utf-8")
    out = tmp_path / "out"
    dr.render_component(comp, INPUTS, out)
    assert load(out / "about.yaml") == {"about": "render-comp 1.2.3"}


def test_a_template_that_renders_empty_writes_no_file(comp, tmp_path):
    (comp / "templates" / "optional.lang.yaml.j2").write_text(
        "[% if inputs.name == 'Hall' %]title: [[ inputs.name ]]\n[% endif %]\n", encoding="utf-8")
    out = tmp_path / "out"
    written = dr.render_component(comp, INPUTS, out)
    assert out / "optional.en.yaml" in written and load(out / "optional.pl.yaml") == {"title": "Hall"}
    written = dr.render_component(comp, {**INPUTS, "name": "Kitchen"}, out)
    assert not list(out.glob("optional.*")) and all(p.is_file() for p in written)
