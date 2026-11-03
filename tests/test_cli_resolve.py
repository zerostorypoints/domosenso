"""One IPv4-first lookup per host, and the Home Assistant client reaching the host at that address."""
import asyncio
import http.client
import socket
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from domosenso_cli import resolve
from domosenso_cli.ha_api import HA
from test_cli_ha_api import TOKEN, ws_stub

NAME = "ha.invalid"  # reserved: it never resolves, so a request reaches the stub only through the pinned address


@pytest.fixture(autouse=True)
def fresh_cache():
    resolve.ipv4.cache_clear()
    yield
    resolve.ipv4.cache_clear()


def test_ipv4_asks_for_ipv4_alone_and_once(monkeypatch):
    asked = []

    def lookup(host, port, family=0, kind=0, *rest):
        asked.append((host, family))
        return [(socket.AF_INET, kind, 6, "", ("192.0.2.7", 0)), (socket.AF_INET, kind, 6, "", ("192.0.2.8", 0))]

    monkeypatch.setattr(resolve.socket, "getaddrinfo", lookup)
    assert resolve.ipv4("demo-host.local") == "192.0.2.7"
    assert resolve.ipv4("demo-host.local") == "192.0.2.7"
    assert asked == [("demo-host.local", socket.AF_INET)]


def test_ipv4_of_a_name_without_one_is_none(monkeypatch):
    def lookup(*args):
        raise socket.gaierror(socket.EAI_NONAME, "no address")

    monkeypatch.setattr(resolve.socket, "getaddrinfo", lookup)
    assert resolve.ipv4("v6only.local") is None
    assert resolve.ipv4(None) is None and resolve.ipv4("") is None


def test_ipv4_of_literals():
    assert resolve.ipv4("127.0.0.1") == "127.0.0.1"
    assert resolve.ipv4("::1") is None


def test_pinned_connection_keeps_the_name_and_goes_to_the_address(monkeypatch):
    made = []
    # http.client takes socket.create_connection when a connection is made: record instead of connecting.
    monkeypatch.setattr(socket, "create_connection", lambda addr, *a, **k: made.append(addr))
    conn = resolve._pinned(http.client.HTTPSConnection, NAME, "192.0.2.7")(NAME, 8123, timeout=3)
    assert conn.host == NAME  # the TLS server name and the certificate check use it
    conn._create_connection((NAME, 8123), 3)
    conn._create_connection(("HA.INVALID", 8123), 3)
    conn._create_connection(("proxy.example", 3128), 3)  # a proxy or another host: reached as it is
    assert made == [("192.0.2.7", 8123), ("192.0.2.7", 8123), ("proxy.example", 3128)]


@contextmanager
def host_stub():
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append({"path": self.path, "host": self.headers.get("Host")})
            body = b'{"ok": true}'
            self.send_response(200)
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
        yield server.server_port, seen
    finally:
        server.shutdown()
        server.server_close()
        thread.join(10)


def _pin(monkeypatch, address="127.0.0.1"):
    asked = []
    monkeypatch.setattr(resolve, "ipv4", lambda host: asked.append(host) or (address if host == NAME else None))
    return asked


def test_rest_goes_to_the_address_with_the_name_in_the_host_header(monkeypatch):
    asked = _pin(monkeypatch)
    with host_stub() as (port, seen):
        async def go():
            async with HA(f"http://{NAME}:{port}", TOKEN) as ha:
                return [await ha.rest_get("/api/"), await ha.http_status("/api/config")]

        assert asyncio.run(go()) == [{"ok": True}, 200]
    assert seen == [{"path": "/api/", "host": f"{NAME}:{port}"}, {"path": "/api/config", "host": f"{NAME}:{port}"}]
    assert asked == [NAME]  # one lookup for the client's whole life


def test_websocket_goes_to_the_address(monkeypatch):
    _pin(monkeypatch)
    with ws_stub() as (url, seen):
        port = url.rsplit(":", 1)[1]

        async def go():
            async with HA(f"http://{NAME}:{port}", TOKEN) as ha:
                return await ha.call("ping")

        assert asyncio.run(go())["echo"] == "ping"


def test_a_name_without_ipv4_is_reached_as_before(monkeypatch):
    asked = _pin(monkeypatch)
    with host_stub() as (port, seen):
        async def go():
            async with HA(f"http://127.0.0.1:{port}", TOKEN) as ha:
                return await ha.rest_get("/api/")

        assert asyncio.run(go()) == {"ok": True}
    assert asked == ["127.0.0.1"] and seen[0]["host"] == f"127.0.0.1:{port}"
