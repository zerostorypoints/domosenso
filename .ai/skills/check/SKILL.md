---
name: check
description: Run every check of the Domosenso catalog (tools/check-all.sh) and report pass or fail per step with the cause. Use before a commit, after changing a component, a tool, a schema, AGENTS.md or a skill, and whenever asked whether the repository is green.
---

# check

Run from the repository root. It needs `uv`, node 22 or newer (`npm install` once) and Docker; it
flashes nothing and talks to no Home Assistant instance. A full run takes a few minutes (each
`ha-check` starts a container), so run it in the background where the tool allows.

```bash
tools/check-all.sh
```

The script keeps going after a failure. Its last line is `all checks passed` (exit 0) or
`failed: <step>` once per failed step (exit 1). Each step prints `==> <step>`, its output, then
`ok   <step>` or `FAIL <step>`. Read the output of every failed step:

| step | passes when | when it fails, look at |
|---|---|---|
| `agents_check` | `0 error(s)` | `ERROR` lines: AGENTS.md over 32,768 bytes, CLAUDE.md with text of its own, skill front matter, skill links (fix links with `uv run tools/install_skills.py`) |
| `pytest` | `N passed` | the `FAILED tests/...::name` lines, then that test's assertion |
| `npm test` | `ℹ fail 0` | the `✖` lines of node's test runner and the assertion under each |
| `catalog_check --strict` | `0 error(s), 0 warning(s)` | `ERROR` / `WARNING` lines; with `--strict` a translation key missing in `de` or `pl` fails too |
| `ha-check <component>` | `fresh: 0 errors (...)` | the `error [domain]` lines; `error [log]` lines are invalid automation-blueprint instances, which `check_config` itself lets through with exit 0 |
| `esphome-check <component>` | every device file `config ok` | `config FAIL <file> (see <work dir>/<file>.out)`: open that file |

A single step can be rerun on its own: `uv run pytest -q tests/<file>.py`,
`tools/ha-check.sh <component>`, `tools/esphome-check.sh <component>`,
`uv run tools/catalog_check.py --strict`, `uv run tools/agents_check.py`.

Report: one line per step, `ok` or `FAIL` with the first cause. Do not call the repository green
while any step failed or did not run (say which, for example Docker not running).
