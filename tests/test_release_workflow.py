"""The Release workflow (SPEC-027) and the hold list it shares with the Release reminder."""
import re
import subprocess
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
WORKFLOWS = REPO / ".github" / "workflows"


def workflow(name: str) -> dict:
    data = yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))
    data["on"] = data.pop(True, data.get("on"))   # YAML 1.1 reads `on:` as true
    return data


def scripts(data: dict) -> list[str]:
    return [step["run"] for job in data["jobs"].values() for step in job["steps"] if "run" in step]


def test_release_runs_after_the_website_check_on_main_one_at_a_time():
    data = workflow("release.yml")
    assert data["on"]["workflow_run"] == {"workflows": ["Framework website"], "types": ["completed"]}
    assert "workflow_dispatch" in data["on"]
    assert data["concurrency"] == {"group": "release", "cancel-in-progress": False}
    condition = data["jobs"]["release"]["if"]
    for part in ("conclusion == 'success'", "event == 'push'", "head_branch == 'main'"):
        assert part in condition
    # The workflow's names match the workflows they wait for.
    assert workflow("website.yml")["name"] == "Framework website"


def test_release_has_only_the_permissions_it_uses():
    assert workflow("release.yml")["permissions"] == {"contents": "write", "pull-requests": "write", "actions": "write"}


def test_release_tags_with_the_full_gate_and_never_forces():
    text = "\n".join(scripts(workflow("release.yml")))
    assert 'uv run tools/release.py "$id"' in text and "--skip-checks" not in text.replace("not --skip-checks", "")
    assert 'git push origin "refs/tags/$tag"' in text
    assert 'uv run tools/publish_release.py "$id"' in text
    assert "gh workflow run release-reminder.yml" in text
    pushes = re.findall(r"git push[^\n;]*", text)
    assert len(pushes) == 2   # the tag, the website branch
    for push in pushes:
        for forbidden in (r"\s(--force|-f|--force-with-lease|--delete|-d|--mirror|--tags)\b", r"\bmain\b", r"\+"):
            assert not re.search(forbidden, push), (push, forbidden)


def test_scratch_files_stay_out_of_the_checkout():
    """release.py refuses a checkout with untracked files."""
    text = "\n".join(scripts(workflow("release.yml")))
    for name in ("status.txt", "untagged.txt", "body.md"):
        assert re.findall(rf'\S*{re.escape(name)}', text) and all(
            "$RUNNER_TEMP" in m for m in re.findall(rf'"?\S*{re.escape(name)}"?', text)), name


def test_every_step_is_valid_bash():
    for name in ("release.yml", "release-reminder.yml"):
        for script in scripts(workflow(name)):
            result = subprocess.run(["bash", "-n"], input=script, capture_output=True, text=True)
            assert result.returncode == 0, (name, result.stderr)


def test_both_workflows_read_the_one_hold_list():
    ids = [line for line in (REPO / ".github" / "release-hold").read_text().splitlines() if line and not line.startswith("#")]
    assert ids == ["remote-access"]
    for name in ("release.yml", "release-reminder.yml"):
        text = "\n".join(scripts(workflow(name)))
        assert "grep -v '^#' .github/release-hold" in text, name
        assert "HOLD" not in text, name
