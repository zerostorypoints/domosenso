---
slug: ramka-0-3-0
title: Keep only the pages you need
summary: The status page can now be removed from Ramka’s ambient rotation.
category: releases
date: '2026-10-28'
status: published
author: DomoSenso
components:
- ramka
releases:
- id: ramka
  version: 0.3.0
  tag: ramka/0.3.0
  commit: 5b89ebe0e07d196bc07e46c2b375a35d1b5ea6fe
sources:
- https://github.com/zerostorypoints/domosenso/tree/5b012718dcce57a386b1f3cfe87b8d7512c39b2f
---

Ramka 0.3.0 adds `status_page: false`. It removes the read-only status page from both the rotation and the swipe sequence. Status remains enabled by default.

## When to use it

If the controls already show your lights and awnings, and there are no other status items you want to see, the extra ambient page may add little. You can keep the useful pages and leave that one out.

Climate, air, plants and photos still depend on their own inputs. At least one ambient page must remain; a render with no ambient pages fails rather than leaving an empty rotation.

## Upgrade deliberately

Review the release notes linked below. Update the component in your separate home project, adjust the inputs, render and inspect the resulting pages. Review the deployment plan before changing a live installation.

The release was merged on 27 October 2026. This article’s publication date is 28 October; it is not the tag creation date.
