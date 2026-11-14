# HiFiSync in Frame Studio

The pilot adds System and Room to the Frame tablet's Music mode for one Home Assistant player and one HiFiSync system. [SPEC-049](../../.ai/specs/SPEC-049-2026-11-14-hifisync-studio-pilot.md) defines the data, permissions and lifecycle.

## Prerequisites

- A HiFiSync environment running the pilot grant migration and web API.
- Home Assistant 2026.9.2 or newer. Install the pilot builds of both the HiFiSync and DomoSenso Frame custom integrations in that instance.
- Frame with the pilot Studio renderer (0.2.1) and a registered Home Assistant `media_player`.
- A HiFiSync account with at least one active personal system. The deletion acceptance scenario requires two allowed systems.

The administrator can use the same steps with HA Container or a standalone tablet backend. Install the components in the HA instance that the chosen Frame endpoint actually uses. Use a separate HA instance and synthetic systems for destructive tests.

## Set up or update

1. Apply the reviewed grant migration to the target HiFiSync environment before deploying its web API and settings. Use the HiFiSync repository's database and deployment procedures.
2. Install `custom_components/hifisync` and `custom_components/domosenso_frame` from the matching pilot revisions, then restart HA. Follow each integration's README for its installation mechanism. Back up the existing HA configuration before upgrading an installation.
3. In HiFiSync **Account settings → Home Assistant**, create an installation grant and explicitly select the systems that installation may read. Copy the displayed token into HA **Settings → Devices & services → Add integration → HiFiSync**. Select one system and the registered player. For a duplicated amplifier, select the intended streaming entity.
4. Open the updated Frame, pair it to the intended HA endpoint, and select **Ramka**. In the DomoSenso Frame administration panel enable HiFiSync for that endpoint. In **Template Studio**, confirm that its Media source maps the same player. Save or apply the `Ramka Classic · HiFiSync` template while the compatible paired Frame is online. Save a separate copy when customizing it.
5. Start playback. The first view is **Now Playing**. The buttons for the previous and next screens expose **System** and, if geometry is available, **Room**. Saved geometry is drawn at its declared dimensions. HiFiSync settings and credentials remain on the server and in HA config entry data.

An older Frame keeps its compatible Studio template projection. If the token is revoked, replace it through HA reauthentication. If the selected system is deleted or removed from the grant, use **Reconfigure** for the HiFiSync integration to select another system. Playback stays on the same HA player.

## Roll back

Disable HiFiSync for the endpoint in DomoSenso Frame, then apply the previously saved Studio template. Revoke the token in HiFiSync and remove the HA integration if the installation no longer needs it. Restore the previous compatible Frame app and bridge together if needed. The additive grant table can stay in place while the feature is rolled back.

## Verification

The reusable acceptance boundary is a fresh HA 2026.9.2 instance, a controlled HTTPS HiFiSync fixture, a registered fixture player and an authenticated Frame WebSocket pairing. Verify an unpaired request is denied, a legacy client receives the previous projection, and a negotiated client can move through all three views. While Room is active, delete the scoped fixture system. After authoritative revalidation, the endpoint must return Now Playing with its track still present. Reconfigure to another allowed system with the same token, then revoke pairing and confirm the private projection is unavailable.

Run the Docker-backed acceptance from the catalog with Docker, OpenSSL and uv installed. Supply checkouts of the pilot bridge and connector:

```sh
uv run --with cryptography python tests/acceptance/hifisync_studio.py \
  --bridge /path/to/domosenso-frame-ha \
  --connector /path/to/hifisync-home-assistant
```

Allow up to six minutes for the real revalidation interval. For a faster fixture run, add `--accelerate-fixture`. It changes the polling intervals only in temporary files inside the test container, with the same API and reconciliation logic.

Browser captures at 1100 × 720 and 720 × 1100 exercise the pinned renderer and touch navigation. A local APK using a separate package ID is suitable for a physical test alongside the installed app. Physical display, installation-specific HA mapping and a real HiFiSync account require their own acceptance. Use the version pins in the delivered branch and artifact manifest to identify the exact revisions exercised.
