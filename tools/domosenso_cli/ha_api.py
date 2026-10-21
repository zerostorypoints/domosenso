"""A small async client for Home Assistant's websocket and REST APIs."""
from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import Target

TIMEOUT = 30


def ws_url(url: str) -> str:
    """`http(s)://host[:port]` to `ws(s)://host[:port]/api/websocket`."""
    base = url.rstrip("/")
    scheme, sep, rest = base.partition("://")
    return f"{'wss' if scheme == 'https' else 'ws'}{sep}{rest}/api/websocket"


class HA:
    """Websocket commands (`call`) and REST reads (`rest_get`, `http_status`) for one instance.

    The websocket connects and authenticates on the first `call`, so a client used only for
    REST never opens one.
    """

    def __init__(self, url: str, token: str, token_source: Path | str | None = None):
        self.url = url.rstrip("/")
        self._token = token
        self._token_source = token_source
        self._ws: Any = None
        self._next_id = 0

    @classmethod
    def for_target(cls, target: Target) -> HA:
        try:
            token = Path(target.token_file).read_text().strip()
        except OSError as e:
            raise DomosensoError(f"{target.name}: cannot read token file {target.token_file}: {e.strerror or e}") from e
        return cls(target.url, token, target.token_file)

    async def __aenter__(self) -> HA:
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._ws is not None:
            await self._ws.close()
            self._ws = None

    async def _connect(self) -> None:
        target = ws_url(self.url)
        try:
            ws = await connect(target, max_size=None, open_timeout=TIMEOUT)
        except (OSError, WebSocketException, TimeoutError) as e:
            raise DomosensoError(f"cannot connect to {target}: {e}") from e
        try:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "auth", "access_token": self._token}))
            reply = json.loads(await ws.recv())
        except (OSError, WebSocketException) as e:
            await ws.close()
            raise DomosensoError(f"{target}: websocket closed during authentication: {e}") from e
        if reply.get("type") != "auth_ok":
            await ws.close()
            source = f" (token file {self._token_source})" if self._token_source else ""
            raise DomosensoError(f"{target}: authentication failed{source}: {reply.get('message', reply.get('type'))}")
        self._ws = ws

    async def call(self, type: str, **fields: Any) -> Any:
        """Send one command and return its `result`; other messages (events, other ids) are skipped."""
        if self._ws is None:
            await self._connect()
        self._next_id += 1
        n = self._next_id
        try:
            await self._ws.send(json.dumps({**fields, "type": type, "id": n}))
            while True:
                msg = json.loads(await self._ws.recv())
                if msg.get("id") == n and msg.get("type") == "result":
                    break
        except (OSError, WebSocketException) as e:
            raise DomosensoError(f"{type}: websocket failed: {e}") from e
        if not msg.get("success"):
            error = msg.get("error") or {}
            raise DomosensoError(f"{type}: {error.get('code', 'error')} {error.get('message', '')}".rstrip())
        return msg.get("result")

    def _request(self, path: str) -> tuple[int, bytes]:
        req = urllib.request.Request(self.url + path, headers={"Authorization": f"Bearer {self._token}"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except (urllib.error.URLError, OSError) as e:
            raise DomosensoError(f"GET {path}: {getattr(e, 'reason', e)}") from e

    async def rest_get(self, path: str) -> Any:
        status, body = await asyncio.to_thread(self._request, path)
        if status >= 400:
            raise DomosensoError(f"GET {path}: HTTP {status}")
        try:
            return json.loads(body)
        except ValueError as e:
            raise DomosensoError(f"GET {path}: response is not JSON: {e}") from e

    async def http_status(self, path: str) -> int:
        """The status code of a GET; 4xx and 5xx are returned, not raised."""
        status, _ = await asyncio.to_thread(self._request, path)
        return status
