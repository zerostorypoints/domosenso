---
slug: atom-echos3r-home-assistant-assist
title: How to connect an M5Stack Atom EchoS3R to Home Assistant Assist
summary: Check the hardware model, select the manufacturer's voice firmware and test each stage of a Home Assistant Assist command.
category: updates
date: '2026-11-03'
updated: '2026-11-11'
status: published
author: DomoSenso
components:
- audio-sensor
releases: []
sources:
- https://docs.m5stack.com/en/homeassistant/applications/voice_assistant/atom_echos3r
- https://docs.m5stack.com/en/core/Atom_VoiceS3R
- https://github.com/m5stack/esphome-yaml/releases/tag/2026.10.0
---

Start by checking the model on the board or packaging. M5Stack's EchoS3R product URL redirects
to [Atom VoiceS3R, SKU C126-ECHO](https://docs.m5stack.com/en/core/Atom_VoiceS3R), and its Assist
guide identifies the same board. Match the SKU before choosing firmware. The
[M5Stack Atom setup guide](/journal/set-up-m5stack-atom-home-assistant/) compares the available
models and firmware.

This is a guide to the manufacturer's Assist setup, not a claim of a tested DomoSenso voice
integration. DomoSenso currently documents this board as an
[audio sensor](/devices/m5stack-atom-echos3r/): its package measures sound and keeps the speaker
amplifier off. That package does not add a voice assistant or Bluetooth. Installing voice
firmware is a different use of the device; do not assume both functions will keep running.

## 1. Prepare the voice pipeline

Choose the Assist pipeline the satellite will use. The manufacturer documents both Home
Assistant Cloud and a local pipeline. Test your chosen pipeline in Home Assistant first,
so you have a working reference before adding the satellite.

## 2. Install firmware for the correct hardware

Follow the [manufacturer's setup guide](https://docs.m5stack.com/en/homeassistant/applications/voice_assistant/atom_echos3r).
M5Stack's [2026.10.0 release](https://github.com/m5stack/esphome-yaml/releases/tag/2026.10.0) provides
`atom-voices3r-satellite.factory.bin` for first installation and `atom-voices3r-satellite.ota.bin`
for updates. You can also build from the complete ESPHome configuration linked in the guide.
Check the ESPHome version required by that source before building.

Use the complete configuration rather than mixing microphone and speaker settings from
similarly named Atom models. Save the configuration and firmware revision you use, along with
the ESPHome version. If this device already performs another job, preserve its configuration
before replacing its firmware.

## 3. Add the satellite to Home Assistant

Once the device joins your network, accept its ESPHome discovery prompt and assign it to an
area. Open its voice assistant settings, then choose its area and Assist pipeline.

The manufacturer's example uses **Okay Nabu** as its wake word. Begin with one exposed light
and a clear command, then check that you can hear the response.

## 4. Find the stage that fails

Use this sequence as a troubleshooting worksheet:

| Observation | Next check |
| --- | --- |
| The device is offline | Check power and network connection before changing voice settings. |
| The device is online but does not react | Confirm the selected firmware and configured wake word. |
| It reacts but the command fails | Compare the result with the same request in the working Assist pipeline. |
| The action succeeds but there is no audible reply | Check the response and audio-output stages separately. |

Change one thing at a time and repeat the same command. A clear description such as
“the light turns on but no response is audible” is more useful than “voice does not work”.

## Choose the job before choosing the package

For voice interaction, follow the upstream Assist configuration above. For room sound readings,
read the [DomoSenso audio-sensor component](/components/audio-sensor/) and its stated limits.
These are separate configurations, and this article does not establish that they can be combined.

## Prepare the setup with an AI agent

Open the [DomoSenso repository](https://github.com/zerostorypoints/domosenso) with your agent
and give it this prompt.

> Confirm the exact model and SKU of my M5Stack Atom and confirm that I want a Home Assistant
> Assist satellite. Read AGENTS.md and the relevant instructions in
> https://github.com/zerostorypoints/domosenso and my home project. Find the official M5Stack
> Assist guide for my hardware and prepare the provisioning steps or a local ESPHome
> configuration. Tell me how to check the pipeline and verify one spoken command. Keep
> credentials local and out of chat and Git. Ask for separate approval before flashing or
> deploying anything.
