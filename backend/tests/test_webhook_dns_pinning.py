"""
Webhook delivery connects to the address the SSRF check cleared (DNS rebinding).

``_deliver`` already re-validated the URL immediately before sending, but then
handed the HOSTNAME to httpx — a second, independent DNS lookup. Whoever controls
the record can answer the check with a public address and the connect with an
internal one, so the guard proved nothing about where the bytes actually went.

Delivery now pins the vetted address: the request URL carries the literal IP,
``Host`` keeps the original authority (virtual hosting still works) and
``sni_hostname`` keeps TLS verification against the NAME rather than demanding an
IP in the certificate SAN.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.webhooks.client import (
    WebhookURLError,
    _pin_target,
    validate_webhook_url,
)


class TestPinTarget:
    def test_host_replaced_by_literal_ip(self):
        url, headers, ext = _pin_target("https://hook.example.com/x", "203.0.113.9")
        assert url == "https://203.0.113.9/x"
        assert headers["Host"] == "hook.example.com"
        assert ext["sni_hostname"] == "hook.example.com"

    def test_port_is_preserved_on_both_sides(self):
        url, headers, _ = _pin_target("https://hook.example.com:8443/x", "203.0.113.9")
        assert url == "https://203.0.113.9:8443/x"
        assert headers["Host"] == "hook.example.com:8443"

    def test_ipv6_is_bracketed(self):
        url, _, ext = _pin_target("https://hook.example.com/x", "2001:db8::1")
        assert url == "https://[2001:db8::1]/x"
        assert ext["sni_hostname"] == "hook.example.com"

    def test_path_and_query_survive(self):
        url, _, _ = _pin_target("https://h.example.com/a/b?c=1&d=2", "203.0.113.9")
        assert url == "https://203.0.113.9/a/b?c=1&d=2"


class TestValidateReturnsVettedAddresses:
    # NOTE: the RFC 5737 documentation ranges (203.0.113.0/24, 198.51.100.0/24)
    # are `is_private` in Python's ipaddress module, so the guard blocks them.
    # Address-level tests therefore use globally routable literals.
    def test_returns_the_addresses_it_cleared(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("93.184.216.34", 443)),
            (2, 1, 6, "", ("93.184.216.35", 443)),
        ]):
            ips = validate_webhook_url("https://hook.example.com/x", allow_local=False)
        assert sorted(ips) == ["93.184.216.34", "93.184.216.35"]

    def test_blocked_target_still_raises(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("169.254.169.254", 443)),
        ]):
            with pytest.raises(WebhookURLError):
                validate_webhook_url("https://metadata.example.com/x", allow_local=True)

    def test_dev_allowed_loopback_is_returned_so_it_stays_connectable(self):
        """The off-prod exception waves loopback through; it must appear in the
        vetted list, otherwise pinning has no address to connect to and local
        development breaks."""
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("127.0.0.1", 9000)),
        ]):
            ips = validate_webhook_url("http://localhost:9000/hook", allow_local=True)
        assert ips == ["127.0.0.1"]


class TestDeliveryUsesThePinnedAddress:
    def _manager_with_webhook(self, url):
        from app.services.webhooks.client import WebhookManager, WebhookRegistration
        mgr = WebhookManager()
        wh = WebhookRegistration(
            id="wh-test", url=url, events=["signal.generated"], secret="s3cret",
        )
        mgr._webhooks[wh.id] = wh
        return mgr, wh

    def test_request_goes_to_the_vetted_ip_not_the_hostname(self):
        mgr, wh = self._manager_with_webhook("https://hook.example.com/x")

        captured = {}

        async def fake_post(url, **kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers") or {}
            captured["extensions"] = kwargs.get("extensions") or {}
            resp = MagicMock()
            resp.status_code = 200
            return resp

        fake_client = MagicMock()
        fake_client.post = AsyncMock(side_effect=fake_post)
        fake_client.__aenter__ = AsyncMock(return_value=fake_client)
        fake_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.webhooks.client.validate_webhook_url",
                   return_value=["203.0.113.9"]), \
             patch("httpx.AsyncClient", return_value=fake_client):
            status = asyncio.run(mgr._deliver(wh, {"event": "signal.generated"}))

        assert status == 200
        # The actual assertion: no hostname left in the connect target.
        assert captured["url"] == "https://203.0.113.9/x"
        assert "hook.example.com" not in captured["url"]
        assert captured["headers"]["Host"] == "hook.example.com"
        assert captured["extensions"]["sni_hostname"] == "hook.example.com"
        # Signing must still happen over the body, unaffected by pinning.
        assert captured["headers"]["X-Trading-Signature"].startswith("sha256=")

    def test_blocked_revalidation_sends_nothing(self):
        mgr, wh = self._manager_with_webhook("https://rebound.example.com/x")
        fake_client = MagicMock()
        fake_client.post = AsyncMock()

        with patch("app.services.webhooks.client.validate_webhook_url",
                   side_effect=WebhookURLError("interne Adresse")), \
             patch("httpx.AsyncClient", return_value=fake_client):
            status = asyncio.run(mgr._deliver(wh, {"event": "signal.generated"}))

        assert status == 0
        fake_client.post.assert_not_called()
        assert wh.delivery_failures == 1
