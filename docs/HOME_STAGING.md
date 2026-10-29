# Local staging for your own home

Your home repository is an **instance** of DomoSenso. It owns your inputs, local additions and
component lock. The framework supplies shared components and tools. You choose when your home
adopts a version; merging a framework PR does not update your installation.

Ask Codex or Claude Code in your **home project**:

> Use stage-home-update to preview COMPONENT at VERSION (or PR URL) with my home inputs. Preserve
> my customizations, use separate worktrees, prepare local staging, and give me a browser link,
> the tested revisions and a few checks with expected results. Wait for my acceptance.

You inspect the result. The agent prepares and tests it. Approving a PR, accepting a home update
and approving a production deployment remain separate decisions.

## Set up once per home

Use a trusted framework checkout containing these tools and a private home repository created
with the normal home onboarding workflow (the framework's `onboard-home` skill). Set up Docker,
Git, uv and Python 3.11.4 or newer. Run `uv sync --frozen` in the framework checkout, then pull
`homeassistant/home-assistant:2026.9.2` before starting the isolated runtime. Docker Desktop on
macOS/Linux Docker are the initial supported environments; Windows requires a Linux environment
with Git symlink support and Docker. Do not infer a native Windows acceptance test.

Create a named linked worktree for the task in **each** repository you work on. For an existing
home, a setup example is `git worktree add -b codex/stage-update ../home-stage HEAD`, executed
from that home's checkout. Verify its intended base and pending changes first. Worktree creation
does not copy uncommitted files or ignored credentials. Keep the home outside the framework tree.

Set these shell variables to the actual absolute worktree paths:

```sh
CATALOG_WT=/absolute/path/to/framework-worktree
HOME_WT=/absolute/path/to/home-worktree
uv run --project "$CATALOG_WT" "$CATALOG_WT/tools/install-home-workflow.py" --home "$HOME_WT"
```

This installs the shared `stage-home-update` skill, this guide, relative discovery links for
Codex and Claude, and `.ai/home-workflow.json` with content hashes. Review and commit those files
in the home. Existing AGENTS/CLAUDE, hooks and settings remain home-owned. Add a reference to the
skill in the home's AGENTS.md and retain its CLAUDE import. The starter template already names it.
Review client trust normally; filesystem installation does not prove a client's hook activation.

Repeat the same installer with a newer trusted framework checkout to update the workflow. It
refuses customized files or conflicting links before writing anything; reconcile those changes
explicitly. It does not silently replace a home's own playbook. Its installed hashes identify
content; record the framework commit used for each task as well.

Ensure `.gitignore` includes `.domosenso/` and none of that runtime directory is tracked. It holds
private credentials, configuration and evidence. Never copy it into the framework or a public PR.
The installer copies only the shared guide/skill, not a personal staging script or home settings.

## Start and inspect

```sh
uv run --project "$CATALOG_WT" "$CATALOG_WT/tools/home-staging.py" --home "$HOME_WT" up --name review
uv run --project "$CATALOG_WT" "$CATALOG_WT/tools/home-staging.py" --home "$HOME_WT" status --name review
uv run --project "$CATALOG_WT" "$CATALOG_WT/tools/home-staging.py" --home "$HOME_WT" target --name review
```

`up` prints the loopback URL, login-file path, target name and private target-fragment path.
Containers, networks and data are unique to the canonical home worktree path plus `--name`.
Two homes/worktrees can both use `review`; ports are allocated independently. `--port NUMBER`
requests a specific free port; an occupied port fails without stopping its owner.

The generated fragment contains only `targets: {staging-review: ...}`. Have the agent add that
single entry to the home worktree's `domosenso.yaml`, preserving every other field and target.
Do not replace the whole declaration with the fragment. Before reusing an existing target name,
compare its container, config, URL and token path to this runtime. Temporary target entries and
absolute worktree catalog paths should be restored before permanent home commits; the runtime
metadata stays private for resuming the preview.

The HA container runs on an internal Docker network with its generated config as its only mount.
A read-only, fixed-destination relay exposes its UI on loopback. No production token, config,
`.storage`, database or state mirror is imported. Dependencies/images are prepared separately;
runtime LAN/internet access remains blocked. This is **an empty staging HA**, not a claim that
all your integrations or components are simulated.

The installer and runtime reject primary checkouts and detached/main branches. They do not grant
agent permissions or install client-wide enforcement. Existing home staging containers are left
alone. Status checks ownership/isolation; do not override a failure or bypass the tool with
unreviewed Docker changes.

## Preview the actual update

The agent follows [the shared playbook](../.ai/skills/stage-home-update/SKILL.md): preserve local
changes, establish a baseline, render/update the chosen candidate, inspect the deployment plan,
apply to `staging-review`, inspect logs and the real dashboard, and compare before/after evidence.
The existing CLI is used with the explicit home:

```sh
uv run --project "$CATALOG_WT" domosenso --home "$HOME_WT" deploy staging-review --plan
# After inspecting the plan and confirming this owned target:
uv run --project "$CATALOG_WT" domosenso --home "$HOME_WT" deploy staging-review --apply
```

`up` never deploys that configuration automatically. Review new integrations, shell commands,
services and fixtures first. Homes needing hardware/cloud integrations or additional services
must provide a suitable private test adapter and document its limits. Missing services/states,
blocked downloads, calendars and physical screen commands are **not** successful acceptance.
Do not copy production secrets/storage or open networking just to get green checks.

### Gaps an empty staging shows first

The first baseline `check_config` on a blank instance usually fails on things the deploy never
carries, not on the update. Seen on a real home, in this order:

- **UI files** (`automations.yaml`, `scripts.yaml`, `scenes.yaml`) listed as `unmanaged_on_target`
  but included by `configuration.yaml`: create empty ones (`[]`, `[]`, `{}`) in the staging config.
- **Directories the config names** (a photo folder under `www/`, an allowlisted path): create
  them empty.
- **Custom integrations** (`config/custom_components/`, installed by hand on production): copy the
  exact version production runs, from its pinned source, or the config check reports the
  integration as missing.

Record each fixture in the handoff; reapply after `reset`. A dashboard whose mode starts `off`
renders black until an `input_select` is set. A compare against an `equivalence.yaml` written for
production prints stale-explanation warnings; read them, do not add exemptions for staging.

`uv --project` selects CLI code. Tagged components come from the home's `catalog:` setting;
record their tag commit separately. `render --catalog-dev` selects a framework working tree,
stamps a development preview and bypasses normal hand-edit protection: preserve/reconcile all
customizations before running it. Released adoption uses an explicit version and is tested again.
`deploy production` refuses development-rendered files (`dev-render` plan lines); a maintainer can
put them on a production target for a look with `--apply --allow-dirty --confirm <hash>` of the plan
read (SPEC-019 A), and the next plan warns until a clean deploy replaces them.
A development render leaves the lock alone and records what it wrote in `.domosenso/dev-render.json`
(SPEC-019 B): per component its files with their sha256 and its resource URLs. `deploy`, on every
target, carries that entry in place of the lock's managed files (all `dev-render` lines), so a
component the lock does not have yet and a new card version directory arrive complete, the resources
move (`resource update … from …`) and the locked version's files are removed through the record. A
file edited after the render fails the plan with `dev render changed: <path>: render again`. A
render, `add` or `update` from the tag removes the component's entry. Read the plan before applying:
it must list the whole candidate.
Use the fictional framework preview, then test the released version in home staging. Do not
hand-edit the lock to pretend that an unreleased candidate is a release. Neither rendering nor
a preview authorizes production.

## Stop or remove this preview

```sh
uv run --project "$CATALOG_WT" "$CATALOG_WT/tools/home-staging.py" --home "$HOME_WT" down --name review
# Only when its generated data is no longer needed:
uv run --project "$CATALOG_WT" "$CATALOG_WT/tools/home-staging.py" --home "$HOME_WT" reset --name review --confirm review
```

`down` preserves config/authentication for the next `up`; resume does not overwrite deployed
configuration. `reset` removes only the owned instance and its generated data after the matching
confirmation. Keep an interactive preview running while its human review is pending.

For framework-only acceptance with fictional inputs and built-in scenes, use
the framework's `preview-pr` skill and `docs/STAGING_QUICKSTART.md`.
