# HiFiSync Studio Room Controls Implementation Plan

> For agentic workers: use the executing-plans or subagent-driven-development workflow. Work in a named branch per repository.

**Goal:** Ship the approved warm HiFiSync screens and readable, persistent room placement details in Frame Studio.

**Architecture:** The shared HiFiSync room drawing enables touch gestures and a selection panel only for Studio. DomoSenso sets the brand and resolves the stored placement data into localized drawing props. The Frame Android app consumes the resulting pinned renderer. The bridge and connector keep the existing negotiated snapshot contract.

**Spec:** [SPEC-050](../../../.ai/specs/SPEC-050-2026-11-14-hifisync-studio-pilot.md) plus the approved warm design and November 15 interaction decisions.

## Constraints

- Keep gesture navigation outside the interactive canvas and controls. The isometric canvas rotates with one finger. The plan pans after zoom. Both accept pinch, plus, minus and fit.
- Present saved angles, not acoustic measurements. Retain a selection through drag, zoom and projection changes. Support Polish and English, and preserve existing German locale support.
- Use synthetic browser verification for this stage. Physical acceptance with real data is a separate step.
- Website impact: no catalog or public website change. These pilot controls are documented in the integration guide.

## Tasks

- [ ] HiFiSync: extend RoomIsometric through an optional Studio prop, with localized controls, bounded zoom and a persistent speaker region. Verify saved, missing and zero angles, touch tap versus drag, and the existing web configuration.
- [ ] DomoSenso: reproduce gesture ownership failures in renderer tests. Apply the approved palette only to System and Room and consume the new Studio prop. Build renderer 0.2.6 from the HiFiSync commit and verify synthetic views, locale and navigation.
- [ ] Frame Android: vendor the pinned renderer and build the pilot with application ID com.domosenso.frame.hifisyncpilot and version code 28.
- [ ] Transport: verify the matching connector and bridge revisions, prepare review branches, and document setup, update, rollback and real-room acceptance in PL and EN.
- [ ] Review the coordinated diffs and prepare pull requests where remotes are available.
