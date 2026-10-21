---
name: render-and-stage
description: Render a Domosenso component into a home repository with that home's inputs, install its cards and files, check the result with check_config and try it on the home's staging Home Assistant before anything reaches production. Use when a component or its templates changed and a home should get the new version.
---

# render-and-stage

Staging is always allowed. Production, flashing a device and any client's home need a human's
go-ahead in the conversation (AGENTS.md, boundaries). The home repository's own `AGENTS.md` says
where its config, inputs and staging live; read it first.

1. **Catalog green.** `tools/check-all.sh` passes for the component in this repository (skill
   `check`), committed, so `--stamp` names a clean commit.
2. **Render** into the home repository with its inputs file:

   ```bash
   uv run tools/domosenso_render.py components/<id> --inputs <home>/<inputs.yaml> --out <dir> --stamp
   ```

   `*.lang.yaml.j2` give one file per language, the rest one file each. The first line of every file
   is `# Rendered by Domosenso from <id>@<commit> — do not edit` (`-dirty` means uncommitted
   catalog changes: stop and commit). A missing input is an error naming it. These are managed files:
   never edit them in the home, change the inputs or the component.
3. **Install** cards, shell scripts and themes into the home's config directory:

   ```bash
   uv run tools/domosenso_install.py components/<id> --config <home config dir> [--dry-run]
   ```

   It prints the Lovelace resource URLs (`/local/domosenso/<id>/<version>/cards/<name>.js`). An
   existing home changes each resource's URL in place; adding a second resource for the same card
   defines its element twice and the page breaks.
4. **Read the upgrade notes** (`components/<id>/UPGRADE.md`, `docs/UPGRADE_NOTES.md`) for renamed
   entities or option values the home's own files still use, and change those too.
5. **check_config** on the home's config. Count the `ERROR:` lines as well as the reported errors:
   an invalid automation-blueprint instance is only a log line and the exit code stays 0.
6. **Staging.** Deploy to the home's staging Home Assistant as its `AGENTS.md` describes, restart
   rather than reload when input_select options changed, and compare screenshots page by page with
   the version before. Report what differs and whether it was intended.
7. **Production** only after an explicit go-ahead, with the checklist from the upgrade notes.
