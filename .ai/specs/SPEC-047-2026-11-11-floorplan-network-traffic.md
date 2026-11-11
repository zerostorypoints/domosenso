# SPEC-047 — Network traffic on the floor plan: live heat and devices with their links

**Status:** approved 2026-11-11 by the maintainer ("Approve, write plan").

**Source:** the maintainer, 2026-11-11, right after Wi-Fi coverage
([SPEC-044](SPEC-044-2026-11-10-wifi-coverage.md)): the router integration already tells, per access
point, its current throughput, which clients are on it, wired or on which band, and each client's
own rate; with the Serving map we can also tell roughly where a client is. "Visualise on the Floor
Plan the network traffic heat map based on the current usage", match the router's client names to
Home Assistant's devices (a network streamer as the example), then other views (Ramka, Pocket, a
dashboard) and an administrator's history: peaks during the day, packet drops, bottlenecks,
incidents. Decided in that session, in this order: **the live view on the floor plan first**,
history and capacity planning after it (a later spec, see **Next: history**); both a heat map and
a devices-and-links view, as two modes; down and up combined; an unplaced Wi-Fi client's heat over
its access point's Serving area.

Extends [SPEC-044](SPEC-044-2026-11-10-wifi-coverage.md) (access points, router rules, the Serving
map) and [SPEC-028](SPEC-028-2026-11-01-floorplan.md) (the plan document, points, `also`). No
catalog component is added: this is the `floorplan` component.

## Goal

A home sees on its floor plan, live, where its network traffic is: as a **heat** over the places
the traffic is used, and as **devices and links**: every connected client tied to its access point,
wired or on its band, its line as thick as its traffic. A client is matched to its Home Assistant
device (and so to its spot on the plan) by MAC, or by a link the owner sets once.

Placement test (`docs/PRINCIPLES.md`):

1. Home Assistant shows a router's client trackers as entities, with their rates in attributes at
   best; no view puts them on a plan. Routers' own apps list clients per node, without a plan.
2. Every home with a router integration that reports per-client rates and a floor plan can use it;
   the inputs are the floor plan's access points and the integration's entities. **A component:
   floorplan.**
3. Nothing in it is specific to one home; a home's links stay in its own plan file.

## Devices and integrations

- **Router integrations with per-client rates.** Verified in a real home on 2026-11-11 with the
  HACS `tplink_deco` integration (TP-Link Deco BE65 mesh, three nodes, firmware 1.3.3):
  - per client, a `device_tracker` (`source_type: router`) with attributes `mac`, `deco_mac` (its
    node), `connection_type` (`wired`, `band2_4`, `band5`, `band6`; `undefined` when not home),
    `down_kilobytes_per_s` and `up_kilobytes_per_s`;
  - per node, sensors `<node>_down` and `<node>_up` in kB/s (`device_class: data_rate`,
    `state_class: measurement`), a connected-clients count, and on the main node
    `client_last_successful_update` and the switch `polling`;
  - polling every 30 s (the integration's default).
  Other integrations (`unifi`, `tplink_omada`, `fritz`, OpenWrt's `luci`) are rule entries when a
  fixture proves their fields; none is assumed here.
- No new integration. Nothing is written to the router or to Home Assistant's registries.

## Data

### Rules (`components/floorplan/cards/lib/wifi-rules.json`, data, changes freely)

An access point rule gains an optional `traffic` block:

```jsonc
{
  "integration": "tplink_deco",
  // … SPEC-044's keys …
  "traffic": {
    "client": {
      "node_mac": "deco_mac",
      "link": {"attr": "connection_type",
               "values": {"wired": "wired", "band2_4": "2.4", "band5": "5", "band6": "6"}},
      "down": "down_kilobytes_per_s", "up": "up_kilobytes_per_s", "unit": "kB/s"
    },
    "node": {"down": "_down", "up": "_up", "unit": "kB/s"},     // object id suffixes on the node device
    "freshness": {"updated": "client_last_successful_update", "polling": "polling",
                  "interval_s": 30}
  }
}
```

A rule without `traffic` gives no traffic; the card then offers no Traffic maps.

### Clients (`components/floorplan/cards/lib/traffic.js`)

One record per client tracker of a rule's integration whose state is `home` and whose link maps to
a known value:

| field | from |
|---|---|
| `mac` | the tracker's `mac`, normalised to lower case with colons |
| `name` | the tracker's friendly name (the router's name for the client) |
| `ap` | the access point on the plan whose device has the node's MAC; `null` when that node is not on the plan |
| `link` | `wired`, `2.4`, `5` or `6` |
| `down`, `up`, `total` | Mbit/s: kB/s × 8 / 1000 (rounded to 0.01) |
| `device_id` | the matched Home Assistant device, or `null` |
| `point` | the matched plan point, or `null` (unplaced) |
| `matched_by` | `link`, `registry`, or `null` |
| `stale` | see **Freshness** |

### Matching (first hit wins)

1. **Link:** a plan point whose `mac` equals the client's MAC.
2. **Registry:** a Home Assistant device with a `mac` connection equal to the client's MAC, other
   than the router integration's own device for that tracker. When a point's device, or one of its
   `also` devices, is such a device, the client takes that point.
3. **Suggestion** (edit mode only, never applied by itself): the client's MAC belongs to an
   unplaced device D, and exactly one placed point's device has D's manufacturer and no `mac`
   connection. The panel offers "Same device as <point>?"; yes adds D to that point's `also` (rule
   2 then matches). The common case: a network streamer known to Home Assistant twice, by a
   protocol that reports its MAC (UPnP/DLNA) and by one that does not (Cast), with only the second
   placed.
