---
slug: ramka-0-9-0
title: Stop on a page and read it
summary: Ramka 0.9.0 pauses the rotation from the bottom-right corner and turns plant pages and photos with a sideways swipe. Ramka 0.8.0 and 0.9.0 also bring a list of every plant, climate widgets, named colours, a preview dashboard and a Live visualization switch.
category: releases
date: '2026-11-01'
status: published
author: DomoSenso
components:
- ramka
- plants
- climate-air
- audio-sensor
releases:
- id: ramka
  version: 0.9.0
  tag: ramka/0.9.0
  commit: c3eca96f268a7ca0d1d7a143f55180e5ee088bc1
- id: audio-sensor
  version: 0.3.0
  tag: audio-sensor/0.3.0
  commit: 934b653536616fc7b310cb430aae00a08d72b1e8
sources:
- https://github.com/zerostorypoints/domosenso/tree/c3eca96f268a7ca0d1d7a143f55180e5ee088bc1
- https://github.com/zerostorypoints/domosenso/tree/934b653536616fc7b310cb430aae00a08d72b1e8
---

Ramka 0.8.0 was tagged on 31 October 2026 and 0.9.0 on 1 November. This article covers both.

## Pause and swipe

On the wall, a tap anywhere opens the controls, so there was no way to stay on a page long enough to read it. In 0.9.0 the bottom-right corner of the rotation pauses it: the page on screen and the view inside it stay, and a small play button in that corner resumes the rotation with the page's full time. A sideways swipe steps through the views of the page on screen: the plant pages, or the photos of the current series, round in both directions. Climate, air and status have one view and ignore it. Up and down still turn the pages. While paused, every swipe keeps the pause, and the controls give back the paused page when they close. The pause ends when the screen goes off, so the next person who walks up gets the rotation.

## Every plant on one page

With more than four plants, a list page now follows the tile pages: one row per plant with its photo, name, room, action, the sun, fertiliser and water bars and the moisture line, up to seven rows a page. A plant without a photo shows a leaf in its state's colour instead of its initial.

## Climate widgets and named colours

The climate page holds up to twenty widgets: temperature, air quality, custom (any two readings) or an empty tile, in an order you drag into place on the settings dashboard. Colour settings pick from one list of named colours that follows the theme, shown with a dot in each choice. The air page's levels read good, fair and poor, and their colours are set on the Air page.

## Settings and a preview

Every settings page opens with what its screen shows and when. Controls on approach and the near settings have their own Controls page. A new preview dashboard, on by default, shows each screen in a frame of the tablet's size, so a setting can be checked without waiting for the rotation. An About page lists the components a home runs and their links.

## The music visual

The visual now has its own switch, Live visualization, off by default: every home starts on the classic wave and switches it on in the settings. Response profiles set how the visual moves, and the Behind speakers EQ preset is a measured curve rather than flat. The Live visualization page reads the music sensor's abilities from audio-sensor's music source, released the same day in audio-sensor 0.3.0, which also brings a six-range EQ to the music cards and needs no new flash. Update the two together: with audio-sensor 0.2.0 that page cannot tell what the sensor can do.

## Upgrade deliberately

`domosenso update ramka` moves the cards to the new version's folder; then deploy and press the Ramka's reload button. Add the preview dashboard's entry, or set `preview_dashboard: false`. A script that reset the near settings with `page: general` passes `page: controls` now. The Ramka component page links the upgrade notes for both releases.
