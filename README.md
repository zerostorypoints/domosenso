# Evidence for pull request #295

Screenshots of the floor plan card's network traffic (SPEC-047) on the fictional catalog demo
(`tools/dev-home.py`, demo home in `examples/demo-home`), Home Assistant 2026.9.2, at 2×, taken
2026-11-11 from `claude/floorplan-network-traffic` at b9c20f9 with the demo's fictional router
(`claude/demo-router-traffic` at c72c14b, its own pull request into `main`) and `tools/dev_home/screenshots.mjs`
(`--theme default`, light and dark). Desktop 1440×1000, phone 390×844. No real home's data.
This branch is never merged.

- `traffic-heat-*`: Traffic heat, the Radios and hubs layer alone.
- `traffic-links-*`: Traffic links with the living room access point's panel open (opened by a pointer
  over it; a finger's tap opens the same panel where the host sets `tap_tips`, as Pocket does).
- `network-client-*`: the edit panel of the placed "Streamer (DLNA)" point: Network client and the
  "Same device as Streamer (Cast)?" suggestion.
