---
slug: wiring-made-visible
title: From a component to the wires
summary: Two documented Atom connections, plus the tablet setup they help support.
category: updates
date: '2026-10-28'
status: published
author: DomoSenso
components:
- bermuda-presence
- awnings
- ramka
releases: []
sources:
- https://github.com/zerostorypoints/domosenso/tree/5b012718dcce57a386b1f3cfe87b8d7512c39b2f
---

Hardware requirements should lead to instructions you can inspect.

The [HLK-LD2410C radar guide](/devices/hlk-ld2410c/) pairs a labeled wiring diagram with a pin table, firmware steps and first-start checks. The [CC1101 guide](/devices/cc1101/) does the same for the radio node used with Somfy RTS awnings.

## Same board, different jobs

The radar accompanies an ESPHome Bluetooth proxy. The CC1101 radio node runs ESPSomfy-RTS. These are distinct firmware roles; one board should not be presented as doing both jobs at once.

## Finish at the screen

The [tablet setup guide](/devices/tcl-9469x/) covers the Companion app and Android settings used by the documented Ramka installation. Wiring, firmware, integration and presentation are separate steps, and each needs a check.

These guides describe the documented models and connections. They do not establish support for all related boards, radios or meters.
