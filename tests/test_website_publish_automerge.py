"""Fail-closed decisions for the automated website release PR."""
from pathlib import Path

import pytest

from test_publish_release import git, read, repo, write  # noqa: F401
import publish_release
from test_release_workflow import workflow

REPOSITORY = "example/framework"
BRANCH = "release/website-radio-1.1.0"
BOT = "framework-publisher"
SHA = "a" * 40


def test_automatic_merge_uses_both_checks_and_protected_environment():
    data = workflow("website-publish-automerge.yml")
    assert set(data["on"]["workflow_run"]["workflows"]) == {"Framework checks", "Framework website"}
    assert data["permissions"] == {"actions": "read", "contents": "read", "pull-requests": "read"}
    validation = data["jobs"]["validate"]
    assert validation["steps"][0]["with"] == {
        "ref": "main", "fetch-depth": 0, "persist-credentials": False,
    }
    merge = data["jobs"]["merge"]
    assert merge["needs"] == "validate"
    assert merge["environment"] == "website-publish"
    assert merge["steps"][0]["with"]["permission-contents"] == "write"
    assert "steps.token.outputs.app-slug" in merge["steps"][1]["env"]["MERGE_APP_SLUG"]
    merge_script = merge["steps"][1]["run"]
    assert "-f sha=\"$PR_SHA\"" in merge_script
    for condition in ('.base.ref == "main"', '.base.repo.full_name == $repo', '.head.sha == $head'):
        assert condition in merge_script.split('gh api --method PUT')[0]
    assert not any(step.get("uses", "").startswith("actions/checkout") for step in merge["steps"])


def pull():
    return {
        "number": 123, "state": "open", "draft": False, "title": "website: publish radio 1.1.0",
        "head": {"ref": BRANCH, "sha": SHA, "repo": {"full_name": REPOSITORY}},
        "base": {"ref": "main", "sha": "b" * 40, "repo": {"full_name": REPOSITORY}},
        "user": {"login": BOT + "[bot]", "type": "Bot"}, "labels": [{"name": "website-publish"}],
    }


@pytest.mark.parametrize(("field", "value"), [
    ("user", {"login": "alice", "type": "User"}),
    ("user", {"login": "github-actions[bot]", "type": "Bot"}),
    ("title", "An editorial release"),
    ("labels", []),
    ("draft", True),
    ("head", {"ref": BRANCH, "sha": SHA, "repo": {"full_name": "fork/framework"}}),
    ("base", {"ref": "other", "sha": "b" * 40, "repo": {"full_name": REPOSITORY}}),
])
def test_only_a_designated_release_bot_pr_can_qualify(field, value):
    from website_publish_automerge import eligible_pull

    pr = pull()
    assert eligible_pull(pr, REPOSITORY, BOT, BRANCH, SHA)
    pr[field] = value
    assert not eligible_pull(pr, REPOSITORY, BOT, BRANCH, SHA)


def run(filename, **changes):
    return {**{
        "path": f".github/workflows/{filename}", "event": "pull_request", "head_branch": BRANCH,
        "head_sha": SHA, "head_repository": {"full_name": REPOSITORY},
        "status": "completed", "conclusion": "success",
        "jobs": [{"name": {"check.yml": "framework", "website.yml": "website"}[filename],
                  "status": "completed", "conclusion": "success"}],
    }, **changes}


def test_both_actual_workflows_must_pass_for_this_pr_head():
    from website_publish_automerge import green_checks

    green = {"check.yml": run("check.yml"), "website.yml": run("website.yml")}
    assert green_checks(green, REPOSITORY, BRANCH, SHA)
    assert not green_checks({"check.yml": green["check.yml"]}, REPOSITORY, BRANCH, SHA)
    for change in [
        {"conclusion": "failure"}, {"conclusion": "skipped"}, {"status": "in_progress"},
        {"head_sha": "c" * 40}, {"head_branch": "other"}, {"path": ".github/workflows/demo.yml"},
        {"event": "push"}, {"head_repository": None},
        {"jobs": []}, {"jobs": [{"name": "website", "status": "completed", "conclusion": "skipped"}]},
    ]:
        assert not green_checks({**green, "website.yml": run("website.yml", **change)}, REPOSITORY, BRANCH, SHA)


