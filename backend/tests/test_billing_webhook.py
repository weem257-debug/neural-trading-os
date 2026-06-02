"""
Billing Webhook Logic Tests — Neural Trading OS (Iteration #109)
================================================================

The HTTP-surface billing tests in test_routes.py cover plan listing, status,
usage and the 503 feature-flag paths. They do NOT cover the part that actually
moves money-relevant state: the Stripe webhook handler in
``app/api/routes/billing.py`` (POST /api/billing/webhook).

That handler is the single most cash-critical code path in the product:
  - checkout.session.completed   → upgrade User.tier + create/patch Subscription
  - customer.subscription.updated → sync plan + status + period end
  - customer.subscription.deleted → downgrade to free
  - duplicate events             → idempotency guard (no double-processing)
  - invoice.payment_failed       → dunning email trigger (no crash)

A bug here means a paying customer is charged but never upgraded (or a churned
customer keeps premium access). These tests exercise the handler against a real
throwaway SQLite DB with Stripe's signature verification mocked out, so the full
DB-mutation logic runs.

Run:
    cd dashboard/backend
    pytest tests/test_billing_webhook.py -v
"""
import asyncio
import json
import os
import tempfile
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def _run(coro):
    """Run an async coroutine to completion on a fresh event loop.

    The TestClient drives the app on its own portal loop, so test-side DB
    assertions need an independent loop. asyncio.run() creates and tears one
    down cleanly per call (no deprecated get_event_loop()).
    """
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# App + DB fixture (isolated throwaway DB, identical bootstrap to test_routes)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def app_module():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_billing_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)

    mock_nautilus = MagicMock()
    mock_nautilus.initialize = AsyncMock(return_value=None)
    mock_nautilus.get_positions = AsyncMock(return_value=[])

    with patch(
        "app.services.nautilus.client.get_execution_client",
        return_value=mock_nautilus,
    ):
        from app.main import app
        from app.db.database import get_session
        from app.db import models

        app.state.limiter.enabled = False
        with TestClient(app, raise_server_exceptions=False) as c:
            yield {"client": c, "get_session": get_session, "models": models}
        app.state.limiter.enabled = True

    try:
        os.remove(db_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _seed_user_and_sub(get_session, models, *, username, email,
                             customer_id=None, plan="free", tier="free"):
    """Create a User + matching Subscription row directly in the DB."""
    from sqlalchemy import select

    async with get_session() as session:
        existing = await session.execute(
            select(models.User).where(models.User.username == username)
        )
        if existing.scalar_one_or_none() is None:
            session.add(models.User(
                username=username,
                email=email,
                hashed_password="x" * 20,
                role="trader",
                tier=tier,
                is_active=True,
                created_at=datetime.now(UTC),
            ))
        sub_existing = await session.execute(
            select(models.Subscription).where(models.Subscription.user_id == username)
        )
        if sub_existing.scalar_one_or_none() is None:
            session.add(models.Subscription(
                user_id=username,
                stripe_customer_id=customer_id,
                plan=plan,
                status="active",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            ))
        await session.commit()


async def _get_user_tier(get_session, models, username):
    from sqlalchemy import select
    async with get_session() as session:
        res = await session.execute(
            select(models.User).where(models.User.username == username)
        )
        u = res.scalar_one_or_none()
        return u.tier if u else None


async def _get_sub(get_session, models, username):
    from sqlalchemy import select
    async with get_session() as session:
        res = await session.execute(
            select(models.Subscription).where(models.Subscription.user_id == username)
        )
        return res.scalar_one_or_none()


async def _count_billing_events(get_session, models):
    from sqlalchemy import func, select
    async with get_session() as session:
        res = await session.execute(select(func.count()).select_from(models.BillingEvent))
        return res.scalar_one()


def _post_event(client, event: dict):
    """POST a fake Stripe event with construct_event mocked to return it verbatim."""
    fake_stripe = MagicMock()
    fake_stripe.Webhook.construct_event.return_value = event
    # SMTP off → email side-effects log only, never network. Stripe enabled via patch.
    with patch("app.api.routes.billing._stripe_enabled", return_value=True), \
         patch.dict("sys.modules", {"stripe": fake_stripe}):
        return client.post(
            "/api/billing/webhook",
            content=json.dumps({"id": event["id"]}).encode(),
            headers={"Content-Type": "application/json", "stripe-signature": "t=1,v1=sig"},
        )


# ---------------------------------------------------------------------------
# checkout.session.completed → upgrade
# ---------------------------------------------------------------------------

class TestCheckoutCompleted:
    def test_checkout_upgrades_existing_user_tier(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        _run(
            _seed_user_and_sub(get_session, models,
                               username="cust_a", email="a@test.io", plan="free", tier="free")
        )
        event = {
            "id": "evt_checkout_a",
            "type": "checkout.session.completed",
            "data": {"object": {
                "customer": "cus_A",
                "metadata": {"user_id": "cust_a", "plan": "pro"},
            }},
        }
        resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "ok"

        tier = _run(
            _get_user_tier(get_session, models, "cust_a")
        )
        assert tier == "pro", f"Expected tier upgraded to 'pro', got '{tier}'"

        sub = _run(
            _get_sub(get_session, models, "cust_a")
        )
        assert sub.plan == "pro"
        assert sub.stripe_customer_id == "cus_A"

    def test_checkout_creates_subscription_when_none_exists(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        # User exists but NO subscription row yet
        from sqlalchemy import select
        async def _seed_user_only():
            async with get_session() as session:
                session.add(models.User(
                    username="cust_b", email="b@test.io", hashed_password="x" * 20,
                    role="trader", tier="free", is_active=True, created_at=datetime.now(UTC),
                ))
                await session.commit()
        _run(_seed_user_only())

        event = {
            "id": "evt_checkout_b",
            "type": "checkout.session.completed",
            "data": {"object": {
                "customer": "cus_B",
                "metadata": {"user_id": "cust_b", "plan": "basic"},
            }},
        }
        resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text

        sub = _run(
            _get_sub(get_session, models, "cust_b")
        )
        assert sub is not None, "Subscription row should have been created from checkout"
        assert sub.plan == "basic"
        assert sub.stripe_customer_id == "cus_B"

    def test_checkout_ignores_invalid_plan_in_metadata(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        _run(
            _seed_user_and_sub(get_session, models,
                               username="cust_c", email="c@test.io", plan="free", tier="free")
        )
        event = {
            "id": "evt_checkout_c",
            "type": "checkout.session.completed",
            "data": {"object": {
                "customer": "cus_C",
                "metadata": {"user_id": "cust_c", "plan": "enterprise_hacker"},
            }},
        }
        resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text
        tier = _run(
            _get_user_tier(get_session, models, "cust_c")
        )
        # Invalid plan must NOT escalate the tier
        assert tier == "free", f"Invalid plan must not upgrade tier, got '{tier}'"


# ---------------------------------------------------------------------------
# customer.subscription.updated → plan resolution from price id
# ---------------------------------------------------------------------------

class TestSubscriptionUpdated:
    def test_subscription_updated_syncs_plan_from_price_id(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        _run(
            _seed_user_and_sub(get_session, models, username="cust_d", email="d@test.io",
                               customer_id="cus_D", plan="free", tier="free")
        )
        event = {
            "id": "evt_sub_d",
            "type": "customer.subscription.updated",
            "data": {"object": {
                "customer": "cus_D",
                "id": "sub_D",
                "status": "active",
                "cancel_at_period_end": False,
                "current_period_end": 1893456000,  # 2030-01-01
                "items": {"data": [{"price": {"id": "price_PRO_test"}}]},
            }},
        }
        # Patch the module-level PLAN_TO_PRICE so 'price_PRO_test' maps to 'pro'
        with patch.dict(
            "app.api.routes.billing.PLAN_TO_PRICE",
            {"basic": "", "pro": "price_PRO_test", "institutional": "", "signals": ""},
            clear=True,
        ):
            resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text

        sub = _run(
            _get_sub(get_session, models, "cust_d")
        )
        assert sub.plan == "pro"
        assert sub.stripe_subscription_id == "sub_D"
        assert sub.current_period_end is not None
        tier = _run(
            _get_user_tier(get_session, models, "cust_d")
        )
        assert tier == "pro", "User.tier must be synced on subscription.updated"


# ---------------------------------------------------------------------------
# customer.subscription.deleted → downgrade
# ---------------------------------------------------------------------------

class TestSubscriptionDeleted:
    def test_subscription_deleted_downgrades_to_free(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        _run(
            _seed_user_and_sub(get_session, models, username="cust_e", email="e@test.io",
                               customer_id="cus_E", plan="pro", tier="pro")
        )
        event = {
            "id": "evt_sub_del_e",
            "type": "customer.subscription.deleted",
            "data": {"object": {"customer": "cus_E", "id": "sub_E"}},
        }
        resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text

        sub = _run(
            _get_sub(get_session, models, "cust_e")
        )
        assert sub.plan == "free"
        assert sub.status == "canceled"
        tier = _run(
            _get_user_tier(get_session, models, "cust_e")
        )
        assert tier == "free", "User.tier must downgrade to free on cancellation"


# ---------------------------------------------------------------------------
# Idempotency guard
# ---------------------------------------------------------------------------

class TestIdempotency:
    def test_duplicate_event_is_not_processed_twice(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        _run(
            _seed_user_and_sub(get_session, models, username="cust_f", email="f@test.io",
                               plan="free", tier="free")
        )
        event = {
            "id": "evt_dup_f",
            "type": "checkout.session.completed",
            "data": {"object": {
                "customer": "cus_F",
                "metadata": {"user_id": "cust_f", "plan": "pro"},
            }},
        }
        first = _post_event(client, event)
        assert first.status_code == 200
        assert first.json()["status"] == "ok"

        count_after_first = _run(
            _count_billing_events(get_session, models)
        )

        second = _post_event(client, event)
        assert second.status_code == 200
        assert second.json()["status"] == "already_processed", (
            "Replaying the same Stripe event id must be a no-op (idempotency)"
        )

        count_after_second = _run(
            _count_billing_events(get_session, models)
        )
        assert count_after_first == count_after_second, (
            "Duplicate event must not create a second BillingEvent row"
        )


# ---------------------------------------------------------------------------
# invoice.payment_failed → dunning path does not crash
# ---------------------------------------------------------------------------

class TestPaymentFailed:
    def test_payment_failed_returns_ok_and_logs_event(self, app_module):
        client, get_session, models = (
            app_module["client"], app_module["get_session"], app_module["models"]
        )
        _run(
            _seed_user_and_sub(get_session, models, username="cust_g", email="g@test.io",
                               customer_id="cus_G", plan="pro", tier="pro")
        )
        event = {
            "id": "evt_payfail_g",
            "type": "invoice.payment_failed",
            "data": {"object": {"customer": "cus_G"}},
        }
        resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text
        # Plan/tier must NOT change on a single failed payment (grace period via Stripe dunning)
        tier = _run(
            _get_user_tier(get_session, models, "cust_g")
        )
        assert tier == "pro", "A single failed payment must not immediately downgrade the user"


# ---------------------------------------------------------------------------
# Unknown / unrelated event types are accepted and logged
# ---------------------------------------------------------------------------

class TestUnknownEvents:
    def test_unknown_event_type_returns_ok(self, app_module):
        client = app_module["client"]
        event = {
            "id": "evt_unknown_x",
            "type": "payment_intent.created",
            "data": {"object": {"customer": "cus_X"}},
        }
        resp = _post_event(client, event)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "ok"

    def test_webhook_without_signature_still_503_when_stripe_disabled(self, app_module):
        client = app_module["client"]
        resp = client.post(
            "/api/billing/webhook",
            content=b'{"type":"test"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 503
