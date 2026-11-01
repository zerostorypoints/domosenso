# SPEC-027: Tag on merge, and a website PR for every new tag

- Status: approved 2026-11-01 by the maintainer, as written; the open questions are settled below as
  the spec's defaults
- Source: the maintainer, 2026-11-01, after Ramka 0.8.0–0.9.0 and audio-sensor's SPEC-025 contract
  waited on main without a tag (ten "Unreleased" sections in Ramka's UPGRADE.md; audio-sensor's new
  entities in no tag while the released Ramka 0.9.0 consumed them). Every tag so far was made by
  hand (32 tags: 28 by one maintainer, 3 by the other, 1 by a third account); feature sessions end
  at the merge, and `docs/TEAM_WORKFLOW.md` names no release owner by default.

## Goal

A merged change reaches a tag and the website without anyone remembering to do it:

1. **Tag on merge.** When main gains a component version that has no tag (`release_status.py`
   `untagged`), a workflow tags `<id>/<version>` on that commit once its required checks have
   passed, and pushes the tag once.
2. **Website PR.** For each tag it pushed, the workflow opens a pull request that selects the tag
   on the website and makes the mechanical updates; the texts are finished on that PR by an agent
   or a maintainer, as the `domosenso-website-audit` skill describes.

What stays human: when to release and which version (the version bump is a reviewed PR), merging,
the website texts, production, flashing and a home's update.

## The decision point: the version-bump PR

- A component's `version:` in `component.yaml` changes only in a PR meant to release it: a release
  PR (as zerostorypoints/domosenso#145, #148), or a feature PR that bumps the version itself when no
  other open PR changes the same component. It carries the `## <version>` entry in the component's
  `UPGRADE.md` (required by `release.py` when the contract changed, required by this spec always).
- **Approving and merging that PR is the go-ahead to publish its tag.** AGENTS.md and
  TEAM_WORKFLOW.md say so in place of "publishing a tag needs the maintainer's go-ahead in the
  conversation"; tagging by hand stays possible and follows the same checks.
- A feature PR that does not bump leaves an "Unreleased" section, as today; the open
  `release-reminder` issue lists it until a version-bump PR merges.

## Workflow `release.yml` (new)

- **Trigger:** `workflow_run` of "Framework checks" and "Framework website" (the two checks
  `main` protection requires) completing on a push to `main`, and `workflow_dispatch` with an
  optional component id.
- **Concurrency:** one group, never cancelled: two runs never tag at once.
- **Steps:**
  1. Check out the run's `head_sha` with full history and tags; skip unless that commit is
     `origin/main`'s current head or an ancestor of it.
  2. `uv run tools/release_status.py --hold <ids> --format lines`; for each `untagged <id> <version>`:
     `uv run tools/release.py <id> --skip-checks`. The tool's CI evidence (every required check
     completed and successful for that commit, from its bound app) is the gate: while the second
     workflow is still running it fails `CI <name>: no current successful check`, and the run ends
     without a tag; the other workflow's completion runs it again.
  3. `git push origin refs/tags/<id>/<version>` for each tag made, one at a time; a push that fails
     because the tag exists on the remote is reported and not retried.
  4. For each tag pushed: `uv run tools/publish_release.py <id>` on a branch
     `release/website-<id>-<version>`, push it, open the PR (below).
  5. `gh workflow run release-reminder.yml` (a push with the workflow's token starts no other
     workflow; a dispatch does), so the reminder issue shows the new state.
- **Permissions:** `contents: write` (tags and the website branch), `pull-requests: write`,
  `actions: write` (the dispatch), `checks: read`. No other secret.
- **Holds:** one list for both workflows, `.github/release-hold` (component ids, one a line;
  today `remote-access`), replacing `HOLD` in `release-reminder.yml`.

## Tool `tools/publish_release.py <id>` (new)

Mechanical website updates for the component's newest tag, the steps the last three publications
did by hand:

- `website/content/publication.json`: the component's `version`, `tag` and full `commit`;
- `website/content/components/*.json`: every view whose `owner` is the component cites the tag's
  commit; the component's own record its `version` and `sourceCommit`;
