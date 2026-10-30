"""tools/release.py: annotated tags `<id>/<version>`, each test on a throwaway git repository."""
import subprocess
from pathlib import Path

import pytest

import release

GIT = ["git", "-c", "user.name=t", "-c", "user.email=t@localhost"]


def git(repo: Path, *args: str) -> str:
    return subprocess.run([*GIT, *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def manifest(version: str, provides: str = "sensor.radio_level") -> str:
    return (
        f"id: radio\nversion: {version}\nsummary: A radio\n"
        f"inputs: {{}}\nprovides:\n  entities:\n    - id: {provides}\nartifacts: {{}}\n"
    )


@pytest.fixture(autouse=True)
def tagger(monkeypatch):
    """release.py tags with the configured identity; the tests bring their own."""
    for role in ("AUTHOR", "COMMITTER"):
        monkeypatch.setenv(f"GIT_{role}_NAME", "t")
        monkeypatch.setenv(f"GIT_{role}_EMAIL", "t@localhost")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "components" / "radio").mkdir(parents=True)
    (tmp_path / "components" / "radio" / "component.yaml").write_text(manifest("1.0.0"))
    git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "tools").mkdir()
    (tmp_path / "tools" / "check-all.sh").write_text("echo 'all checks passed'\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "radio")
    return tmp_path


def commit_all(repo: Path, message: str) -> None:
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", message)


def test_creates_annotated_tag(repo):
    assert release.release(repo, "radio") == "radio/1.0.0"
    assert git(repo, "cat-file", "-t", "radio/1.0.0") == "tag"
    assert git(repo, "tag", "-l", "--format=%(contents)", "radio/1.0.0") == "radio 1.0.0"


def test_refuses_existing_version(repo):
    release.release(repo, "radio")
    with pytest.raises(release.ReleaseError, match="radio/1.0.0 exists"):
        release.release(repo, "radio")


def test_refuses_dirty_component(repo):
    (repo / "components" / "radio" / "README.md").write_text("notes\n")
    with pytest.raises(release.ReleaseError, match="uncommitted"):
        release.release(repo, "radio")


def test_needs_upgrade_entry_when_contract_changed(repo):
    release.release(repo, "radio")
    component = repo / "components" / "radio"
    (component / "component.yaml").write_text(manifest("1.1.0", provides="sensor.radio_volume"))
    commit_all(repo, "change provides")
    with pytest.raises(release.ReleaseError, match="UPGRADE.md"):
        release.release(repo, "radio")
    (component / "UPGRADE.md").write_text("# Upgrade\n\n## 1.1.0\n\nProvides changed.\n")
    commit_all(repo, "upgrade notes")
    assert release.release(repo, "radio") == "radio/1.1.0"


def test_unchanged_contract_needs_no_upgrade_entry(repo):
    release.release(repo, "radio")
    (repo / "components" / "radio" / "component.yaml").write_text(manifest("1.0.1"))
    commit_all(repo, "patch")
    assert release.release(repo, "radio") == "radio/1.0.1"


def test_newest_earlier_tag_is_numeric(repo):
    # 1.10.0 is newer than 1.9.0 although it sorts before it as text
    component = repo / "components" / "radio"
    for version in ("1.9.0", "1.10.0"):
        (component / "component.yaml").write_text(manifest(version))
        commit_all(repo, version)
        release.release(repo, "radio")
    (component / "component.yaml").write_text(manifest("1.10.1", provides="sensor.other"))
    commit_all(repo, "change provides")
    with pytest.raises(release.ReleaseError, match="UPGRADE.md"):
        release.release(repo, "radio")


def test_runs_check_all_unless_skipped(repo):
    script = repo / "tools" / "check-all.sh"
    script.parent.mkdir(exist_ok=True)
    script.write_text("#!/usr/bin/env bash\necho boom\nexit 1\n")
    script.chmod(0o755)
    commit_all(repo, "stub")
    with pytest.raises(release.ReleaseError, match="check-all"):
        release.release(repo, "radio")
    assert git(repo, "tag", "-l") == ""


def test_refuses_unmerged_commit(repo):
    git(repo, "checkout", "-b", "feature/new")
    (repo / "notes").write_text("unmerged")
    commit_all(repo, "feature")
    with pytest.raises(release.ReleaseError, match="main"):
        release.release(repo, "radio")
    assert git(repo, "tag", "-l") == ""


def test_refuses_dirty_shared_tools(repo):
    (repo / "tools" / "check-all.sh").write_text("echo 'all checks passed'\n# changed")
    with pytest.raises(release.ReleaseError, match="uncommitted"):
        release.release(repo, "radio")
    assert git(repo, "tag", "-l") == ""


def test_partial_local_pass_cannot_release(repo):
    (repo / "tools" / "check-all.sh").write_text("echo 'partial checks passed'\n")
    commit_all(repo, "partial")
    with pytest.raises(release.ReleaseError, match="full"):
        release.release(repo, "radio")
    assert git(repo, "tag", "-l") == ""


def test_checkout_changed_during_checks_cannot_release(repo):
    (repo / "tools" / "check-all.sh").write_text(
        "git -c user.name=t -c user.email=t@localhost commit --allow-empty -m changed\n"
        "echo 'all checks passed'\n")
    commit_all(repo, "changes while checking")
    with pytest.raises(release.ReleaseError, match="changed"):
        release.release(repo, "radio")
    assert git(repo, "tag", "-l") == ""


def test_origin_main_must_be_current(repo, tmp_path):
    remote = tmp_path.with_name(tmp_path.name + "-remote.git")
    git(repo, "init", "--bare", str(remote))
    git(repo, "remote", "add", "origin", str(remote))
    git(repo, "push", "origin", "main")
    # A remote advance which the local tracking ref has not fetched must be rejected.
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD~0")
    (repo / "new").write_text("change")
    commit_all(repo, "local next")
    git(repo, "push", "origin", "main")
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD~1")
    with pytest.raises(release.ReleaseError, match="fetch"):
        release.release(repo, "radio")


def test_skip_local_checks_requires_ci_evidence(repo, monkeypatch):
    def unavailable(*args):
        raise release.ReleaseError("CI evidence unavailable")
    monkeypatch.setattr(release, "verify_ci", unavailable, raising=False)
    with pytest.raises(release.ReleaseError, match="CI evidence"):
        release.release(repo, "radio", skip_checks=True)
    assert git(repo, "tag", "-l") == ""


def test_skip_local_checks_tags_exact_verified_commit(repo, monkeypatch):
    (repo / "tools" / "check-all.sh").write_text("exit 1\n")
    commit_all(repo, "CI validated this commit")
    sha = git(repo, "rev-parse", "HEAD")
    verified = []
    monkeypatch.setattr(release, "verify_ci", lambda root, head: verified.append(head), raising=False)
    assert release.release(repo, "radio", skip_checks=True) == "radio/1.0.0"
    assert verified == [sha]
    assert git(repo, "rev-parse", "radio/1.0.0^{commit}") == sha


def ci_fixture(repo, monkeypatch, runs):
    git(repo, "remote", "add", "origin", "https://github.com/example/catalog.git")
    sha = git(repo, "rev-parse", "HEAD")
    requirements = {"checks": [{"context": "framework", "app_id": 15368},
                                {"context": "website", "app_id": 15368}]}
    def api(root, endpoint, paginate=False):
        if endpoint.endswith("required_status_checks"):
            return requirements
        return [{"check_runs": runs(sha)}]
    monkeypatch.setattr(release, "github_json", api, raising=False)
    return sha


def run(name, sha, id=1, conclusion="success", app=15368):
    return {"id": id, "name": name, "head_sha": sha, "status": "completed",
            "conclusion": conclusion, "app": {"id": app}}


@pytest.mark.parametrize("kind", ["missing", "stale", "failed", "newer-pending", "wrong-app"])
def test_ci_rejects_insufficient_evidence(repo, monkeypatch, kind):
    def runs(sha):
        website = run("website", sha)
        if kind == "missing": return [website]
        if kind == "stale": return [website, run("framework", "0" * 40)]
        if kind == "failed": return [website, run("framework", sha, conclusion="failure")]
        if kind == "wrong-app": return [website, run("framework", sha, app=999)]
        return [website, run("framework", sha),
                {**run("framework", sha, id=2), "status": "queued", "conclusion": None}]
    sha = ci_fixture(repo, monkeypatch, runs)
    with pytest.raises(release.ReleaseError, match="CI"):
        release.verify_ci(repo, sha)


def test_ci_accepts_current_required_checks(repo, monkeypatch):
    sha = ci_fixture(repo, monkeypatch, lambda sha: [run("framework", sha), run("website", sha)])
    release.verify_ci(repo, sha)


def test_release_sees_untracked_files_even_when_user_hides_them(repo):
    git(repo, 'config', 'status.showUntrackedFiles', 'no')
    (repo / 'tools' / 'untracked.py').write_text('local-only code\n')
    with pytest.raises(release.ReleaseError, match='uncommitted'):
        release.release(repo, 'radio')
    assert git(repo, 'tag', '-l') == ''


# ---- A squash merge: main's commit is new, its tree is the tested PR head's --------------------

def pr_fixture(repo, monkeypatch, *, same_tree=True, merge_sha=None, pr_runs=True):
    """main's HEAD has no checks of its own; the PR that produced it was tested at a head commit
    whose tree is (or is not) the same."""
    git(repo, "remote", "add", "origin", "https://github.com/example/catalog.git")
    head = git(repo, "rev-parse", "HEAD")
    tree = git(repo, "rev-parse", "HEAD^{tree}")
    pr_head = "a" * 40
    requirements = {"checks": [{"context": "framework", "app_id": 15368},
                                {"context": "website", "app_id": 15368}]}
    def api(root, endpoint, paginate=False):
        if endpoint.endswith("required_status_checks"):
            return requirements
        if endpoint.endswith(f"commits/{head}/pulls"):
            return [{"number": 7, "merged_at": "2026-10-30T22:00:00Z", "merge_commit_sha": merge_sha or head,
                     "head": {"sha": pr_head}}]
        if endpoint.endswith(f"git/commits/{pr_head}"):
            return {"tree": {"sha": tree if same_tree else "b" * 40}}
        if f"commits/{pr_head}/check-runs" in endpoint:
            return [{"check_runs": [run("framework", pr_head), run("website", pr_head)] if pr_runs else []}]
        if f"commits/{head}/check-runs" in endpoint:
            return [{"check_runs": []}]
        raise AssertionError(endpoint)
    monkeypatch.setattr(release, "github_json", api, raising=False)
    return head


def test_ci_accepts_the_merged_prs_tested_head_with_the_same_tree(repo, monkeypatch):
    head = pr_fixture(repo, monkeypatch)
    release.verify_ci(repo, head)


@pytest.mark.parametrize("case", ["other tree", "not this merge", "pr not green"])
def test_ci_refuses_borrowed_evidence_that_does_not_match(repo, monkeypatch, case):
    head = pr_fixture(repo, monkeypatch, same_tree=case != "other tree",
                      merge_sha="c" * 40 if case == "not this merge" else None, pr_runs=case != "pr not green")
    with pytest.raises(release.ReleaseError, match="CI framework: no current successful check"):
        release.verify_ci(repo, head)
