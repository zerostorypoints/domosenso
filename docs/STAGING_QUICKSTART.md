# Preview a PR before accepting it

You do not need to write code. Ask Codex or Claude Code to prepare a preview on the computer where
you will open it. This first preview runs the real Ramka in a local, fictional Home Assistant.
Your home and devices are not connected to it.

## Give the agent this task

> Prepare local staging for PR #NUMBER at its current commit, in a separate worktree and named
> branch. Run the applicable checks, then leave an interactive demo running. Give me its browser
> URL, the private login-file location, the tested commit and 3–5 things to try with expected
> results. List known problems. Do not approve or merge the PR, enable auto-merge, publish a tag
> or deploy to my home. Wait for my explicit acceptance.

The agent fetches the PR revision first. The selected revision must include the demo tools; they
are introduced by PR #68. It prepares dependencies using [the setup guide](LOCAL_DEVELOPMENT.md#prepare-once).
After automated checks, it starts a **separate interactive instance** for you: the CI runner cleans
up its own instance and therefore does not leave a preview to open.

## Open it and decide

1. Open the Ramka URL the agent gives you: `http://127.0.0.1:<port>/dashboard-ramka-en/ramka?disable_km`.
   Replace `en` with `pl` or `de` for those versions; `up` itself prints only the base URL.
2. Read the username/password from the reported `login_file` on your computer. Do not paste that
   file or its contents into a PR or issue.
3. Try the specific change first, then lights, weather and calendar. Ask the agent to switch between
   `morning`, `evening`, `away` and `rain`, and to restart the demo while your browser stays open.
4. Ask for a short result: **what worked, what failed, tested commit, and remaining risks**. Existing
   #51–53 are known Ramka problems; a green infrastructure check does not mean they are fixed.
   If the view switches too quickly, ask the agent to hold a demo page for inspection and report
   any temporary timer changes. Empty history charts are expected in a fresh demo.
5. Explicitly accept or request changes. A running preview, green CI or adding a reviewer is **not
   acceptance**. An updated PR commit needs refreshed evidence. GitHub still enforces its required
   approval; the PR author's account cannot provide that formal approval itself.
6. Ask the agent to stop the preview when finished. `down` preserves it for another look; `reset`
   deletes only that generated demo. Neither action affects your home.

## Commands the agent uses

From the prepared PR worktree, with Docker running and dependencies installed:

```sh
uv run tools/dev-home.py up --name review
uv run tools/dev-home.py scenario evening --name review
uv run tools/dev-home.py status --name review
uv run tools/dev-home.py down --name review
```

`up` prints the URL and login-file path. Run it again after `down` to resume. After code changes,
use `down` then `up` to refresh the render; an already running instance keeps its previous render.
For a fresh demo: `uv run tools/dev-home.py reset --name review --confirm review`, then `up`.

## Before adopting it in your own home

The fictional preview helps you accept a framework PR. Your home's staging is a second check:

- Ask the agent to read the **home repository's** instructions, use its own worktree/branch and
  identify the configured staging target. If there is no staging target, prepare its setup first;
  do not substitute production.
- To try an unreleased PR with your private inputs, the agent uses `render <component> --catalog-dev
  <PR-worktree>`, reviews `deploy staging --plan`, and applies to **staging only**. This does not
  publish a version or authorise production. Its private URL/login stay in the home context.
- After the framework PR is accepted and a component tag is separately released, update the home's
  lock to that explicit version and test it on home staging again. Approve the home changes and
  production plan separately. Merging either repository is not a production deployment.

Tell the agent: **"Show me this change on staging and wait for my acceptance before taking it to
my home production environment."** See [release and home adoption](TEAM_WORKFLOW.md#release-then-home-adoption)
for the full sequence.
