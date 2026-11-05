# Canonical native metadata fixtures

These are fictional, private-format schema-2 artifacts produced by SPEC-037's canonical
compiler. They are not the authenticated discovery/query wire format and do not grant
access. Bridge integration must validate provenance, endpoint grants and HA permission,
then derive its bounded client projection. Frame does not load these private files.

`source.yaml` is the canonical authoring input. `temperature-only.json` adds one generic
measurement capability; `temperature-humidity.json` adds a differently named humidity
capability and role using the same evaluator and compiler. The component version and
synthetic commit remain fixed deliberately: metadata/binding content changes must be
noticed independently of the component version. Locales share English fixture wording
so these files test data/protocol projection, not PL/EN matching accuracy.

The output contains canonical `definitions.capabilities`, selected translations, source
bindings and optional subject/room aliases. It deliberately differs from the old
experiment's independent-definition list. Integrators must not silently substitute the
old schema-2 shape. No released v2 consumer is claimed compatible with either shape.

Regenerate from the framework root:

```sh
PYTHONPATH=tools:tests uv run python tests/generate_native_metadata.py
uv run pytest -q tests/test_assistant_metadata.py
```

`SHA256SUMS` pins the source, both outputs and the schema bytes. From this directory,
`shasum -a 256 -c SHA256SUMS` verifies them. Cross-repository consumers copy the schema,
fixtures and sums at a full reviewed framework commit and test equality/digests. Do not
regenerate or patch a copied fixture independently to conceal a disagreement. Source,
schema, fixture and producing revision form one compatibility set.

The assessment and operability corpus remains on the shared browser integration branch
at the revision pinned in SPEC-037. This directory does not replace those semantics or
the companion freshness/partial-evidence cases required before native activation.
