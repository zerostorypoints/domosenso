# Domosenso principles

What Domosenso is for and how a change is judged. Written 2026-10-31 after the review of catalog
pull request #141, from the maintainer's framing: the framework's strength is its metadata, and
the Ramka is the showcase of what that metadata makes possible. Stated in the shape Open Mercato
uses for its own: a few principles, each a problem and the answer, and a short list of rules for
agents in `AGENTS.md`.

## The five

1. **The metadata is the asset.** Home Assistant knows entities; it does not know what a working
   home is made of. Every Domosenso component declares what it does, what hardware and
   integrations it needs, what it provides, what it consumes and how stable each of those is
   (`component.yaml`, `devices/`, `kinds/`). From that alone an agent recommends hardware,
   onboards a home, installs, upgrades and verifies; the code only renders what the manifest says.
   What the manifest cannot describe does not belong in the catalog.

2. **Components, not configuration.** A home installs tested components from a versioned catalog
   and keeps only its own inputs and its own files. Managed files are replaced on update, never
   edited; a hand edit is refused at the next render. A thing enters the catalog when it would
   work in a second home unchanged; what only one home wants stays in that home's local layer.

3. **Contracts between components, a bridge for one minor version.** Components meet only at
   declared `provides` / `consumes` surfaces, each with a stability level
   (`docs/COMPATIBILITY.md`). A breaking change keeps a bridge for one minor version and an
   `UPGRADE.md` entry, or it does not merge.

4. **Home Assistant stays the home's interface; Domosenso builds the surfaces it does not have.**
   The Home Assistant website and the companion app show everything in the home, and their
   editors remain the way to configure it. Domosenso adds what Home Assistant has no card or flow
   for, a wall tablet readable from across the room, a settings page rendered in the home's
   languages from the manifests, and builds it from Home Assistant's own primitives (its helpers,
   rows, pickers, sections). It does not rebuild a control Home Assistant already offers, and it
   does not open a second place to configure what Home Assistant configures.

5. **Agents do the work, people approve it.** `AGENTS.md`, skills and specs ship in the catalog
   and in every home; the manifest is what an agent reads. A new capability gets a spec before
   code; every check prints a machine-readable pass or fail; nothing reaches production without
   the owner's go-ahead typed in that session.

## The Ramka is the proof of 1 and 4

The Ramka is not a product of its own. Because the manifests say what each component exposes, a
wall tablet's screens, its live settings and its preview render from a home's inputs, in any of
the catalog's languages, and a new component shows up on it by declaring what it provides. It
exists because Home Assistant has no view readable from across a room; everything else in the home
is still used through the Home Assistant app.

## The placement test

Every change answers these in order, before a spec is written:

1. Does Home Assistant already offer it for this surface? Use Home Assistant.
2. Would a second home need it? A component, with its manifest.
3. Only this home? The home's local layer.

None of the three: it is not built.

## Rules for agents

The `Never` list in `AGENTS.md` is these principles as rules:

- never reference another component's entities outside `provides` / `consumes` (3);
- never edit a rendered file: change the inputs or the catalog (2);
- never put a home's names, rooms, ids or credentials in the catalog (2);
- never rebuild a control or editor Home Assistant has: compose it (4);
- never write to production without the owner's go-ahead typed in that session (5).
