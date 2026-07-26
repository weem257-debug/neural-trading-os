"""
Centralised rate-limiter instance.

Importing from here (not from app.main) avoids circular imports when route
modules need to apply @limiter.limit decorators.

Behind a reverse proxy (Railway / Render) the socket peer address is the
proxy, so ``get_remote_address`` would lump every client into a single bucket.
We therefore derive the client IP from ``X-Forwarded-For`` — but ONLY when the
deployment is configured to sit behind a trusted proxy (TRUST_PROXY=true),
otherwise the header is client-controlled and trivially spoofable to evade
limits. The right-most untrusted hop can't be forged by the client because the
proxy appends the real peer; we take the first entry which the trusted proxy
sets to the originating client.
"""
import ipaddress
import logging
import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

_logger = logging.getLogger(__name__)

_TRUST_PROXY = os.getenv("TRUST_PROXY", "false").strip().lower() in ("1", "true", "yes")


def _parse_trusted_networks(raw: str) -> tuple:
    """Parse TRUSTED_PROXY_IPS — comma-separated IPs and/or CIDR blocks."""
    nets = []
    for entry in (e.strip() for e in raw.split(",")):
        if not entry:
            continue
        try:
            nets.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            # Fail loud in the log but keep booting: a typo must not take the
            # service down, and an unparseable entry simply grants no trust.
            _logger.warning("trusted_proxy_entry_invalid entry=%s", entry)
    return tuple(nets)


# Optional allow-list of peer addresses whose forwarding headers we honour.
# Empty (the default) keeps the historical behaviour — see _peer_is_trusted.
_TRUSTED_PROXY_NETS = _parse_trusted_networks(os.getenv("TRUSTED_PROXY_IPS", ""))


def _peer_is_trusted(request: Request) -> bool:
    """
    True when the socket peer is allowed to dictate the client IP via headers.

    With no allow-list configured this returns True: TRUST_PROXY alone keeps
    meaning exactly what it meant before, so an existing deployment cannot
    silently lose its per-client buckets (every request collapsing onto one key
    would be an outage of its own). Setting TRUSTED_PROXY_IPS upgrades the check
    from "trust the header" to "trust the header only when it comes from the
    edge".
    """
    if not _TRUSTED_PROXY_NETS:
        return True
    peer = request.client.host if request.client else None
    if not peer:
        return False
    try:
        addr = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(addr in net for net in _TRUSTED_PROXY_NETS)


def client_ip_key(request: Request) -> str:
    """
    Rate-limit key: real client IP, proxy-aware and spoofing-resistant (F-23).

    X-Forwarded-For is "client, proxy1, proxy2, …" where each hop APPENDS the
    address it received the connection from. A malicious client can freely forge
    the LEFT-most entries, so trusting the left-most value lets an attacker mint
    a fresh rate-limit bucket per request and bypass the login/IP limits.

    Header trust is additionally gated on WHO is talking to us. Without an
    allow-list, anyone reaching the process directly — bypassing the edge — can
    set X-Real-IP themselves and mint a fresh bucket per request, which is the
    very bypass this key function exists to prevent. Set TRUSTED_PROXY_IPS to the
    edge's address range to close that path. The process must then also run with
    uvicorn's own header handling off (``--no-proxy-headers``), otherwise
    ``request.client.host`` is itself derived from those headers and the check
    would be validating a value the client supplied.
    """
    if _TRUST_PROXY and _peer_is_trusted(request):
        # Prefer X-Real-IP: Railway's edge proxy OVERWRITES it with the actual
        # connecting client, so (unlike X-Forwarded-For) it is a single value the
        # client cannot append to or forge. This is both stable (one bucket per
        # real client) and spoof-resistant.
        real = request.headers.get("x-real-ip", "").strip()
        if real:
            return real
        # Fallback when X-Real-IP is absent: X-Forwarded-For. The left-most entry
        # is the value the edge proxy recorded for the client when the client did
        # not itself inject XFF; we keep it as a best-effort key. (Right-most is
        # NOT used — behind Railway it is a per-request-varying internal hop,
        # which would defeat bucketing entirely.)
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            parts = [p.strip() for p in fwd.split(",") if p.strip()]
            if parts:
                return parts[0]
    return get_remote_address(request)


# Global 60 req/min per client IP. Individual routes override with stricter
# limits (e.g. /auth/token 5/min, /auth/register 3/min).
limiter = Limiter(key_func=client_ip_key, default_limits=["60/minute"])
