---
slug: atom-echos3r-home-assistant-assist
title: How to connect an M5Stack Atom EchoS3R to Home Assistant Assist
summary: Check the hardware model, select the manufacturer's voice firmware and test each stage of a Home Assistant Assist command.
category: updates
date: '2026-11-03'
status: published
author: DomoSenso
components:
- audio-sensor
releases: []
sources:
- https://docs.m5stack.com/en/homeassistant/applications/voice_assistant/atom_echos3r
- https://docs.m5stack.com/en/core/Atom_EchoS3R
---

Start by checking the exact model printed on your device. At the time of writing, M5Stack's
documentation at the Atom EchoS3R guide URL uses the name **Atom VoiceS3R**. Match your hardware
to the manufacturer's product page before choosing firmware.

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

Use the precompiled firmware or complete ESPHome configuration linked from the
[manufacturer's setup guide](https://docs.m5stack.com/en/homeassistant/applications/voice_assistant/atom_echos3r).
The guide currently specifies ESPHome **2026.1.0 or later**. Check that requirement again
when preparing your device.

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
