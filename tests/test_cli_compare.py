"""`domosenso compare`: two snapshots side by side, differences explained by `equivalence.yaml`."""
import json
import subprocess
from pathlib import Path

from domosenso_cli import main as cli
from domosenso_cli.compare import Diff, diff, explain, sizes

SHA_A = "a" * 64
SHA_B = "b" * 64


def entity(platform: str, unique_id: str | None, from_files: bool = True, state_class: str = "available") -> dict:
    return {"platform": platform, "unique_id": unique_id, "state_class": state_class, "from_files": from_files}


def base() -> dict:
    return {
        "taken_at": "2026-10-21T18:00:00+00:00",
        "ha_version": "2026.9.2",
        "entities": {
            "automation.hall_light": entity("automation", "hall_light_1"),
            "input_select.house_mode": entity("input_select", "house_mode"),
            "sensor.office_comfort": entity("template", "office_comfort"),
            "sensor.living_room_temperature": entity("hue", "hue-1", from_files=False),
        },
        "automations": {
            "automation.hall_light": {"id": "hall_light_1", "state": "on", "loaded": True,
                                      "config_sha256": SHA_A, "last_triggered": None},
        },
        "scripts": {},
        "helpers": {"input_select.house_mode": {"options": ["home", "away", "night"]}},
        "dashboards": {"dashboard-ramka": {"title": "Ramka", "icon": "mdi:tablet", "require_admin": False,
                                           "config_sha256": SHA_A}},
        "resources": [{"url_no_query": "/local/radar-card.js", "type": "module"}],
        "config_entries": [{"domain": "hue", "title": "Hue Bridge", "state": "loaded"}],
        "errors": [],
        "profiles": {},
    }


def kinds(diffs: list[Diff]) -> list[tuple[str, str, str]]:
    return [(d.part, d.id, d.kind) for d in diffs]


def test_identical_snapshots_equivalent():
    assert diff(base(), base()) == []


def test_integration_entities_ignored():
    b = base()
    del b["entities"]["sensor.living_room_temperature"]
    b["config_entries"] = []
    assert diff(base(), b) == []


def test_only_in_a_reported():
    b = base()
    del b["entities"]["sensor.office_comfort"]
    assert kinds(diff(base(), b)) == [
        ("entities", "sensor.office_comfort", "only-in-a"),
        ("unique_ids", "template:office_comfort", "only-in-a"),
    ]


def test_only_in_b_reported():
    b = base()
    b["dashboards"]["dashboard-plants"] = {"title": "Plants", "icon": None, "require_admin": False,
                                           "config_sha256": SHA_B}
    assert kinds(diff(base(), b)) == [("dashboards", "dashboard-plants", "only-in-b")]


def test_unavailable_automation_is_not_loaded():
    b = base()
    b["automations"]["automation.hall_light"].update(state="unavailable", loaded=False, config_sha256=None)
    assert kinds(diff(base(), b)) == [("automations", "automation.hall_light", "not-loaded")]
    assert "not loaded in b" in diff(base(), b)[0].detail


def test_automation_config_and_state_differ():
    b = base()
    b["automations"]["automation.hall_light"]["config_sha256"] = SHA_B
    b["automations"]["automation.hall_light"]["state"] = "off"
    [d] = diff(base(), b)
    assert (d.part, d.kind) == ("automations", "config-differs")
    assert "config" in d.detail and "state on → off" in d.detail


def test_changed_unique_id_fails():
    b = base()
    b["entities"]["sensor.office_comfort"]["unique_id"] = "office_comfort_v2"
    [d] = diff(base(), b)
    assert (d.part, d.id, d.kind) == ("unique_ids", "sensor.office_comfort", "unique-id-differs")
    assert "template:office_comfort" in d.detail and "template:office_comfort_v2" in d.detail


def test_renamed_entity_keeps_unique_id():
    b = base()
    b["entities"]["sensor.office_comfort_index"] = b["entities"].pop("sensor.office_comfort")
    assert kinds(diff(base(), b)) == [
        ("entities", "sensor.office_comfort", "only-in-a"),
        ("entities", "sensor.office_comfort_index", "only-in-b"),
    ]


