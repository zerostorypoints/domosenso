# HiFiSync in Frame Studio

The pilot adds System and Room to the Frame tablet's Music mode for one Home Assistant player and one HiFiSync system. [SPEC-050](../../.ai/specs/SPEC-050-2026-11-14-hifisync-studio-pilot.md) defines the data, permissions and lifecycle.

[Skrócona instrukcja po polsku](#skrócona-instrukcja-po-polsku).

## Prerequisites

- A HiFiSync environment running the pilot grant migration and web API.
- Home Assistant 2026.9.2 or newer. Install the pilot builds of both the HiFiSync and DomoSenso Frame custom integrations in that instance.
- Frame with the pilot Studio renderer (0.2.6) and a registered Home Assistant `media_player`.
- A HiFiSync account with at least one active personal system. The deletion acceptance scenario requires two allowed systems.

The administrator can use the same steps with HA Container or a standalone tablet backend. Install the components in the HA instance that the chosen Frame endpoint actually uses. Use a separate HA instance and synthetic systems for destructive tests.

## Set up or update

1. Apply the reviewed grant migration to the target HiFiSync environment before deploying its web API and settings. Use the HiFiSync repository's database and deployment procedures.
2. Install `custom_components/hifisync` and `custom_components/domosenso_frame` from the matching pilot revisions, then restart HA. Follow each integration's README for its installation mechanism. Back up the existing HA configuration before upgrading an installation.
3. In HiFiSync **Account settings → Home Assistant**, create an installation grant and explicitly select the systems that installation may read. Copy the displayed token into HA **Settings → Devices & services → Add integration → HiFiSync**. Select one system and the registered player. For a duplicated amplifier, select the intended streaming entity.
4. Open the updated Frame, pair it to the intended HA endpoint, and select **Ramka**. In the DomoSenso Frame administration panel enable HiFiSync for that endpoint. In **Template Studio**, confirm that its Media source maps the same player. Save or apply the `Ramka Classic · HiFiSync` template while the compatible paired Frame is online. Save a separate copy when customizing it.
5. Start playback. The first view is **Now Playing**. Studio gives each eligible music page 15 seconds. Swipe left for the next page or right for the previous one. Swipe anywhere on the page outside its controls. A footer indicates the gesture. Room reserves its drawing and controls for rotation, zoom, panning and speaker selection. A swipe starting on the heading or footer still changes pages. HiFiSync settings and credentials remain on the server and in HA config entry data.

## Use HiFiSync Preview

The pilot can use an official HiFiSync Preview deployment as its data source. The tablet still
connects to its Home Assistant instance. In HA, use HiFiSync connector 0.1.1 or newer and enter
the Preview HTTPS origin in **HiFiSync site URL** when adding the integration. Paste the origin
without the account page or API path. Issue the scoped token in that same Preview, select a
system that exists there, and choose the intended registered player. Leave the URL field blank
for a production installation.

Check the selected deployment's public API before asking the owner to sign in again. A JSON
`401` from the systems route without a token confirms the route is deployed. A `404` indicates
that the route or deployment must be checked. A paired Frame can show its usual HA screens
while the connector is unavailable. A token from Preview belongs to that environment.

## Pair a pilot tablet

1. Read the installation's device and HA notes. Identify which HA normally serves the target
   Ramka and confirm the pilot's Android package and build. A tablet can run its local HA and use
   a separate HA on the network. An independently installed pilot needs its own app sign-in and
   pairing, even when the default Ramka is already paired.
2. For wireless Android debugging, an empty `adb devices` or `adb mdns services` list does not
   establish that debugging is off. On macOS use `dns-sd -B _adb-tls-connect._tcp local.` and
   resolve each matching service instance with `dns-sd -L`. Check numbered duplicate names as
   well as the original name because Bonjour can retain an obsolete connect port. Probe only
   the recorded tablet's advertised endpoints. If TCP connects but the shared ADB daemon reports
   a route error, retry with a task-owned daemon on a free port and the existing paired key.
   Verify the tablet model and identity before issuing device commands. Ask for the current
   connect address shown on the device only if discovery and reconnection fail. Use the separate
   pairing port only when the existing key is rejected.
3. Open the pilot and enter the verified HA address. If a local installation already has an
   approved regular Frame account stored securely, use it through the app's normal HA sign-in
   form. Check for it before asking the owner to log in. Keep authentication values out of
   screenshots, tool output and shared documentation.
4. Select **Ramka** or the installation's matching panel. Read the pairing code in the pilot and
   match it to the same pending device and account on **Home Assistant → DomoSenso Frame →
   Devices and pairing**. Approve that request with a separate administrator session. Confirm
   the device shows as approved and the pilot displays **Connected · access approved**, then
   open the panel. Close the task's temporary ADB daemon and forwards after verification.
5. Treat successful pairing and access to the listening system as two checks. Confirm that the
   HiFiSync connector is loaded on this HA, that its configured origin answers over HTTPS, and
   that the grant from that environment returns the selected system. Confirm the enabled Frame
   endpoint maps the same media player. Check **System** and **Room** during playback.

## Use Room

Choose **Isometric** or **Top view**. Drag the isometric drawing with one finger to rotate it. In Top view, drag a zoomed drawing to pan. Pinch with two fingers in either view, or use **+**, **−** and **Fit**. If the room has no saved height, Studio opens the interactive top view directly.

Tap a speaker or its button below the drawing. The details stay visible while you rotate, zoom or switch projection on Room. The angle comes from the stored speaker setting. Zero points straight into the room. When the system has a listening position, the details also show the distance to it. An unknown angle has its own label. Pause the music-page rotation if you want to keep Room on screen.

Set **Language** in the applied Template Studio template to choose the UI language. The controls, placement labels and number formatting follow that choice. System and room names come from HiFiSync.

To share Ramka’s existing rotation pause, map the endpoint’s `studio.runtime.paused` to its existing `input_boolean.<prefix>_paused`. While paused, a swipe still changes the page. Reapply a saved pilot template explicitly to adopt the new durations, or set the three durations in your own copy.

An older Frame keeps its compatible Studio template projection. If the token is revoked, replace it through HA reauthentication. If the selected system is deleted or removed from the grant, use **Reconfigure** for the HiFiSync integration to select another system. Playback stays on the same HA player.

## Roll back

Disable HiFiSync for the endpoint in DomoSenso Frame, then apply the previously saved Studio template. Revoke the token in HiFiSync and remove the HA integration if the installation no longer needs it. Restore the previous compatible Frame app and bridge together if needed. The additive grant table can stay in place while the feature is rolled back.

## Verification

The reusable acceptance boundary is a fresh HA 2026.9.2 instance, a controlled HTTPS HiFiSync fixture, a registered fixture player and an authenticated Frame WebSocket pairing. Verify an unpaired request is denied, a legacy client receives the previous projection, and a negotiated client rotates through all three views. Verify manual steps, wraparound, pause and the missing-room path. While Room is active, delete the scoped fixture system. After authoritative revalidation, the endpoint must return Now Playing with its track still present. Reconfigure to another allowed system with the same token, then revoke pairing and confirm the private projection is unavailable.

Run the Docker-backed acceptance from the catalog with Docker, OpenSSL and uv installed. Supply checkouts of the pilot bridge and connector:

```sh
uv run --with cryptography python tests/acceptance/hifisync_studio.py \
  --bridge /path/to/domosenso-frame-ha \
  --connector /path/to/hifisync-home-assistant
```

Allow up to six minutes for the real revalidation interval. For a faster fixture run, add `--accelerate-fixture`. It changes the polling intervals only in temporary files inside the test container, with the same API and reconciliation logic.

Browser captures at 1100 × 720 and 720 × 1100 exercise the pinned renderer and touch navigation. A local APK using a separate package ID is suitable for a physical test alongside the installed app. Physical display, installation-specific HA mapping and a real HiFiSync account require their own acceptance. Use the version pins in the delivered branch and artifact manifest to identify the exact revisions exercised.

## Renderer and Android compatibility

Use matching HiFiSync web, connector, Frame bridge and Frame Android revisions.
HiFiSync provides optional component dimensions and driver metadata through its
existing scoped API. There is no new database migration for the drawings.
The bridge sends the extra fields only to clients that advertise support.
System uses the catalog rack elevation and the saved shelf order where
available. Equipment on the same saved shelf is represented in sequence.
Room uses the HiFiSync drawing with a top-view preset and saved placements.
A room without placements draws its outline without inventing equipment positions.

For a physical trial alongside the existing Frame, build with
`FRAME_ANDROID_PACKAGE=com.domosenso.frame.hifisyncpilot` and a strictly
increasing `FRAME_ANDROID_VERSION_CODE` for that package. The local test APK
uses a separate Android application identity and pairing. Select Ramka /
Studio in the pilot app after pairing. Test both room presets and verify
that the chosen preset remains visible during ongoing playback updates.


## Skrócona instrukcja po polsku

Przed parowaniem sprawdź adres HA używany przez tę Ramkę i lokalną instrukcję tabletu. Pusta lista
ADB może oznaczać stary port albo problem z demonem. Sprawdź też drugi wpis Bonjour, a gdy port
odpowiada, spróbuj osobnej sesji ADB. Jeśli zapisano zwykłe konto Ramki, użyj go w formularzu HA.
Po wybraniu panelu porównaj kod z odpowiednim zgłoszeniem w **DomoSenso Frame → Urządzenia
i parowanie**, zatwierdź je i sprawdź, czy pilot pokazuje „Połączono · dostęp zatwierdzony”.


1. W Home Assistant zainstaluj pasujące wersje integracji HiFiSync oraz DomoSenso Frame. W HiFiSync wejdź w **Ustawienia konta → Home Assistant**, wydaj token i zaznacz systemy, do których instalacja ma mieć dostęp.
2. Dodaj integrację **HiFiSync** w HA. Jeśli używasz Preview, wpisz jego adres HTTPS w polu **Adres HiFiSync** i wklej token wydany w tym samym Preview. Wybierz zestaw i właściwy odtwarzacz. Token przechowuje Home Assistant.
3. Zaktualizuj testową aplikację Frame do kompilacji z rendererem 0.2.6. Sparuj ją z instancją HA, włącz HiFiSync dla tego urządzenia w panelu DomoSenso Frame i zastosuj w Template Studio szablon **Ramka Classic · HiFiSync**. Ustaw język szablonu na **Polski** lub **English** i zastosuj zapisany szablon. Nazwy zestawu i pokoju pochodzą z HiFiSync.
4. Podczas odtwarzania przesuń palcem po nagłówku albo stopce, żeby przejść między **Teraz gra**, **System** i **Pokój**. Na ekranie **Pokój** rozsuń dwa palce na rysunku lub użyj **+ / − / Dopasuj**. Jednym palcem obrócisz izometrię albo przesuniesz powiększony **Rzut z góry**.
5. Dotknij kolumny na rysunku albo wybierz jej przycisk. Pod rysunkiem zostaną zapisany kąt i odległość do miejsca odsłuchu, jeśli istnieje. Sprawdź, czy dane zostają przy zoomie i zmianie rzutu oraz czy swipe poza rysunkiem nadal zmienia ekran. W razie potrzeby wstrzymaj automatyczną rotację ekranów.

Gdy wybrany system zniknie z HiFiSync lub zakresu tokena, wybierz inny przez **Konfiguruj ponownie** w HA. Po unieważnieniu tokena użyj ponownego uwierzytelnienia. **Teraz gra** nadal korzysta z tego samego odtwarzacza HA. Aby wrócić do poprzedniego układu, wyłącz HiFiSync dla urządzenia, przywróć zapisany szablon i cofnij token, jeśli instalacja już go nie potrzebuje.
