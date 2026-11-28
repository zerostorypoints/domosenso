#!/usr/bin/env python3
"""Verify a generated website release before giving the merge job a PR number and SHAs.

Run on a clean checkout of main with a read-only GitHub token. The candidate is read as Git
objects. Its working tree, workflows, artifacts and dependencies are never used here.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys

from publish_release import PublishError, publish

PUBLICATION = "website/content/publication.json"
CHECKS = {"check.yml": "framework", "website.yml": "website"}
BRANCH = re.compile(r"release/website-[a-z0-9][a-z0-9.-]*")
SHA = re.compile(r"[0-9a-f]{40}")
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")


def command(root, *args):
    return subprocess.run(args, cwd=root, check=True, text=True, stdout=subprocess.PIPE).stdout.strip()


def eligible_pull(pr, repository, bot, branch, head):
    source, target = pr["head"], pr["base"]
    return (
        pr["state"] == "open" and not pr["draft"]
        and pr["user"]["type"] == "Bot" and pr["user"]["login"] == f"{bot}[bot]"
        and pr["title"].startswith("website: publish ")
        and any(label["name"] == "website-publish" for label in pr["labels"])
        and source["ref"] == branch and source["sha"] == head and BRANCH.fullmatch(branch) is not None
        and (source.get("repo") or {}).get("full_name") == repository
        and target["ref"] == "main" and (target.get("repo") or {}).get("full_name") == repository
    )


def green_checks(runs, repository, branch, head):
    for workflow, check in CHECKS.items():
        run = runs.get(workflow) or {}
        if not (
            run.get("path") == f".github/workflows/{workflow}"
            and run.get("event") == "pull_request"
            and (run.get("head_repository") or {}).get("full_name") == repository
            and run.get("head_branch") == branch and run.get("head_sha") == head
            and run.get("status") == "completed" and run.get("conclusion") == "success"
        ):
            return False
        jobs = [job for job in run.get("jobs", []) if job["name"] == check]
        if len(jobs) != 1 or jobs[0]["status"] != "completed" or jobs[0]["conclusion"] != "success":
            return False
    return True


def components(publication):
    entries = json.loads(publication)["components"]
    result = {entry["id"]: entry["version"] for entry in entries}
    if len(result) != len(entries) or not all(isinstance(v, str) and VERSION.fullmatch(v) for v in result.values()):
        raise ValueError("invalid publication entries")
    return result


def export_website(root):
    command(root, sys.executable, str(root / "tools/export_website.py"), "--verify-remote")


def verify_tree(root, base, head, *, export=export_website):
    if command(root, "git", "rev-parse", "HEAD") != base or command(root, "git", "status", "--porcelain"):
        raise ValueError("the verifier needs a clean checkout of the expected main commit")
    if command(root, "git", "rev-list", "--parents", "-n", "1", head).split() != [head, base]:
        return False
    current = components((root / PUBLICATION).read_text(encoding="utf-8"))
    proposed = components(command(root, "git", "show", f"{head}:{PUBLICATION}"))
    if current.keys() != proposed.keys():
        return False
    changed = sorted(cid for cid in current if current[cid] != proposed[cid])
    if not changed or any(
        tuple(map(int, proposed[cid].split("."))) <= tuple(map(int, current[cid].split("."))) for cid in changed
    ):
        return False
    for cid in changed:
        publish(root, cid)
    export(root)
    command(root, "git", "add", "-A", "--", "website")
    return command(root, "git", "write-tree") == command(root, "git", "rev-parse", f"{head}^{{tree}}")


def evaluate(root, repository, bot, event):
    trigger = event["workflow_run"]
    branch, head = trigger.get("head_branch"), trigger.get("head_sha")
    if not (
        trigger.get("event") == "pull_request" and trigger.get("conclusion") == "success"
        and (trigger.get("head_repository") or {}).get("full_name") == repository
        and isinstance(branch, str) and BRANCH.fullmatch(branch)
        and isinstance(head, str) and SHA.fullmatch(head)
    ):
        return None

    def api(path, **query):
        args = [item for key, value in query.items() for item in ("-f", f"{key}={value}")]
        return json.loads(command(root, "gh", "api", "-X", "GET", f"repos/{repository}/{path}", *args))

    owner = repository.partition("/")[0]
    pulls = api("pulls", state="open", base="main", head=f"{owner}:{branch}")
    if len(pulls) != 1 or not eligible_pull(pulls[0], repository, bot, branch, head):
        return None
    pr = pulls[0]
    number, base = pr["number"], pr["base"]["sha"]
    if type(number) is not int or number < 1 or not SHA.fullmatch(base):
        raise ValueError("invalid PR number or base SHA")
    if base != command(root, "git", "rev-parse", "HEAD"):
        return None
    runs = {}
    for workflow in CHECKS:
        latest = api(f"actions/workflows/{workflow}/runs", event="pull_request",
                     head_sha=head, per_page=1)["workflow_runs"]
        if not latest or latest[0]["conclusion"] != "success":
            return None
        run = latest[0]
        run_id, attempt = int(run["id"]), int(run["run_attempt"])
        run["jobs"] = api(f"actions/runs/{run_id}/attempts/{attempt}/jobs", per_page=100)["jobs"]
        runs[workflow] = run
    if not green_checks(runs, repository, branch, head):
        return None
    command(root, "git", "fetch", "--no-tags", "origin", f"refs/pull/{number}/head")
    if command(root, "git", "rev-parse", "FETCH_HEAD") != head or not verify_tree(root, base, head):
        return None
    return {"number": number, "head": head, "base": base}


def main():
    root = Path(__file__).resolve().parent.parent
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        result = evaluate(root, os.environ["GITHUB_REPOSITORY"], os.environ["PUBLISH_APP_SLUG"], event)
    except (KeyError, TypeError, ValueError, OSError, PublishError, subprocess.CalledProcessError):
        print("Website publication verification failed. No merge authorized.", file=sys.stderr)
        return 1
    if result is None:
        print("No eligible website publication with both checks and an exact generated tree.")
        return 0
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as out:
        out.writelines(f"{name}={value}\n" for name, value in result.items())
    print(f"Verified generated website publication PR #{result['number']} at {result['head']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