def test_options_order_matters():
    b = base()
    b["helpers"]["input_select.house_mode"]["options"] = ["away", "home", "night"]
    [d] = diff(base(), b)
    assert (d.part, d.id, d.kind) == ("helpers", "input_select.house_mode", "options-differ")
    assert "options" in d.detail


def test_resource_type_differs():
    b = base()
    b["resources"] = [{"url_no_query": "/local/radar-card.js", "type": "js"}]
    assert kinds(diff(base(), b)) == [("resources", "/local/radar-card.js", "config-differs")]


def test_explained_difference_passes():
    b = base()
    del b["entities"]["sensor.office_comfort"]
    entries = [
        {"part": "entities", "id": "sensor.office_comfort", "kind": "removed", "reason": "replaced by the catalog"},
        {"part": "unique_ids", "id": "template:office_comfort", "kind": "ignore", "reason": "goes with it"},
    ]
    unexplained, stale = explain(diff(base(), b), entries, None)
    assert unexplained == [] and stale == []


def test_renamed_explains_both_sides():
    b = base()
    b["entities"]["sensor.office_comfort_index"] = b["entities"].pop("sensor.office_comfort")
    entries = [{"part": "entities", "id": "sensor.office_comfort", "kind": "renamed",
                "to": "sensor.office_comfort_index", "reason": "catalog name"}]
    assert explain(diff(base(), b), entries, None) == ([], [])


def test_wrong_kind_does_not_explain():
    b = base()
    del b["entities"]["sensor.office_comfort"]
    entries = [{"part": "entities", "id": "sensor.office_comfort", "kind": "added", "reason": "x"}]
    unexplained, stale = explain(diff(base(), b), entries, None)
    assert ("entities", "sensor.office_comfort", "only-in-a") in kinds(unexplained)
    assert stale == entries


def test_stale_explanation_warned():
    entries = [{"part": "entities", "id": "sensor.gone", "kind": "ignore", "reason": "old"}]
    assert explain([], entries, None) == ([], entries)


def test_after_restart_entry_is_not_an_explanation():
    entries = [{"part": "entities", "id": "sensor.wind", "after_restart": "unknown", "reason": "next report"}]
    assert explain([], entries, None) == ([], [])


def test_config_explanation_invalidated_by_new_commit():
    b = base()
    b["automations"]["automation.hall_light"]["config_sha256"] = SHA_B
    diffs = diff(base(), b)
    entry = {"part": "automations", "id": "automation.hall_light", "kind": "config", "reason": "same behaviour",
             "reviewed_at": "1234567"}
    assert explain(diffs, [entry], "1234567890abcdef") == ([], [])
    unexplained, stale = explain(diffs, [entry], "fedcba0987654321")
    assert kinds(unexplained) == [("automations", "automation.hall_light", "config-differs")]
    assert stale == [entry]
    # No commit known: only an entry without reviewed_at counts.
    assert explain(diffs, [entry], None)[0] == diffs
    unreviewed = {k: v for k, v in entry.items() if k != "reviewed_at"}
    assert explain(diffs, [unreviewed], None) == ([], [])
    assert explain(diffs, [unreviewed], "fedcba0987654321")[0] == diffs


def write(path: Path, data: dict) -> Path:
    path.write_text(json.dumps(data))
    return path


