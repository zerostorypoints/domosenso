"""Test doubles shared by the `domosenso` command's tests."""
from __future__ import annotations

from typing import Any

from domosenso_cli.errors import DomosensoError


class FakeHA:
    """Stands in for `domosenso_cli.ha_api.HA`.

    `responses` maps a websocket type (`"lovelace/resources"`) or a REST path (starts with `/`,
    `"/api/states"`) to a result, or to a callable `(fields) -> result` for a stateful fake. A key
    that is not there fails like a rejected call. `calls` records `(type or path, fields)`;
    `http_statuses` gives `http_status` answers per path (default 200).
    """

    def __init__(self, responses: dict[str, Any] | None = None, http_statuses: dict[str, int] | None = None):
        self.responses = dict(responses or {})
        self.http_statuses = dict(http_statuses or {})
        self.calls: list[tuple[str, dict]] = []

    async def __aenter__(self) -> FakeHA:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    def _answer(self, key: str, fields: dict) -> Any:
        self.calls.append((key, fields))
        if key not in self.responses:
            raise DomosensoError(f"{key}: unknown (FakeHA has no response)")
        value = self.responses[key]
        return value(fields) if callable(value) else value

    async def call(self, type: str, **fields: Any) -> Any:
        return self._answer(type, fields)

    async def rest_get(self, path: str) -> Any:
        return self._answer(path, {})

    async def http_status(self, path: str) -> int:
        return self.http_statuses.get(path, 200)
