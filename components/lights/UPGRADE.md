# lights: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.


## 0.4.0 (unreleased): optional assistant action metadata

Adds a private managed `domosenso/assistant-actions/lights.yaml` sidecar for explicit light on/off.
This is descriptive metadata: no service is called and no write grant is enabled.
Existing inputs, HA entities, automations, read definitions and default behaviour are preserved.

### What a home does

After release, upgrade tooling to support SPEC-033 before running
`domosenso update lights --to 0.4.0`; review and deploy the matching inventory and
private sidecars through normal staging. Use a bridge advertising these actions at revision 1
and a client supporting control protocol version 1; released minimum versions are pending.
Review exact targets and explicitly enable/grant controls in the existing integration editor.
Read exposure alone never grants control. Template-light commands continue to use the existing Hue group indirection.
The action-only optional `group: {entity}` relation records the actual `rooms[].group`
for a proxy while preserving its read identity and command target. The bridge must review
current members, bind grants/revisions to that membership and invalidate scope growth;
unknown membership blocks control. No group or room is guessed and no input is added.

For downgrade, update to the preceding component tag and deploy sidecar removal before
reverting tooling. Retain the compatible bridge/client until the change is verified; never
migrate grants to changed bindings. Legacy schema-1 reads and timers remain supported for at
least one minor version. See [protocol and limits](../../docs/ASSISTANT.md).

## 0.3.0 (unreleased): component-backed assistant answers

Adds the optional version 1 assistant definition and private source bindings (SPEC-029).
Existing entities, helper values, dashboard preferences and automation actions are preserved.
The component's metadata alone does not grant the Frame app access to its data.

### What a home does

Upgrade DomoSenso tooling to a revision supporting assistant metadata **before** updating this
component; old tooling cannot install its bindings template correctly. After this version is
released, run `domosenso update lights --to 0.3.0` and review the normal staging/deployment plan.
Deploy the generated `domosenso/assistant/lights.yaml` alongside the matching inventory.
With a compatible Frame bridge, reload metadata, choose the frame in **Assistant sources**,
review the proposed sources and save the selection. Existing supported answers do not require
another APK just to change labels or thresholds. New answer types require a compatible app.

No automatic exposure or control is added. Missing metadata, permissions, fresh observations or
assessment rules produce qualified/unavailable answers. Keep old tooling and component versions
together when reverting. See [shared setup and limitations](../../docs/ASSISTANT.md).

## 0.2.0 (2026-10-21): a package with room lights that follow the bulbs

New artifact `templates/package.yaml.j2` → `packages/lights.yaml`; new optional inputs `rooms` and
`battery_sensors`; new entities (`provides` in `component.yaml`). Nothing that existed changes.

### What a home does

- Nothing, unless it wants the package: then `domosenso add lights@0.2.0` (or `update`), list its
  Hue room groups in `rooms` (with `id` where the current `unique_id` is not `room_<group object id>`),
  and remove its own template lights and sensors with the same `unique_id`s: Home Assistant refuses a
  second entity with a given `unique_id`.
