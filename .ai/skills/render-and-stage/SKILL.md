---
name: render-and-stage
description: Try a changed catalog component in a real home before it is released - render it from the catalog working tree into the home repository with domosenso render --catalog-dev, deploy it to the home's staging Home Assistant, compare it page by page, then release a tag and move the home to it with domosenso update. Use when a component or its templates changed and a home should get the new version.
---

# render-and-stage

For the catalog's side of a change (the component is being changed here); adding a released
component to a home is the skill `add-component`. Staging is always allowed. Production, flashing a
device, pushing a tag and any client's home need a human's go-ahead in the conversation (AGENTS.md,
Boundaries). Read the home repository's own `AGENTS.md` first: it says where its config, inputs and
staging live. Commands run from the home's root: `uv run --project <catalog> domosenso <command>`,
written `domosenso <command>`; read the last line, `ok` or `FAIL <reason>`.

1. **Catalog green.** `tools/check-all.sh` passes here (skill `check`), the change committed on its
   branch.
2. **Render the working tree into the home:**

   ```bash
   domosenso render <id> --catalog-dev <catalog>
   ```

   The managed files get a `-dirty` stamp and the lock is left as it was; `deploy production`
   refuses such files. A new input the change needs goes into the home's
   `domosenso/<id>.inputs.yaml` first (a missing one fails the render, naming it). A new
   `templates/instance/` file, ESPHome device file or service file is written only by `add`: for a
   home that has the component already, write it by hand from the component and say so.
3. **Read the upgrade notes** you wrote (`components/<id>/UPGRADE.md`, `docs/UPGRADE_NOTES.md`): an
   entity or option value the home's own files still use is changed there too.
4. **Staging.** `domosenso deploy staging --plan`, then `--apply` (it runs `check_config` and counts
   the error lines an exit code would hide, then restarts). Restart rather than reload when
   `input_select` options changed. Compare screenshots page by page with the version before, as the
   home's `AGENTS.md` describes; report what differs and whether it was intended.
5. **Release.** After the pull request is merged, `uv run tools/release.py <id>` on `main` makes the
   tag; pushing it needs the go-ahead.
6. **Move the home to the tag:** `domosenso update <id>` (prints the `note` lines of `UPGRADE.md`
   and renders from the tag, stamps without `-dirty`), `domosenso deploy staging --apply` once more,
   then production only after an explicit go-ahead: `snapshot`, `deploy production --plan`, their
   yes, `--apply --confirm <hash>`, `verify`.

The old scripts `tools/domosenso_render.py` and `tools/domosenso_install.py` stay for the catalog's
own checks (`ha-check`); a home is rendered with the command.
