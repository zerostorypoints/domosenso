#!/usr/bin/env python3
"""Tag a component release: an annotated git tag `<id>/<version>` at HEAD.

Usage: uv run tools/release.py <id> [--skip-checks]

The `domosenso` command reads components only from these tags. Refuses when
- the checkout has uncommitted changes or HEAD has not reached main;
- the tag `<id>/<version>` already exists (a published version is never moved);
- the contract (`inputs`, `provides`, `artifacts`) differs from the newest earlier tag of the
  component and `components/<id>/UPGRADE.md` has no `## <version>` heading;
- the full local gate fails, or --skip-checks has no successful GitHub CI evidence for HEAD: its own
  checks, or those of the merged pull request's last commit when that commit has the same tree (a
  squash or merge commit holds exactly the files CI tested; the tree id is their hash).

Prints `tag <id>/<version> at <short sha>` and `ok`, or `FAIL <reason>` (exit 1). Never pushes.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
CONTRACT_KEYS = ("inputs", "provides", "artifacts")
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


class ReleaseError(Exception):
    pass


def git(catalog: Path, *args: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(["git", *args], cwd=catalog, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"git check failed: {exc}") from exc


def checked_head(catalog: Path) -> str:
    """A release is a clean commit already included in the authoritative main."""
    dirty = git(catalog, "status", "--porcelain", "--untracked-files=all")
    if dirty.returncode or dirty.stdout.strip():
        raise ReleaseError("uncommitted changes in the catalog: commit or remove them before release")
    head = git(catalog, "rev-parse", "HEAD")
    if head.returncode:
        raise ReleaseError("cannot resolve HEAD")
    origin = git(catalog, "remote", "get-url", "origin")
    main = "refs/heads/main"
    if origin.returncode == 0:
        remote = git(catalog, "ls-remote", "--exit-code", "origin", "refs/heads/main")
        main = "refs/remotes/origin/main"
        local = git(catalog, "rev-parse", "--verify", main)
        if remote.returncode or not remote.stdout.strip():
            raise ReleaseError("cannot verify origin/main; check remote access and fetch origin")
        if local.returncode or local.stdout.strip() != remote.stdout.split()[0]:
            raise ReleaseError("origin/main is stale or missing: fetch origin before release")
    if git(catalog, "merge-base", "--is-ancestor", head.stdout.strip(), main).returncode:
        raise ReleaseError("HEAD is not included in main: merge the reviewed PR before release")
    return head.stdout.strip()


def github_json(catalog: Path, endpoint: str, paginate: bool = False):
    command = ["gh", "api", endpoint]
    if paginate:
        command += ["--paginate", "--slurp"]
    try:
        result = subprocess.run(command, cwd=catalog, capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise ReleaseError(f"CI evidence unavailable: {result.stderr.strip()[-400:]}")
        return json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        raise ReleaseError(f"CI evidence unavailable: {exc}") from exc


def verify_ci(catalog: Path, head: str) -> None:
    """Require every protected-branch check for this commit, from its configured GitHub App."""
    origin = git(catalog, "remote", "get-url", "origin")
    match = re.fullmatch(r"(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)([\w.-]+/[\w.-]+?)(?:\.git)?", origin.stdout.strip())
    if origin.returncode or not match:
        raise ReleaseError("CI evidence requires a GitHub origin; run the full local gate instead")
    repo = match[1]
    requirements = github_json(catalog, f"repos/{repo}/branches/main/protection/required_status_checks")
    if not isinstance(requirements, dict) or not requirements.get("checks"):
        raise ReleaseError("CI required checks unavailable: run the full local gate instead")
    pages = github_json(catalog, f"repos/{repo}/commits/{head}/check-runs?filter=all&per_page=100", paginate=True)
    if not isinstance(pages, list) or not all(isinstance(page, dict) and isinstance(page.get("check_runs"), list) for page in pages):
        raise ReleaseError("CI check response is malformed")
    missing = _missing_check(requirements, pages, head)
    if missing is None:
        return
    # A squash merge makes a new commit that CI may not have reached yet; the pull request that
    # produced it was tested at its last commit. Same tree, same files: that evidence holds.
    for sha in _merged_pr_heads(catalog, repo, head):
        pages = github_json(catalog, f"repos/{repo}/commits/{sha}/check-runs?filter=all&per_page=100", paginate=True)
        if _missing_check(requirements, pages, sha) is None:
            return
    raise ReleaseError(f"CI {missing}: no current successful check for {head}")


def _missing_check(requirements: dict, pages, sha: str) -> str | None:
    """The first required check without a current success for `sha`, or None when all have one."""
    if not isinstance(pages, list) or not all(isinstance(page, dict) and isinstance(page.get("check_runs"), list) for page in pages):
        raise ReleaseError("CI check response is malformed")
    runs = [run for page in pages for run in page["check_runs"]]
    for required in requirements["checks"]:
        name, app_id = required.get("context"), required.get("app_id")
        # An unbound context can be supplied by an unrelated app: don't use it for a release.
        if not name or not app_id:
            raise ReleaseError("CI required check has no trusted app; run the full local gate instead")
        matching = [run for run in runs if run.get("name") == name and run.get("head_sha") == sha
                    and (run.get("app") or {}).get("id") == app_id]
        latest = max(matching, key=lambda run: run.get("id", 0), default={})
        if latest.get("status") != "completed" or latest.get("conclusion") != "success":
            return name
    return None


def _merged_pr_heads(catalog: Path, repo: str, head: str) -> list[str]:
    """Last commits of the pull requests merged as `head` whose tree is `head`'s tree."""
    tree = git(catalog, "rev-parse", f"{head}^{{tree}}").stdout.strip()
    pulls = github_json(catalog, f"repos/{repo}/commits/{head}/pulls")
    heads = []
    for pull in pulls if isinstance(pulls, list) else []:
        pr_head = ((pull or {}).get("head") or {}).get("sha")
        if not pull.get("merged_at") or pull.get("merge_commit_sha") != head or not pr_head:
            continue
        commit = github_json(catalog, f"repos/{repo}/git/commits/{pr_head}")
        if isinstance(commit, dict) and (commit.get("tree") or {}).get("sha") == tree:
            heads.append(pr_head)
    return heads


