# SPEC-035: a home's private folder outside its repository

- Status: approved 2026-11-05 by the maintainer, as written; location `~/.config/domosenso/homes/<id>/` (open question 1).
- Source: maintainer request, 2026-11-05: a user-level folder for this kind of data, "because it
  disappears when we remove the worktree". It followed the first home's gate-remote rollout
  (SPEC-034). There, the captured gate code and the ESPHome `secrets.yaml` existed only as
  git-ignored files in two git worktrees and a temporary folder. The first home moved both by hand to
  `~/.config/domosenso/homes/<home>/esphome/` and linked them back into `esphome/`. Tested there with
  ESPHome 2026.9.1 and `domosenso status`; the results are below, each marked tested or inference.

## Goal and placement

Each home keeps the files that git must not hold in one folder per home in the user's config
directory, outside every checkout. The home repository holds links to them. A new worktree or a
fresh clone then misses nothing it cannot get back with one command, and removing a worktree deletes
only links. The tool reports what is missing.

Placement test:

1. **What happens today.**
   - The home template git-ignores `secrets.yaml`, `token` and `*.token`.
   - `docs/getting-started.md` puts the ESPHome secrets in the home's `esphome/secrets.yaml`.
   - gate-remote's README puts `<name>-<slug>.code.yaml` next to the device file and asks the home
     to git-ignore it.
   - All of these live inside one checkout. `git worktree add` creates a worktree without them, and
     removing the worktree, or a clone, deletes them. Agents work in worktrees by rule (AGENTS.md),
     so every agent session hits this.
2. **What is lost.**
   - The ESPHome API key. The home template's device files authenticate OTA with it
     (`ota: encryption:` inherits the API key, `docs/pilot-bermuda-presence.md`). Losing it means
     flashing every board over USB (inference).
   - The Wi-Fi credentials.
   - A captured gate code. A new capture needs the handset, the board and the capture firmware
     again.
3. **Where it belongs.** Every home has such files, so the folder belongs in the tool and the home
   template, not in one home's local fix.

## Location

`<config home>/domosenso/homes/<id>/`. `<config home>` is `$XDG_CONFIG_HOME` when set, otherwise
`~/.config`, on macOS and Linux alike.

The maintainer first suggested `~/.domosenso/`. This spec recommends `~/.config/domosenso/` instead,
because Domosenso already keeps user-level data there:
- the bot pull request tool on `feature/team-workflow` stores `~/.config/domosenso/pr-bot/...` under
  the same 700/600 rule;
- the maintainer's machine holds device notes and signing keys there.

One folder for everything Domosenso keeps per user, in the place Linux users expect. The maintainer
decides (open question 1).

The layout mirrors the home repository: a file at `<private>/<path>` belongs at `<home>/<path>`.
Example, demo home:

```
~/.config/domosenso/homes/alex-and-sam/
  esphome/secrets.yaml
  esphome/gate-remote-garage.code.yaml
```

Folders are 700, files 600. The folder never sits inside a git repository; the command refuses to
create or use one that does.

## The home id

New optional key `id` in `domosenso.yaml`, a slug (`^[a-z0-9]+(-[a-z0-9]+)*$`). `init` writes it,
defaulting to the slug of the home directory's name; `init --id <slug>` overrides that.

The id is a key and not derived from the directory, because a worktree's directory has another name
(for example `.claude/worktrees/<task>`). A derived id would differ per worktree, which is the
problem this spec removes.

A home without `id` behaves as today: `status` prints none of the lines below, and `private` fails
with `FAIL no id in domosenso.yaml`.

## What goes there

Files that git must not hold and that the home cannot regenerate:

- `<esphome_dir>/secrets.yaml`;
- `<esphome_dir>/*.code.yaml`, the codes of gate-remote (SPEC-034);
- any other file the home chooses: the command links every regular file under the folder.

Target tokens need no tool change. `token_file` already takes any path with `~`. The template
suggests `~/.config/domosenso/homes/<id>/tokens/<target>` for a token the home has no other place
for.

Not there:
- staging data (`staging/.data*/`), which the staging tool regenerates;
- `.domosenso/` (catalog cache, snapshots, deploy backups);
- Home Assistant's own `secrets.yaml` and `.storage/`, which live on the target.

Nothing is linked under `config_dir`. `deploy` walks `config_dir` and follows links, so a private
file there could reach a target. `private link` and `private adopt` refuse such paths, which keeps
the deploy surface unchanged.

## Commands

New command `private`. Like every command, it prints one line per action, then `ok` or
`FAIL <reason>`, and `--json`.

- **`domosenso private link`** makes `<home>/<path>` a symlink to each file under the private folder.
  - Lines:
    - `link <path>`: created;
    - `linked <path>`: already right;
    - `conflict <path>`: a regular file or another link is there, left alone;
    - `tracked <path>`: git tracks that path, refused;
    - `refused <path>: inside config_dir`.
  - The command fails on any conflict, tracked or refused path (`FAIL <n> not linked`).
  - It writes nothing in the private folder and can run any number of times.
  - Run it once in every new checkout or worktree.
- **`domosenso private adopt <path>...`** moves a file of the home into the private folder and leaves
  a link in its place. It creates folders with mode 700 and the file with 600.
  - It refuses:
    - a tracked file (`tracked <path>`);
    - a path outside the home or under `config_dir`;
    - a link;
    - a path that already exists in the private folder with other content (`exists <path>`).
  - The line for each file is `adopt <path>`.
  - This is how an existing home moves its secrets, as the first home did by hand.

`status` gains these lines, only when `id` is set:

