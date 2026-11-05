# Preparing and adapting a self-contained Frame installation

Use this guide to prepare a new home's Frame, deliver it ready to use, and adapt the installation
to another host or display. Keep the home's configuration separate from the reusable components.
The Android pilot provides partial runtime evidence; this guide does not certify other devices or
operating systems. Record the exact supported profile and outstanding tests for each delivery.

## What must remain independent

An installation has four parts:

| Part | Responsibility | What changes for another platform |
| --- | --- | --- |
| Home Assistant and services | Integrations, recorder, MQTT and required adapters | Runtime packaging, supervision, storage and backup paths |
| Domosenso components | Rendered screens, cards, helpers and automation | Home inputs and pinned versions; retain shared source |
| Display client | Authentication, rendering and reconnect | Browser/WebView, kiosk startup and credential storage |
| Hardware and operating system | Sensor reception, physical screen, network and power | Radio access, screen actuator, permissions and boot policy |

The host and display may be one device or separate devices on the home's LAN. A small always-on
host with a replaceable display is an adaptation option, not a tested profile here. Android APKs
are one packaging choice; do not make Android permissions or ADB a dependency of the shared UI.
HAOS and new operating-system hosts require their own compatibility assessment; the current
catalog's documented deployment path is HA Container. A native Frame port is not implied.

Independent of a previous NAS means current sensor data, required controls, media, history,
screen policy and service restart work without reaching that NAS. Internet independence is a
separate requirement: cloud calendars, forecasts, vendor APIs and remote support may need WAN.

## Required equipment and installation inputs

- A host compatible with the selected HA runtime and a display with a supported browser or
  Frame client. Measure RAM, CPU, storage growth and boot behavior rather than copying sizing
  assumptions from another model. The Android guest pilot requires ARM64 and several GB free.
- Reliable power, a suitable supply/cable, Wi-Fi or Ethernet and a documented recovery method.
  Test screen-off behavior on the intended supply, not only through a development USB cable.
- Sensors for the requested capabilities, their matching integrations and any needed radios:
  a BLE receiver/proxy for BLE devices, a Zigbee coordinator for Zigbee devices, or the vendor
  bridge when required. MQTT is a transport, not a substitute for these receivers.
- A presence sensor and a platform-specific way to control the real display if automatic
  sleep/wake is required. A helper saying "on" is not evidence that the display is awake.
- A separate private home repository, device/room inventory, own credentials and accounts,
  floorplan if used, media, retention policy and a list of required controls.
- A maintenance computer with the prerequisites from the relevant runtime's build guide;
  signing keys and backups kept outside source control. Stable package IDs and certificates
  are required for Android updates that retain application data.

For every requested feature, record its physical producer, integration, HA entity, command
destination, radio owner and external dependencies. Include replacement parts and the action
needed if a receiver fails. Choose hardware after checking those capabilities; a price list
alone is not an installation bill of materials.

## Preparation sequence

1. **Define the new home.** Start from the home template and existing onboarding flow
   ([getting started](getting-started.md)). Create fresh users, secrets and device credentials.
   Do not clone another home's users, keys, calendars, recorder or registry as a starter image.
2. **Choose the deployment profile.** Name the host, display, runtime, radio ownership, storage,
   startup supervisor, screen actuator and support route. Record proposed parts as untested
   until the actual combination passes acceptance.
3. **Pin and build the software.** Record framework component tags, application source commits,
   HA/runtime versions, dependencies, artifact hashes and Android certificate fingerprints.
   Follow the Frame and HA Server repositories' build instructions. For an Android release,
   build from clean source, run its required checks and verify the APK signature. Generated
   guest archives and native libraries are build inputs too. A local unpublished branch is not
   a version another installer can fetch; include that release blocker in the delivery record.
4. **Bootstrap locally.** Install the runtime, create a local HA and regular kiosk account,
   install required integrations, authenticate the display, select the dashboard and verify
   browser resources, language, clock format and theme. Admin credentials are for maintenance.
5. **Enroll real devices.** Use this home's own keys and pairing. For the pinned ESPHome
   proxy setup, choose one HA BLE advertisement owner; API connection success alone does not
   prove two HA consumers can share Bluetooth. Coexistence mirrors are migration aids and
   remain dependencies. A new standalone home should receive data from its own hardware.
6. **Render components.** Supply the home's inputs, render through `domosenso`, inspect its
   status and validate against the matching HA version. Never hand-edit managed output.
   Install required non-catalog integrations at their recorded versions. Preserve the
   instance-owned configuration and customizations on later updates.
7. **Configure local transport.** Point devices/adapters at the intended broker or direct API.
   Inventory every MQTT direction and retained command. Do not carry a migration bridge,
   old-host REST fallback or discovery dependency into a standalone profile unnoticed.
   Wind/safety status must come from the real source, not synthetic test frames.
8. **Supply media and history.** Import only explicitly selected data with a backup and verify
   representative dates, charts and file hashes. Define how new photos arrive after delivery.
   Routine configuration updates must retain the live recorder; do not restore an old database
   just to update a dashboard. A copied album is not an ongoing synchronization mechanism.
