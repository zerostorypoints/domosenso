"""A target's host name, looked up once per run with IPv4 first.

A lookup that asks for both address families waits for both answers. A `.local` host whose mDNS
answers A but never AAAA makes macOS's resolver wait 5 s for the missing AAAA on every such lookup,
and every new socket (a websocket, a REST request, each `ssh`) pays it again. Asking for IPv4 alone
answers at once, so the command asks that once and connects to the address; a name without an IPv4
address is left to the system resolver, as before.
"""
from __future__ import annotations

import functools
import http.client
import socket
import urllib.request


@functools.cache
def ipv4(host: str | None) -> str | None:
    """The first IPv4 address of `host`, or None (no name, no A record, or an IPv6 literal)."""
    if not host:
        return None
    try:
        found = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        return None
    return found[0][4][0] if found else None


def _pinned(base: type[http.client.HTTPConnection], name: str, address: str) -> type[http.client.HTTPConnection]:
    """`base` connecting to `address` whenever it would connect to `name`. The request keeps the
    name (Host header, TLS server name and certificate check); a proxy or a redirect to another
    host is reached as it would be without this."""

    class Pinned(base):  # type: ignore[valid-type, misc]
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            create = self._create_connection

            def to_address(addr, *rest, **kw):
                host, port = addr[0], addr[1]
                return create((address if host.lower() == name else host, port), *rest, **kw)

            self._create_connection = to_address

    return Pinned


class _HTTP(urllib.request.HTTPHandler):
    def __init__(self, name: str, address: str):
        super().__init__()
        self._conn = _pinned(http.client.HTTPConnection, name, address)

    def http_open(self, req):
        return self.do_open(self._conn, req)


class _HTTPS(urllib.request.HTTPSHandler):
    def __init__(self, name: str, address: str):
        super().__init__()
        self._conn = _pinned(http.client.HTTPSConnection, name, address)

    def https_open(self, req):
        extra = {"context": self._context}
        if getattr(self, "_check_hostname", None) is not None:  # Python < 3.12 still passes it
            extra["check_hostname"] = self._check_hostname
        return self.do_open(self._conn, req, **extra)


def opener(host: str | None) -> urllib.request.OpenerDirector:
    """A urllib opener that reaches `host` at its IPv4 address; the default one when it has none."""
    address = ipv4(host)
    if address is None or address == host:
        return urllib.request.build_opener()
    name = host.lower()
    return urllib.request.build_opener(_HTTP(name, address), _HTTPS(name, address))
