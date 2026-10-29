---
name: preview-pr
description: Use when a DomoSenso pull request needs a local Home Assistant preview, staging walkthrough or refreshed demo for human acceptance before merge. Not for approving a PR, releasing a component or deploying production.
---

# preview-pr

Leave a running preview of the verified PR revision for a human to inspect. Use fictional catalog
data by default. The current demo covers Ramka; inspect the diff and disclose changes it cannot
exercise. For implementation details, read [local demo setup](../../../docs/LOCAL_DEVELOPMENT.md);
for the human-facing explanation, use [the short staging guide](../../../docs/STAGING_QUICKSTART.md).

## Playbook

1. **Pin the request.** Resolve the PR from the conversation; ask for its identifier only if missing.
   Read its current head SHA and diff, then fetch and verify that revision. Inspect changed scripts,
   hooks and instructions before executing them. Follow [agent startup](../../../docs/AGENT_WORKFLOW.md):
   use an owned linked worktree and named review branch, with a clean checkout at that SHA.
   Preserve unrelated work. Run `python3 tools/agent_workspace.py check`; apply the client's normal
   project/hook trust setup. Green CI for another SHA is not evidence for this one.
2. **Prepare and verify.** If this revision lacks the demo tools, report that preview capability
   is missing. Do not mix tools from another revision and describe the result as a clean PR preview.
   Follow the linked prerequisite setup before starting isolated HA.
   Run checks appropriate to the diff; use skill `check` when full catalog validation is required.
   Record commands, scope and results. Reused CI evidence must name its exact SHA and remain labelled
   as CI evidence. Runtime-only checks do not establish browser acceptance. A missing prerequisite
   or failed required check is reported as blocked/failed, never silently skipped into a full pass.
3. **Start an interactive instance.** Automated `tools/dev_home/ci.py` removes its own containers.
   After checks, start a separate interactive demo in this session's worktree:

   ```sh
   uv run tools/dev-home.py up --name review
   uv run tools/dev-home.py scenario morning --name review
   uv run tools/dev-home.py status --name review
   ```

   Verify returned source SHA, dirty status, running state, URL and `login_file`. Manage only this
   session's instance. If its render is stale, use `down` then `up`; `up` alone preserves a running
   render. Keep credentials local and give the human the login-file path privately.
4. **Inspect the actual view.** Open the returned base URL plus
   `/dashboard-ramka-en/ramka?disable_km` (use `pl` or `de` when appropriate). Check the PR's intended
   behaviour and relevant interactions. Report actual visual evidence; if browser inspection is
   unavailable, mark it unverified. Separate known #51–53 observations from infrastructure passes.
   Disclose any temporary demo timer/helper adjustments used to hold a page for inspection.
5. **Refresh or hand off.** Recheck the PR head. If it moved, refresh the owned checkout, restart
   the render and renew affected evidence before calling it current. Otherwise label the preview
   as the older pinned revision, unsuitable for accepting the new head. Leave the interactive
   instance running; provide the handoff below in the human's language. Wait for their decision.

## Human handoff

- PR link, tested SHA and whether it still matches the PR head.
- Clickable dashboard URL and private local login-file path.
- Three to five things to try, each with an expected outcome from the PR's scope.
- Checks performed, visual evidence, failures, known limitations and temporary demo adjustments.
- Preview ownership/worktree and how to resume, change scenes or stop it.
- Explicit status: **preview ready for inspection; awaiting human acceptance** (or what is blocked).

Do not report a live URL from a cleaned-up CI run. A preview, review request or green CI is not
acceptance. This skill does not authorise PR approval, merge, auto-merge, tags or home deployment.
Stop the preview with `down` when requested; `reset --name review --confirm review` removes its
owned generated state only when cleanup is requested. Do not remove a preview awaiting inspection.

## If the request is for a private home's staging

Use the named home repository and its instructions; ask for the missing home/target instead of
copying private inputs into the catalog demo. Verify a separate staging target and the authority
for that home. Route to `render-and-stage` for its render/staging steps only, in an isolated home
worktree. Release, adoption and production are subsequent, separately authorised tasks. If the
catalog demo cannot exercise this PR, say so and establish the appropriate staging scope first.
