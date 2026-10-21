"""Forward every RTS frame an ESPSomfy-RTS node hears to MQTT and to a log file.

The node offers received frames only on its websocket (port 8080, after "join:0"); over MQTT it
publishes a shade's wind flag only when the flag changes, so one missed "calm" frame from the wind
sensor leaves the flag set for good. This bridge republishes the raw events, under ROOT_TOPIC:

  <root>/frames              every frame, JSON: ts, address, command, rcode, rssi, bits, valid
  <root>/wind_sensor/state   "1" or "0" for each frame from the wind sensor (bit 0 of rcode); only
                             with WIND_SENSOR set
  <root>/bridge/status       "online" / "offline" (retained, last will)
  <root>/shades/N/position   retained copy of each position the node reports. The node retains this
                             topic only at boot and sends movement updates unretained, so after a
                             Home Assistant restart or an MQTT reload the covers came back with the
                             boot-time position.

A button held on a remote and a sensor event both arrive as a burst of identical frames; only the
first of a burst is forwarded.

Environment: NODE_WS (ws://<node>:8080) and MQTT_HOST are required, MQTT_USER / MQTT_PASSWORD when
the broker wants them; MQTT_PORT (1883), ROOT_TOPIC (espsomfy), WIND_SENSOR (the sensor's RTS
address, decimal), LOG_PATH (/data/frames.jsonl). Part of the Domosenso component awnings.
"""
import asyncio
import json
import os
import time

BURST_SECONDS = 3.0


def config(env=os.environ):
    wind = env.get("WIND_SENSOR")
    return {
        "node_ws": env["NODE_WS"],
        "mqtt_host": env["MQTT_HOST"],
        "mqtt_port": int(env.get("MQTT_PORT", "1883")),
        "mqtt_user": env.get("MQTT_USER"),
        "mqtt_password": env.get("MQTT_PASSWORD"),
        "root": env.get("ROOT_TOPIC", "espsomfy").rstrip("/"),
        "wind_sensor": int(wind) if wind else None,
        "log_path": env.get("LOG_PATH", "/data/frames.jsonl"),
    }


def parse(message):
    """`42[name,{...}]` -> (name, dict), anything else -> (None, None). The name is not quoted."""
    if not message.startswith("42[") or "," not in message:
        return None, None
    return message[3 : message.index(",")], json.loads(message[message.index(",") + 1 : message.rindex("]")])


class Bursts:
    """Tells the first frame of a burst of identical frames from its repeats."""

    def __init__(self, window=BURST_SECONDS):
        self.window, self.last_key, self.last_time = window, None, 0.0

    def repeat(self, frame, now):
        key = (frame["address"], frame["command"], frame["rcode"])
        burst = key == self.last_key and now - self.last_time < self.window
        self.last_key, self.last_time = key, now
        return burst


def publications(name, frame, now, cfg, bursts):
    """What one websocket event publishes: a list of (topic, payload, retain)."""
    root = cfg["root"]
    if name == "shadeState" and "position" in frame:
        return [(f"{root}/shades/{frame['shadeId']}/position", str(frame["position"]), True)]
    if name != "remoteFrame" or bursts.repeat(frame, now):
        return []
    event = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(now)),
        **{k: frame.get(k) for k in ("address", "command", "rcode", "rssi", "bits", "valid")},
    }
    out = [(f"{root}/frames", json.dumps(event), False)]
    if cfg["wind_sensor"] is not None and frame["address"] == cfg["wind_sensor"] and frame["command"] == "Sensor":
        out.append((f"{root}/wind_sensor/state", str(frame["rcode"] & 1), False))
    return out


async def main():
    import paho.mqtt.client as mqtt
    import websockets

    cfg = config()
    status = f"{cfg['root']}/bridge/status"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="espsomfy-frame-bridge")
    if cfg["mqtt_user"]:
        client.username_pw_set(cfg["mqtt_user"], cfg["mqtt_password"])
    client.will_set(status, "offline", retain=True)
    client.on_connect = lambda c, *_: c.publish(status, "online", retain=True)
    client.connect_async(cfg["mqtt_host"], cfg["mqtt_port"], keepalive=30)
    client.loop_start()

    bursts = Bursts()
    while True:
        try:
            # Pings, so a node that reboots or drops off Wi-Fi ends the connection here too; without
            # them the socket stays open on this side and the bridge hears nothing.
            async with websockets.connect(cfg["node_ws"], max_size=None, ping_interval=20, ping_timeout=20) as ws:
                await ws.send("join:0")
                print("listening on", cfg["node_ws"], flush=True)
                async for message in ws:
                    name, frame = parse(message) if isinstance(message, str) else (None, None)
                    for topic, payload, retain in publications(name, frame, time.time(), cfg, bursts):
                        if topic.endswith("/frames"):
                            print(payload, flush=True)
                            with open(cfg["log_path"], "a") as log:
                                log.write(payload + "\n")
                        client.publish(topic, payload, retain=retain)
        except Exception as error:  # the node reboots, Wi-Fi drops: keep trying
            print("websocket lost:", error, flush=True)
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
