---
slug: automate-old-awnings
title: Automate old awnings
description: Awnings with a Somfy remote can retract at sunset and follow the wind sensor without rewiring. Wall-button motors are coming soon.
components:
- awnings
devices:
- m5stack-atom-lite
- cc1101
status: published
updated: '2026-10-29'
sources:
- https://github.com/zerostorypoints/domosenso/tree/df34993199025856eeac590f959ae54e2a02cd62/components/awnings
branches:
- situation: A motor with a Somfy RTS remote
  needs: 'A small radio node: an M5Stack Atom Lite with a CC1101 radio module running ESPSomfy-RTS. It pairs with each awning as one more remote.'
  wiring: None at the awning. Eight short wires between the radio module and the Atom, on the desk.
  supported: 'yes'
  prompt: Add the awnings component to my home, prepare the radio node for my Somfy RTS awnings (I will flash it myself), and stop before production so I can check it on staging.
- situation: A motor with buttons in the wall
  needs: A Shelly 2PM behind the wall switch; the buttons keep working.
  wiring: Mains, by an electrician.
  supported: coming-soon
  issue: https://github.com/zerostorypoints/domosenso/issues/74
- situation: A Somfy io motor (a two-way remote)
  needs: Somfy io is a different radio from RTS; the RTS node cannot drive it.
  wiring: —
  supported: 'no'
- situation: No motor (a crank or a strap)
  needs: An awning cannot be automated without a motor. Fitting one is a job for an awning installer.
  wiring: —
  supported: 'no'
---

If your awnings already open and close with a Somfy remote, you can automate them without
touching the awnings or the wiring: a small radio node learns to speak to them as one more remote,
and Home Assistant then retracts them at sunset and shows them on your phone and wall tablet. Your
old remote keeps working.

Look at your remote first: the label on the back or in the battery compartment usually says RTS
or io. RTS is the older one-way radio this guide covers; Somfy io is a different radio, not
supported yet. Awnings run by buttons in the wall need a relay behind the switch; that branch
waits for the Shelly component ([issue #74](https://github.com/zerostorypoints/domosenso/issues/74)).

## A motor with a Somfy RTS remote

**What to buy**

- One [M5Stack Atom Lite](/devices/m5stack-atom-lite/), about €8–15.
- One [CC1101 radio module](/devices/cc1101/) (tested: Ebyte E07-M1101D) with a 433 MHz antenna,
  about €5–10.
- A USB power supply for the node.

**Wiring.** Nothing at the awning. The radio module connects to the Atom with eight short wires;
the [CC1101 guide](/devices/cc1101/) has the diagram and the pin table. The module runs on 3.3 V,
never 5 V, and the antenna goes on before the node transmits.

**What your agent does, and what you do.** The agent adds the [awnings component](/components/awnings/)
to your home, prepares the flashing commands and the node's settings, and puts the awnings on your
staging Home Assistant. You flash the node over USB, join its Wi-Fi from your phone once, and pair
the awnings. Nothing reaches your real Home Assistant until you say so.

**What you get**

- Each awning as a cover in Home Assistant, with open, stop and close on your phone and on the
  [Ramka](/components/ramka/) wall tablet.
- At sunset, every awning that is not closed retracts by itself.
- The wind sensor's reports are watched, and you get an alert if it goes silent. The awnings still
  retract on wind by themselves, as before.
- Home Assistant follows the old remote too: when someone uses it, the positions update.

**Hints from real installations**

- Pair one awning at a time: hold PROG on a remote that already works for that awning, then pair
  the node's virtual remote. Name each awning as you go, before you pair the next one.
- Somfy RTS only sends, it never answers. Home Assistant knows what it sent, not where the awning
  is, and estimates the position from travel time. Time each awning's full extend and retract once
  and enter it on the node; the default of 10 seconds is wrong for most awnings.
- The node may hear the wind sensor only part of the time. On one installation the sensor was
  heard only intermittently, and the "sensor silent" alert had to be relaxed to 72 hours to stop
  false alarms. Place the node, or its antenna, with a clear line to the awnings and the sensor.
- The node prints your Wi-Fi password in its start-up log. Never paste that log into a chat or an
  issue.
- Reserve the node's address in your router so it comes back after a power cut.
