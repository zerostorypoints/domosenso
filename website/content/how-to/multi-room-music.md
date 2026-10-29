---
slug: multi-room-music
title: Music in every room
description: Control the music you already play from a wall tablet and your phone, starting from the network player or speakers you have.
components:
- media
devices:
- hegel-h400
status: published
updated: '2026-10-29'
sources:
- https://github.com/zerostorypoints/domosenso/tree/df34993199025856eeac590f959ae54e2a02cd62/components/media
branches:
- situation: A network streamer or amplifier Home Assistant supports
  needs: Nothing new. The player's Home Assistant integration (tested with a Hegel H400 through hegel_streaming).
  wiring: None. The player is on your home network.
  supported: 'yes'
  prompt: Add the media component to my home for the network player I already have, show it on my wall tablet, and stop before production so I can check it on staging.
- situation: Speakers in several rooms that you group in their own app
  needs: DomoSenso controls one player from the wall tablet; grouping rooms stays in the speakers' own app.
  wiring: None.
  supported: 'no'
- situation: An old hi-fi or passive speakers, nothing on the network
  needs: A network streamer in front of the amplifier first; Home Assistant has nothing to talk to without one.
  wiring: The streamer's audio cable to the amplifier.
  supported: 'no'
---

DomoSenso lets you control the music players you already have from a wall tablet and your phone:
play, pause, volume, input and what is playing now, for a streamer, amplifier or speaker that
Home Assistant supports. It does not group rooms into one stream; speakers that play together are
grouped in their own app, and the wall tablet controls one player.

It also does not make an old hi-fi smart; that needs a network streamer in front of it first.

## A network streamer or amplifier Home Assistant supports

**What to buy.** Nothing, if Home Assistant already lists your player as a media player. The tested
player is a [Hegel H400](/devices/hegel-h400/) through the `hegel_streaming` integration, which
finds the amplifier on your network without an account. Other players work when they offer the
basics the wall tablet needs: on and off, play and pause, volume and the current track. Only the
Hegel has been tested.

**Wiring.** None. The player stays where it is.

**What your agent does, and what you do.** The agent adds the [media component](/components/media/)
and points the [Ramka](/components/ramka/) wall tablet at your player, on your staging Home
Assistant first. You install the player's integration if Home Assistant does not have it yet
(the Hegel one comes from HACS) and confirm when the player is discovered.

**What you get**

- A now-playing page on the wall tablet with the title, artist and cover art when the player
  reports them, and the audio quality on the Hegel.
- Play, pause, volume and turn on from the tablet or your phone.
- Previous and next hidden while a service that cannot skip is playing, so the buttons on screen
  are the ones that work.

**Hints from real installations**

- Home Assistant may list the same amplifier two or three times (for example through Cast and
  DLNA as well). Point the tablet at the player from its own integration.
- Resume and skip depend on the player's integration and the streaming service. Before you rely
  on it, pause from the wall tablet and press play again: the same track should continue. On one
  installation Spotify Connect lost the session on a plain play until the integration was fixed.
- A player switched off at the mains does not answer at all. Network standby keeps it reachable.
