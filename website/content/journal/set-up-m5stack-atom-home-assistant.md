---
slug: set-up-m5stack-atom-home-assistant
title: Set up an M5Stack Atom in Home Assistant
summary: Set up an Atom Lite as a Bermuda Bluetooth proxy, or choose the right firmware for Assist or sound measurement on an Atom EchoS3R.
category: updates
date: '2026-11-11'
status: published
author: DomoSenso
components:
- bermuda-presence
- audio-sensor
releases: []
howto:
- presence-who-is-home
sources:
- https://github.com/zerostorypoints/domosenso
- https://github.com/agittins/bermuda/wiki/
- https://esphome.io/guides/cli/
- https://docs.m5stack.com/en/core/Atom_VoiceS3R
- https://docs.m5stack.com/en/homeassistant/applications/voice_assistant/atom_echos3r
- https://github.com/m5stack/esphome-yaml/releases/tag/2026.10.0
- https://www.home-assistant.io/voice_control/troubleshooting/
---

Check the model on the board or packaging and decide what it should do before choosing firmware.
The M5Stack Atom family includes boards with different chips, microphones and speakers.

| Your goal | Board | Firmware to use |
| --- | --- | --- |
| Estimate which room a phone or Bluetooth tag is in | [Atom Lite](/devices/m5stack-atom-lite/) | Build the DomoSenso Bermuda Presence ESPHome configuration |
| Speak commands to Home Assistant Assist | [Atom EchoS3R](/devices/m5stack-atom-echos3r/) | Use the M5Stack Assist firmware for Atom VoiceS3R, SKU `C126-ECHO` |
| Measure room sound level and frequency spectrum | Atom EchoS3R | Build the DomoSenso Audio Sensor ESPHome configuration |

## Atom Lite for Bermuda room presence

ESPHome runs on the Atom Lite and forwards nearby Bluetooth Low Energy advertisements to
Home Assistant over Wi-Fi. Bermuda runs in Home Assistant and uses observations from the
proxies to estimate the area of a tracked phone or tag. Start with two proxies in two
different rooms and a device that Bermuda can track.

### Build the proxy for your home

