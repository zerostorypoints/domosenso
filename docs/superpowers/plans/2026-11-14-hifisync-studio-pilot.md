# HiFiSync Studio Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox syntax.

**Goal:** Show Now Playing, System and Room on a paired Frame tablet for one selected HiFiSync system and HA player.

**Architecture:** HiFiSync authorizes and normalizes the system and current room. A standalone HA integration owns the token, player binding and cache. Frame Studio reads the presentation through the paired HA bridge and renders it offline.

**Tech Stack:** Next.js, Supabase/Postgres, Home Assistant/Python, JavaScript Studio, React Native Frame.

**Spec:** [SPEC-050](../../../.ai/specs/SPEC-050-2026-11-14-hifisync-studio-pilot.md)

## Global Constraints

- One HA installation, one registered player and one selected system UUID. Explicit scope contains current personal system UUIDs, including private and public systems.
- Token expiry 90 days, refresh five minutes, last-good data no longer than one hour from validation and never beyond known token expiry. Authoritative access loss clears the snapshot.
- Keep the cloud key in HA config entry data. No cloud credential or remote asset reaches Frame. No HA player identifiers or playback data reach HiFiSync.
- Use synthetic fixtures, local branches and independent test installations. Physical installation, publishing and production operations have separate scopes.

## Shared interfaces

- `GET /api/integrations/home-assistant/v1/systems`: bearer token. JSON `{expiresAt,systems:[{id,name,visibility,roomName}]}`; visibility is `public` or `private`, roomName may be null.
- `GET /api/integrations/home-assistant/v1/systems/{uuid}`: bearer token. JSON `{expiresAt,snapshot}`; 401 for invalid/revoked/expired grant, 404 for unavailable/out-of-scope selected system. Use complete responses in this pilot. `expiresAt` is ISO 8601.
- `snapshot`: `{version:1,revision,system:{id,name,components:[{id,label,role,quantity}],rack:string[][]},room:null|{name,widthM,lengthM,heightM,placements:[{role,xM,yM,rotationDeg}]}}`. Height and rotation may be null. Role in placements is left, right, subwoofer or listening. Plan coordinates are metres from the front-left corner, with y increasing toward the listener. Zero degrees faces along positive y and positive angles rotate clockwise. Use only stored layout; omit unsupported or out-of-bounds placements. Rack references component ids. Components and placements are bounded.
- HA stores a callable at `hass.data["hifisync"]["studio_snapshot_v1"]` accepting the effective player entity ID and returning `None` or `{snapshot,stale,validUntil}`. `validUntil` is ISO 8601. The callable resolves registry identity and expiry locally, performs no network I/O and returns no credentials.
- Frame endpoint opt-in `hifisync` plus client `hifisyncVersion:1` negotiates optional `data.hifisync` with the local provider shape. Capabilities `hifisync-system` and `hifisync-room` gate screens independently. Extend existing next/previous navigation and keep Now Playing unconditional.

## Review Focus

- Lost ownership or scope during a warm cache read clears data at authoritative validation.
- A late response for a formerly selected system cannot restore it.
- Player rename keeps the binding; replacement under the same entity ID requires remapping.
- Old renderer and bridge combinations preserve Now Playing and the existing schema.
- An offline tablet hides private projection when local validity expires.

## Tasks

### 1. HiFiSync grant and API

- [x] Add failing web and SQL cases for own private/public listing, excluded systems, foreign UUID, revocation, expiry, renamed slug, changed room and missing selection.
- [x] Add additive Supabase migration for grants and backend-only lookup. Place hashing, bounded projection and scoped checks under `packages/web/lib/integrations/home-assistant/`. Reuse existing authenticated account settings, catalog labels and normalized room data. Add issuance/revoke/scope controls to the account settings. Add both GET routes under `packages/web/app/api/integrations/home-assistant/v1/`.
- [x] Run targeted web tests, a local database migration and TypeScript check. Commit only HiFiSync-owned changes.

### 2. Standalone HA integration

- [x] Add failing pytest cases for the HTTP contract, system deletion vs reauth, refresh generation, transient expiry, registry rename/replacement and scope list.
- [x] Build `custom_components/hifisync/` with config flow, manifest, coordinator, bounded HTTP client and the provider above. Add HACS metadata and setup/release instructions. Use config flow for token, system and player, and reconfigure for stale selection.
- [x] Verify in fresh ordinary HA with a mock HTTPS HiFiSync contract, including setup and refresh with no Frame. Commit only integration-owned files.

### 3. Studio source and renderer

- [x] Rebuild revision `d50300e` in isolation and match both Frame's lock and Android renderer bytes. Verified content hash `812a338ad47792767167fa6c3d36a2a2d16699f12d91904f392a4552f1be5eaa`.
- [x] Recover only `packages/frame-studio/` and the deterministic build tool from that checkpoint. Record provenance and avoid unrelated historical code. Add the renderer's test dependencies using the parent repository conventions.
- [x] Red/green renderer cases for separate widget gates, complete and dimension-only rooms, touch navigation, offline validity and live snapshot removal. Extend `registry.json`, `schema.json`, `contract.js`, `frame-ui.js`, layout, template, styles and translations as required. Render a simple equipment list/rack and geometrically scaled top-down plan.
- [x] Exercise renderer tests and build a committed, deterministic artifact. Verify tablet-sized layouts locally.

### 4. HA bridge and Frame compatibility

- [x] Red/green tests for wrong endpoint, denied player and missing opt-in, warm cache loss, negotiation and fallback while an extra page is open.
- [x] Extend `studio_api.py`, `studio_data.py`, `studio_runtime.py`, setup and validation in `domosenso-frame-ha`. Keep old clients on the legacy projection, including the old widget config. Import the matching versioned renderer.
- [x] Extend the Frame profile/Studio request handshake in `App.tsx` and transport types, then import the pinned artifact using Frame's script. Test old/new negotiation and expiry while disconnected without external network access from WebView.
- [x] Run the bridge suites, Frame tests, TypeScript checks and artifact integrity check. Commit each repository independently.

### 5. Integrated acceptance

- [x] Rehearse the private-system flow in a fresh staged HA environment using a controlled HiFiSync fixture, including authoritative deletion, fallback while Room is open and selection of another allowed system.
- [x] Capture and inspect Studio landscape and portrait at representative tablet viewports. Record any differences between the browser fixture and physical Frame.
- [ ] Report commits, reproducible install/update order, rollback and explicit prerequisites for real-account and physical tablet acceptance. Preserve all recoverable branches and clean pilot-owned temporary resources.
