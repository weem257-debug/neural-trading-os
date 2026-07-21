"""
F-24 (log redaction), F-18 (SSRF guard), F-13 (order idempotency cache).
"""
import pytest

from app.core.log_redaction import redact_processor, _REDACTED
from app.core.ssrf_guard import assert_url_allowed, SSRFError


# ----------------------------- F-24 -----------------------------------------

class TestLogRedaction:
    def test_sensitive_keys_redacted(self):
        out = redact_processor(None, "info", {
            "event": "login",
            "password": "hunter2",
            "access_token": "abc.def.ghi",
            "Authorization": "Bearer xyz",
            "api_key": "sk-123",
            "user": "alice",
        })
        assert out["password"] == _REDACTED
        assert out["access_token"] == _REDACTED
        assert out["Authorization"] == _REDACTED
        assert out["api_key"] == _REDACTED
        assert out["user"] == "alice"  # non-sensitive preserved
        assert out["event"] == "login"

    def test_bearer_and_jwt_in_values_redacted(self):
        jwt = "eyJhbGciOi.eyJzdWIiOiJhbGljZSJ9.sig-part_123"
        out = redact_processor(None, "info", {
            "event": "req",
            "headers": f"Authorization: Bearer {jwt}",
            "note": f"token {jwt} used",
        })
        assert "Bearer " + _REDACTED in out["headers"]
        assert jwt not in out["headers"]
        assert jwt not in out["note"]

    def test_nested_dict_redacted(self):
        out = redact_processor(None, "info", {
            "ctx": {"csrf_token": "t", "nested": {"secret": "s", "ok": 1}},
        })
        assert out["ctx"]["csrf_token"] == _REDACTED
        assert out["ctx"]["nested"]["secret"] == _REDACTED
        assert out["ctx"]["nested"]["ok"] == 1

    def test_cookie_pair_redacted(self):
        out = redact_processor(None, "info", {"event": "x", "raw": "access_token=abc123; path=/"})
        assert "access_token=" + _REDACTED in out["raw"]
        assert "abc123" not in out["raw"]


# ----------------------------- F-18 -----------------------------------------

class TestSSRFGuard:
    def test_rejects_non_https(self):
        with pytest.raises(SSRFError):
            assert_url_allowed("http://api.broker.com/x")

    def test_rejects_loopback_ip(self):
        with pytest.raises(SSRFError):
            assert_url_allowed("https://127.0.0.1/x", resolve_dns=False)

    def test_rejects_private_ip(self):
        for ip in ("10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.1.1"):
            with pytest.raises(SSRFError):
                assert_url_allowed(f"https://{ip}/x", resolve_dns=False)

    def test_rejects_ipv6_loopback(self):
        with pytest.raises(SSRFError):
            assert_url_allowed("https://[::1]/x", resolve_dns=False)

    def test_rejects_host_not_on_allowlist(self):
        with pytest.raises(SSRFError):
            assert_url_allowed("https://evil.com/x", allowed_hosts={"api.broker.com"}, resolve_dns=False)

    def test_allows_allowlisted_public_host(self):
        # allow-listed host, DNS resolution skipped for a hermetic unit test.
        assert assert_url_allowed(
            "https://api.broker.com/orders",
            allowed_hosts={"api.broker.com"},
            resolve_dns=False,
        ) == "https://api.broker.com/orders"

    def test_allows_public_ip_literal(self):
        assert assert_url_allowed("https://8.8.8.8/x", resolve_dns=False)


# ----------------------------- F-13 -----------------------------------------

class TestOrderIdempotencyCache:
    def test_bounded_cache_fifo_evicts(self):
        from app.api.routes.execution import _BoundedOrderCache
        c = _BoundedOrderCache()
        c._MAX = 3
        for i in range(5):
            c[f"k{i}"] = i
        assert len(c) == 3
        assert "k0" not in c and "k1" not in c  # oldest evicted
        assert c["k4"] == 4

    def test_same_key_returns_same_value(self):
        from app.api.routes.execution import _BoundedOrderCache
        c = _BoundedOrderCache()
        sentinel = object()
        c["alice:key1"] = sentinel
        assert c.get("alice:key1") is sentinel
        assert c.get("alice:other") is None