- `website/content/devices/*.json`: a `compatibility` entry for the component names the version;
- `uv run tools/export_website.py --verify-remote`.

It changes no text. Output: one line per file changed and `ok`, or `FAIL <reason>`.

The PR it opens is titled `website: publish <id> <version>`, labelled `website-publish`, and its
body lists what is left for a person or an agent: the view conditions and setup steps against the
`## <version>` entry of UPGRADE.md (quoted), a journal article if the release is worth one, the e2e
counts, the audit note, the post-merge live checks and the sitemap resubmission. A reviewer is
requested from `CODEOWNERS` if the repository has one; the workflow names nobody.

## GitHub settings (a maintainer applies them; the workflow cannot)

- A tag ruleset on `*/*`: no update, no deletion, for everyone, no bypass. Creation allowed.
- Branch protection of `main` unchanged; the website PR needs the same approval as any PR.

## Compatibility

- Unchanged: the tag scheme `<component>/<version>` (FROZEN), `release.py`'s command line and
  output, `release_status.py`'s, the lock.
- Changed agent rules: AGENTS.md "Boundaries" and "Main, tags and pull requests", TEAM_WORKFLOW.md
  "Roles and decisions" and "Release, then home adoption", the reminder issue's text, the
  `domosenso-website-audit` skill (it starts from the bot's PR when there is one).
- A home: nothing. It still adopts a tag with `domosenso update`, on its own staging.

## Tests

- `tests/test_publish_release.py`: on a fixture website tree, the four file kinds change as listed,
  texts never; a component without views or devices; a tag not on the remote fails.
- `tests/test_release_workflow.py`: the workflow's YAML: its triggers, concurrency, permissions,
  that it reads `.github/release-hold`, that it never pushes a branch named `main` and never passes
  `--force` or `-f` to git.
- A dry run: `workflow_dispatch` on a fork, or `act`, with a fixture component bumped.
- `tools/check-all.sh`.

## Out of scope

- Bumping versions automatically or choosing semver from the diff.
- Merging the website PR, writing journal articles, live verification and the sitemap resubmission
  (the Search Console and Bing accounts are a maintainer's).
- Releasing from a feature branch.

## Open questions, settled by the approval

The maintainer approved the spec as written, so each question keeps the behaviour the sections above
describe: (1) a feature PR may bump its own version; (2) one website PR per tag; (3) a release waits
for the required checks only, not `demo`; (4) no reviewer is named by the workflow.


1. **A feature PR that bumps its own version** (allowed above) can collide with another open PR on
   the same component; the second to merge then needs a rebase and a new number. Acceptable, or
   should a bump always be its own release PR?
2. **One tag, several components.** A version-bump PR that bumps two components gets two tags and
   two website PRs. One combined website PR may read better (as #137 did for three); inference: the
   mechanical part is per component, the article is shared, so one PR per run is the alternative.
3. **The `demo` check.** It is not required by `main` protection, so `release.py` does not wait for
   it. Verified: required checks are `framework` and `website` (2026-11-01). Should a release wait
   for `demo` when the PR carried `run-demo`?
4. **CODEOWNERS.** None exists; without it the website PR gets no reviewer requested.

## Amendment 1 (2026-11-01, found while building)

- **The full gate, not `--skip-checks`.** `release.py --skip-checks` reads main's required checks
  (`GET /repos/{owner}/{repo}/branches/main/protection/required_status_checks`), which needs the
  repository permission "Administration: read" (GitHub's table of fine-grained permissions); the
  workflow's token cannot hold it, and the spec allows no other secret. The workflow therefore runs
  `release.py <id>` with its full local gate (`check-all`), the evidence a local release uses.
- **One trigger.** With the gate inside the job, the workflow waits only for "Framework website"
  (the required check that `check-all` does not cover: lint, typecheck, build, e2e) to pass on the
  merged commit; "Framework checks" is repeated by the gate. A run takes the gate's time
  (about 20 minutes) per component it tags.

