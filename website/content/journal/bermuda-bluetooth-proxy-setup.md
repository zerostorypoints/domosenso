---
slug: bermuda-bluetooth-proxy-setup
title: How to set up a Bermuda Bluetooth proxy for room presence
summary: Connect Bluetooth proxies, assign their rooms and check Bermuda's area estimates before building presence automations.
category: updates
date: '2026-11-03'
updated: '2026-11-11'
status: published
author: DomoSenso
components:
- bermuda-presence
releases: []
howto:
- presence-who-is-home
sources:
- https://github.com/agittins/bermuda/wiki/
- https://www.home-assistant.io/integrations/bluetooth/
---

A Bluetooth proxy receives nearby Bluetooth signals and forwards them to Home Assistant.
Bermuda uses those observations to estimate which room a device is in. The proxy provides
the observations; Bermuda interprets them.

This guide covers the upstream setup and a suggested acceptance check. It does not claim
that the procedure has been tested in your home.

## Before you start

Have Home Assistant running, compatible ESP32 hardware with Bluetooth proxy firmware, USB
power and a Bluetooth device you want to track. Start with two rooms so you can test a
transition between them. Home Assistant supports remote Bluetooth adapters through ESPHome;
the [Bluetooth integration documentation](https://www.home-assistant.io/integrations/bluetooth/)
explains the supported arrangements.

## 1. Connect and name the proxies

Set up your ESP32 devices with ESPHome Bluetooth proxy firmware and add them to Home Assistant
through the ESPHome integration. For an Atom Lite, use the
[tagged package and build steps in the Atom guide](/journal/set-up-m5stack-atom-home-assistant/).
Assign each proxy to the Home Assistant area where it is
physically installed. Choose names that make that assignment easy to check later.

## 2. Select a device in Bermuda

Follow the installation instructions in the
[Bermuda documentation](https://github.com/agittins/bermuda/wiki/). Open Bermuda's configuration
under **Settings → Devices & services** and select the Bluetooth device you want to track.
Bermuda supplies home/away tracking, an estimated area and distance sensors.

Phones that change their Bluetooth address may need additional identity handling. Bermuda
supports Home Assistant's Private BLE Device integration for compatible devices. Follow the
upstream instructions for your model rather than assuming that every phone or tracker
advertises a stable identity.

## 3. Check the room estimate

Before creating an automation, try this small acceptance exercise:

1. Leave the tracked device in the first room and record the reported area.
2. Carry it into the second room, wait for the estimate to settle and record the result.
3. Repeat with the device in a pocket and with doors closed.
4. Leave the device behind and walk out yourself.

That last step makes the limitation clear: the system is locating the device. A phone on
a desk remains there after its owner leaves.

## If the wrong room appears

First check the receiver's assigned area, its connection to Home Assistant and whether the
device is being detected. Keep a short record of locations that are confused. Try changing
one receiver position at a time, then repeat the same exercise. Treat the reported distance
as an estimate, not a measurement of the room.

Only build an automation after deciding what should happen when the device is left behind,
goes offline or changes rooms briefly. Start with a visible notification so you can inspect
the result before using it to control a room.

## Use it with DomoSenso

The [presence guide](/how-to/presence-who-is-home/) explains the framework's room-presence
approach and its optional radar hardware. The
[Bermuda presence component](/components/bermuda-presence/) records the released DomoSenso
scope. Keep proxy credentials and device identity information in your own home project.

### Prepare an Atom Lite with an AI agent

Open the [DomoSenso repository](https://github.com/zerostorypoints/domosenso) with your agent
and give it this prompt.

> Verify that my board is an M5Stack Atom Lite and confirm that I want a Bermuda Bluetooth
> proxy. Read AGENTS.md and the relevant Bermuda Presence instructions in
> https://github.com/zerostorypoints/domosenso and my home project. Find the released ESPHome
> package and prepare a device YAML for each room I give you. Keep secrets local and out of
> chat and Git. Give me the build command and the steps to check the proxies and a room change
> in Home Assistant. Ask for separate approval before flashing or deploying anything.
