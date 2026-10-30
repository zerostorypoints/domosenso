---
slug: ramka-0-4-0
title: Ramka draws the music in the room
summary: Ramka 0.4.0 can show the room's sound on the now-playing page, and every setting is now live.
category: releases
date: '2026-10-30'
status: published
author: DomoSenso
components:
- ramka
- audio-sensor
- media
releases:
- id: ramka
  version: 0.4.0
  tag: ramka/0.4.0
  commit: 4a7bcf5f222f38dbb9f9e8790c95b56e68305b0c
- id: audio-sensor
  version: 0.1.0
  tag: audio-sensor/0.1.0
  commit: 4a7bcf5f222f38dbb9f9e8790c95b56e68305b0c
sources:
- https://github.com/zerostorypoints/domosenso/tree/4a7bcf5f222f38dbb9f9e8790c95b56e68305b0c
---

Ramka 0.4.0 and the new audio-sensor component are released together. A small M5Stack Atom EchoS3R board in the room measures the sound level and a third-octave spectrum; with `music_visual: spectrum` or `level`, the now-playing page draws that measurement in its wave strip instead of the classic wave. Without a reading, the strip falls back to the classic wave.

## Settings without a render

Every behaviour setting of Ramka is now a Home Assistant helper the tablet reads live. A new admin dashboard, "Ramka settings", has one page per view plus General: which pages rotate, presence and display timing, the theme and the music visual's look. A change reaches the tablet within about a second. "Reset to defaults" returns a page to its starting values.

## Upgrade deliberately

0.4.0 includes 0.3.1, which brings the clock card's forecast back after a Home Assistant restart. One step is required: add the settings dashboard's `lovelace:` entry to your `configuration.yaml`. A home that already runs Ramka keeps its tuned presence and display values. The visual needs audio-sensor with one board marked `music: true`; flashing the board the first time is done over USB.

The audio sensor is not a measurement microphone: it has one capsule and one calibration offset per board, and it has been tested with one board in one home. Read the upgrade notes linked below before changing a live installation.

Both releases were merged and tagged on 30 October 2026.
