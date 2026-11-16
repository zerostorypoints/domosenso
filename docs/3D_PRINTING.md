# Designing printable parts for DomoSenso

Use `3d-print-designer` when a task needs a new or modified printable enclosure, bracket, stand
or other physical part. It is optional for ordinary Home Assistant, ESPHome and website work.
Check the active agent's skill list first and read the installed `SKILL.md` before modelling.
If missing, install it as below within the task's authorization; do not claim it is available
merely because another agent's installation exists on the same computer.

## Source and prerequisites

Use the DomoSenso maintainer's fork, submitted as
[upstream pull request #6](https://github.com/wilsonwaters/3d-printing/pull/6). The installation
fetches that pull-request ref from [upstream](https://github.com/wilsonwaters/3d-printing), then
selects the fork's exact commit rather than upstream `main`. This guide pins commit
`16c019f647286f3a91520b73e97614bb2564b627`. Its source directory is
`.claude/skills/3d-print-designer/`. The fork adds real-parts, first-print and multicolour
playbooks, `bambu-cli.py complete|slice`, and `make-bambu-3mf.py --add-part`.
The skill has its own MIT license; retain it with the installed copy.

You need Git and Bash for the installation below, Python 3 for the bundled tools, and OpenSCAD
for geometry verification and STL export. Read the installed `verification.md` for supported
OpenSCAD versions and discovery (`OPENSCAD` or `--openscad` when necessary).
Bambu Studio is needed for its CLI preset completion and slicing; a skill installation alone
does not install any of these applications. Check each tool separately before promising output.

## Install for the active agent

At the pinned revision, `adapters/` contains Cursor, Windsurf, Copilot and Cline adapters, but no
Codex adapter. Codex can load the original `SKILL.md` directory directly; copy the **whole
directory**, including Python tools and referenced Markdown files.

For Codex, use the user-level `~/.agents/skills` location described in the
[official skill documentation](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).
For Claude Code, use `~/.claude/skills`. Keep this external skill outside DomoSenso's tracked
`.ai/skills`, `.agents/skills` and `.claude/skills`; `tools/install_skills.py` manages project skills
and does not install this dependency. Avoid duplicate installations with the same skill name;
inspect existing locations, including older Codex installations under `~/.codex/skills`.

Run this block in Bash. It refuses an existing destination, including a broken symlink. For
Claude Code, set `DOMOSENSO_SKILLS_DIR="$HOME/.claude/skills"` before running the block; the same
override can select an isolated directory when verifying setup.

```bash
(
  set -euo pipefail
  print_skill_repo=https://github.com/wilsonwaters/3d-printing.git
  print_skill_ref=refs/pull/6/head
  print_skill_revision=16c019f647286f3a91520b73e97614bb2564b627
  print_skill_parent=${DOMOSENSO_SKILLS_DIR:-"$HOME/.agents/skills"}
  print_skill_dest="$print_skill_parent/3d-print-designer"
  if [ -e "$print_skill_dest" ] || [ -L "$print_skill_dest" ]; then
    printf 'Already exists; inspect and preserve before updating: %s\n' "$print_skill_dest" >&2
    exit 1
  fi
  print_skill_tmp=$(mktemp -d)
  trap 'rm -rf "$print_skill_tmp"' EXIT
  git clone --filter=blob:none --no-checkout "$print_skill_repo" "$print_skill_tmp/source"
  git -C "$print_skill_tmp/source" sparse-checkout set .claude/skills/3d-print-designer
  git -C "$print_skill_tmp/source" fetch origin "$print_skill_ref"
  git -C "$print_skill_tmp/source" checkout --detach "$print_skill_revision"
  test "$(git -C "$print_skill_tmp/source" rev-parse HEAD)" = "$print_skill_revision"
  cp -R "$print_skill_tmp/source/.claude/skills/3d-print-designer" "$print_skill_tmp/install"
  cp "$print_skill_tmp/source/LICENSE" "$print_skill_tmp/install/LICENSE"
  printf 'Source: %s\nRef: %s\nRevision: %s\n' \
    "$print_skill_repo" "$print_skill_ref" "$print_skill_revision" \
    > "$print_skill_tmp/install/INSTALLED.txt"
  python3 "$print_skill_tmp/install/verify-model.py" --help >/dev/null
  python3 "$print_skill_tmp/install/make-bambu-3mf.py" --help >/dev/null
  python3 "$print_skill_tmp/install/bambu-cli.py" --help >/dev/null
  mkdir -p "$print_skill_parent"
  # copytree refuses an existing destination even if it appeared after the first check.
  python3 -c 'import shutil, sys; shutil.copytree(sys.argv[1], sys.argv[2])' \
    "$print_skill_tmp/install" "$print_skill_dest"
  printf 'Installed: %s\n' "$print_skill_dest"
)
```

Confirm the skill appears in the active client's skill list and ask it to read the installed
`SKILL.md` and `INSTALLED.txt`. If Codex does not discover the new skill, restart it, as described
in the official documentation. Reading the file manually proves access, not automatic discovery.
The three `--help` checks above prove Python entry points load; they do **not** prove OpenSCAD,
Bambu Studio, a model or a physical print works.

### Updates and local customizations

An installed copy is not a Git checkout. Change the skill in a working checkout of its source
fork, review and commit there, then reinstall from that reviewed revision. Do not edit only the
installed copy and expect a push in the source repository to include those changes.

Before updating, inspect `INSTALLED.txt` and compare the installed directory with that source
revision. Preserve local changes and the entire old directory in recoverable storage **outside
the client's skill search directories**, recording its original path and revision. Install the
new revision into a separate directory using `DOMOSENSO_SKILLS_DIR`, verify it, then replace the
active copy while retaining the backup. Restore by moving the new copy aside and putting the
backup back at its recorded path. Do not overwrite customizations or change pins to `main`
implicitly; review the new revision, repeat verification, and update the documented pin.
If the pull-request ref is no longer available, use the source fork linked on the pull request
and verify the same pinned commit; do not silently fall back to upstream `main`.

## Use it in DomoSenso

1. Confirm the printer, nozzle and material; for an existing model read its headers first.
   Ask for the actual hardware variant, measurements, connector clearances and button access.
   An oblique photograph is context, not a dimensioned drawing. Load `playbook-real-parts.md`.
2. Agree on measurable requirements, assembly, print orientation and motion ranges. Keep
   installation-specific photos and notes in the private instance, not the public catalog.
3. Put reusable hardware models in `devices/enclosures/<device-or-board-pair>/`, following
   [SPEC-036](../.ai/specs/SPEC-036-2026-11-05-printable-enclosures.md) and the
   [existing enclosure](../devices/enclosures/m5stack-cc1101-atom-lite/README.md).
   A printable part alone is not a Home Assistant component and needs no component version bump.
4. Deliver parametric `.scad`, generated STL files, previews and a README with hardware,
   assembly, print settings, measurements and unverified limits. For Bambu printers also produce
   the project 3MF using the actual printer/nozzle/material profile. Keep build commands and
   prerequisites reproducible on another installation; never embed a developer's absolute paths.
5. Read `verification.md`, run `verify-model.py` on all printable parts and interference checks,
   fix failures, then perform the skill's independent design review with rendered geometry.
   The skill names Claude-specific reviewer models. On Codex use an available independent
   reviewer through the host's supported delegation tools and report its actual model; never
   claim a Sonnet or Fable review that did not run. If delegation is unavailable, disclose the
   missing independent review and hand off only with that limitation.
6. For Bambu projects, follow `bambu-3mf-export.md`; for multiple filaments also use
   `playbook-multicolour.md`, complete presets and inspect the slicing result. Read the selected
   filament's requirements rather than substituting a generic profile without checking it.
7. Separate verified geometry from physical fit and stability. Use an interface coupon before
   a long print when fit matters, and `playbook-first-print.md` for feedback. Record which checks
   ran, which did not, and what still requires a physical print. Preparing files does not
   authorize sending a job to a printer or publishing a model to an external catalog.

## MakerWorld and domosenso.org share the model sources

The device guides in `devices/*.md` supply the enclosure overview on domosenso.org. Enclosure
READMEs supply parts, printing and assembly. Do not maintain a second hand-written copy for
MakerWorld. `devices/enclosures/makerworld.json` selects the three models, README sections and
exact files; `makerworldUrl` stays null until a publication URL has actually been verified.

After committing the model and instructions, export a delivery directory outside the checkout:

```sh
uv run tools/export_makerworld.py --revision "$(git rev-parse HEAD)" --out /tmp/domosenso-makerworld
```

Each folder contains `description.md`, the existing CAD illustrations, a complete ZIP and a
manifest recording the source SHA and SHA-256 of every source file. All inputs come from that
commit, so uncommitted local edits cannot silently change an upload. Convert a description for
a rich-text editor with Pandoc if needed: `pandoc description.md -f gfm -t html -o description.html`.
The website publishes its selected `documentationCommit` through its normal source/main gate;
use the same revision for MakerWorld after the website pin has advanced. A draft may name a
newer source revision, but do not claim it is already live on .org.

Keep both bases of the radar mount in one listing, both dragon orientations in one listing,
and both radio base/clamp options in one listing. Preserve LICENSE and NOTICE; choose a matching
license on the platform, and do not select Exclusive while these files are publicly available.
Do not upload calibration/test plates as independent models. Choose the material in each 3MF
before slicing; a physical fit report does not certify every profile or optional variant.

Publication also needs real, matching photographs. The MakerWorld model-upload guidelines
inspected on 16 November 2026 require at least three views of each completed print. Add CAD
assembly diagrams as supplemental illustrations; do not present renders as print photos. Review
current requirements at https://wiki.bambulab.com/en/makerworld/tutorials/model-upload-guidelines
before publishing. Account sessions and unpublished draft identifiers stay outside the repository.
