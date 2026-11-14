# SPEC-049: HiFiSync system and room in Frame Studio

- Status: approved 2026-11-14 by the maintainer.
- Source: the requested tablet pilot and the follow-up on token-based access, system selection and deletion.
- Scope: one Home Assistant installation, one player and one selected HiFiSync system. The first acceptance scenario uses a private system. The same flow accepts a public system owned by the linked account.

## Goal

During playback, a paired Frame tablet in Ramka / Studio presents three music screens: Now Playing, System and Room. Now Playing opens first. The user can step through the screens and return using touch controls. Home Assistant provides playback state. HiFiSync provides the saved equipment and listening-room layout. The local player remains usable throughout setup and failures.

## Approach

Use a dedicated read-only installation token issued from a signed-in HiFiSync account. The owner explicitly selects which current personal systems to share and can select all of those displayed. Consent covers the selected UUIDs at the time of issuance. Newly created systems require the owner to grant access. A valid token can list its allowed systems even after the selected system is lost. A manually pasted token fits the HA setup flow and the requested account controls. A device-code flow would remove pasting, at the cost of a separate enrollment protocol. Both approaches can use the same versioned data contract. A public URL would limit the pilot to published systems and would follow a mutable slug.

## HiFiSync access and data

The owner names the installation and sees the selected systems and expiry before issuing a token. HiFiSync generates a random bearer credential, shows it once and stores only its digest. Account settings list grants and allow an owner to change the allowed UUIDs or revoke the token. Proposed pilot expiry: 90 days. An expired or revoked token requires replacement in HA. Rate-limit API access and keep credentials out of URLs, logs, diagnostics and error text.

The versioned HTTPS API has two read operations. The first lists eligible allowed systems with UUID, name, visibility and room label. The second accepts a system UUID and returns a bounded, normalized snapshot. Both enforce the token's current scope and current personal ownership on every request, including conditional reads. Sketches, retired systems, organization systems and systems belonging to other accounts are outside the pilot scope. Unavailable or unauthorized UUIDs give the same response. A public-to-private transition preserves an explicit owner's grant. A system rename or slug change preserves the grant and HA binding because the system primary key is an independent UUID.

A snapshot supplies its contract version and revision, system name and resolved equipment labels/roles/quantities, and saved rack order if available. It reads the room via the current system relationship, validates ownership, and includes the name, declared dimensions and available stored listening position, speaker and subwoofer layout. Changes to the room, equipment labels used for display or system placement must change the snapshot revision. Room reassignment replaces the previous room on the next successful refresh. Use explicit units and coordinate conventions, and bounded text and collections. If there is no eligible room, omit the room projection and keep System available. The response contains data only and excludes HTML, external assets, account email, unrelated systems and HA identifiers. Access is checked before returning a not-modified response. Responses are private and excluded from shared caches.

## Home Assistant integration

Use a separate HACS custom integration with proposed repo name `hifisync-home-assistant` and domain `hifisync`, following the distribution pattern of Hegel Streaming. HACS default inclusion and Home Assistant core submission are outside this pilot. The integration sets up and refreshes on ordinary HA without Studio or Frame.

An HA administrator adds the integration, pastes the token, selects an eligible system from the scoped list and selects a registered `media_player`. Store the token in HA config entry data. Bind the chosen system UUID to the player's registry entry within this HA installation. Resolve the current entity ID from the registry so a rename keeps the binding, and require explicit remapping if the entry is replaced or removed. A device's area and label are for selection context only. For a Hegel amplifier with duplicate Cast or DLNA entries, select the intended streaming integration explicitly.

The HA backend owns refresh and credential validation. The pilot keeps a bounded snapshot in memory. Proposed timing is refresh at setup and selection, periodic revalidation every five minutes while loaded, and refresh on entering playback if due. Use a single in-flight refresh per selection and discard responses from a superseded selection or credential. Retry transient failures with bounded backoff independent of Frame polling. Expiry of a stored token limits cache lifetime even offline. The integration exposes link and selection readiness in HA and provides a versioned local snapshot interface scoped to the matching player for the optional Studio bridge. Full room data and secrets are excluded from generic HA entity state, recorder and diagnostics. No updates to HiFiSync, media service calls or transmission of track or Home Assistant metadata are required.

| Condition | Expected behavior |
| --- | --- |
| Missing, retired, deleted, out-of-scope or no longer owned selection | On authoritative response, clear the selection and cached snapshot. Keep the player binding and valid token. Open Now Playing and offer explicit reselection in HA, including an empty-list state. |
| Token revoked or expired | Clear the snapshot and start HA reauthentication. Restore a previous selection only after verifying access with the replacement credential. Known expiry applies even offline. |
| Transport timeout or server error | Allow a last successful snapshot marked stale for at most one hour from last successful validation. After the limit, fall back to Now Playing. Remote revocation while offline takes effect when the connection is restored or the local validity limit expires. |
| Explicit local disconnect, integration unload, player replacement or changed selection | Drop the old snapshot at once. An older in-flight response must never revive it. |

## Studio and tablet

