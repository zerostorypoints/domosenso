---
slug: presence-who-is-home
title: 'Presence: who is home, and in which room'
description: See who is home and which room they are in, from the phones and watches people already carry, with small Bluetooth receivers.
components:
- bermuda-presence
- ramka
devices:
- m5stack-atom-lite
- hlk-ld2410c
status: published
updated: '2026-10-29'
sources:
- https://github.com/zerostorypoints/domosenso/tree/df34993199025856eeac590f959ae54e2a02cd62/components/bermuda-presence
- https://github.com/zerostorypoints/domosenso/tree/df34993199025856eeac590f959ae54e2a02cd62/components/ramka
branches:
- situation: Phones and watches everyone carries
  needs: One Bluetooth proxy per room, an M5Stack Atom Lite, and the Bermuda integration in Home Assistant.
  wiring: None. Each proxy plugs into a USB power supply.
  supported: 'yes'
  prompt: Add the bermuda-presence component to my home with one Bluetooth proxy per room, prepare the proxies' firmware (I will flash them myself), and stop before production so I can check it on staging.
- situation: Someone in the room without a phone
  needs: An HLK-LD2410C radar on one of the room's proxies. It notices a person sitting still beyond about 1.5 m and, if you have the Ramka wall tablet, wakes it.
  wiring: Four low-voltage wires between the radar and the Atom.
  supported: 'yes'
  prompt: Add the radar feature of the bermuda-presence component to the proxy in the room I choose, let it wake the Ramka if I have one, and stop before production so I can check it on staging.
- situation: Only AirTags or similar trackers
  needs: These trackers change their Bluetooth address and cannot be told apart as one person's tag.
  wiring: —
  supported: 'no'
---

Home Assistant can tell who is home and which room they are in from the phones and watches people
already carry: a small Bluetooth receiver in each room hears them, and the Bermuda integration
works out which room is closest. DomoSenso turns that into one line per room ("Alex, Sam"), shown on
your phone and, if you have one, on a wall tablet. A radar adds "someone is here" for people
without a phone in their pocket.

## Phones and watches everyone carries

**What to buy**

- One [M5Stack Atom Lite](/devices/m5stack-atom-lite/) per room, about €8–15 each. A room without
  one gets no presence of its own.
- A plain 5 V USB power supply for each. Fast-charging plugs can cut the Atom's power.

**Wiring.** None. Each proxy sits on a shelf or in a socket, wherever it is out of the way.

**What your agent does, and what you do.** The agent adds the
[bermuda-presence component](/components/bermuda-presence/), writes one firmware file per proxy
and the room sensors, and shows them on your staging Home Assistant first. You flash the proxies
over USB, install Bermuda (it comes from HACS) and add each phone and watch. Apple devices change
their Bluetooth address, so each one needs its identity key once; the
[component's notes](/components/bermuda-presence/) explain how to read it.

**What you get**

- One sensor per room with the names of the people in it, and a tablet left in a room shown in
  brackets, because a tablet lies where it was put down.
- A notification when a proxy has been offline for ten minutes.
- Room sensors your own automations can use.

## Someone in the room without a phone

**What to buy.** One [HLK-LD2410C radar](/devices/hlk-ld2410c/), about €3–10, on the Atom that is
already the room's proxy.

**Wiring.** Four wires between the radar and the Atom, all low voltage: 5 V, ground and two data
lines. The [radar guide](/devices/hlk-ld2410c/) has the diagram.

**What you get.** A "someone is in the room" sensor that works without a phone. If you have the
[Ramka](/components/ramka/) wall tablet, it wakes when someone comes near.

## Hints from real installations

- Cover every room before you calibrate. A room without a proxy is never empty: Bermuda places
  the person in the nearest room that has one.
- One flat needed seven proxies, one per room.
- Phones and watches work best. Tested with iPhones, iPads and Apple Watches; Garmin watches stay
  silent while connected to their phone.
- Give each proxy a fixed address in your router so it comes back after a power cut.
- Keep Bermuda's distance sensors out of Home Assistant's history. On one installation they filled
  most of the database.
- The radar does not see a person sitting still within about 1.5 m of it, only movement. Mount it
  a little away from where people sit closest.
