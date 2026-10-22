"""Test doubles shared by the `domosenso` command's tests."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from domosenso_cli.errors import DomosensoError
from domosenso_cli.targets import COMMAND_TIMEOUT_S, LocalFiles


class FakeHA:
    """Stands in for `domosenso_cli.ha_api.HA`.

    `responses` maps a websocket type (`"lovelace/resources"`) or a REST path (starts with `/`,
    `"/api/states"`) to a result, or to a callable `(fields) -> result` for a stateful fake. A key
    that is not there fails like a rejected call. `calls` records `(type or path, fields)`;
    `http_statuses` gives `http_status` answers per path (default 200); each probe is recorded as
    `("http_status", {"path": path})`.
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
        self.calls.append(("http_status", {"path": path}))
        return self.http_statuses.get(path, 200)


class FakeTarget(LocalFiles):
    """Stands in for a `TargetIO` (`domosenso_cli.targets`): the files are a directory, `root`.

    `exec` answers `(0, check_output)` for an argv that contains `check_config`, `(0, "")` otherwise,
    and records every argv in `execs` and its timeout in `exec_timeouts`; `restarts` counts `restart`
    calls. `files_put` counts the files every `put` has written. `fail_put_after=N` makes the `put`
    that would write file N+1 (counted across puts) write the ones before it and raise, once, like
    a copy cut off by a dropped link that then comes back.
    """

    def __init__(self, root: Path, check_output: str = "{}", fail_put_after: int | None = None):
        super().__init__(root)
        self.check_output = check_output
        self.fail_put_after = fail_put_after
        self.files_put = 0
        self.restarts = 0
        self.execs: list[list[str]] = []
        self.exec_timeouts: list[float] = []

    def put(self, files: dict[str, bytes]) -> None:
        for path, data in files.items():
            if self.fail_put_after is not None and self.files_put >= self.fail_put_after:
                done, self.fail_put_after = self.fail_put_after, None
                raise DomosensoError(f"put interrupted after {done} files")
            super().put({path: data})
            self.files_put += 1

    def exec(self, argv: list[str], timeout_s: float | None = None) -> tuple[int, str]:
        self.execs.append(list(argv))
        self.exec_timeouts.append(timeout_s or COMMAND_TIMEOUT_S)
        return 0, self.check_output if "check_config" in argv else ""

    def restart(self, timeout_s: int = 120) -> None:
        self.restarts += 1
