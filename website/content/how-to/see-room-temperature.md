---
slug: see-room-temperature
title: Room temperature you can see
description: See the temperature and humidity of every room at a glance, on your phone and a wall tablet, from small battery sensors.
components:
- climate-air
devices:
- tapo-t315
status: published
updated: '2026-10-29'
sources:
- https://github.com/zerostorypoints/domosenso/tree/df34993199025856eeac590f959ae54e2a02cd62/components/climate-air
branches:
- situation: No room sensors yet
  needs: One Tapo T315 thermo-hygrometer per room and a Tapo hub (tested with the H200) that they report to.
  wiring: None. Battery sensors; the hub plugs into a socket and joins your network.
  supported: 'yes'
  prompt: Add the climate-air component to my home with one Tapo sensor per room, show the rooms on my wall tablet, and stop before production so I can check it on staging.
- situation: Temperature sensors already in Home Assistant, another brand
  needs: Nothing new. The component reads any temperature and humidity sensors Home Assistant already shows; only Tapo has been tested.
  wiring: None.
  supported: 'yes'
  prompt: Add the climate-air component to my home using the temperature and humidity sensors I already have in Home Assistant, one entry per room, and stop before production so I can check it on staging.
---

To see every room's temperature in one place, put one small battery sensor in each room and let
Home Assistant collect them: DomoSenso turns them into a room list, a whole-home average and the
most humid room, on your phone and on a wall tablet. If you already have sensors in Home Assistant,
you can use those instead.

## No room sensors yet

**What to buy**

- One [Tapo T315](/devices/tapo-t315/) temperature and humidity sensor per room, about €20–30 each. It has its own small
  display, so the reading is also on the wall.
- One Tapo hub that the sensors report to (tested: the H200).

**Wiring.** None. The sensors run on batteries; the hub plugs into a socket and joins your
network.

**What your agent does, and what you do.** You set up the hub and the sensors in the Tapo app and
add your TP-Link account in Home Assistant once; after that the hub is read on your home network.
The agent adds the [climate-air component](/components/climate-air/) with one entry per room,
labels them the way your household names the rooms, and shows the result on your staging Home
Assistant first.

**What you get**

- Temperature and humidity for every room, the indoor average, warmest and coolest, and, from
  your weather service or an outdoor sensor, the difference to outside.
- The most humid room by name, and a flag when the bathroom stays humid for ten minutes.
- The sensor with the lowest battery, before one goes flat.
- History kept as hourly figures, so you can compare this winter with the last.
- A temperature page on the [Ramka](/components/ramka/) wall tablet.

## Temperature sensors already in Home Assistant

The component takes each room's temperature and humidity sensor as an input, whatever their
brand. Your agent lists the ones Home Assistant has and asks which room each belongs to. Only the
Tapo sensors have been tested; tell your agent which ones you have, and check the readings on
staging before you rely on them.

## Hints from real installations

- Put each sensor away from radiators, windows and direct sun, at roughly head height. A sensor on
  a sunny windowsill reports the sun, not the room.
- Leave a glazed porch or winter garden out of the indoor average if its windows are often open;
  it still shows as a room of its own.
- Tapo hides the battery and signal entities by default. Switch on the battery ones in Home
  Assistant, or the lowest-battery figure stays empty.
- Reserve the hub's address in your router so Home Assistant finds it after a power cut.
