"""
At-rest encryption for stored credentials (C2).
================================================

Broker / API credentials persisted in the ``app_secrets`` table are encrypted
with Fernet (AES-128-CBC + HMAC-SHA256) using a key supplied via the
``APP_ENCRYPTION_KEY`` environment variable.

Storage format
--------------
Encrypted values are stored with a versioned prefix so the resolver can tell
encrypted ciphertext apart from legacy clear-text rows and migrate them
transparently on read/write:

    enc:v1:<fernet-token>

Rows written before this change (no prefix) are treated as clear text. They are
decrypted as-is on read and re-encrypted on the next write (or via the
``encrypt_existing_secrets`` migration script).

Key management
--------------
* Generate a key:
      python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
* Set it as ``APP_ENCRYPTION_KEY`` (env var / Railway variable).
* Rotating the key is supported by listing the *old* key(s) in
  ``APP_ENCRYPTION_KEYS_OLD`` (comma-separated). New writes always use the
  primary ``APP_ENCRYPTION_KEY``; old keys are only tried on decrypt.

In a non-hardened environment (development/test) a missing key falls back to
clear-text storage with a one-time warning, so local development keeps working
without ceremony. Production refuses to boot without a key (guard in main.py).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

logger = logging.getLogger(__name__)

# Versioned prefix marking a value as Fernet-encrypted.
ENC_PREFIX = "enc:v1:"

_warned_no_key = False
_cached_fernet: Optional[MultiFernet] = None
_cached_key_signature: Optional[str] = None


def _read_keys() -> tuple[Optional[str], list[str]]:
    """Return (primary_key, [old_keys]) from the environment."""
    primary = (os.getenv("APP_ENCRYPTION_KEY") or "").strip() or None
    old_raw = os.getenv("APP_ENCRYPTION_KEYS_OLD") or ""
    old = [k.strip() for k in old_raw.split(",") if k.strip()]
    return primary, old


def encryption_key_configured() -> bool:
    """True when a usable APP_ENCRYPTION_KEY is present."""
    primary, _ = _read_keys()
    if not primary:
        return False
    try:
        Fernet(primary.encode())
        return True
    except Exception:
        return False


def _get_fernet() -> Optional[MultiFernet]:
    """
    Build (and cache) a MultiFernet from the primary + old keys.
    Returns None when no valid primary key is configured.
    The cache invalidates if the key set changes (e.g. during tests).
    """
    global _cached_fernet, _cached_key_signature, _warned_no_key
    primary, old = _read_keys()
    signature = "|".join([primary or ""] + old)

    if not primary:
        if not _warned_no_key:
            logger.warning(
                "app_encryption_key_missing: credentials are stored WITHOUT "
                "at-rest encryption. Set APP_ENCRYPTION_KEY to enable it."
            )
            _warned_no_key = True
        _cached_fernet = None
        _cached_key_signature = signature
        return None

    if _cached_fernet is not None and _cached_key_signature == signature:
        return _cached_fernet

    keys: list[Fernet] = []
    try:
        keys.append(Fernet(primary.encode()))
    except Exception as exc:
        logger.error("app_encryption_key_invalid: %s", exc)
        raise ValueError(
            "APP_ENCRYPTION_KEY is not a valid Fernet key. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        ) from exc
    for k in old:
        try:
            keys.append(Fernet(k.encode()))
        except Exception:
            logger.warning("ignoring_invalid_old_encryption_key")

    _cached_fernet = MultiFernet(keys)
    _cached_key_signature = signature
    return _cached_fernet


def is_encrypted(value: Optional[str]) -> bool:
    return bool(value) and value.startswith(ENC_PREFIX)


def encrypt(value: str) -> str:
    """
    Encrypt a clear-text value for storage.

    Returns the prefixed ciphertext when a key is configured, otherwise the
    value unchanged (clear text) so non-hardened environments keep working.
    """
    if value is None:
        return value
    fernet = _get_fernet()
    if fernet is None:
        return value
    token = fernet.encrypt(value.encode()).decode()
    return f"{ENC_PREFIX}{token}"


def decrypt(value: Optional[str]) -> Optional[str]:
    """
    Decrypt a stored value.

    * Prefixed values are decrypted (trying the primary then any old keys).
    * Unprefixed (legacy clear-text) values are returned as-is.
    """
    if value is None:
        return None
    if not value.startswith(ENC_PREFIX):
        # Legacy clear-text row — return unchanged.
        return value
    token = value[len(ENC_PREFIX):]
    fernet = _get_fernet()
    if fernet is None:
        logger.error(
            "encrypted_value_but_no_key: a value is encrypted but "
            "APP_ENCRYPTION_KEY is not configured — cannot decrypt."
        )
        return None
    try:
        return fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        logger.error("decrypt_failed_invalid_token: wrong/rotated key?")
        return None
