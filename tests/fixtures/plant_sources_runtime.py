"""Pinned real HA, fresh SQLite recorder, fictional Android BLE advertisements."""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time

from aiohttp import ThreadedResolver
from homeassistant import loader
from homeassistant.bootstrap import async_from_config_dict
from homeassistant.components import bluetooth
from homeassistant.config import merge_packages_config
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry
from homeassistant.helpers.aiohttp_client import DATA_RESOLVER
import yaml

FIXTURE = Path("/fixture")
ADDRESS = "AA:BB:CC:DD:EE:01"
MOISTURE = "sensor.fern_reading_moisture"
RAW_MOISTURE = "sensor.plant_sensor_ee01_moisture"
STATUS = "sensor.fern_reading_status"
BEFORE = {"moisture": 44, "conductivity": 500, "illuminance": 1200, "temperature": 23.5}
AFTER = {"moisture": 64, "conductivity": 501, "illuminance": 1201, "temperature": 23}


@asynccontextmanager
async def running(root, stream, profile):
    hass = HomeAssistant(str(root))
    hass.config.skip_pip = True
    loader.async_setup(hass)
    resolver = ThreadedResolver()
    hass.data[DATA_RESOLVER] = resolver
    package = yaml.safe_load((FIXTURE / profile / "package.yaml").read_text())
    try:
        config = {
            "homeassistant": {"time_zone": "UTC"},
            "bluetooth": {},
            "domosenso_android_ble": {"stream_file": str(stream)},
            "recorder": {"commit_interval": 1},
        }
        await merge_packages_config(hass, config, {"plant_fixture": package})
        result = await async_from_config_dict(config, hass)
        assert result is hass
        await hass.async_start()
        await hass.async_block_till_done()
        assert not {"mqtt", "esphome", "domosenso_state_mirror"} & hass.config.components
        yield hass
    finally:
        await hass.async_stop(force=True)
        await resolver.close()


