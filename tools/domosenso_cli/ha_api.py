"""A small async client for Home Assistant's websocket and REST APIs."""
from __future__ import annotations

import asyncio
import http.client
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
# Cloudflare refuses urllib's default user agent (error 1010, an HTTP 403) on a Home Assistant
# reached through a tunnel; any named agent passes.
USER_AGENT = "domosenso"


def ws_url(url: str) -> str:
    """`http(s)://host[:port]` to `ws(s)://host[:port]/api/websocket`."""
    base = url.rstrip("/")
    scheme, sep, rest = base.partition("://")
    return f"{'wss' if scheme == 'https' else 'ws'}{sep}{rest}/api/websocket"


def _decode(raw: str | bytes, what: str) -> dict:
    """A websocket frame as a JSON object; anything else is a protocol failure."""
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise DomosensoError(f"{what}: frame is not a JSON object: {e}") from e
    if not isinstance(data, dict):
        raise DomosensoError(f"{what}: frame is not a JSON object: got {type(data).__name__}")
    return data


class HA:
    """Websocket commands (`call`) and REST reads (`rest_get`, `http_status`) for one instance.

    The websocket connects and authenticates on the first `call`, so a client used only for
    REST never opens one. Sequential use only: one `call` at a time (no `asyncio.gather` on one
    instance), because a call reads the shared socket until its own result arrives.

    `timeout` (seconds) bounds the connect, each authentication read, each call's wait for its
    result and each REST request.
    """

    def __init__(self, url: str, token: str, token_source: Path | str | None = None, timeout: float = TIMEOUT):
        self.url = url.rstrip("/")
        self._token = token
        self._token_source = token_source
        self._timeout = timeout
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
        await self._drop()

    async def _drop(self) -> None:
        ws, self._ws = self._ws, None
        if ws is not None:
            await ws.close()

    async def _connect(self) -> None:
        target = ws_url(self.url)
        try:
            ws = await connect(target, max_size=None, open_timeout=self._timeout)
        except (OSError, WebSocketException, TimeoutError) as e:
            raise DomosensoError(f"cannot connect to {target}: {e}") from e
        try:
            await asyncio.wait_for(ws.recv(), self._timeout)  # auth_required
            await ws.send(json.dumps({"type": "auth", "access_token": self._token}))
            reply = _decode(await asyncio.wait_for(ws.recv(), self._timeout), f"{target}: authentication")
        except TimeoutError as e:
            await ws.close()
            raise DomosensoError(f"{target}: websocket timed out during authentication after {self._timeout:g} s") from e
        except (OSError, WebSocketException) as e:
            await ws.close()
            raise DomosensoError(f"{target}: websocket closed during authentication: {e}") from e
        except DomosensoError:
            await ws.close()
            raise
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
            async with asyncio.timeout(self._timeout):
                while True:
                    msg = _decode(await self._ws.recv(), type)
                    if msg.get("id") == n and msg.get("type") == "result":
                        break
        except TimeoutError as e:
            await self._drop()  # a late result would still be on this socket: start the next call on a fresh one
            raise DomosensoError(f"{type}: no result within {self._timeout:g} s") from e
        except (OSError, WebSocketException) as e:
            await self._drop()  # a closed or broken socket: the next call connects afresh
            raise DomosensoError(f"{type}: websocket failed: {e}") from e
        except DomosensoError:
            await self._drop()
            raise
        if not msg.get("success"):
            error = msg.get("error") or {}
            raise DomosensoError(f"{type}: {error.get('code', 'error')} {error.get('message', '')}".rstrip())
        return msg.get("result")

    async def subscribe(self, event_type: str) -> int:
        """Subscribe to one event type; returns the subscription id that `next_event` reads."""
        await self.call("subscribe_events", event_type=event_type)
        return self._next_id

    async def next_event(self, subscription: int, timeout: float) -> dict | None:
        """The next event of a subscription, or None when none arrives within `timeout` seconds.
        Other messages on the socket are skipped."""
        try:
            async with asyncio.timeout(timeout):
                while True:
                    msg = _decode(await self._ws.recv(), "event")
                    if msg.get("id") == subscription and msg.get("type") == "event":
                        return msg.get("event") or {}
        except TimeoutError:
            return None
        except (OSError, WebSocketException) as e:
            await self._drop()
            raise DomosensoError(f"subscription {subscription}: websocket failed: {e}") from e

    def _request(self, path: str) -> tuple[int, bytes]:
        req = urllib.request.Request(self.url + path, headers={"Authorization": f"Bearer {self._token}", "User-Agent": USER_AGENT})
        try:
            try:
                with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                    return resp.status, resp.read()
            except urllib.error.HTTPError as e:
                return e.code, e.read()
        except (urllib.error.URLError, OSError, http.client.HTTPException) as e:
            reason = repr(e) if isinstance(e, http.client.HTTPException) else getattr(e, "reason", e)
            raise DomosensoError(f"GET {path}: {reason}") from e

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
