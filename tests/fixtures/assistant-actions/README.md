# Fictional assistant action protocol fixtures

`lights.json` and `awnings.json` are real compiler outputs for `inputs.json`, using
component version 0.4.0, synthetic commit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
and `dev: false`. Bridge tests must provide the same exact component inventory
provenance; these files are examples, not release artifacts or authorization.
They contain no enabled flags, grants or executable HA services.

Copy both standalone schemas from `schemas/assistant-actions*.schema.json` when
validating outside this repository. The definitions schema describes
`bundle.definitions`; the profile schema describes the complete bundle. Consumers
must also validate fixed action semantics, component ownership and installed
provenance as the compiler does. Unsupported owners/types are ignored separately
from supported timer artifacts. The private installation destination is
`domosenso/assistant-actions/<component>.yaml`, outside `www` and HA packages.

The action APIs remain `load_actions` and `compile_actions`. Controls use
`definitions.actions`, revision 1, operation `write`, types `control-action.v1`
and `control-result.v1`, effect equal to the action ID suffix, empty parameters
and confirmation `none`. Sources use required_facts/optional_facts, with the same
role/type/units/source shape as read capabilities. Subjects share read keys,
labels, room keys and target entity references. A light proxy additionally carries optional
`group: {entity}`, from existing `rooms[].group`, referencing a declared upstream light.
The target remains `fields.light.entity`; no group IDs are inferred. The bridge must bind
exact current membership to grants/revisions, deduplicate or reject overlaps and invalidate
membership growth; missing/unknown membership fails closed.

`lights-membership.json` is fictional HA state evidence, with `initial` and `expanded`
entity-ID-keyed snapshots. Initially `light.office_group` contains `light.desk`, which
is also an explicit action subject in `lights.json`; `light.room_office` is its proxy
and still exposes only `component: lights`. The expanded snapshot adds `light.ceiling`.
This supplies group/member overlap and scope-growth cases without claiming that compiled
metadata snapshots dynamic membership or grants future members access.

An optional awning `guard`
references the wind and last-heard entities, with a positive finite
`max_age_seconds` from the component's existing silence policy. Absence of a
guard never permits extension; retraction and supported STOP do not require calm
wind. The bridge checks current permissions, availability, safety and grants.

`timers.json` captures the preceding timer compiler output at synthetic commit
`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`. Its operation, types, effects,
parameters and confirmation semantics remain unchanged. `lights-read.yaml` and
`awnings-read.yaml` capture preceding schema-1 read serialization at version 0.3.0
and that same synthetic commit. Regression tests compare complete bytes at
identical provenance, separating the intentional version bump from serialization.

Run `uv run pytest -q tests/test_assistant_actions.py tests/test_cli_actions.py`
to validate fixture equality and fresh-catalog installation. To regenerate control
fixtures after a reviewed protocol change, load `inputs.json`, render the declared
bindings with `domosenso_render._make_env`, call `compile_actions` with the
synthetic commit above and `dirty=False`, and serialize with JSON indentation 2
and Unicode enabled. Keep the timer/read regression fixtures pinned to their
preceding contract rather than regenerating them with a changed compiler.
