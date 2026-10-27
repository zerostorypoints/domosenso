"""The GitHub issue forms in .github/ISSUE_TEMPLATE/ follow docs/ISSUES.md, so an issue filed through
any of them can pass tools/issue_check.py."""
from pathlib import Path

import pytest
import yaml

import issue_check as ic

REPO = Path(__file__).resolve().parent.parent
FORMS_DIR = REPO / ".github" / "ISSUE_TEMPLATE"
FORMS = sorted(FORMS_DIR.glob("*.yml"))
FORMS = [f for f in FORMS if f.name != "config.yml"]
# Labels that exist on the GitHub repository; a form must not ask for one that does not.
LABELS = {"bug", "enhancement", "documentation"}


def load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def fields(form: dict) -> list[dict]:
    return [f for f in form["body"] if f["type"] != "markdown"]


def test_the_four_forms_and_no_blank_issues():
    assert {f.name for f in FORMS} == {"bug.yml", "enhancement.yml", "new-device-or-component.yml", "docs.yml"}
    assert load(FORMS_DIR / "config.yml")["blank_issues_enabled"] is False


@pytest.mark.parametrize("path", FORMS, ids=lambda p: p.name)
def test_a_form_has_every_section_its_type_requires(path):
    form = load(path)
    labels = [f["attributes"]["label"] for f in fields(form)]
    for kind in type_options(form):
        for section in ic.required_sections(kind):
            assert section in labels, f"{path.name} ({kind}): no field '{section}'"
    assert {"Type", "Area", "Spec needed"} <= set(labels)


@pytest.mark.parametrize("path", FORMS, ids=lambda p: p.name)
def test_required_fields_are_required(path):
    form = load(path)
    for f in fields(form):
        label = f["attributes"]["label"]
        if f["type"] == "checkboxes":
            continue  # required per option: test_the_privacy_box_is_a_required_checkbox
        if label in ic.required_sections("bug" if path.name == "bug.yml" else "enhancement") | {"Type", "Area", "Spec needed"}:
            assert f.get("validations", {}).get("required") is True, f"{path.name}: '{label}' is optional"


@pytest.mark.parametrize("path", FORMS, ids=lambda p: p.name)
def test_the_privacy_box_is_a_required_checkbox(path):
    privacy = [f for f in fields(load(path)) if f["attributes"]["label"] == "Privacy check"]
    assert len(privacy) == 1 and privacy[0]["type"] == "checkboxes"
    assert all(o.get("required") is True for o in privacy[0]["attributes"]["options"])


@pytest.mark.parametrize("path", FORMS, ids=lambda p: p.name)
def test_labels_exist_and_types_are_known(path):
    form = load(path)
    assert set(form.get("labels", [])) <= LABELS
    for option in type_options(form):
        assert ic.kind_of(option) in ic.KINDS


@pytest.mark.parametrize("path", FORMS, ids=lambda p: p.name)
def test_a_filled_form_passes_the_checker(path):
    """Fill every field the way GitHub renders it (### label, then the answer) and check the body."""
    form = load(path)
    for kind in type_options(form):
        report = ic.check(render_filled(form, kind), title=f"{path.stem}: a filled form")
        assert report.errors == [], f"{path.name} ({kind}): {report.errors}"


def type_options(form: dict) -> list[str]:
    [field] = [f for f in fields(form) if f["attributes"]["label"] == "Type"]
    return field["attributes"]["options"]


ANSWERS = {
    "Acceptance criteria": "- [ ] Given A, when B, then `C` is printed.\n- [ ] Given D, then E.",
    "Tests required": "- [ ] `tests/test_x.py`: covers A; it fails before the change.",
    "Alternatives considered": "- Doing nothing: the problem stays.",
    "Spec needed": "no",
    "User story": "As a home owner, I want A, so that B.",
}


def render_filled(form: dict, kind: str) -> str:
    out = []
    for f in fields(form):
        label = f["attributes"]["label"]
        if f["type"] == "checkboxes":
            answer = "\n".join(f"- [x] {o['label']}" for o in f["attributes"]["options"])
        elif label == "Type":
            answer = kind
        elif f["type"] == "dropdown":
            answer = f["attributes"]["options"][0]
        else:
            answer = ANSWERS.get(label, f"An answer for {label.lower()}.")
        out.append(f"### {label}\n\n{answer}\n")
    return "\n".join(out)
