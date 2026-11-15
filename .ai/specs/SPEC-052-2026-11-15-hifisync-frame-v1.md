# SPEC-052: Optional HiFiSync screens in Frame Studio

- Status: approved 2026-11-15 by the maintainer as SPEC-051. Renumbered after fetching main because SPEC-051 was assigned to the audio sensor.
- Source: first-release feedback after live playback acceptance on TCL and [SPEC-050](SPEC-050-2026-11-14-hifisync-studio-pilot.md).

## Goal and placement

A home can show its HiFiSync System and Room alongside Now Playing on a paired Frame. The administrator sees which system and room belong to the selected player in Studio before playback. A per-panel switch enables the screens for the active layout.

Home Assistant already owns integration setup, reauthentication and player selection. Frame Studio owns the panel's display preference and playback interaction. This capability applies to any home using a compatible Frame and the optional HiFiSync integration.

## Setup

1. In HiFiSync account settings, name the installation and choose which personal systems it may read. HiFiSync issues a read-only token valid for 90 days and lists the scope, expiry and revocation action.
2. Add the HiFiSync custom integration in HA and paste the token once. Use the production HiFiSync origin by default, with an explicit supported HTTPS Preview origin for testing. Use a token issued in the selected environment. Choose one system and a registered media player. Reuse the pilot's stable system UUID and player registry ID, scoped grant, refresh and reauthentication.
3. In **Studio → Sources → Music**, select the player. Below it, display the linked system and room names or their availability. Show the summary for the selected player even while it is idle. The administrator can enable **Show System and Room** for this panel. New panels default to off. The setting is available with HiFiSync installed and can be switched off even when the link needs repair. With the integration absent, the ordinary player selector is sufficient.

The summary contains presentation names and readiness for the selected player. It uses the local integration and the existing administrator and player checks. The authenticated tablet receives drawing data only during eligible playback on its paired, enabled panel. The bounded summary excludes the token, account details and room geometry.

## Panel behavior

- With the switch on, extend the panel's effective playback layout at runtime. Open the existing Now Playing screen first, or the first unconditional music page in a customized layout without a Now Playing screen. Place System and Room immediately after it. Keep the remaining custom music pages in their original relative order. Reuse an existing pilot screen of the same type once, including its saved layout and duration. Use the pilot's 15-second duration for newly supplied screens. Preserve the saved template, its history and customization. Disabling the feature hides the HiFiSync screens even if a pilot template still contains them.
- If only the system is available, show System and retain Now Playing. If the binding or access is lost, return to Now Playing and show the reason or repair action under the player in Studio. Apply SPEC-050's refresh and validity rules. Never select a different system implicitly.
- Use the existing HiFiSync drawings, zoom, angle/distance details and page gestures. The displayed UI follows the Ramka language, with Polish and English required. The account's system and room names are shown as saved.

## Room interaction and rotation

- Selecting a speaker, rotating the drawing or zooming holds automatic music-page rotation. A gesture starts the hold as soon as the Room control owns it. For a continuous gesture, the 30 seconds start at its end. Any later qualifying interaction renews the hold. During the hold, keep manual page swipes outside active controls available.
- After 30 seconds without additional interaction, resume the automatic timer. Preserve the Room page time remaining at the start of the hold. A manual page change clears the hold immediately and gives the destination its normal duration. Any independently enabled Ramka rotation pause still applies.
- Keep the selected speaker and its available toe-in and distance visible while the user stays in Room, including after the hold expires and through view changes, zoom, rotation and playback updates. Clear the selection on leaving Room or when the selected speaker or room is no longer present.
- Scope the temporary hold to the paired panel currently displaying Room. Clear it on leaving Room, loss of playback or loss of access. Expire it if the client disconnects, and reject delayed input from an obsolete Room visit so it cannot pin a subsequent page.

## Approaches and ownership

Use the established pasted-token flow and a runtime extension of the existing Studio layout. A dedicated HiFiSync template is the pilot alternative and requires the administrator to replace or reapply a layout. Pairing by code could remove manual token entry and would add an enrollment flow on both sides. The maintainer chose the pasted-token flow and the existing layout.

| Owner | Responsibility |
| --- | --- |
| HiFiSync | Scoped account grants and HTTPS source for the matched system and room. |
| HiFiSync custom integration | Optional HA setup and local, player-scoped link summary and snapshot. |
| Frame HA | Per-panel preference, bounded summary for Studio, effective playback layout and rotation authority. |
| DomoSenso Studio and Frame | Player configuration UI, translated labels, Room interactions and the compatible tablet bundle. |
| Home installation | HA integration entry and token, chosen player and system, and per-panel display preference. |

## Devices, compatibility and delivery

Use a Studio-capable paired Frame and an HA-registered media player. The pilot confirmed a TCL Android tablet with real playback. Verify this release on an independent HA instance with a controlled HiFiSync endpoint and a compatible Frame build. Publish the tested HA, bridge, renderer and app revision matrix with the release instructions.

The additive input is a per-panel Boolean, initially false. The existing HiFiSync link status sensor remains the HA entity surface. No new dependent hardware or HA entities are required. Package shared code in its owning repositories and keep installation settings and credentials in HA. Negotiate support for runtime pages and the Room hold with compatible clients. Preserve the saved-template page limit and allow up to two additional pages in the negotiated runtime view, including for a template at the saved limit. Legacy clients receive their compatible layout. Existing explicit pilot opt-ins remain usable, and layout history is retained. Enabling this preference does not invoke template Apply or take over existing HA scheduler automations. Record the behavior in the integration guide and applicable upgrade notes. Assess the catalog and website once the release revisions are known.

## Acceptance

1. Set up a fresh HA from a fictional private system using one token. Verify the link summary while stopped, a different or renamed player, no room, and the integration missing or unavailable. Verify the grant origin, token expiry and the fallback when the selected system is removed.
2. Toggle the feature on and off for one paired panel with a customized template. Verify a second panel is unaffected, the saved template and revision are identical, and an existing pilot template does not duplicate either screen. Verify older clients and installations without HiFiSync keep their usual playback.
3. On a paired tablet, check automatic rotation and manual swipes. Exercise speaker selection, drag rotation and zoom near a page boundary. With a controlled clock, confirm a second interaction renews the hold, 30 seconds of inactivity resumes rotation, and a manual step releases the temporary hold immediately. Check that a configured manual pause still applies, stale interactions cannot pin the next screen, and speaker details survive the hold while Room remains visible.
4. Run focused connector, Frame HA and Studio renderer checks. Verify the Polish and English flow in isolated HA and exercise the release build on a tablet during playback. Record test evidence and pin the matching artifacts.

Pairing by code, editing HiFiSync from Studio and production deployment are outside this specification.
