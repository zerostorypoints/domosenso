---
slug: mi-flora-home-assistant-setup
title: How to add a Mi Flora plant sensor to Home Assistant
summary: Set up Xiaomi BLE for a Flower Care sensor, troubleshoot discovery and missing battery readings, then check the data before adding plant reminders.
category: updates
date: '2026-11-03'
status: published
author: DomoSenso
components:
- plants
releases: []
sources:
- https://www.home-assistant.io/integrations/xiaomi_ble/
- https://www.home-assistant.io/integrations/bluetooth/
---

For the **HHCCJCY01**, also sold as Flower Care or MiFlora, start with Home Assistant's
**Xiaomi BLE** integration. First get reliable readings into Home Assistant; then decide
how you want to display them or use them in a reminder.

## 1. Check Bluetooth reception

Home Assistant needs a working Bluetooth adapter or compatible Bluetooth proxy within range.
For initial setup, place the sensor close to the receiver. If you use an ESPHome proxy,
confirm that it is connected to Home Assistant before troubleshooting the plant sensor.
See the [Bluetooth integration guide](https://www.home-assistant.io/integrations/bluetooth/)
for supported receivers and proxy arrangements.

## 2. Add Xiaomi BLE

The sensor should be discovered automatically. If necessary, open
**Settings → Devices & services → Add integration**, select **Xiaomi BLE** and follow
the setup steps. Some entities appear only after their first reading arrives.

## 3. Check firmware if discovery fails

Older firmware may not transmit the required Bluetooth advertisements. Home Assistant lists
**3.2.1** as the lowest confirmed working firmware version for this model.

If an update is needed, use the official Flower Care app and follow the linked firmware-update
instructions. The app and account are not required for ongoing Home Assistant operation
afterwards.

## 4. Give the battery reading time

Battery information requires an active Bluetooth connection. Home Assistant requests it only
once a day to conserve power, and reception must be strong enough for that connection.
Other readings arrive through passive broadcasts. A missing battery value therefore does not
necessarily mean that every part of the integration has failed.

These discovery, firmware and battery details come from the
[Home Assistant MiFlora documentation](https://www.home-assistant.io/integrations/xiaomi_ble/#plant-sensor-flower-care-miflora-hhccjcy01).

## 5. Check the sensor in its final position

After setup, move the sensor to its intended pot and inspect the history over a normal watering
cycle. As a suggested acceptance check:

1. Give the device a name that identifies its pot.
2. Confirm that readings continue after it leaves the setup location.
3. Compare the moisture trend with your own observations of the soil.
4. Check whether gaps appear in the history before creating an alert.

Begin with a reminder you can evaluate. Do not choose one moisture threshold for every plant
simply because a dashboard makes it convenient. Record the plant, substrate and threshold you
choose in your own home project, so future adjustments have context.

## Use it with DomoSenso

The [Mi Flora device guide](/devices/mi-flora/) describes the readings to check before assigning
the sensor to a plant. The [plants component](/components/plants/) is the next step for the
framework's plant display. A sensor and a dashboard do not, by themselves, provide automatic
watering.

This article describes the upstream setup and a suggested check of your readings. It does
not claim a new hardware test or establish a watering threshold for your plants.
