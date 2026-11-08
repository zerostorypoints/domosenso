---
name: check-home-upgrades
description: Use when asked what an existing DomoSenso home can upgrade, which installed components are behind, or what a new catalog release changes for that installation.
---

# check-home-upgrades

Audit the selected home before choosing a candidate for [stage-home-update](../stage-home-update/SKILL.md).
Read the home's agent instructions. Keep the report private. Do not change home files, refs, lock,
staging or production. Use task-owned scratch outside both repositories for fetching, caches and
any new evidence. No update, render, deploy, runtime startup or device command is part of this audit.

## Establish the three versions

1. Verify the home and framework paths and Git origins. Distinguish the CLI checkout from the
   home's configured `catalog:` source. Record the active home branch and any relevant pending
   edits. Find the home's canonical integration branch, usually the remote default branch, and
   verify its tip with `git ls-remote --symref <verified-home-origin> HEAD`. If needed, fetch the
   tip into a disposable repo. Read that exact revision's `domosenso.yaml` and `domosenso.lock`.
   Report relevant differences from the active checkout separately.
2. Establish what is deployed separately from what is locked. Use an authorized read-only
   observation such as `sensor.domosenso_components` if available, or inspect dated deploy records,
   generated provenance stamps and existing snapshots. Check relevant rollout branches when a
   record points outside the canonical branch. Report the source, date and target. Label historical
   versions as last confirmed when the target is unreachable. Keep the scope of each observation
   explicit: an HA record cannot establish flashed firmware, and a single dashboard stamp only
   identifies that dashboard's render. If a deployed rollout is missing from the canonical branch,
   flag the reconciliation needed before planning an upgrade from that branch.
3. List stable tags with `git ls-remote --refs --tags <verified-catalog-origin>` or the verified
   refs of an intentionally local catalog. Compare numeric `<id>/<major>.<minor>.<patch>` versions
   for the locked and known-deployed components. Peel annotated tags and compare their commits
   with the lock and deployed provenance where available. Report development, ahead, divergent
   and unverifiable deployments explicitly, including equal version labels with different commits.
   If the authoritative source is
   unreachable, label locally available tags as cached. Untagged work, new components and manual
   integration, firmware or container versions are separate from installed component upgrades.

`domosenso status` can supplement the inventory with stale renders, modified or unclassified
files and manual dependencies. It can populate `.domosenso/`, so run it only in a disposable
copy with the catalog source verified. Avoid copying credentials, ignored runtime data or private
inputs that are unnecessary for the audit. Read only the fields needed to assess applicability.

## Assess and hand off

Read each candidate's tagged `components/<id>/UPGRADE.md` across the entire version gap, plus
relevant framework upgrade notes. If notes are missing or incomplete, inspect the tagged
manifest and relevant diff, and identify what remains unknown. Distinguish behavior that changes
on adoption, opt-in settings, and changes that do not apply to the home's current inputs. Call
out CLI prerequisites, mandatory migrations, external dependencies and manual actions separately.

Report the audited home/CLI revisions and source freshness. For each candidate give the locked,
last confirmed deployed and available versions, user-visible impact, required steps, priority and
a concrete staging check. Include blockers such as divergent rollout history, tag mismatches,
stale renders or hand-edited managed files. An audit does not establish staging compatibility.

When the owner chooses an upgrade to try, hand off the baseline and exact released tag and commit
to `stage-home-update`. Use `add-component` for a new component and `preview-pr` for a framework PR
demo. Keep production approval separate. Clean up scratch, preserving only authorized evidence.
