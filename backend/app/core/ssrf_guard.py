"""
F-18 — reusable SSRF guard for outbound HTTP calls.

There is currently NO server-side outbound broker/import fetch in this codebase
(Weg A: no live order routing). This module is a ready-to-use, tested guard that
ANY future outbound-fetch code (broker adapters, imports, avatar/webhook fetches)
MUST route its target URLs through before making the request.

It enforces:
  * scheme allow-list (https only by default),
  * optional host allow-list (exact host match),
  * blocking of private / loopback / link-local / reserved IP ranges (IPv4+IPv6),
    resolving the hostname first so DNS-rebinding to an internal IP is refused.

Usage (once broker integration lands):

    from app.core.ssrf_guard import assert_url_allowed
    assert_url_allowed(url, allowed_hosts={"api.broker.com"})
    resp = await client.get(url)   # only reached if the guard passed
"""
from __future__ import annotations

import ipaddress
import socket
from typing import Iterable, Optional
from urllib.parse import urlsplit


class SSRFError(ValueError):
    """Raised when an outbound URL is rejected by the SSRF guard."""


_DEFAULT_ALLOWED_SCHEMES = frozenset({"https"})


def _ip_is_blocked(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # not a parseable IP → refuse (fail closed)
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def _resolve_all_ips(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None)
    return [info[4][0] for info in infos]


def assert_url_allowed(
    url: str,
    *,
    allowed_hosts: Optional[Iterable[str]] = None,
    allowed_schemes: Iterable[str] = _DEFAULT_ALLOWED_SCHEMES,
    resolve_dns: bool = True,
) -> str:
    """
    Validate ``url`` for outbound use. Returns the URL on success, raises
    :class:`SSRFError` otherwise. Fail-closed on any ambiguity.
    """
    parts = urlsplit(url)
    scheme = (parts.scheme or "").lower()
    if scheme not in {s.lower() for s in allowed_schemes}:
        raise SSRFError(f"scheme '{scheme}' not allowed")

    host = parts.hostname
    if not host:
        raise SSRFError("missing host")

    if allowed_hosts is not None:
        allowed = {h.lower() for h in allowed_hosts}
        if host.lower() not in allowed:
            raise SSRFError(f"host '{host}' not on allow-list")

    # If the host is a literal IP, check it directly. (Parse separately so the
    # SSRFError we raise below is NOT swallowed — SSRFError subclasses ValueError.)
    _is_ip = True
    try:
        ipaddress.ip_address(host)
    except ValueError:
        _is_ip = False
    if _is_ip:
        if _ip_is_blocked(host):
            raise SSRFError(f"target IP '{host}' is private/reserved")
        return url

    if resolve_dns:
        try:
            ips = _resolve_all_ips(host)
        except socket.gaierror as exc:
            raise SSRFError(f"DNS resolution failed for '{host}'") from exc
        if not ips:
            raise SSRFError(f"no addresses for '{host}'")
        for ip in ips:
            if _ip_is_blocked(ip):
                raise SSRFError(
                    f"host '{host}' resolves to blocked address '{ip}'"
                )
    return url
