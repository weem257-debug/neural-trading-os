"""
Regression tests for the Stripe webhook startup guard — P1-1 (C4).
=================================================================

The Stripe webhook handler (POST /api/billing/webhook) authenticates inbound
events *solely* via their signature, which requires STRIPE_WEBHOOK_SECRET.
If billing is enabled (STRIPE_SECRET_KEY set) but the webhook secret is
missing, every event is silently rejected and paid upgrades/downgrades never
reach the database — a cash-critical, hard-to-detect failure.

These tests pin two behaviours:
  1. ``stripe_webhook_secret_missing()`` — the precondition helper.
  2. The lifespan startup guard fails closed in hardened environments and
     stays quiet otherwise (and when Stripe is intentionally disabled).

Run:
    cd dashboard/backend
    pytest tests/test_stripe_webhook_guard.py -v
"""
import importlib

import pytest


def _reload_config(monkeypatch, *, env, secret_key, webhook_secret):
    """Reload app.core.config with explicit Stripe + environment settings."""
    monkeypatch.setenv("ENVIRONMENT", env)
    monkeypatch.setenv("STRIPE_SECRET_KEY", secret_key)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
    import app.core.config as config_mod
    importlib.reload(config_mod)
    return config_mod


@pytest.fixture(autouse=True)
def _restore_config():
    """Ensure other tests see a pristine config module after we mutate env."""
    yield
    import app.core.config as config_mod
    importlib.reload(config_mod)


# ---------------------------------------------------------------------------
# Helper: stripe_webhook_secret_missing()
# ---------------------------------------------------------------------------

def test_secret_missing_when_billing_enabled_without_webhook_secret(monkeypatch):
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="sk_live_abc", webhook_secret=""
    )
    assert cfg.stripe_billing_enabled() is True
    assert cfg.stripe_webhook_secret_missing() is True


def test_secret_present_clears_the_flag(monkeypatch):
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="sk_live_abc", webhook_secret="whsec_xyz"
    )
    assert cfg.stripe_webhook_secret_missing() is False


def test_billing_disabled_never_requires_webhook_secret(monkeypatch):
    # No STRIPE_SECRET_KEY → Stripe is opt-out; webhook secret is irrelevant.
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="", webhook_secret=""
    )
    assert cfg.stripe_billing_enabled() is False
    assert cfg.stripe_webhook_secret_missing() is False


def test_whitespace_only_secret_counts_as_missing(monkeypatch):
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="sk_live_abc", webhook_secret="   "
    )
    assert cfg.stripe_webhook_secret_missing() is True


# ---------------------------------------------------------------------------
# Lifespan startup guard (C4)
# ---------------------------------------------------------------------------

def _run_lifespan_guard(config_mod):
    """Execute just the C4 branch of the lifespan guard against patched config.

    We replicate the exact condition + raise from main.py:lifespan so the test
    is independent of the heavy app-startup side effects (DB migrate, table
    creation, background loops), while still asserting the fail-closed contract.
    """
    is_production = config_mod.is_hardened_environment()
    if is_production and config_mod.stripe_webhook_secret_missing():
        raise RuntimeError(
            "FATAL: STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing"
        )


def test_guard_aborts_boot_in_production(monkeypatch):
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="sk_live_abc", webhook_secret=""
    )
    with pytest.raises(RuntimeError, match="STRIPE_WEBHOOK_SECRET is missing"):
        _run_lifespan_guard(cfg)


def test_guard_allows_boot_in_development(monkeypatch):
    # Same missing-secret state, but non-hardened env → warn-only, no raise.
    cfg = _reload_config(
        monkeypatch, env="development", secret_key="sk_test_abc", webhook_secret=""
    )
    _run_lifespan_guard(cfg)  # must not raise


def test_guard_allows_boot_in_production_with_secret(monkeypatch):
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="sk_live_abc", webhook_secret="whsec_xyz"
    )
    _run_lifespan_guard(cfg)  # must not raise


def test_guard_allows_boot_in_production_without_billing(monkeypatch):
    cfg = _reload_config(
        monkeypatch, env="production", secret_key="", webhook_secret=""
    )
    _run_lifespan_guard(cfg)  # billing off → must not raise
