"""
F-24 — central log redaction.

A structlog processor that scrubs sensitive values from every structured log
event before it is rendered, so tokens, cookies, passwords, API/broker keys and
Authorization headers can never leak into logs (stdout / JSON sink), regardless
of which call site logged them.

Redaction is applied to:
  * event-dict keys whose (lower-cased) name matches a sensitive token, and
  * string values that look like a Bearer token / JWT / cookie header.

Nested dicts and lists are walked recursively (bounded depth).
"""
from __future__ import annotations

import re
from typing import Any

_REDACTED = "***REDACTED***"

# Key names (substring match, case-insensitive) whose values are always secret.
_SENSITIVE_KEY_PARTS = (
    "authorization",
    "cookie",
    "password",
    "passwd",
    "secret",
    "token",          # access_token, refresh_token, csrf_token, ws-token, jwt token…
    "api_key",
    "apikey",
    "api-key",
    "jwt",
    "csrf",
    "private_key",
    "client_secret",
    "encryption_key",
    "pin",            # broker FinTS PIN
    "otp",
    "mfa",
    "set-cookie",
)

# Value patterns that are secret even under a non-sensitive key.
_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._\-]+", re.IGNORECASE)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+")
_COOKIE_PAIR_RE = re.compile(
    r"\b(access_token|refresh_token|csrf_token|session)=[^;\s]+", re.IGNORECASE
)

_MAX_DEPTH = 6


def _key_is_sensitive(key: str) -> bool:
    k = key.lower()
    return any(part in k for part in _SENSITIVE_KEY_PARTS)


def _redact_str(value: str) -> str:
    value = _BEARER_RE.sub("Bearer " + _REDACTED, value)
    value = _JWT_RE.sub(_REDACTED, value)
    value = _COOKIE_PAIR_RE.sub(lambda m: f"{m.group(1)}={_REDACTED}", value)
    return value


def _redact(value: Any, depth: int = 0) -> Any:
    if depth > _MAX_DEPTH:
        return value
    if isinstance(value, dict):
        return {
            k: (_REDACTED if isinstance(k, str) and _key_is_sensitive(k)
                else _redact(v, depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return type(value)(_redact(v, depth + 1) for v in value)
    if isinstance(value, str):
        return _redact_str(value)
    return value


def redact_processor(_logger: Any, _method: str, event_dict: dict) -> dict:
    """structlog processor: scrub sensitive keys/values from the event dict."""
    out: dict = {}
    for k, v in event_dict.items():
        if isinstance(k, str) and _key_is_sensitive(k):
            out[k] = _REDACTED
        else:
            out[k] = _redact(v)
    return out
