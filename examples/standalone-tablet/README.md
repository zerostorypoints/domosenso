# Plant readings on a standalone tablet

The example uses six fictional Mi Flora devices and a local Home Assistant
recorder. Install Frame and HA Server, then enroll the tablet's own sensors
using the native Android BLE path in the [Frame installation guide](../../docs/FRAME_INSTALLATION.md).
Android 12 or later, Nearby devices permission and the private address
allowlist are required. Home Assistant's Xiaomi BLE integration discovers
and decodes compatible advertisements. Replace the sample sensor IDs with
the four entities for each enrolled plant. Keep the sample names or assign
permanent `plant.*` IDs before recording history. Use the household's own
notification action or keep Home Assistant's persistent notifications.

Render the plants component with `plants.inputs.yaml`. Enable the Ramka
plants page with `plants: discover`. In a plant-only dashboard, use a
`custom:plants-card` with `discover: true` and install its Ramka resource.
The full Ramka dashboard has separate weather and display configuration.
This profile requires neither a proxy nor an upstream HA, MQTT broker or
shared registry. Check real reception in the final position with the screen
on and off. Aged readings stay visible and marked; active GATT battery
polling is outside the Android advertisement receiver.

To exercise the fictional profile on a fresh, isolated HA 2026.9.2 with
the pinned receiver and SQLite recorder, run from the framework root:

```sh
tools/check-plant-sources.sh /path/to/domosenso-ha-server
```

The Server clone must contain the revision pinned by the test. The Docker
image must already be present. The check plays fictional Mi Flora packets
through the Android BLE stream and the real HA decoder. It does not exercise
an Android radio or establish coverage in a particular apartment. After the
standalone test, it switches one plant to a separate fictional source to
verify recorder continuity. The HA instance and database are disposable.
