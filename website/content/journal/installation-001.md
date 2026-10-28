---
slug: installation-001
title: A tablet, a radar, an ordinary shelf
summary: 'Inside the maintainer’s first installation: components with a physical home.'
category: installations
date: '2026-10-28'
status: published
author: DomoSenso
components:
- ramka
- bermuda-presence
- media
releases:
- id: ramka
  version: 0.2.0
  tag: ramka/0.2.0
  commit: 0345fba394a40f666fd038c4dd6f6fa49173311d
sources:
- https://github.com/zerostorypoints/domosenso/tree/5b012718dcce57a386b1f3cfe87b8d7512c39b2f
cover: /journal/installation-001.jpg
---

The first installation brings an Android tablet, a nearby radar and Home Assistant together. This is the maintainer’s personal setup, not a customer project. The photographs were already published in the original installation journal.

## Give the screen a reason to wake

Ramka supplies the ambient pages and controls. The radar supplies presence and distance through the optional radar feature of Room presence. Bluetooth room estimates and radar presence are separate signals; the screen does not need to identify a person to react to someone nearby.

## Show what is already happening

The media integration supplies a Home Assistant media player. Ramka can use its track metadata for the now-playing view. The documented player is a Hegel H400; a speaker visible in a photograph is not a claim about compatibility.

## What this installation taught us

A wall display needs more than a dashboard layout. Screen wake and sleep, Android permissions, charging behavior and the viewport all matter. The [tablet guide](/devices/tcl-9469x/) records the tested setup; the [radar guide](/devices/hlk-ld2410c/) records the wiring.

The original journal documented Ramka 0.2.0. This article does not establish which version is running in the home today. Field experience remains limited; another installation needs its own validation.