- `private <folder>`, the folder in use, written with `~`;
- `private-link <path> missing`: a private file without its link, as in a fresh worktree;
  `private link` fixes it;
- `private-file <path> in repository`: `<esphome_dir>/secrets.yaml` or `<esphome_dir>/*.code.yaml`
  is a regular file and not a link into the private folder; `private adopt` fixes it;
- `private-mode <path> <mode>`: a folder or file looser than 700/600.

A fix that does not depend on `id`:
- `<esphome_dir>/*.code.yaml` joins `<esphome_dir>/secrets.yaml` as built-in `unmanaged`.
- Tested 2026-11-05 on a fresh `init` home without a `local:` glob for `esphome/`: a gate-remote code
  file makes `status` end in `unclassified esphome/gate-remote-garage.code.yaml`, then
  `FAIL 1 unclassified`.
- The first home did not see this, because its `local:` globs include `esphome/**`.

## ESPHome

Tested 2026-11-05 on the first home with ESPHome 2026.9.1 (`esphome config` and `esphome compile`):
a gate-remote device file reads `!secret` from a linked `secrets.yaml` and `!include`s a linked
`*.code.yaml`.

The OTA upload that day ran before the links existed. An upload reads the built binary, not the
secrets (inference). `tools/esphome-check.sh` copies the demo home's files and does not change.

## Template and documentation

- `examples/home-template/.gitignore`: add `*.code.yaml`. The links are ignored by the same lines as
  the files.
- `examples/home-template/AGENTS.md`:
  - private files live in the folder;
  - a new worktree runs `domosenso private link`;
  - a private file is never copied into the repository;
  - back the folder up.
- `docs/getting-started.md`:
  - the ESPHome secrets step writes into the private folder and runs `private link`;
  - a backup note: the folder is the only copy outside the boards. Time Machine and most backup tools
    include `~/.config` unless it is excluded (inference; check per tool).
- `components/gate-remote/README.md`, "Capture" steps 6 and 7: paste the code, then
  `domosenso private adopt <esphome_dir>/<name>-<slug>.code.yaml`. This replaces "add `*.code.yaml`
  to the `.gitignore`".
- `docs/COMPATIBILITY.md`:
  - the `id` key;
  - the `private` command and its lines;
  - the new `status` lines;
  - the private folder's layout (STABLE; new files ADDITIVE-ONLY).

## Compatibility

Everything is additive: an optional key, a new command, new `status` lines, and one more built-in
`unmanaged` pattern. A home without `id` sees no change apart from the `*.code.yaml` fix.

An existing home moves in three steps:
1. add `id`;
2. run `private adopt esphome/secrets.yaml` and the same for any code files;
3. run `private link` in each other checkout.

No component `UPGRADE.md` entry is needed. gate-remote's README changes in its next patch release.

## Tests

- pytest, `private link`:
  - creates links and repeats harmlessly;
  - refuses tracked files, conflicts and paths under `config_dir`;
  - honours `XDG_CONFIG_HOME`.
- pytest, `private adopt`:
  - moves the file and leaves the link;
  - modes 700/600;
  - refuses tracked files, links and `exists`.
- pytest, `status`:
  - missing link, plain secret in the repository, loose mode;
  - `*.code.yaml` unmanaged;
  - no private lines without `id`.
- Schema: `id` is a slug; `init --id`.
- End to end, in a temporary git repository:
  1. `init`, add `id`, `private adopt`;
  2. `git worktree add`; `status` in the new worktree shows `private-link ... missing`;
  3. `private link`; `status` is `ok`;
  4. removing the worktree leaves the private folder intact;
  5. `esphome config` of the demo home's gate-remote device file through the links.
- `tools/check-all.sh`.
- Run on a fresh home directory as well as the first home (reuse rule).

## Out of scope

- Encrypting the folder, or a keychain backend (macOS Keychain, libsecret).
- Syncing the folder between machines; an export or backup command.
- Windows. Symlinks there need Developer Mode or administrator rights, so the command refuses with
  `FAIL symlinks unsupported`.
- Home Assistant's own `secrets.yaml` and `.storage/` on the target; staging data.
- gate-remote's `provides` pattern. On 2026-11-05 Home Assistant 2026.9.2 put the node's area into
  its entity ids (the device file sets `esphome: area:`), so the pattern
  `button.<friendly name slug>_<label slug>` is wrong when `area` is set. This is a separate
  gate-remote fix in the same patch release, needing no spec.

## Open questions

1. Location: `~/.config/domosenso/homes/<id>/` (recommended) or `~/.domosenso/homes/<id>/`?
2. A `private_dir` key to put the folder elsewhere, for example on an encrypted volume. Recommended:
   not now; a home that needs it can link the whole folder.
3. Should `add` run `private link` itself? Recommended: no; `status` reports the missing link and
   `add` stays as it is.
4. A keychain backend later.
5. Windows, via hard links or junctions.

## Tasks (coordinator: the session that wrote this spec; feature branch `feature/home-private-folder`)

Status per task: waiting, in progress, in review, merged into the feature branch.

1. (merged into the feature branch, #226) Tool: `id` in the schema and `init`, `private link` / `private adopt`, the `status` lines, the
   `*.code.yaml` fix, `docs/COMPATIBILITY.md`, tests. One pull request.
2. (merged into the feature branch, #228) Template and docs: home template, getting started, gate-remote README in gate-remote 0.1.1
   together with the `provides` fix. One pull request.
3. (waiting for the feature branch in `main`: `id` in `domosenso.yaml` fails the schema of the command on `main`) First home: add `id` and replace the hand-made links with `private link`. The folder already
   exists. This is done in that home's repository.
