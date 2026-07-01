"""
P1 hardening regression tests:
  - BACKEND_URL default points at the real Railway backend, not the
    halluzinated/wrong "backend-production-52af" host.
  - Outbound webhook HMAC signing never falls back to JWT_SECRET_KEY.

Run:
    cd dashboard/backend
    pytest tests/test_p1_hardening.py -v
"""
from app.core.config import settings


class TestBackendUrlDefault:
    def test_backend_url_default_is_correct_host(self):
        assert settings.BACKEND_URL == "https://neural-trading-os-production.up.railway.app"
        assert "backend-production-52af" not in settings.BACKEND_URL


class TestWebhookSigningSecret:
    def test_default_secret_never_equals_jwt_secret(self, monkeypatch):
        """Webhook HMAC secret must never reuse JWT_SECRET_KEY, even when
        WEBHOOK_SIGNING_SECRET is unset."""
        monkeypatch.setattr("app.core.config.settings.WEBHOOK_SIGNING_SECRET", "")
        monkeypatch.setattr("app.core.config.settings.JWT_SECRET_KEY", "some-jwt-secret-value-1234567890")

        from app.services.webhooks.client import _default_secret
        resolved = _default_secret()

        assert resolved != "some-jwt-secret-value-1234567890"
        assert resolved != settings.JWT_SECRET_KEY

    def test_dedicated_secret_is_used_when_configured(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.WEBHOOK_SIGNING_SECRET", "my-dedicated-webhook-secret")

        from app.services.webhooks.client import _default_secret
        assert _default_secret() == "my-dedicated-webhook-secret"

    def test_ephemeral_secret_is_stable_within_process(self, monkeypatch):
        """Without a configured secret, the fallback must still be internally
        consistent (same value across calls) so signatures generated and
        verified in the same process match."""
        monkeypatch.setattr("app.core.config.settings.WEBHOOK_SIGNING_SECRET", "")
        from app.services.webhooks.client import _default_secret
        assert _default_secret() == _default_secret()
