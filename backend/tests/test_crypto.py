"""
Tests for at-rest credential encryption (app.core.crypto) — C2.
"""
import importlib

import pytest
from cryptography.fernet import Fernet


@pytest.fixture
def crypto(monkeypatch):
    """Reload the crypto module with a fresh key and cleared caches."""
    import app.core.crypto as crypto_mod
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("APP_ENCRYPTION_KEY", key)
    monkeypatch.delenv("APP_ENCRYPTION_KEYS_OLD", raising=False)
    importlib.reload(crypto_mod)
    yield crypto_mod
    # reload again clean so other tests aren't affected
    importlib.reload(crypto_mod)


def test_roundtrip(crypto):
    secret = "sk-ant-super-secret-value-123"
    enc = crypto.encrypt(secret)
    assert enc.startswith(crypto.ENC_PREFIX)
    assert secret not in enc  # ciphertext must not leak the plaintext
    assert crypto.decrypt(enc) == secret


def test_is_encrypted(crypto):
    assert crypto.is_encrypted(crypto.encrypt("x")) is True
    assert crypto.is_encrypted("plain") is False
    assert crypto.is_encrypted("") is False
    assert crypto.is_encrypted(None) is False


def test_legacy_plaintext_passthrough(crypto):
    # Unprefixed legacy rows are returned unchanged on decrypt.
    assert crypto.decrypt("legacy-clear-text") == "legacy-clear-text"


def test_encryption_key_configured(crypto):
    assert crypto.encryption_key_configured() is True


def test_no_key_falls_back_to_plaintext(monkeypatch):
    import app.core.crypto as crypto_mod
    monkeypatch.delenv("APP_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("APP_ENCRYPTION_KEYS_OLD", raising=False)
    importlib.reload(crypto_mod)
    try:
        assert crypto_mod.encryption_key_configured() is False
        # Without a key, encrypt is a no-op (clear text) so dev keeps working.
        assert crypto_mod.encrypt("value") == "value"
        assert crypto_mod.decrypt("value") == "value"
    finally:
        importlib.reload(crypto_mod)


def test_key_rotation_old_key_decrypts(monkeypatch):
    import app.core.crypto as crypto_mod
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()

    # Encrypt with the old key.
    monkeypatch.setenv("APP_ENCRYPTION_KEY", old_key)
    monkeypatch.delenv("APP_ENCRYPTION_KEYS_OLD", raising=False)
    importlib.reload(crypto_mod)
    token = crypto_mod.encrypt("rotate-me")

    # Now make new_key primary and old_key the fallback.
    monkeypatch.setenv("APP_ENCRYPTION_KEY", new_key)
    monkeypatch.setenv("APP_ENCRYPTION_KEYS_OLD", old_key)
    importlib.reload(crypto_mod)
    try:
        assert crypto_mod.decrypt(token) == "rotate-me"
    finally:
        monkeypatch.delenv("APP_ENCRYPTION_KEYS_OLD", raising=False)
        importlib.reload(crypto_mod)


def test_invalid_token_returns_none(crypto):
    # A prefixed but corrupt token must not raise — returns None.
    assert crypto.decrypt(crypto.ENC_PREFIX + "not-a-valid-fernet-token") is None
