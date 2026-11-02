# backup: upgrade notes

## 0.2.0 (unreleased): component-backed assistant answers

Adds the optional version 1 assistant definition and private source bindings (SPEC-029).
Existing entities, helper values, dashboard preferences and automation actions are preserved.
The component's metadata alone does not grant the Frame app access to its data.

### What a home does

Upgrade DomoSenso tooling to a revision supporting assistant metadata **before** updating this
component; old tooling cannot install its bindings template correctly. After this version is
released, run `domosenso update backup --to 0.2.0` and review the normal staging/deployment plan.
Deploy the generated `domosenso/assistant/backup.yaml` alongside the matching inventory.
With a compatible Frame bridge, reload metadata, choose the frame in **Assistant sources**,
review the proposed sources and save the selection. Existing supported answers do not require
another APK just to change labels or thresholds. New answer types require a compatible app.

No automatic exposure or control is added. Missing metadata, permissions, fresh observations or
assessment rules produce qualified/unavailable answers. Keep old tooling and component versions
together when reverting. See [shared setup and limitations](../../docs/ASSISTANT.md).

