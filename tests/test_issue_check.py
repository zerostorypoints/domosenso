"""tools/issue_check.py: an issue body checked against docs/ISSUES.md."""
import json

import pytest

import issue_check as ic

GOOD = """\
# verify: wait until Home Assistant is RUNNING before judging entities

**Type:** bug · **Area:** `domosenso verify` · **Spec needed:** no

## Summary

`verify` right after a restart fails on entities that come back on their own.

## Problem statement

The first `verify` failed after 6 of 7 deploys on entities that recovered within minutes.

## Evidence

```
FAIL entities: 5 differences
```

## Value proposition

Maintainers and agents can trust the first `FAIL`.

## Proposed solution

Wait for `RUNNING`, then re-read failing entities for a bounded window.

## Alternatives considered

- Document "ignore the first verify": keeps the noise.

## Acceptance criteria

- [ ] Given a target in `NOT_RUNNING`, `verify` prints `wait running <s>` before reading entities.
- [ ] Given `--settle 0`, the output is today's, byte for byte.

## Tests required

- [ ] `tests/test_cli_verify.py`: a fake target that is `NOT_RUNNING` twice; it fails before the change.

## Compatibility and upgrade

Additive: a new option and new report lines.

## Privacy check

- [x] No real names, rooms, entity ids, addresses or photos.

## Environment

HA 2026.9.2 Container; catalog at `ramka/0.3.0`.
"""


def drop(text: str, heading: str) -> str:
    """The body without one `## <heading>` section."""
    head, rest = text.split(f"## {heading}\n", 1)
    tail = rest.split("\n## ", 1)
    return head + ("## " + tail[1] if len(tail) > 1 else "")


def run(text: str, **kw) -> ic.Report:
    return ic.check(text, **kw)


def test_a_complete_bug_passes():
    r = run(GOOD)
    assert r.errors == [] and r.warnings == []
    assert r.title.startswith("verify: wait") and r.kind == "bug"


@pytest.mark.parametrize("heading", ["Summary", "Problem statement", "Value proposition", "Proposed solution",
                                     "Alternatives considered", "Acceptance criteria", "Tests required",
                                     "Compatibility and upgrade", "Privacy check", "Evidence", "Environment"])
def test_every_required_section_of_a_bug_is_required(heading):
    slug = ic.slug(heading)
    assert any(e.startswith(f"{slug}:") for e in run(drop(GOOD, heading)).errors)


def test_evidence_and_environment_are_required_for_bugs_only():
    body = drop(drop(GOOD, "Evidence"), "Environment").replace("**Type:** bug", "**Type:** enhancement")
    assert run(body).errors == []


def test_issue_forms_headings_and_fields_count_like_markdown():
    form = GOOD.replace("## ", "### ").replace(
        "**Type:** bug · **Area:** `domosenso verify` · **Spec needed:** no\n",
        "### Type\n\nbug\n\n### Area\n\n`domosenso verify`\n\n### Spec needed\n\nno\n")
    r = run(form)
    assert r.errors == [] and r.kind == "bug" and r.spec == "no"


def test_an_empty_form_answer_is_missing():
    body = GOOD.replace("Wait for `RUNNING`, then re-read failing entities for a bounded window.", "_No response_")
    assert "proposed-solution: empty" in run(body).errors


def test_type_area_and_spec_are_required_and_type_must_be_known():
    errors = run(GOOD.replace("**Type:** bug · **Area:** `domosenso verify` · **Spec needed:** no\n", "")).errors
    assert {"type: missing", "area: missing", "spec-needed: missing"} <= set(errors)
    assert "type: unknown 'wish' (bug, enhancement, new, docs)" in run(GOOD.replace("**Type:** bug", "**Type:** wish")).errors


@pytest.mark.parametrize("written, kind", [("bug", "bug"), ("enhancement (false positives)", "enhancement"),
                                           ("new device / integration", "new"), ("new component", "new"),
                                           ("process / docs", "docs"), ("docs", "docs")])
def test_type_is_read_from_its_first_words(written, kind):
    assert run(GOOD.replace("**Type:** bug", f"**Type:** {written}")).kind == kind


def test_a_label_gives_the_type_when_the_body_has_none():
    body = GOOD.replace("**Type:** bug · ", "")
    assert run(body, labels=["bug"]).kind == "bug"


def test_spec_needed_must_be_yes_or_no():
    assert "spec-needed: say yes or no, not 'maybe'" in run(GOOD.replace("**Spec needed:** no", "**Spec needed:** maybe")).errors
    assert run(GOOD.replace("**Spec needed:** no", "**Spec needed:** yes (input schema change)")).spec == "yes"