def test_command_equivalent(tmp_path, capsys):
    a, b = write(tmp_path / "a.json", base()), write(tmp_path / "b.json", base())
    assert cli.main(["--home", str(tmp_path), "compare", str(a), str(b)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert "ok entities (3)" in lines
    assert "ok automations (1)" in lines
    assert lines[-2:] == ["equivalent", "ok"]


def test_command_not_equivalent_with_explanations(tmp_path, capsys):
    b = base()
    del b["entities"]["sensor.office_comfort"]
    b["helpers"]["input_select.house_mode"]["options"] = ["away", "home", "night"]
    (tmp_path / "domosenso").mkdir()
    explanations = tmp_path / "domosenso" / "equivalence.yaml"
    explanations.write_text(
        "entries:\n"
        "  - {part: entities, id: sensor.office_comfort, kind: removed, reason: replaced}\n"
        "  - {part: dashboards, id: dashboard-old, kind: ignore, reason: gone}\n"
    )
    pa, pb = write(tmp_path / "a.json", base()), write(tmp_path / "b.json", b)
    assert cli.main(["--home", str(tmp_path), "compare", str(pa), str(pb), "--explain", str(explanations)]) == 1
    lines = capsys.readouterr().out.splitlines()
    assert "ok entities (3)" in lines
    assert "FAIL unique_ids: 1 differences" in lines
    assert "only-in-a unique_ids template:office_comfort sensor.office_comfort" in lines
    assert "FAIL helpers: 1 differences" in lines
    assert "warning stale explanation dashboards dashboard-old" in lines
    assert lines[-1] == "FAIL not equivalent: 2 unexplained"


def test_command_json(tmp_path, capsys):
    b = base()
    del b["entities"]["sensor.office_comfort"]
    pa, pb = write(tmp_path / "a.json", base()), write(tmp_path / "b.json", b)
    assert cli.main(["--home", str(tmp_path), "compare", str(pa), str(pb), "--json"]) == 1
    doc = json.loads(capsys.readouterr().out)
    assert doc["reason"] == "not equivalent: 2 unexplained"
    assert doc["data"][0]["unexplained"][0] == {
        "part": "entities", "id": "sensor.office_comfort", "kind": "only-in-a", "detail": "",
    }


def test_command_rejects_bad_explanation_file(tmp_path, capsys):
    explanations = tmp_path / "equivalence.yaml"
    explanations.write_text("entries:\n  - {part: entities, id: x, kind: sideways, reason: r}\n")
    pa, pb = write(tmp_path / "a.json", base()), write(tmp_path / "b.json", base())
    assert cli.main(["--home", str(tmp_path), "compare", str(pa), str(pb), "--explain", str(explanations)]) == 1
    assert capsys.readouterr().out.splitlines()[-1].startswith("FAIL equivalence.yaml: entries.0.kind")


def test_command_reads_commit_of_config_dir(tmp_path, capsys):
    """A `config` entry reviewed at the commit that last touched the home's config tree matches."""
    home = tmp_path / "home"
    (home / "home-assistant").mkdir(parents=True)
    (home / "home-assistant" / "configuration.yaml").write_text("homeassistant:\n")
    (home / "domosenso.yaml").write_text(
        "catalog: ../c\nconfig_dir: home-assistant\nesphome_dir: esphome\ntargets: {}\ncomponents: {}\n")
    git = ["git", "-C", str(home), "-c", "user.name=t", "-c", "user.email=t@t"]
    subprocess.run([*git, "init", "-q"], check=True)
    subprocess.run([*git, "add", "."], check=True)
    subprocess.run([*git, "commit", "-qm", "c"], check=True)
    head = subprocess.run([*git, "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    b = base()
    b["automations"]["automation.hall_light"]["config_sha256"] = SHA_B
    explanations = tmp_path / "eq.yaml"
    explanations.write_text(
        f"entries:\n  - {{part: automations, id: automation.hall_light, kind: config, reason: r, reviewed_at: '{head[:10]}'}}\n")
    pa, pb = write(tmp_path / "a.json", base()), write(tmp_path / "b.json", b)
    assert cli.main(["--home", str(home), "compare", str(pa), str(pb), "--explain", str(explanations)]) == 0
    assert capsys.readouterr().out.splitlines()[-2:] == ["equivalent", "ok"]


def test_mirrored_state_of_an_integration_entity_not_compared():
    """Staging's mirror posts production's integration states over the REST API: on staging they have
    no registry entry, so its snapshot counts them as from files; production knows they are not."""
    b = base()
    b["entities"]["sensor.living_room_temperature"] = entity("sensor", None)  # mirrored, registry-less
    assert diff(base(), b) == []
    assert sizes(base(), b)["entities"] == 3


def test_registry_less_entity_on_both_sides_compared():
    a, b = base(), base()
    a["entities"]["sensor.legacy_template"] = entity("sensor", None)  # YAML without unique_id
    assert kinds(diff(a, b)) == [("entities", "sensor.legacy_template", "only-in-a")]


def test_renamed_needs_both_halves():
    b = base()
    del b["entities"]["sensor.office_comfort"]  # only the a half: the new id never appeared
    entry = {"part": "entities", "id": "sensor.office_comfort", "kind": "renamed",
             "to": "sensor.office_comfort_index", "reason": "catalog name"}
    unexplained, stale = explain(diff(base(), b), [entry], None)
    assert ("entities", "sensor.office_comfort", "only-in-a") in kinds(unexplained)
    assert stale == [entry]
    c = base()
    c["entities"]["sensor.office_comfort_index"] = entity("template", "office_comfort")  # only the b half
    unexplained, stale = explain(diff(base(), c), [entry], None)
    assert ("entities", "sensor.office_comfort_index", "only-in-b") in kinds(unexplained)
    assert stale == [entry]


def test_config_explanation_commit_per_entry():
    b = base()
    b["automations"]["automation.hall_light"]["config_sha256"] = SHA_B
    diffs = diff(base(), b)
    entry = {"part": "automations", "id": "automation.hall_light", "kind": "config", "reason": "same",
             "reviewed_at": "aaaaaaa"}
    seen = []

    def commit_of(e):
        seen.append(e["id"])
        return "aaaaaaa1234"

    assert explain(diffs, [entry], commit_of) == ([], [])
    assert seen == ["automation.hall_light"]


def git_home(tmp_path: Path) -> tuple[Path, list[str]]:
    home = tmp_path / "home"
    (home / "home-assistant" / "packages").mkdir(parents=True)
    (home / "domosenso.yaml").write_text(
        "catalog: ../c\nconfig_dir: home-assistant\nesphome_dir: esphome\ntargets: {}\ncomponents: {}\n")
    (home / "home-assistant" / "packages" / "hall.yaml").write_text(
        "automation:\n  - id: hall_light_1\n    alias: Hall light\n")
    (home / "home-assistant" / "packages" / "other.yaml").write_text("automation:\n  - id: 'other_1'\n")
    git = ["git", "-C", str(home), "-c", "user.name=t", "-c", "user.email=t@t"]
    subprocess.run([*git, "init", "-q"], check=True)
    subprocess.run([*git, "add", "."], check=True)
    subprocess.run([*git, "commit", "-qm", "c1"], check=True)
    return home, git


def head(git: list[str]) -> str:
    return subprocess.run([*git, "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()


def compare_with_config_entry(tmp_path, home, reviewed_at: str, extra: str = "") -> int:
    b = base()
    b["automations"]["automation.hall_light"]["config_sha256"] = SHA_B
    explanations = tmp_path / "eq.yaml"
    explanations.write_text(
        "entries:\n  - {part: automations, id: automation.hall_light, kind: config, reason: r, "
        f"reviewed_at: '{reviewed_at}'{extra}}}\n")
    pa, pb = write(tmp_path / "a.json", base()), write(tmp_path / "b.json", b)
    return cli.main(["--home", str(home), "compare", str(pa), str(pb), "--explain", str(explanations)])


def test_config_entry_bound_to_the_file_that_defines_the_automation(tmp_path, capsys):
    home, git = git_home(tmp_path)
    reviewed = head(git)[:12]
    (home / "home-assistant" / "packages" / "other.yaml").write_text("automation:\n  - id: 'other_2'\n")
    subprocess.run([*git, "commit", "-qam", "another component"], check=True)
    assert compare_with_config_entry(tmp_path, home, reviewed) == 0  # another file's commit: still valid
    (home / "home-assistant" / "packages" / "hall.yaml").write_text(
        "automation:\n  - id: hall_light_1\n    alias: Hall light, changed\n")
    assert compare_with_config_entry(tmp_path, home, reviewed) == 1  # uncommitted change of the file
    subprocess.run([*git, "commit", "-qam", "hall changed"], check=True)
    assert compare_with_config_entry(tmp_path, home, reviewed) == 1  # committed change of the file
    assert compare_with_config_entry(tmp_path, home, head(git)[:12]) == 0
    capsys.readouterr()


def test_config_entry_names_its_file(tmp_path, capsys):
    home, git = git_home(tmp_path)
    reviewed = head(git)[:12]
    (home / "home-assistant" / "packages" / "hall.yaml").write_text("automation:\n  - id: hall_light_1\n    alias: x\n")
    subprocess.run([*git, "commit", "-qam", "hall changed"], check=True)
    # The entry names other.yaml: hall.yaml's new commit does not concern it.
    assert compare_with_config_entry(tmp_path, home, reviewed, ", file: packages/other.yaml") == 0
    capsys.readouterr()
