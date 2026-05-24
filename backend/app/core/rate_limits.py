"""
Centralised rate-limiter instance.

Importing from here (not from app.main) avoids circular imports when route
modules need to apply @limiter.limit decorators.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Global 60 req/min per IP.  Individual routes can override with stricter limits.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
