---
slug: see-power-consumption
title: See your power consumption
description: Find the devices that never really switch off with a small metering relay behind a socket. Coming with the Shelly component.
components: []
devices: []
status: draft
updated: '2026-10-29'
sources:
- https://github.com/zerostorypoints/domosenso/issues/74
branches:
- situation: A device you suspect of drawing power in standby
  needs: A small metering relay (a Shelly PM Mini) behind its socket.
  wiring: Mains, by an electrician.
  supported: coming-soon
  issue: https://github.com/zerostorypoints/domosenso/issues/74
---

A small metering relay behind one socket shows how much the device plugged into it draws, on your
phone and in Home Assistant's energy history, including the standby draw of devices that never
really switch off. DomoSenso does not cover this yet: it waits for the Shelly component
([issue #74](https://github.com/zerostorypoints/domosenso/issues/74)), and this guide is published
when that component is released.

## Hints from real installations

- On one installation a metering relay behind an amplifier's socket showed its standby draw, the
  kind of figure that is hard to see any other way.
- Fitting a relay behind a socket is mains work. Have an electrician do it.
