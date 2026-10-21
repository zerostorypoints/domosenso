"""The Home Assistant client against a local websocket stub and a local HTTP server, and `FakeHA`."""
import asyncio
import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
import websockets

from domosenso_cli.errors import DomosensoError
from domosenso_cli.ha_api import HA, ws_url
from domosenso_cli.home import Target
from fakes import FakeHA

TOKEN = "secret-token"


async def _ws_handler(conn, seen):
    await conn.send(json.dumps({"type": "auth_required", "ha_version": "2026.9.2"}))
    auth = json.loads(await conn.recv())
    if auth.get("access_token") != TOKEN:
        await conn.send(json.dumps({"type": "auth_invalid", "message": "Invalid access token"}))
        return
    await conn.send(json.dumps({"type": "auth_ok"}))
    async for raw in conn:
        msg = json.loads(raw)
        seen.append(msg)
        # Noise a real instance sends: an event, and a result for another id.
        await conn.send(json.dumps({"id": msg["id"] + 100, "type": "event", "event": {}}))
        await conn.send(json.dumps({"id": msg["id"] + 100, "type": "result", "success": True, "result": "other"}))
        if msg["type"] == "boom":
            reply = {"success": False, "error": {"code": "not_found", "message": "no such thing"}}
        else:
            reply = {"success": True, "result": {"echo": msg["type"], "id": msg["id"]}}
        await conn.send(json.dumps({"id": msg["id"], "type": "result", **reply}))


async def _silent_auth_handler(conn, seen):
    await conn.send(json.dumps({"type": "auth_required"}))
    await conn.wait_closed()


async def _silent_call_handler(conn, seen):
    await conn.send(json.dumps({"type": "auth_required"}))
    await conn.recv()
    await conn.send(json.dumps({"type": "auth_ok"}))
    async for raw in conn:
        seen.append(json.loads(raw))  # never answers


def _garbage_handler(frame: str):
    async def handler(conn, seen):
        await conn.send(json.dumps({"type": "auth_required"}))
        await conn.recv()
        await conn.send(json.dumps({"type": "auth_ok"}))
        async for raw in conn:
            await conn.send(frame)

    return handler


async def _garbage_auth_handler(conn, seen):
    await conn.send(json.dumps({"type": "auth_required"}))
    await conn.recv()
    await conn.send("not json")
    await conn.wait_closed()


@contextmanager
def ws_stub(handler=_ws_handler):
    """Run the stub in a thread; yield (url, seen messages)."""
    seen: list[dict] = []
    ready = threading.Event()
    box: dict = {}

    def run():
        async def main():
            async with websockets.serve(lambda c: handler(c, seen), "127.0.0.1", 0) as server:
                box["port"] = server.sockets[0].getsockname()[1]
                box["loop"] = asyncio.get_running_loop()
                box["stop"] = asyncio.Event()
                ready.set()
                await box["stop"].wait()

        asyncio.run(main())

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    assert ready.wait(10)
    try:
        yield f"http://127.0.0.1:{box['port']}", seen
    finally:
        box["loop"].call_soon_threadsafe(box["stop"].set)
        thread.join(10)