9. **Configure the physical display.** Apply only the app permissions and power/autostart
   settings required on that model. Verify default Home or kiosk startup, screen-actuator
   connectivity, real sleep/wake and startup reconciliation. Retain a way to leave the kiosk.
10. **Create backups and a handover record.** Keep a restore-tested off-device backup, package
    and certificate identities, setup inputs, support instructions and the acceptance table.
    Then perform the tests below before transport and again on the destination network.

The current Android screen path uses HA automation and the official minimal Companion alongside
Frame and HA Server. It is not yet a two-APK setup with no extra screen client. Test notification,
background, settings and overlay permissions as required by the selected path. Wireless ADB
may be unavailable after a reboot; resolve its current endpoint and verify the model before
commands. Application recovery must work without an attached debugger or USB.

## Adapting to another device

Keep the home data model, component inputs and screen behavior. Replace only the affected
runtime/display mechanisms, then run the same acceptance suite. Do not copy Android shell
commands to a different operating system.

| Concern | Android pilot | New host or display |
| --- | --- | --- |
| Runtime startup | Foreground service and boot receiver | Define and test the platform's service supervisor |
| Rendering | Frame WebView with local HA | Verify actual browser features, layout, authentication and reconnect |
| Screen control | Local Companion notification path | Supply and test an actuator for the actual display |
| Sensor access | Own network devices/proxies and guest integrations | Verify USB/network/BLE access and persistence after boot |
| Update | Signed APK retaining app-private data | Define an update and rollback unit preserving home data |
| Diagnostics | Local HA/MQTT plus authorized ADB | Use authenticated platform diagnostics independent of the UI |

A display-only device can use a separate local HA host, but then that host and the LAN are
explicit requirements. A low-power or noninteractive display may need different rotation,
refresh and control behavior; do not describe it as visual or functional parity before testing.

## Acceptance before delivery

For each row store pass/fail/not tested, source/artifact revision, timestamp, evidence and
remaining limitations. Never replace a failed measurement with a later manual workaround.

| Test | Required evidence |
| --- | --- |
| Fresh independent setup | No credentials, paths or data inherited from the development home |
| Full screen set | Real readings, every requested control/status, calendar ranges, plants, floorplan and decoded photos |
| Data freshness | Actual new sensor samples and correct stale/offline behavior, not only numeric restored states |
| Real control | Authorized physical actions and feedback; inspect media artwork during real playback |
| Presence | Empty room, real arrival, physical sleep/wake and automatic readings/photo rotation without touching the client |
| Process loss | On the Android pilot, SIGKILL only the Server process; compare app/HA/MQTT PIDs and start times before/after |
| Full power or boot cycle | Automatic services and kiosk, authenticated HA reply, new MQTT nonce at independent subscribers, real screen |
| Former NAS isolated | Block only the test installation's access; fresh readings and required controls continue; do not shut down a household NAS |
| LAN without WAN | Separate local operation from cloud-dependent pages; show truthful unavailable states |
| Wi-Fi loss and return | Reconnect without app launch, stale data clearly marked, no queued surprise commands |
| Update and restore | Current users, canonical history and media retained; known-good rollback and off-device backup restored |
| Destination soak | At least 24–48 hours on the intended power/network, including idle periods and morning recovery |

Measure first app resume, broker readiness, HA readiness and first usable screen separately.
If debugging is unavailable, a startup automation timestamp is not an exact first-HTTP latency.
For SIGKILL do not substitute Android Force Stop, which changes application lifecycle policy.
These tests must be adapted to a non-Android supervisor without claiming the Android result
certifies it.

## Maintenance for a remote household

Plan authenticated encrypted remote access, restricted to the maintained installation and
revocable by its owner. Do not expose HA, MQTT or ADB directly on the public internet. A VPN or
outbound management path is a design option until deployed and tested. Do not make Android's
wireless-debugging toggle the sole remote recovery mechanism.

Keep a local fallback: restart/power instructions, an accessible exit from the kiosk and a
backup recovery method. The owner should not need a development computer for ordinary use.
Agree who can maintain it, a suitable update window and what to do when remote access fails.
Never start an update if the only recovery path depends on the component being replaced.

Before updating, capture the current versions and backup; validate a candidate with the home's
inputs; apply during the agreed window; verify fresh data, display and controls; roll back on
failed acceptance. Android certificate continuity, home customization preservation and recorder
continuity are part of the update, not optional cleanup. Remote update automation and rollback
are not yet certified by the Android pilot.

## Keep the guide and installation journal current

For every setup or migration step record: prerequisite, source version, action, expected result,
actual evidence, failure/correction, rollback and manual steps. Keep reusable corrections here or
in the owning runtime/component guide; keep names, addresses, IDs, screenshots and credentials in
the private home record. An adaptation record should state which rows above changed and which
must be rerun. Promote a profile to tested only after its own evidence exists.

Related contracts and procedures: [principles](PRINCIPLES.md),
[compatibility](COMPATIBILITY.md), [component upgrade notes](UPGRADE_NOTES.md).