def test_acceptance_criteria_need_checkboxes():
    body = GOOD.replace("- [ ] Given a target", "Given a target").replace("- [ ] Given `--settle 0`", "Given `--settle 0`")
    assert "acceptance-criteria: no checkbox item (- [ ])" in run(body).errors
    one = GOOD.replace("- [ ] Given `--settle 0`, the output is today's, byte for byte.\n", "")
    assert "acceptance-criteria: only one criterion" in run(one).warnings


def test_vague_acceptance_criteria_warn():
    body = GOOD.replace("byte for byte.", "byte for byte and it works correctly.")
    assert any(w.startswith("acceptance-criteria: vague") for w in run(body).warnings)


def test_tests_need_a_checkbox_and_a_named_check():
    body = GOOD.replace("- [ ] `tests/test_cli_verify.py`: a fake target", "Some testing of a fake target")
    errors = run(body).errors
    assert "tests-required: no checkbox item (- [ ])" in errors
    assert any(e.startswith("tests-required: names no test or check") for e in errors)


def test_a_bug_fix_test_must_fail_first():
    body = GOOD.replace("; it fails before the change", "")
    assert "tests-required: say that the test fails before the fix" in run(body).errors
    assert "tests-required: say that the tests fail before the change" in run(
        body.replace("**Type:** bug", "**Type:** enhancement")).warnings


def test_privacy_must_be_ticked():
    assert "privacy-check: not ticked (- [x])" in run(GOOD.replace("- [x] No real", "- [ ] No real")).errors


@pytest.mark.parametrize("leak, rule", [("10.20.30.40", "an IP address"), ("02:00:5e:10:00:01", "a MAC address"),
                                        ("alex@gmail.com", "an e-mail address"), ("/Users/alex/home", "a home directory"),
                                        ("gho_" + "a" * 30, "a token")])
def test_privacy_leaks_are_errors(leak, rule):
    errors = run(GOOD.replace("re-read failing entities", f"re-read {leak} entities")).errors
    assert f"privacy: {rule} on line 25" in errors


@pytest.mark.parametrize("fine", ["127.0.0.1", "192.0.2.10", "http://homeassistant.local:8123", "noreply@anthropic.com",
                                  "alex@example.com", "2026.9.2", "/Users/<name>/x"])
def test_documentation_values_are_not_leaks(fine):
    assert run(GOOD.replace("re-read failing entities", f"re-read {fine} entities")).errors == []


def test_extra_household_words_from_a_file(tmp_path):
    words = tmp_path / "words.txt"
    words.write_text("# the home's own words\nHollowmere\n\n", encoding="utf-8")
    body = GOOD.replace("re-read failing entities", "re-read hollowmere entities")
    assert "privacy: a household word ('Hollowmere') on line 25" in run(body, forbidden=ic.read_words(words)).errors


def test_title_shape_warns():
    assert run(GOOD).warnings == []
    assert any(w.startswith("title:") for w in run(GOOD.replace("# verify: wait", "# Wait")).warnings)
    assert any(w.startswith("title:") for w in run(GOOD, title="verify: wait.").warnings)


def test_a_user_story_is_recommended_for_enhancements_and_new_work():
    body = GOOD.replace("**Type:** bug", "**Type:** enhancement")
    assert "user-story: none (As a <who>, I want <what>, so that <why>)" in run(body).warnings
    story = body.replace("## Problem statement", "## User story\n\nAs a home owner, I want X, so that Y.\n\n## Problem statement")
    assert run(story).warnings == []


def test_the_report_ends_ok_or_fail():
    assert ic.render(run(GOOD))[-1] == "ok"
    bad = ic.render(run(drop(GOOD, "Summary")))
    assert bad[-1] == "FAIL 1 error(s)" and "error summary: missing" in bad


def test_main_reads_a_file_and_prints_json(tmp_path, capsys):
    f = tmp_path / "issue.md"
    f.write_text(GOOD, encoding="utf-8")
    assert ic.main([str(f), "--json"]) == 0
    doc = json.loads(capsys.readouterr().out)
    assert doc["result"] == "ok" and doc["type"] == "bug" and doc["errors"] == []


def test_main_exits_1_on_errors(tmp_path, capsys):
    f = tmp_path / "issue.md"
    f.write_text(drop(GOOD, "Summary"), encoding="utf-8")
    assert ic.main([str(f)]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "FAIL 1 error(s)"


def test_main_reads_a_github_issue_through_gh(monkeypatch, capsys):
    seen = {}

    def fake_gh(args):
        seen["args"] = args
        return json.dumps({"title": "verify: wait until RUNNING", "body": GOOD.split("\n", 2)[2], "labels": [{"name": "bug"}]})

    monkeypatch.setattr(ic, "gh", fake_gh)
    assert ic.main(["--issue", "49", "--repo", "zerostorypoints/domosenso"]) == 0
    assert seen["args"][:3] == ["issue", "view", "49"] and "zerostorypoints/domosenso" in seen["args"]
    assert capsys.readouterr().out.splitlines()[-1] == "ok"
