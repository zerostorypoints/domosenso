# Tablet installation and runtime requirements

Track S requirements, reviewed 2026-11-05. This profile complements the
[shared-home design](2026-11-05-shared-home-component-metadata.md) and
[implementation handoff](../../handoffs/2026-11-05-shared-home-metadata.md).
It describes installation work to specify and implement separately from browser
shared-input migration or native metadata v2 routing.

## Boundary and evidence

Home inputs describe room/source choices. An installation profile describes where
providers execute, their dependencies and deployment identities. Runtime diagnostics
report observed readiness. Keep these artifacts separate. Android, broker location,
signing, remote support and provisioning fields are excluded from `home-inputs.schema.json`;
browser cards do not load the installation profile. H0-lite remains limited to
assessment vocabulary, helper identity and policy ownership.

The signed Android pilot has physical evidence for service-process recovery, reboot,
fresh HA/MQTT responses, restored render/rotation and radar-driven screen wake. It
also exposed empty guest DNS, startup ordering and stale screen-state assumptions.
Complete integration migration, extended unattended operation and independent remote
rollout remain separate acceptance. One passing recovery test does not establish a
complete local provider graph.

The inspected reusable server source is `domosenso-ha-server` at
`15e6f0affe64735daf6be0e21ca15b2957f9bfd5`. Its HA backup flow does not back up the
separate Mosquitto persistence directory. Its guest DNS is synchronized from Android's
active network. Recheck the current source and acceptance before implementation.

## S1 — Define providers, compatibility and identity-aware migration

Owners are the server/deployment coordinator and private-home migrator. Specify the
profile format and its versioning before adding fields or commands. Reuse existing
component services and integration declarations rather than repeating their domain
semantics in the profile.

- Record whether each selected source depends on local HA/runtime, a LAN device,
  another broker/host or a cloud service. A local MQTT mirror keeps its upstream
  dependency. Preserve the distinction between fresh source evidence and replayed,
  retained or restored state. Broker receipt time does not establish observation age.
- Pin Server/Frame package IDs, version codes, signing lineage, HA/guest dependencies,
  broker, Bridge, catalog lock, UI resources and supported primitive/policy revisions
  in one compatible installation set. Package required Python/native integration
  dependencies; a component's existence does not prove Android runtime support.
- Compare integration/entity/device identities before importing selected registrations.
  Reject collisions and require explicit identity-checked aliases. Preserve destination
  users, device registrations, native pairing, screen client, policy values and grants.
  A new household receives independent identities and credentials.
- Inventory setup effects, including device registration and event subscriptions.
  Isolate outgoing device actions during migration rehearsals. Loopback listeners
  constrain incoming traffic only. Do not activate copied automations implicitly.
- Validate a candidate configuration and preserve a compatible rollback checkpoint.
  Existing device registrations or MQTT publisher destinations require their own
  authorized migration. Re-pair when the installation/security boundary changes.

Done when a fresh synthetic installation and an independently initialized destination
both pass collision, dependency and data-preservation checks without inheriting
another installation's identity. Include a source mirrored through an upstream broker
and require diagnostics to show that dependency explicitly.

## S2 — Supervise recovery and preserve data

Owners are the Android Server and Frame/device-lifecycle implementers. Inspect the
server's foreground service, boot receiver, guest extraction, DNS lifecycle and backup
flow, plus Frame's Home activity, authenticated session and reconnect handling.

- Observe supervisor, HA API, fresh broker delivery, integration data, Bridge/session,
  decoded reading/image and actual screen state separately. A running process or
  restored HA helper is insufficient proof of a visible operational panel.
- Reconcile screen policy after startup and client reconnect with bounded idempotent
  retries. Distinguish command submission, accepted delivery and observed display
  effect. Screen management also applies to Companion-driven Ramka. It is separate
  lifecycle work and does not block P3's shared-input/threshold migration.
- Test delayed client connection, radar changes during startup waits, overlapping
  commands and exhausted retries. Never replay pending voice/control requests after
  a connection or process epoch change. Keep intentional stop and Android process
  death as distinct lifecycle states.
- Handle late Wi-Fi and DNS changes, offline operation, stale callbacks and service
  shutdown. Physical wake/Doze behavior must be recorded for the supported firmware.
- Keep runtime binaries separate from configuration, recorder, media and broker
  persistence. Back up both HA and Mosquitto data consistently, verify checkpoint
  age and expose a recovery gap. Test interrupted extraction/update and data-compatible
  rollback. Preserve failed candidates for diagnosis without discarding current data.
- Report disk/retention/extraction headroom and combined resource use with HA, MQTT,
  Frame and loaded local models. Report deployment health without household contents.

Done when SIGKILL changes the intended process identities, HA reaches readiness, a
new MQTT message arrives and Frame renders without manual relaunch. Repeat after a
cold boot, late network/client startup and screen sleep/wake. Verify preserved history,
media and broker persistence, then test one update and recovery with a fresh home.
Long unattended use and battery/Doze evidence remain explicitly recorded tests.

## S3 — Provision and maintain independent installations

Owners are the deployment and device-management implementers. Design a model/firmware
profile with doctor, plan and apply stages. Detect the selected device, package
identities/signatures, required permissions and supported settings. Read back changes,
preserve original values, make repeat runs idempotent and stop/replan after partial
failure. Identify manual trust, Home selection, HA login and pairing steps explicitly.

Remote health and updates use revocable installation-scoped identities and a signed
compatible release set. Keep detailed diagnostics opt-in and bounded. Routine reports
contain versions/readiness and omit photos, calendar contents, presence history,
recordings and credentials. Test wrong-device/channel/signature rejection, interrupted
downloads, disk/power limits and locally recoverable update failure before remote use.

Done when a second independent installation works without the first home's hosts or
credentials, recovers locally while offline, and can accept a scoped update and have
support access revoked. The first device's acceptance does not establish a different
device/firmware profile automatically.

## Shared acceptance without shared release blockers

Availability fixtures are common semantic input for browser C1 and native work.
Represent missing, unavailable, unknown and stale separately, with domain/action-aware
operability. The Pocket fix at `85afeb5` is an existing implementation to preserve.
Its release can proceed through browser A2 independently of S1/S2/S3.

Native installation acceptance combines the applicable S gates with its own Frame
compatibility and hardware tests. Native metadata v2 retains the independent F2
language/authorization gate. Screen recovery, package installation and remote support
do not add generic assistant actuation privileges.

## Review status

These are proposed installation requirements derived from pilot evidence. The
authoring coordinator owns their placement outside shared home inputs and browser
prerequisites. Exact profile schema, provisioning commands, support transport,
release channel and deployment authorization require their own reviewed implementation.
Private home data and device evidence remain in the installation repository.