4. Otherwise unmatched: shown by its router name, unplaced.

A client without any Home Assistant device (phones, laptops) matches only by a link (1). A phone
using a private Wi-Fi address keeps it per network on current iOS and Android (inference from their
documentation); a link holds until the phone rotates it.

### Freshness

- The router's data is **live** while its `freshness.updated` sensor is younger than three
  `interval_s` and its `polling` switch (when it exists) is on.
- Otherwise every client is `stale` (Amendment 1: no per-client staleness).

## The plan document (`schemas/floorplan.schema.json`, `schema: 1`, one new optional key)

- `points[].mac`: a MAC (`aa:bb:cc:dd:ee:ff`, any case, `-` or `:`), on a device or entity point:
  this point is the router client with that MAC.
- **Validation** (`push`, `preview`, `survey`): `point <key>: mac malformed`; `mac linked twice:
  <mac>` (on two points of the document).
- `push --plan` prints `point change <floor> <key>` when a point's `mac` changed (as for `category`
  and `also` today).

## Card (`custom:floorplan-card`)

- **Maps** on the `radio` layer, after SPEC-044's: **Traffic heat** and **Traffic links**, offered
  when some rule's `traffic` finds client trackers. Card config `traffic` (boolean, default `true`):
  `false` draws neither.
- **Scale**, the same for every home: logarithmic, 0.1 to 1000 Mbit/s, marks at 1, 10 and 100. A
  client's value is `total` (down + up).
