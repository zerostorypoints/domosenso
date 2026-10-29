---
slug: try-before-you-merge
title: Try it before it reaches your home
summary: Every change can now be opened in a local Home Assistant first, by anyone, without writing code.
category: updates
date: '2026-10-29'
status: published
author: DomoSenso
components:
- ramka
releases: []
sources:
- https://github.com/zerostorypoints/domosenso/pull/68
---

DomoSenso now has a shared way of working that is open to anyone. Contributors use a fork and run the same checks as the core team. An AI agent reviews each change, and a human approves it. Nobody can approve their own pull request, and that includes the maintainers.

## Look at a pull request before it is accepted

Ask Codex or Claude Code to run `preview-pr` for a pull request number. It starts a fictional home on your computer with the real Ramka on screen. You can switch it between morning, evening, away and rain. It has no lights, speakers or blinds of its own; light switches and music commands are only recorded. When you have seen enough, you accept the change or ask for changes.

## Test an update on your own home

`stage-home-update` does the same for your own home. It sets up a separate Home Assistant with no access to your network or the internet, and with none of your passwords. It loads the configuration you have now, then the update, and compares the two. In the first run on a real home, three component updates went through and every entity, automation and dashboard came out the same. The only difference was the new address of the Ramka's cards.

## Still to come

A test Home Assistant starts empty, so the tiles on the dashboards have no readings. Next it will be able to show real readings copied from your own Home Assistant, or realistic invented ones when none are available.
