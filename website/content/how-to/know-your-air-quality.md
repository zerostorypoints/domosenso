---
slug: know-your-air-quality
title: Know your air quality
description: Know when to open a window. One air monitor shows CO₂, fine dust and an air-quality score on your phone and a wall tablet.
components:
- climate-air
devices:
- ruuvi-air
status: published
updated: '2026-10-29'
sources:
- https://github.com/zerostorypoints/domosenso/tree/df34993199025856eeac590f959ae54e2a02cd62/components/climate-air
branches:
- situation: No air monitor yet
  needs: A Ruuvi Air and one Bluetooth proxy within range (an M5Stack Atom Lite with the proxy firmware of the bermuda-presence component), unless you already have one.
  wiring: None. The monitor and the proxy each plug into USB power.
  supported: 'yes'
  prompt: Add the air part of the climate-air component to my home with my Ruuvi Air, prepare the Bluetooth proxy firmware from the bermuda-presence component for one Atom Lite near it (I will flash it myself), show the air on my wall tablet, and stop before production so I can check it on staging.
- situation: A CO₂ or air-quality sensor already in Home Assistant, another brand
  needs: Nothing new. The component reads the CO₂, fine-dust and index sensors Home Assistant already shows; only the Ruuvi Air has been tested.
  wiring: None.
  supported: 'yes'
  prompt: Add the air part of the climate-air component to my home using the air-quality sensor I already have in Home Assistant, and stop before production so I can check it on staging.
---

Stale air is easy to miss and easy to measure: a CO₂ reading tells you when to open a window, and
above about 1000 ppm most people notice it as tiredness or a stuffy room. One air monitor in the
room you spend most time in, read by Home Assistant, puts that number on your phone and on a wall
tablet, next to fine dust and an overall air-quality score.

If you only want temperature and humidity per room, see
[Room temperature you can see](/how-to/see-room-temperature/); this guide is about the air itself.

## No air monitor yet

**What to buy**

- A [Ruuvi Air](/devices/ruuvi-air/), a Bluetooth monitor for CO₂, fine dust (PM2.5), VOC, NOx,
  temperature, humidity and pressure.
- One Bluetooth proxy within range, an [M5Stack Atom Lite](/devices/m5stack-atom-lite/), about
  €8–15. A proxy you already have from [room presence](/how-to/presence-who-is-home/) also
  hears the monitor if it is within range; then you buy nothing more.

**Wiring.** None. Both run on USB power.

**What your agent does, and what you do.** A new proxy gets its firmware from the
[bermuda-presence component](/components/bermuda-presence/), the same Bluetooth proxy firmware
the room-presence guide uses: the agent prepares it for your board and you flash it over USB.
Home Assistant then discovers the monitor through the proxy; you confirm it, switch on its air-quality score (off by default) and switch off the
light-level reading the monitor does not have. The agent adds the air part of the
[climate-air component](/components/climate-air/) and shows the result on your staging Home
Assistant first.

**What you get**

- CO₂, PM2.5, VOC and NOx and an air-quality score out of 100, the same score the Ruuvi app shows.
- An air page on the [Ramka](/components/ramka/) wall tablet.
- History of every figure, so you can see which hours of the day the air gets bad.

## A sensor already in Home Assistant

The component takes the CO₂, PM2.5, VOC, NOx and score sensors as inputs, whichever of them your
sensor has. Only the Ruuvi Air has been tested; check the readings on staging before you rely on
them.

## Hints from real installations

- Place the monitor at breathing height, where people sit, not next to the hob or an open window.
- Through the common Atom Lite proxies the Ruuvi Air reported CO₂, temperature, humidity and PM2.5,
  but not PM1, PM4 or PM10: those travel in a newer Bluetooth format the proxies do not receive.
- VOC and NOx need about a day after power-on to settle. Do not judge them, or set alerts on them,
  before that.
- The monitor has a fan. Next to a presence radar it can look like movement; check the radar after
  placing it.