def newest_earlier_tag(catalog: Path, component_id: str) -> str | None:
    """The `<id>/X.Y.Z` tag with the highest version, compared numerically."""
    names = git(catalog, "tag", "-l", f"{component_id}/*").stdout.split()
    versions = []
    for name in names:
        m = SEMVER.match(name.split("/", 1)[1])
        if m:
            versions.append((tuple(map(int, m.groups())), name))
    return max(versions)[1] if versions else None


def contract(manifest: dict) -> dict:
    return {key: manifest.get(key) for key in CONTRACT_KEYS}


def has_upgrade_entry(upgrade_md: Path, version: str) -> bool:
    if not upgrade_md.is_file():
        return False
    heading = re.compile(rf"^##\s+{re.escape(version)}(\s|$)", re.M)
    return bool(heading.search(upgrade_md.read_text(encoding="utf-8")))


def release(catalog: Path, component_id: str, skip_checks: bool = False) -> str:
    catalog = Path(catalog)
    head = checked_head(catalog)
    component = catalog / "components" / component_id
    manifest_path = component / "component.yaml"
    if not manifest_path.is_file():
        raise ReleaseError(f"components/{component_id}/component.yaml not found")
    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    version = str(manifest.get("version", ""))
    if not SEMVER.match(version):
        raise ReleaseError(f"components/{component_id}/component.yaml: version {version!r} is not X.Y.Z")
    tag = f"{component_id}/{version}"

    dirty = git(catalog, "status", "--porcelain", "--", f"components/{component_id}").stdout.strip()
    if dirty:
        raise ReleaseError(f"uncommitted changes under components/{component_id}/:\n{dirty}")
    if git(catalog, "rev-parse", "-q", "--verify", f"refs/tags/{tag}").returncode == 0:
        raise ReleaseError(f"{tag} exists")

    earlier = newest_earlier_tag(catalog, component_id)
    if earlier:
        shown = git(catalog, "show", f"{earlier}:components/{component_id}/component.yaml")
        if shown.returncode != 0:
            raise ReleaseError(f"cannot read the manifest at {earlier}: {shown.stderr.strip()}")
        if contract(yaml.safe_load(shown.stdout)) != contract(manifest) and not has_upgrade_entry(
            component / "UPGRADE.md", version
        ):
            raise ReleaseError(
                f"the contract changed since {earlier}: add a '## {version}' entry to "
                f"components/{component_id}/UPGRADE.md"
            )

    if skip_checks:
        verify_ci(catalog, head)
    else:
        script = catalog / "tools" / "check-all.sh"
        result = subprocess.run(["bash", str(script)], cwd=catalog, capture_output=True, text=True)
        if result.returncode != 0 or not result.stdout.rstrip().endswith("all checks passed"):
            tail = "\n".join((result.stdout + result.stderr).strip().splitlines()[-15:])
            raise ReleaseError(f"full check-all failed (exit {result.returncode}):\n{tail}")

    if checked_head(catalog) != head:
        raise ReleaseError("HEAD changed during verification: run release again")
    made = git(catalog, "tag", "-a", tag, head, "-m", f"{component_id} {version}")
    if made.returncode != 0:
        raise ReleaseError(f"git tag failed: {made.stderr.strip()}")
    return tag


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tag a component release (annotated tag <id>/<version> at HEAD).")
    parser.add_argument("id", help="component id")
    parser.add_argument("--skip-checks", action="store_true", help="use successful exact-HEAD GitHub checks instead of the full local gate")
    args = parser.parse_args(argv)
    try:
        tag = release(REPO, args.id, skip_checks=args.skip_checks)
    except ReleaseError as exc:
        print(f"FAIL {exc}")
        return 1
    sha = git(REPO, "rev-parse", "--short", f"{tag}^{{commit}}").stdout.strip()
    print(f"tag {tag} at {sha}")
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
