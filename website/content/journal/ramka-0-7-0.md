---
slug: ramka-0-7-0
title: Ramka finds the plants itself
summary: Ramka 0.7.0 shows 1 to 50 plants in pages, with plants 0.3.0 saying when each was watered and when it will need water. Ramka 0.5.0 and 0.6.0 bring more settings, and audio-sensor 0.2.0 a faster spectrum.
category: releases
date: '2026-10-31'
status: published
author: DomoSenso
components:
- ramka
- plants
- audio-sensor
- climate-air
releases:
- id: ramka
  version: 0.7.0
  tag: ramka/0.7.0
  commit: c54b8243303fd3b6b39c7d1d7eedfe1e78348a3b
- id: plants
  version: 0.3.0
  tag: plants/0.3.0
  commit: c54b8243303fd3b6b39c7d1d7eedfe1e78348a3b
- id: audio-sensor
  version: 0.2.0
  tag: audio-sensor/0.2.0
  commit: 0f1f0a7d060ec4bcb5ed0f4389363f24f7439250
sources:
- https://github.com/zerostorypoints/domosenso/tree/c54b8243303fd3b6b39c7d1d7eedfe1e78348a3b
- https://github.com/zerostorypoints/domosenso/tree/0f1f0a7d060ec4bcb5ed0f4389363f24f7439250
---

Three Ramka releases, a plants release and an audio-sensor release were tagged on 30 October 2026. This article covers them together.

## Plants, from one to fifty

With plants 0.3.0, each plant carries its room, its limits, an optional photo and its names, so Ramka 0.7.0 can find every plant with `plants: discover` instead of a list in its inputs. The plants page shows up to six plants at a time by default, the tiles growing to fill the screen; with more plants, pages turn every ten seconds, the plants that need something first, with one dot per plant grouped by room. A tile shows the photo or the plant's initial, its 7-day moisture line and, from plants 0.3.0, "watered N days ago" or "water in ~N days". The colours are green, grey and amber, never red. Plants per page and time per page are on the settings dashboard.

Plants 0.3.0 also lists a moisture sensor that sits in soil but belongs to no plant, so a new probe in a pot is noticed.

## More settings without a render

Ramka 0.5.0 adds settings pages for Photos (albums, photos per series, time per photo), Air (each reading and its two limits), Climate (the rooms and their readings) and Calendar, plus a General page. Ramka 0.6.0 raises the Climate rooms from five to ten.

## A faster spectrum

audio-sensor 0.2.0 follows a bass hit in about 0.3 s instead of up to about 1 s. The board has three update rates; with Ramka 0.6.0 it runs on the fast one only while the music view is on screen and returns to normal afterwards. The faster rate needs the board flashed with the 0.2.0 firmware; until then the spectrum keeps its old pace.

## Upgrade deliberately

Update plants to 0.3.0 before, or in the same deploy as, Ramka 0.7.0 when you switch to `plants: discover`; before plants 0.3.0 runs, the page says there are no plants. A plant list in Ramka's inputs keeps working. Update audio-sensor together with Ramka 0.6.0 or later. The component pages link each release's upgrade notes.