@contextmanager
def rest_stub():
    """A local HTTP server: /api/ok (200 json), /api/gone (404), /api/boom (500); records headers."""
    seen: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append({"path": self.path, "auth": self.headers.get("Authorization")})
            if self.path == "/api/hangup":  # closes without a response
                self.close_connection = True
                return
            if self.path == "/api/short":  # promises 100 bytes, sends 5
                self.send_response(200)
                self.send_header("Content-Length", "100")
                self.end_headers()
                self.wfile.write(b"short")
                self.close_connection = True
                return
            status = {"/api/ok": 200, "/api/gone": 404, "/api/boom": 500}.get(self.path, 404)
            body = json.dumps({"path": self.path}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", seen
    finally:
        server.shutdown()
        server.server_close()
        thread.join(10)


def make_target(tmp_path: Path, url: str, token: str | None = TOKEN) -> Target:
    token_file = tmp_path / "token"
    if token is not None:
        token_file.write_text(token + "\n")
    return Target(name="staging", kind="local-docker", container="ha", config=tmp_path, url=url, token_file=token_file)


def test_ws_url_derivation():
    assert ws_url("http://ha.local:8123") == "ws://ha.local:8123/api/websocket"
    assert ws_url("https://ha.example.org/") == "wss://ha.example.org/api/websocket"


def test_call_returns_result(tmp_path):
    with ws_stub() as (url, seen):
        async def go():
            async with HA.for_target(make_target(tmp_path, url)) as ha:
                first = await ha.call("lovelace/resources")
                second = await ha.call("lovelace/dashboards/list", foo="bar")
                return first, second

        first, second = asyncio.run(go())
    assert first == {"echo": "lovelace/resources", "id": 1}
    assert second == {"echo": "lovelace/dashboards/list", "id": 2}
    assert seen[1] == {"type": "lovelace/dashboards/list", "foo": "bar", "id": 2}


def test_call_error_raises(tmp_path):
    with ws_stub() as (url, _):
        async def go():
            async with HA.for_target(make_target(tmp_path, url)) as ha:
                await ha.call("boom")

        with pytest.raises(DomosensoError, match=r"boom: not_found no such thing"):
            asyncio.run(go())


def test_auth_failure_message(tmp_path):
    target = make_target(tmp_path, "http://unused", token="wrong")
    with ws_stub() as (url, _):
        target.url = url

        async def go():
            async with HA.for_target(target) as ha:
                await ha.call("lovelace/resources")

        with pytest.raises(DomosensoError) as exc:
            asyncio.run(go())
    assert str(target.token_file) in str(exc.value)


def test_missing_token_file_names_it(tmp_path):
    target = make_target(tmp_path, "http://127.0.0.1:1", token=None)
    with pytest.raises(DomosensoError, match=str(target.token_file)):
        HA.for_target(target)


def test_rest_get_sends_bearer_and_parses_json(tmp_path):
    with rest_stub() as (url, seen):
        async def go():
            async with HA(url, TOKEN) as ha:
                return await ha.rest_get("/api/ok")

        assert asyncio.run(go()) == {"path": "/api/ok"}
    assert seen == [{"path": "/api/ok", "auth": f"Bearer {TOKEN}"}]


def test_rest_get_error_status_raises():
    with rest_stub() as (url, _):
        async def go():
            async with HA(url, TOKEN) as ha:
                await ha.rest_get("/api/boom")

        with pytest.raises(DomosensoError, match=r"/api/boom.*500"):
            asyncio.run(go())


def test_http_status_does_not_raise_on_4xx_5xx():
    with rest_stub() as (url, _):
        async def go():
            async with HA(url, TOKEN) as ha:
                return [await ha.http_status(p) for p in ("/api/ok", "/api/gone", "/api/boom")]

        assert asyncio.run(go()) == [200, 404, 500]


def test_http_status_unreachable_raises():
    async def go():
        async with HA("http://127.0.0.1:1", TOKEN) as ha:
            await ha.http_status("/api/ok")

    with pytest.raises(DomosensoError, match="/api/ok"):
        asyncio.run(go())


def test_auth_read_times_out_naming_the_step():
    with ws_stub(_silent_auth_handler) as (url, _):
        async def go():
            async with HA(url, TOKEN, timeout=0.3) as ha:
                await ha.call("lovelace/resources")

        with pytest.raises(DomosensoError, match=r"timed out.*authentication"):
            asyncio.run(go())


def test_call_times_out_naming_the_type():
    with ws_stub(_silent_call_handler) as (url, _):
        async def go():
            async with HA(url, TOKEN, timeout=0.3) as ha:
                await ha.call("lovelace/resources")

        with pytest.raises(DomosensoError, match=r"lovelace/resources: no result within"):
            asyncio.run(go())


def test_call_after_timeout_reconnects():
    with ws_stub(_silent_call_handler) as (url, seen):
        async def go():
            async with HA(url, TOKEN, timeout=0.3) as ha:
                for _ in range(2):
                    with pytest.raises(DomosensoError):
                        await ha.call("x")

        asyncio.run(go())
    assert [m["id"] for m in seen] == [1, 2]  # the second call reconnected, not reused a stale socket


@pytest.mark.parametrize("frame", ["not json", "[1, 2]", '"text"'])
def test_call_non_object_frame_raises(frame):
    with ws_stub(_garbage_handler(frame)) as (url, _):
        async def go():
            async with HA(url, TOKEN, timeout=5) as ha:
                await ha.call("lovelace/resources")

        with pytest.raises(DomosensoError, match=r"lovelace/resources: .*not a JSON object"):
            asyncio.run(go())


def test_auth_reply_not_json_raises():
    with ws_stub(_garbage_auth_handler) as (url, _):
        async def go():
            async with HA(url, TOKEN, timeout=5) as ha:
                await ha.call("lovelace/resources")

        with pytest.raises(DomosensoError, match=r"authentication.*not a JSON object"):
            asyncio.run(go())


def test_rest_incomplete_read_raises_domosenso_error():
    with rest_stub() as (url, _):
        async def go():
            async with HA(url, TOKEN) as ha:
                await ha.rest_get("/api/short")

        with pytest.raises(DomosensoError, match="/api/short"):
            asyncio.run(go())


def test_rest_remote_disconnect_raises_domosenso_error():
    with rest_stub() as (url, _):
        async def go():
            async with HA(url, TOKEN) as ha:
                await ha.http_status("/api/hangup")

        with pytest.raises(DomosensoError, match="/api/hangup"):
            asyncio.run(go())


def test_fake_ha_ws_rest_and_records():
    fake = FakeHA({"lovelace/resources": [{"url": "/a"}], "/api/states": [1, 2]}, http_statuses={"/x": 404})

    async def go():
        async with fake as ha:
            return (
                await ha.call("lovelace/resources", force=True),
                await ha.rest_get("/api/states"),
                await ha.http_status("/x"),
                await ha.http_status("/y"),
            )

    assert asyncio.run(go()) == ([{"url": "/a"}], [1, 2], 404, 200)
    assert fake.calls == [
        ("lovelace/resources", {"force": True}),
        ("/api/states", {}),
        ("http_status", {"path": "/x"}),
        ("http_status", {"path": "/y"}),
    ]


def test_fake_ha_callable_is_stateful_and_unknown_key_raises():
    store: list = []
    fake = FakeHA({"lovelace/resources/create": lambda f: store.append(f["url"]) or {"id": len(store)}})

    async def go():
        await fake.call("lovelace/resources/create", url="/a")
        await fake.call("unknown/type")

    with pytest.raises(DomosensoError, match="unknown/type"):
        asyncio.run(go())
    assert store == ["/a"]
