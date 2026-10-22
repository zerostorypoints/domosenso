# Plan: onboard-home v2 (SPEC-011)

Spec: [SPEC-011](../.ai/specs/SPEC-011-2026-10-22-onboard-home-v2.md), approved 2026-10-22.
Feature branch: `feature/onboard-v2` (from the spec's branch, PR #24). One pull request per phase into
the feature branch, then one from the feature branch into `main` for the maintainer.
Coordinator: the session that wrote the spec; it does the phases itself, one after the other.

Working conditions from 2026-10-22, for about four days: the maintainer is away. No SSH or LAN to the
home's NAS, so no `deploy`, `rollback`, probe install or any write to production. Production is
read-only through its Cloudflare tunnel (REST and websocket). Anything that needs a running Home
Assistant uses a local staging container. The tablet cannot be checked: those checks are owed until
the maintainer is back.

## Tasks

| phase | task | state |
|---|---|---|
| A | `domosenso discover` (§4.1), tests, COMPATIBILITY row | done on `claude/onboard-v2-phase-a` |
| A | `sw_version` in `recommend --from-ha` `scan.devices`; `tested_homes` per device in `--json` `needs` / `optional` (§5, §8) | done on `claude/onboard-v2-phase-a` |
| A | device files: `tested`, `tablet` in the schema; `tested.homes: 1` on the eight devices; `devices/tcl-9469x.yaml` with its match rule and profile; the tablet in the scenes that list the Ramka | done on `claude/onboard-v2-phase-a` |
| A | skill `onboard-home` v2 text (§1, §2.1, §4.2, §5, §6.1, §7.1–7.2); getting-started; AGENTS.md command list | done on `claude/onboard-v2-phase-a` |
| A | fix found on the way: REST through a Cloudflare tunnel needs a named User-Agent (error 1010) | done on `claude/onboard-v2-phase-a` |
| A | real check, read-only: `discover` and `recommend --from-ha` against production over the tunnel | done 2026-10-22 (reported in the conversation) |
| B | `domosenso probe` and the probe card (§7.3); `ha_api` subscriptions; skill text | done on `claude/onboard-v2-phase-b` |
| B | end-to-end on a throwaway local HA 2026.9.2 (onboarded through its API): install, the page in a browser at 1100 × 720 DPR 2, `--read` got the report, remove (twice) | done 2026-10-22 |
| B | the probe on the real tablet (must report 1100 × 720 at DPR 2) | owed until the maintainer is back |
| C | ramka 0.2.0: optional `air`, `plants`, `climate`, `photo_dir` (photos separable, at the coordinator's request); `screen` input and the layout table; `recommend: [tcl-9469x]` for `android-tablet`; renderer `fail()`; `ha-check` `INPUTS=` and a check-all step (§6.2, §7.4) | done on `claude/onboard-v2-phase-c` |
| C | byte-identical render with every page and no `screen` (a test against the tag `ramka/0.1.2`); every page shot on a scratch demo staging at 1024 × 720 and 1280 × 800; the reduced home run live (rotation, swipes, guard) | done 2026-10-22 |
| C | tag `ramka/0.2.0` (with `tools/release.py`, after the merge into `main`) | waiting for the maintainer |
| C | follow-up found: German status words cut off on the status page (already in 0.1.2) | not started |
| all | push the branches, PRs per phase into `feature/onboard-v2`, then one into `main` | waiting for the maintainer's go-ahead |
| D | `examples/home-template/services/home-assistant/compose.yaml`, skill section 1.1, a test that the image is the checked version (§3) | done on `claude/onboard-v2-phase-d` |
| D | tried on a local container (Mac, port published instead of host networking): start, `/api/onboarding`, onboarding, `discover`, `recommend --from-ha` | done 2026-10-22 |
| D | on a Synology or a Linux host | owed to the first home without Home Assistant |
| E | SPEC-012 `remote-access` and `domosenso http`, drafted on `claude/onboard-v2-phase-e`; found while drafting: on 2026.9 the `http` settings are not YAML (SPEC-011 §2.2 corrected) | draft, waiting for the maintainer's approval |