DomoSenso publishes the shared [Bermuda Presence ESPHome package at
`bermuda-presence/0.3.0`](https://github.com/zerostorypoints/domosenso/blob/bermuda-presence/0.3.0/components/bermuda-presence/esphome/ble-proxy.yaml).
If you already use the DomoSenso catalog, have your agent set the component's proxy inputs
and generate one device YAML per proxy. For a standalone proxy, save the example below as
`ble-proxy-office.yaml` in your ESPHome configuration directory. Give each board a unique
`room` slug and set `area` to its physical room's name in Home Assistant.

```yaml
substitutions:
  room: office
  area: Office

esphome:
  area: ${area}

packages:
  proxy: github://zerostorypoints/domosenso/components/bermuda-presence/esphome/ble-proxy.yaml@bermuda-presence/0.3.0

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
  encryption:
    key: !secret api_encryption_key

ota:
  - platform: esphome
    encryption:
```

In a local `secrets.yaml` beside the device file, define `wifi_ssid`, `wifi_password` and
`api_encryption_key`. Use a 2.4 GHz Wi-Fi network and generate the key with
`openssl rand -base64 32`. Keep the secrets file out of Git.

With [uv installed](https://docs.astral.sh/uv/getting-started/installation/), validate and compile
from that directory using ESPHome 2026.9.1, the catalog's checked version.

```sh
uvx esphome@2026.9.1 config ble-proxy-office.yaml
uvx esphome@2026.9.1 compile ble-proxy-office.yaml
```

When ready to flash, connect the Atom Lite with a USB data cable. Run
`uvx esphome@2026.9.1 run ble-proxy-office.yaml` and choose the USB serial port for the
first installation. For later updates, run the same command and choose the online board
for an over-the-air (OTA) upload. Keep the device name and API key consistent with the
running configuration. If the board cannot join Wi-Fi, reconnect over USB.

### Add the proxy and check a room change

1. In Home Assistant, open **Settings → Devices & services** and add the discovered ESPHome
   device. Enter the API encryption key if prompted. If discovery is unavailable, add the
   device by hostname or IP in the ESPHome integration.
2. On each proxy's Home Assistant device page, check that **Area** matches its physical
   room. Install Bermuda via HACS or follow Bermuda's manual installation instructions if
   you run without HACS. Select a device in Bermuda's configuration. A phone with a rotating
   Bluetooth address may need the Private BLE Device integration.
3. Open the tracked device's Bermuda **Area** sensor. Leave the phone or tag in the first
   room until the estimate settles, then carry it to the second room and check that the
   area changes. If it stays in the first room, check that both proxies are online, their
   areas are correct and the tracked device is still advertising.

For a longer test and help with coverage, see the
[Bermuda Bluetooth proxy setup](/journal/bermuda-bluetooth-proxy-setup/).
The [Bermuda Presence component](/components/bermuda-presence/) and
[room-presence guide](/how-to/presence-who-is-home/) cover the optional room sensors and radar.

## Atom EchoS3R for Home Assistant Assist

Check the hardware against M5Stack's product page before you choose a firmware image. M5Stack's
old EchoS3R product URL redirects to **Atom VoiceS3R**, SKU **C126-ECHO**. The Assist tutorial
still has `atom_echos3r` in its URL and identifies the same product. Match that SKU, especially
if the packaging says Atom Echo or AtomS3R. [M5Stack product page](https://docs.m5stack.com/en/core/Atom_VoiceS3R)

1. In **Settings → Voice assistants**, choose or configure a Home Assistant Cloud or local
   Assist pipeline. Expose one light to Assist and test a command in Home Assistant first.
2. Follow the [EchoS3R Assist setup](/journal/atom-echos3r-home-assistant-assist/) and
   [M5Stack's guide](https://docs.m5stack.com/en/homeassistant/applications/voice_assistant/atom_echos3r)
   to install the matching voice firmware. M5Stack's [2026.10.0 release](https://github.com/m5stack/esphome-yaml/releases/tag/2026.10.0)
   supplies `atom-voices3r-satellite.factory.bin` for first installation and
   `atom-voices3r-satellite.ota.bin` for updates. The manufacturer also links the ESPHome
   configuration if you want to build it yourself.
3. When the satellite joins Wi-Fi, add it from ESPHome discovery, assign its area and select
   the tested pipeline in its voice settings. With the example wake word, say “Okay Nabu,”
   then “Turn on the desk lamp,” using the name of your exposed light. Check that the light
   turns on and you hear the reply.
4. If the command fails, open **Settings → Voice assistants**, choose the assistant's **Debug**
   option and inspect the latest run. Check the transcript, the action and the spoken response
   in order. [Home Assistant Assist troubleshooting](https://www.home-assistant.io/voice_control/troubleshooting/)

## Atom EchoS3R for measuring sound

The [Audio Sensor component](/components/audio-sensor/) uses the microphone to publish sound
level and a frequency spectrum. Its ESPHome package keeps the speaker amplifier off and has
no Assist pipeline. To use the board for sound measurement, build from the
[released Audio Sensor source](https://github.com/zerostorypoints/domosenso/tree/audio-sensor/0.4.0/components/audio-sensor)
with a home-specific device file. After adding it in Home Assistant, check that the level and
spectrum update as the room goes from quiet to ordinary conversation or music. Use separate
boards if you need a voice satellite and a sound sensor at the same time.

## What you can download or build

| Item | Where it comes from | What you do with it |
| --- | --- | --- |
| Shared ESPHome package YAML | The tagged DomoSenso source for Bermuda Presence or Audio Sensor | Reference it under `packages:` in a device file. It defines the hardware and behavior. |
| Device YAML for your home | Generated by the DomoSenso catalog from your inputs, or written using the example above | Set the name and area, reference local secrets and build it with ESPHome. Keep this file for future updates. |
| DomoSenso first-flash or OTA image | Built locally by ESPHome from your device YAML | ESPHome builds `firmware.factory.bin` for first installation over USB and `firmware.ota.bin` for network updates. DomoSenso publishes YAML source, including factory configurations, without a public ready-to-download `.bin` for these two components. |
| Assist firmware for C126-ECHO | M5Stack's model-specific Assist guide | Download the model-specific factory or OTA image from M5Stack, or build its linked ESPHome source. |

The Atom Lite setup follows a field-tested sequence of building a device YAML, flashing over USB,
adding it to Home Assistant and updating over Wi-Fi. The original installation used a local ESPHome
package. The tagged package above provides the basic proxy without copying installation-specific
settings or add-ons.

Find more guides and component pages in the [DomoSenso sitemap](/sitemap.xml).

## Prepare the configuration with an AI agent

Give your agent the [public DomoSenso repository](https://github.com/zerostorypoints/domosenso) and
paste this prompt into your home project's workspace.

> Help me set up my M5Stack Atom in Home Assistant. Confirm the exact model and SKU from my
> label or packaging. Ask whether I want a Bermuda Bluetooth proxy, an Assist voice satellite
> or a room sound sensor. Read AGENTS.md and the relevant instructions in
> https://github.com/zerostorypoints/domosenso and my home project. Find the released ESPHome
> package for the chosen DomoSenso component or M5Stack's guide for the exact Assist hardware.
> Prepare a device configuration or provisioning steps for my home. Show the source and its
> version, the local validation or build command and the Home Assistant checks for the chosen
> job. Use local secret references and keep credentials out of chat and Git. Stop for my separate
> approval before flashing a device or deploying changes to Home Assistant.