@pytest.mark.parametrize("edit", ["none", "editorial", "outside-website", "mode", "extra-commit", "no-update", "older-tag"])
def test_requires_the_exact_generated_tree(repo, edit):
    from website_publish_automerge import verify_tree

    base = git(repo, "rev-parse", "HEAD")
    git(repo, "switch", "-qc", BRANCH)
    if edit not in ("no-update", "older-tag"):
        publish_release.publish(repo, "radio")
    if edit == "editorial":
        data = read(repo, "components/radio.json")
        data["outcome"] = "handwritten edit"
        write(repo / "website/content/components/radio.json", data)
    if edit == "outside-website":
        (repo / "unexpected.py").write_text("print('unexpected')\n")
    if edit == "mode":
        (repo / "website/content/components/radio.json").chmod(0o755)
    if edit == "older-tag":
        data = read(repo, "publication.json")
        data["components"][0]["version"] = "0.9.0"
        write(repo / "website/content/publication.json", data)
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "candidate", "--allow-empty")
    if edit == "extra-commit":
        git(repo, "commit", "-qm", "additional commit", "--allow-empty")
    head = git(repo, "rev-parse", "HEAD")
    git(repo, "switch", "-q", "main")

    def export(path: Path):
        assert path == repo
        assert git(repo, "rev-parse", "HEAD") == base

    assert verify_tree(repo, base, head, export=export) is (edit == "none")


def test_a_failed_trusted_export_can_never_authorize_a_merge(repo):
    from website_publish_automerge import verify_tree

    base = git(repo, "rev-parse", "HEAD")
    git(repo, "switch", "-qc", BRANCH)
    publish_release.publish(repo, "radio")
    git(repo, "commit", "-qam", "candidate")
    head = git(repo, "rev-parse", "HEAD")
    git(repo, "switch", "-q", "main")

    def export(path):
        raise ValueError("The release tag is absent from the remote")

    with pytest.raises(ValueError, match="absent from the remote"):
        verify_tree(repo, base, head, export=export)


def test_release_uses_app_for_publication_prs_only_when_configured():
    release = workflow("release.yml")["jobs"]["release"]
    assert release["environment"] == "website-publish"
    mint = next(step for step in release["steps"] if step.get("id") == "publisher")
    assert "vars.WEBSITE_PUBLISH_APP_ID != ''" in mint["if"]
    assert mint["with"]["permission-pull-requests"] == "write"
    assert "permission-contents" not in mint["with"]
    publish = next(step for step in release["steps"] if "gh pr create" in step.get("run", ""))
    assert "steps.publisher.outputs.token" in publish["env"]["PUBLISH_TOKEN"]
    assert 'GH_TOKEN="${PUBLISH_TOKEN:-$GH_TOKEN}" gh pr create' in publish["run"]


@pytest.mark.parametrize(("case", "expected"), [
    ("unique", True), ("path-with-ref", True), ("different-associated-pr", False),
    ("second-pr-with-same-branch", False), ("changed-target", False),
])
def test_evaluate_cannot_reuse_checks_from_another_pr(monkeypatch, case, expected):
    import json
    import website_publish_automerge as verifier

    pr = pull()
    base = pr["base"]["sha"]

    def command(root, *args):
        if args[0] == "git":
            if args[1] == "rev-parse":
                return SHA if args[2] == "FETCH_HEAD" else base
            assert args[1:] == ("fetch", "--no-tags", "origin", "refs/pull/123/head")
            return ""
        path = args[4]
        prefix = f"repos/{REPOSITORY}/"
        assert path.startswith(prefix)
        path = path.removeprefix(prefix)
        if path == "pulls":
            other = {**pr, "number": 234, "state": "closed"}
            result = [pr, other] if case == "second-pr-with-same-branch" and "state=all" in args else [pr]
        elif path == "issues/123/timeline":
            result = [{"event": "base_ref_changed"}] if case == "changed-target" else []
        elif path.startswith("actions/workflows/"):
            name = path.split("/")[2]
            item = run(name, id=1 if name == "check.yml" else 2, run_attempt=1)
            item["pull_requests"] = [{"number": 234}] if case == "different-associated-pr" else []
            if case == "path-with-ref":
                item["path"] += "@refs/pull/123/merge"
            result = {"workflow_runs": [item]}
        else:
            name = "check.yml" if path.split("/")[2] == "1" else "website.yml"
            result = {"jobs": run(name)["jobs"]}
        return json.dumps(result)

    monkeypatch.setattr(verifier, "command", command)
    monkeypatch.setattr(verifier, "verify_tree", lambda root, base, head: True)
    event = {"workflow_run": run("website.yml")}
    result = verifier.evaluate(Path("."), REPOSITORY, BOT, event)
    assert (result == {"number": 123, "head": SHA, "base": base}) is expected
