---
name: write-component-spec
description: Write the spec for a new Domosenso component, a new tool capability or a change to a schema or a contract surface, as a numbered file in .ai/specs/, and stop for approval before any code. Use when such work is asked for; plain fixes need no spec.
---

# write-component-spec

Spec-first (AGENTS.md): a new component, a new capability of the tools, a schema change or any
change to a surface in `docs/COMPATIBILITY.md` gets a spec, approved by a human, before it is
implemented. A fix that keeps the contract goes straight to a commit.

1. **Number and name.** Next free `NNN` in `.ai/specs/` (three digits), today's date from `date`,
   a short kebab-case title: `.ai/specs/SPEC-007-2026-11-02-naim-player.md`.
2. **Read first:** `AGENTS.md`, `docs/COMPATIBILITY.md`, the manifests of the components it touches
   or resembles, and their `README.md` notes. For hardware, find what the catalog already has in
   `devices/`.
3. **Sections**, short, facts over prose:
   - Status (draft, the date), source (who asked, which notes);
   - Goal: what a home gets;
   - Devices: required, optional, recommended models; what is tested and what is assumed;
   - Integrations: core / HACS / firmware, versions, setup a human has to do;
   - Inputs: name, type, default, example (fictional, like the demo home's Alex and Sam);
   - Provides: entity ids or patterns, each with `frozen`, `stable` or `additive-only`;
     Consumes: other components' entities it reads;
   - Artifacts and ownership layer of each (managed, instance, local);
   - Compatibility: what existing homes must change, the bridge kept for one minor version, the
     `UPGRADE.md` entry;
   - Tests: which checks prove it (`catalog_check`, pytest, `ha-check`, `esphome-check`, staging);
   - Out of scope; open questions, with what is verified and what is inference marked as such.
4. **Stop.** Show a short summary and wait for an explicit approval. Record it as
   `Status: approved <date>` in the spec, then implement (skill `new-component`).