- **Traffic heat:**
  - a client with a point: its `total` at the point;
  - a Wi-Fi client without a point: its `total` spread evenly over the cells its `ap` serves on its
    band (SPEC-044's serving pick, calibrated when calibrated); a plan without access points'
    bands, or a band the access point does not serve, falls back to the cells of the room its
    access point stands in;
  - a wired client without a point: its `total` at its access point;
  - a client whose `ap` is `null`: left out;
  - cells sum their clients, blurred over 1 m, drawn with the scale's colours. Access points as
    markers without numbers.
- **Traffic links:**
  - each access point labelled with the sum of its clients' `total` and their count;
  - each client a dot joined to its access point: solid line wired, dashed Wi-Fi, colour by band
    (the Serving map's band colours), width and dot size by `total`;
  - a client without a point on a ring around its access point, its dot with a dotted rim;
  - **Idle** switch (default on, remembered with the map choice): clients under 0.01 Mbit/s drawn
    small and unlabelled when on, hidden when off.
- **Tap panel** (a client or an access point): name (and the router's name when they differ),
  access point, link, ↓ and ↑ Mbit/s, `matched_by`, time since its last update; for an access
  point also its node sensors' down and up ("clients 1.7 · node 1.7 Mbit/s") and, under "On access
  points not on the plan", clients whose node is not placed.
- **Not live:** a banner "Router data from <time>, not live"; every client grey; Traffic heat
  draws no heat. When the integration is unavailable, the two maps stay in the chooser with that
  reason.
- **Edit mode:** a point's panel gains **Network client**: a list of online clients by router
  name to link (sets `mac`), the link's state ("not seen since <time>" when its client is offline),
  and remove; the suggestions of **Matching** 3.
- **Updates:** clients are rebuilt when a tracker of a rule's integration changes its attributes;
  the heat at most once a second. Serving cells per access point and band come from the Wi-Fi model
  already computed for the Serving map.
- Every new string in en, de and pl (`no-literals` test).

## Provides and consumes

- Provides: `points[].mac` (ADDITIVE-ONLY), the card's `traffic` config key and its two maps
  (ADDITIVE-ONLY), `push`'s `point change` for `mac` (ADDITIVE-ONLY). The rules file is data.
- Consumes (read only): device and entity registries, states, the router integration's client
  trackers, node sensors and freshness entities; SPEC-044's access points and serving pick.

## Artifacts and ownership

| artifact | layer |
|---|---|
| `components/floorplan/cards/lib/traffic.js`, the `traffic` blocks in `wifi-rules.json` | managed (rendered with the card) |
| the plan's `points[].mac` and `also` entries the owner adds | instance (`domosenso/floorplan.json` and the `floorplan` dashboard) |

## Compatibility

- Additive: a plan without `mac` behaves as today; a home without a rule with `traffic` sees no
  new maps.
- `docs/COMPATIBILITY.md`: the `floorplan.schema.json` row gains `points[].mac`; the `floorplan`
  command row's `point change` names `mac` and the refusals `mac malformed`, `mac linked twice`.
  No `UPGRADE.md` step.
- The floorplan version: the maintainer's call (no version is bumped by this spec).

## Stages (each a pull request into `feature/wifi-coverage`, or into `main` if it has merged)

1. **T1 Data:** the `traffic` rule block for `tplink_deco`, `lib/traffic.js` (records, matching
   1, 2 and 4, freshness), the schema key and its validation and `push` line.
2. **T2 Maps:** Traffic heat and Traffic links, scale and legend, tap panel, not-live banner, Idle
   switch, card config `traffic`.
3. **T3 Edit:** the Network client panel and the suggestion (matching 3).

Before the pull request of T2: a prototype on the maintainer's test home (rendered from the
catalog branch, after the home owner's go-ahead), screenshots of both maps.

## Tests

- `lib/traffic.test.mjs`: kB/s to Mbit/s; each `connection_type`; `not_home` and `undefined`
  skipped; matching by link, by registry (the router's own device excluded, a point's `also`
  device), unmatched; the suggestion (one candidate offered, two candidates none, never applied);
  freshness from the updated sensor, the polling switch and a single tracker's age; heat
  distribution (point, serving cells of the band, room fallback, wired at its access point,
  unplaced access point left out); node sums vs clients.
- `test_floorplan_schema.py` / `test_cli_floorplan.py`: `mac malformed`, `mac linked twice`, `point
  change` on a `mac` change.
- `floorplan-card.test.mjs`: maps offered only with a `traffic` rule and trackers; `traffic: false`;
  the not-live banner hides the heat; Idle switch; tap panel; edit panel link and suggestion.
- Fixtures: the demo home's people (Alex, Sam), locally administered MACs (`02:00:00:…`).

## Out of scope

- History of any kind, per-device sensors, peaks, incidents and alerts (see **Next: history**).
- Packet loss, retries, latency, link rate and airtime: the Deco API does not report them
  (verified for `tplink_deco` 2026-11-11; other routers unknown).
- Locating a Wi-Fi client more precisely than its access point's Serving area (no per-client
  signal in `tplink_deco`).
- WAN throughput on the plan (it has no place); it belongs to the history view.
- Writing to the router (blocking a client, QoS).

## Next: history (a later spec, decisions so far)

A `network` component, taking over `lib/traffic.js` with its tests:

- per-device rate sensors with long-term statistics for **named devices only** (matched or linked
  clients), and one "other devices" series per access point, so access point totals still add up;
- peaks over the day, sustained load per access point, WAN use against the contract speed, clients
  kept on 2.4 GHz, clients on another access point than the Serving map gives for their spot, as
  bottleneck hints; incidents from the router's online and internet sensors, polling errors, and
  loss and latency from Home Assistant's `ping` integration (a human adds it);
- its views: a dashboard, Pocket and Ramka.
- Priority recorded from the maintainer: capacity planning, then troubleshooting, then the glance.

## Open questions

- Whether `tplink_deco`'s node `<node>_down`/`_up` include the backhaul to other nodes (inference:
  they count the node's own clients; the panel shows both so any gap is visible).
- Whether `down_kilobytes_per_s` is averaged over the polling interval or a momentary value
  (inference: averaged by the Deco; checked on the prototype against a client of known rate, a
  network streamer's reported bit rate).

## Amendment 1 (per-client staleness dropped, 2026-11-11)

Verified on a live `tplink_deco` (2026-11-11): with the router's `client_last_successful_update` 17 s old, three idle clients' trackers had not been written for 35 minutes; the integration does not rewrite every tracker on each poll. A client is therefore stale exactly when the router's data is not live; the per-tracker 3 × `interval_s` rule of **Freshness** is withdrawn. A client's `updated` stays, shown in the tap panel.