Require a paired Frame tablet with the Studio renderer, a fixture or live HA `media_player` and the optional HiFiSync integration enabled. The Frame HA bridge uses only the local provider for the same player bound to the Studio endpoint. For tablet reads, use the existing authenticated HA WebSocket and Frame pairing proof. Resolve the endpoint from that proof and the player from that endpoint's effective server-side mapping. The caller supplies neither identifier to select the data. Check the active user, paired grant, endpoint opt-in and HA read permission for the resolved player on each response, including cache hits and after asynchronous work. An administrator enables the feature for the intended endpoint and applies the template. Any preview of live private data requires an authorized HA administrator and the same endpoint and player checks. The renderer and app receive only bounded presentation data. The contract negotiates the optional extension so clients that do not opt in retain the previous response shape and cannot receive the new widget types or data.

Use the existing Music mode and screen navigation. Keep Now Playing unconditional, first on entering a playback session and available regardless of HiFiSync. Show System and Room only during the mapped player's playback session and when their projections are available. The extra screens are user-selected and do not rotate automatically. Reuse the existing debounced music-view source for brief buffering and pause transitions where mapped. Sustained pause, idle or unavailable playback ends automatic Music mode. An explicitly opened idle Music view continues to offer existing playback controls with the two extra screens hidden. If the snapshot expires or access is lost during playback, select Now Playing on the next local display update, independent of the next cloud refresh. If the HA display transport itself goes offline, the client must stop presenting the private projection when its validity expires. Treat the server-provided projection validity as an upper bound.

- **System** shows the name and equipment grouped by role, with rack arrangement when saved. The track strip uses the current HA playback summary when available.
- **Room** shows a readable plan view and dimensions, with speakers, subwoofers and listening position only where stored geometry supports them. Dimensions-only rooms render as a dimensioned outline. The two screens use the Studio locale and support touch and keyboard navigation. Render from normalized data using the offline Studio bundle.

## Ownership and delivery

| Repository | Owned work |
| --- | --- |
| `hifisync` | Grant settings and storage, scoped list and snapshot API, tests for access and room projection. |
| `hifisync-home-assistant` (proposed) | Installable HACS custom integration, HA setup and reauthentication, player binding, snapshot validation, refresh and a local provider. |
| `domosenso` | Studio renderer and widget/template definitions, translations, contract fixtures and optional installation documentation. |
| `domosenso-frame-ha` | Optional provider hookup, per-endpoint configuration and scoped snapshot transport, fallback and compatibility tests. |
| `domosenso-frame` | Import and verify the matching pinned renderer, negotiate the optional extension, and validate tablet navigation and lifecycle. |
| Home instance | Endpoint, player and account selections in the installation's own configuration. Token stays in HA-managed local configuration. |

Verified source gap: the current Frame lock pins catalog commit `d50300efa0ff646bcd8dc5d7c0aa7abfa16b9242`. The checked DomoSenso main, `caf952d4dc1de790e4e0a17cab28ffa5daa2580d`, has no `packages/frame-studio` sources. The pinned source is reachable on the local `codex/frame-shared-ui` branch. Before Studio implementation, establish a reviewed source baseline: reproduce the pinned renderer from that checkpoint, audit its delta against the merge target and record the version/commit/hash for the matching bridge assets and Android bundle. Existing template revisions keep their own history and receive the new screens through explicit Save/Apply. No automatic migration of a home's applied template is needed.

## Acceptance

1. Independent HiFiSync test accounts and fictional public, private, disallowed, org-owned and retired fixtures prove list/detail scope, no cross-account reads, revocation and UUID stability under rename and visibility changes. Refresh includes the changed data after room reassignment or a shared-room edit.
2. Install the HA integration in a fresh standalone HA instance without Frame. Verify setup and selection, empty list, replacement token, player rename and deletion, snapshot validation, offline expiry, stale display status and invalidation during an in-flight refresh. HA playback still works without the custom integration.
3. Exercise current and older Frame/bridge combinations. Older clients continue to show Now Playing. Verify that an unpaired or wrong-endpoint client and a user denied player access cannot receive the snapshot, including after grant or permission loss and with a warm cache. Verify disconnected and duplicate player paths, and ensure local navigation cannot change the selected player.
4. On a paired test tablet running the pinned pilot build, start playback and move through Now Playing, System and Room and back. Check a complete room and a dimensions-only room. Delete the active private test system while Room is visible. At the next successful validation, Now Playing returns, controls still work and the same token can select another allowed system. Verify framed display at landscape and portrait viewports and distinguish fixture-only checks from physical device acceptance.
5. Document installation, reconfiguration, rotation and update steps in the owning repos. Preserve existing HA and Studio customizations. Verify in staging before requesting authorization for any production or tablet installation changes.

Outside the pilot: concurrent playback and automatic player switching, historical rooms, acoustic predictions, automatic rack or speaker placement, editing HiFiSync from HA, publishing to HACS default and submitting to HA core.


## Amendment 2026-11-14: HiFiSync drawings

The maintainer approved the interactive mockup with the HiFiSync rack elevation
on System and the HiFiSync isometric room with a top-view preset on Room.
Studio embeds the drawings from a pinned HiFiSync source revision. The optional
drawing metadata extends the current scoped contract. Frame requests the
extension explicitly, and the bridge omits it for earlier clients. Persisted
room placement and available catalog dimensions are the source of the drawings.
The current text and plan renderers remain available for partial data.
