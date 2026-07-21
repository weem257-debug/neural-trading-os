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
import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

_TRUST_PROXY = os.getenv("TRUST_PROXY", "false").strip().lower() in ("1", "true", "yes")


def client_ip_key(request: Request) -> str:
    """
    Rate-limit key: real client IP, proxy-aware and spoofing-resistant (F-23).

    X-Forwarded-For is "client, proxy1, proxy2, …" where each hop APPENDS the
    address it received the connection from. A malicious client can freely forge
    the LEFT-most entries, so trusting the left-most value lets an attacker mint
    a fresh rate-limit bucket per request and bypass the login/IP limits.

    We instead take the entry ``_TRUSTED_PROXY_HOPS`` positions from the RIGHT —
    the address our own trusted edge proxy (Railway = 1 hop) observed and
    appended, which the client cannot forge.
    """
    if _TRUST_PROXY:
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
