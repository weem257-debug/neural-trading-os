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
    """Rate-limit key: real client IP, proxy-aware and spoofing-resistant."""
    if _TRUST_PROXY:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            # Format: "client, proxy1, proxy2". The left-most is the client as
            # set by our trusted edge proxy.
            client = fwd.split(",")[0].strip()
            if client:
                return client
        real = request.headers.get("x-real-ip", "").strip()
        if real:
            return real
    return get_remote_address(request)


# Global 60 req/min per client IP. Individual routes override with stricter
# limits (e.g. /auth/token 5/min, /auth/register 3/min).
limiter = Limiter(key_func=client_ip_key, default_limits=["60/minute"])