async def wait_for(check, description, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        result = check()
        if result:
            return result
        await asyncio.sleep(0.1)
    raise AssertionError(description)


def write_packet(stream, sequence, moisture, address=ADDRESS):
    # Xiaomi Mi Flora: frame control, model, counter, temperature, moisture,
    # conductivity and illuminance objects in a service data advertisement.
    raw = f"1c1695fe40209800{sequence:02x}041002eb00081001{moisture:02x}091002f401071003b00400"
    now = int(time.time() * 1000)
    stream.write_text(json.dumps({
        "version": 1, "session": "11111111-1111-4111-8111-111111111111",
        "captured_at_ms": now, "status": "scanning",
        "events": [{"sequence": sequence, "address": address, "rssi": -61,
                    "observed_at_ms": now - 100, "raw": raw}],
    }))


def number(hass, entity):
    state = hass.states.get(entity)
    try:
        return float(state.state) if state else None
    except ValueError:
        return None


def moisture_report(hass):
    state = hass.states.get(STATUS)
    return state.attributes.get("readings", {}).get("moisture", {}) if state else {}


async def enroll(hass, info):
    # Fresh HA can complete a Bluetooth discovery automatically before onboarding.
    await hass.async_block_till_done()
    if not any(e.unique_id == info.address for e in hass.config_entries.async_entries("xiaomi_ble")):
        flow = await hass.config_entries.flow.async_init("xiaomi_ble", context={"source": "bluetooth"}, data=info)
        if flow["type"] == "form":
            flow = await hass.config_entries.flow.async_configure(flow["flow_id"], {})
        assert flow["type"] == "create_entry", flow
        assert flow["result"].unique_id == info.address
    await hass.async_block_till_done()


async def main():
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder) / "config"
        root.mkdir()
        stream = Path(folder) / "advertisements.json"
        shutil.copytree(FIXTURE / "examples/android-ble/custom_components", root / "custom_components")
        (root / "domosenso").mkdir()
        addresses = [f"AA:BB:CC:DD:EE:{i:02X}" for i in range(1, 7)]
        (root / "domosenso/android-ble.json").write_text(json.dumps({
            "version": 1, "enabled": True, "addresses": addresses,
        }))
        assert not (root / "home-assistant_v2.db").exists()

        async with running(root, stream, "tablet") as hass:
            await wait_for(lambda: moisture_report(hass).get("available") is False, "missing source looked available")
            assert moisture_report(hass).get("at") is None
            receiver = hass.data["domosenso_android_ble"]
            for i, address in enumerate(addresses, 1):
                write_packet(stream, i, 41 + i, address)
                await receiver.poll()
                info = bluetooth.async_last_service_info(hass, address, connectable=False)
                assert info and info.source == "domosenso_android_ble" and not info.connectable
                await enroll(hass, info)
            for i, plant in enumerate(("fern", "basil", "monstera", "ficus", "mint", "orchid"), 1):
                expected = {"moisture": 41 + i, "conductivity": 500, "illuminance": 1200, "temperature": 23.5}
                status_id = f"sensor.{plant}_reading_status"
                for key, value in expected.items():
                    entity = f"sensor.{plant}_reading_{key}"
                    await wait_for(lambda: number(hass, entity) == value, f"missing decoded measurement: {entity}")
                    report_key = "brightness" if key == "illuminance" else key
                    report = await wait_for(
                        lambda: hass.states.get(status_id).attributes.get("readings", {}).get(report_key, {}).get("at"),
                        f"missing report time: {entity}",
                    )
                    assert 0 <= (datetime.now(UTC) - datetime.fromisoformat(report)).total_seconds() < 30
            before = await wait_for(lambda: moisture_report(hass).get("at"), "missing report timestamp")
            registry = entity_registry.async_get(hass)
            stable_ids = {key: registry.async_get(f"sensor.fern_reading_{key}").id for key in BEFORE}
            assert hass.states.get("plant.fern").attributes["sensors"]["moisture"] == MOISTURE
            write_packet(stream, 7, 44)
            await receiver.poll()
            await wait_for(lambda: number(hass, MOISTURE) == 44, "new BLE measurement did not reach the plant")
            await wait_for(lambda: moisture_report(hass).get("value") == 44, "metadata did not update")
            at = moisture_report(hass)["at"]
            assert datetime.fromisoformat(at) > datetime.fromisoformat(before)
            state = hass.states.get(RAW_MOISTURE)
            hass.states.async_set(RAW_MOISTURE, state.state, state.attributes)
            await wait_for(lambda: moisture_report(hass).get("at") not in (None, at),
                           "unchanged HA report did not refresh age", timeout=65)
            latest = moisture_report(hass)["at"]
            hass.states.async_set(RAW_MOISTURE, "unavailable")
            await wait_for(lambda: moisture_report(hass).get("available") is False, "loss of source not visible")
            assert moisture_report(hass)["at"] == latest and moisture_report(hass)["value"] == 44
            assert number(hass, MOISTURE) is None
            print("Standalone HA: six discovered Mi Flora devices, four readings, unchanged reports and honest loss", flush=True)

        stream.unlink()
        async with running(root, stream, "switched") as hass:
            registry = entity_registry.async_get(hass)
            assert {key: registry.async_get(f"sensor.fern_reading_{key}").id for key in AFTER} == stable_ids
            await wait_for(lambda: moisture_report(hass).get("source") == "sensor.fixture_moisture",
                           "selection metadata did not switch")
            assert moisture_report(hass).get("at") is None and moisture_report(hass).get("value") is None
            for key, (value, unit) in {
                "moisture": (64, "%"), "conductivity": (501, "μS/cm"),
                "brightness": (1201, "lx"), "temperature": (73.4, "°F"),
            }.items():
                hass.states.async_set(f"sensor.fixture_{key}", value, {"unit_of_measurement": unit})
            for key, value in AFTER.items():
                entity = f"sensor.fern_reading_{key}"
                await wait_for(lambda: number(hass, entity) == value, f"changed provider failed: {entity}")
            assert hass.states.get("sensor.fern_last_watered").state == "unknown"
            await asyncio.sleep(2)

        with sqlite3.connect(root / "home-assistant_v2.db") as db:
            def history(entity):
                rows = db.execute("""
                    SELECT states.state FROM states JOIN states_meta USING (metadata_id)
                    WHERE states_meta.entity_id = ? ORDER BY states.state_id
                """, (entity,)).fetchall()
                return [float(s) for (s,) in rows if s not in ("unknown", "unavailable", None)]
            for key, before in BEFORE.items():
                values = history(f"sensor.fern_reading_{key}")
                after = AFTER[key]
                assert before in values and after in values and values.index(before) < values.index(after), values
            assert {42, 44} <= set(history(RAW_MOISTURE))
            assert 42 in history(MOISTURE)
        print("Recorder: four stable series retain readings from both sources across an actual HA restart")


if __name__ == "__main__":
    asyncio.run(main())
