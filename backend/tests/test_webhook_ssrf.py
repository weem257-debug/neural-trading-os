"""
SSRF validation tests for outbound webhooks (H2).
"""
import pytest

from app.services.webhooks.client import validate_webhook_url, WebhookURLError


@pytest.mark.parametrize("url", [
    "http://example.com/hook",          # http rejected in hardened mode
    "ftp://example.com/hook",           # wrong scheme
    "https://localhost/hook",           # loopback
    "https://127.0.0.1/hook",           # loopback IP
    "https://10.0.0.5/hook",            # private
    "https://192.168.1.10/hook",        # private
    "https://169.254.169.254/latest",   # cloud metadata
    "https://[::1]/hook",               # ipv6 loopback
    "https://0.0.0.0/hook",             # unspecified
])
def test_blocked_urls_hardened(url):
    with pytest.raises(WebhookURLError):
        validate_webhook_url(url, allow_local=False)


def test_allows_public_https():
    # A public host must pass (uses real DNS; example.com is stable).
    validate_webhook_url("https://example.com/hook", allow_local=False)


def test_local_allowed_in_dev():
    # Off-production we permit localhost for developer convenience.
    validate_webhook_url("http://localhost:9000/hook", allow_local=True)


def test_metadata_blocked_even_in_dev():
    with pytest.raises(WebhookURLError):
        validate_webhook_url("https://169.254.169.254/latest/meta-data", allow_local=True)


def test_unresolvable_host_rejected():
    with pytest.raises(WebhookURLError):
        validate_webhook_url(
            "https://this-host-should-not-exist-zzz123.invalid/hook",
            allow_local=False,
        )
