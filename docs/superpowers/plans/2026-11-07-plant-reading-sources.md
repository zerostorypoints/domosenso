# Plant reading sources implementation plan

Implement approved SPEC-041 on `codex/plant-sources`.

1. Add failing renderer and Ramka card tests for source binding, age and history.
2. Resolve configured sources in the plants render, generate stable numeric sensors
   and separate report metadata, and keep legacy binding output compatible.
3. Show age in the tile and list and stitch the optional legacy moisture statistics.
   Declare the new contracts and add setup, migration and rollback documentation.
4. Use HA 2026.9.2 in an isolated container to verify recorder continuity across
   configuration reload and fictional Mi Flora packets through the pinned Android
   receiver with no upstream services. Verify the browser card separately.
5. Run the full catalog checks before committing. Website changes are deferred to
   the component releases. The installation guide covers the new configuration.
