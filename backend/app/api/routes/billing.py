"""
/api/billing — Stripe Subscription Management
----------------------------------------------
Feature-flagged: returns 503 when STRIPE_SECRET_KEY is not configured.
All routes require JWT authentication.

Plans:
  basic         — €29/mo (STRIPE_PRICE_BASIC)
  pro           — €99/mo (STRIPE_PRICE_PRO)
  institutional — €299/mo (STRIPE_PRICE_INST)
  signals       — €19/mo add-on (STRIPE_PRICE_SIGNALS)
"""
import json
import logging
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.api.auth import UserInfo, get_current_user
from app.core.config import settings
from app.db.database import get_session
from app.db.models import BillingEvent, Subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])

PLAN_TO_PRICE: dict[str, str] = {
    "basic": settings.STRIPE_PRICE_BASIC,
    "pro": settings.STRIPE_PRICE_PRO,
    "institutional": settings.STRIPE_PRICE_INST,
    "signals": settings.STRIPE_PRICE_SIGNALS,
}

PLAN_META = {
    "free":          {"name": "Free",               "price_eur": 0,   "signals_day": 3},
    "basic":         {"name": "Basic",               "price_eur": 29,  "signals_day": 10},
    "pro":           {"name": "Pro",                 "price_eur": 99,  "signals_day": 50},
    "institutional": {"name": "Institutional",       "price_eur": 299, "signals_day": -1},
    "signals":       {"name": "Signal Marketplace",  "price_eur": 19,  "signals_day": 10},
}


def _stripe_enabled() -> bool:
    return bool((settings.STRIPE_SECRET_KEY or "").strip())


def _require_stripe():
    if not _stripe_enabled():
        raise HTTPException(
            status_code=503,
            detail="Stripe billing is not configured on this instance. Set STRIPE_SECRET_KEY to enable.",
        )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SubscriptionStatus(BaseModel):
    user_id: str
    plan: str
    plan_name: str
    price_eur: int
    signals_per_day: int
    status: str
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    stripe_configured: bool


class CheckoutRequest(BaseModel):
    plan: str
    annual: bool = False


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    portal_url: str


# ---------------------------------------------------------------------------
# GET /api/billing/plans  (public)
# ---------------------------------------------------------------------------

@router.get("/plans")
async def list_plans():
    """Return all available plans with pricing metadata."""
    return {
        "plans": [
            {
                "id": plan_id,
                **meta,
                "stripe_price_id": PLAN_TO_PRICE.get(plan_id, ""),
                "available": plan_id == "free" or bool(PLAN_TO_PRICE.get(plan_id, "").strip()),
            }
            for plan_id, meta in PLAN_META.items()
        ],
        "stripe_configured": _stripe_enabled(),
    }


# ---------------------------------------------------------------------------
# GET /api/billing/status
# ---------------------------------------------------------------------------

@router.get("/status", response_model=SubscriptionStatus)
async def get_subscription_status(
    current_user: UserInfo = Depends(get_current_user),
):
    """Return current subscription plan and limits."""
    async with get_session() as session:
        result = await session.execute(
            select(Subscription).where(Subscription.user_id == current_user.username)
        )
        sub = result.scalar_one_or_none()
        if sub is None:
            sub = Subscription(
                user_id=current_user.username,
                plan="free",
                status="active",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            session.add(sub)
            await session.commit()

        meta = PLAN_META.get(sub.plan, PLAN_META["free"])
        return SubscriptionStatus(
            user_id=sub.user_id,
            plan=sub.plan,
            plan_name=meta["name"],
            price_eur=meta["price_eur"],
            signals_per_day=meta["signals_day"],
            status=sub.status,
            current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
            stripe_configured=_stripe_enabled(),
        )


# ---------------------------------------------------------------------------
# POST /api/billing/checkout
# ---------------------------------------------------------------------------

@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    req: CheckoutRequest,
    current_user: UserInfo = Depends(get_current_user),
):
    """Create a Stripe Checkout session for the requested plan."""
    _require_stripe()

    import stripe  # lazy import — only needed when Stripe is configured

    if req.plan not in PLAN_TO_PRICE:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {req.plan}")
    price_id = PLAN_TO_PRICE[req.plan]
    if not price_id:
        raise HTTPException(status_code=503, detail=f"Price ID for plan '{req.plan}' not configured.")

    stripe.api_key = settings.STRIPE_SECRET_KEY

    async with get_session() as session:
        result = await session.execute(
            select(Subscription).where(Subscription.user_id == current_user.username)
        )
        sub = result.scalar_one_or_none()
        stripe_customer_id = sub.stripe_customer_id if sub else None

    try:
        checkout_kwargs: dict = {
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{settings.FRONTEND_URL}/billing?success=1",
            "cancel_url": f"{settings.FRONTEND_URL}/pricing",
            "metadata": {"user_id": current_user.username, "plan": req.plan},
            "allow_promotion_codes": True,
        }
        if stripe_customer_id:
            checkout_kwargs["customer"] = stripe_customer_id

        checkout_session = stripe.checkout.Session.create(**checkout_kwargs)
    except stripe.StripeError as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(status_code=502, detail="Stripe error — check server logs.") from exc

    return CheckoutResponse(checkout_url=checkout_session.url, session_id=checkout_session.id)


# ---------------------------------------------------------------------------
# POST /api/billing/portal
# ---------------------------------------------------------------------------

@router.post("/portal", response_model=PortalResponse)
async def create_billing_portal(
    current_user: UserInfo = Depends(get_current_user),
):
    """Return a Stripe Customer Portal URL for managing subscription/payment methods."""
    _require_stripe()

    import stripe

    async with get_session() as session:
        result = await session.execute(
            select(Subscription).where(Subscription.user_id == current_user.username)
        )
        sub = result.scalar_one_or_none()

    if not sub or not sub.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active Stripe subscription found.")

    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        portal = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/billing",
        )
    except stripe.StripeError as exc:
        logger.error("Stripe portal error: %s", exc)
        raise HTTPException(status_code=502, detail="Stripe error — check server logs.") from exc

    return PortalResponse(portal_url=portal.url)


# ---------------------------------------------------------------------------
# POST /api/billing/webhook
# ---------------------------------------------------------------------------

@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request):
    """Stripe webhook receiver with signature verification and idempotency guard."""
    if not _stripe_enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured.")

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async with get_session() as session:
        # Idempotency check
        existing = await session.execute(
            select(BillingEvent).where(BillingEvent.stripe_event_id == event["id"])
        )
        if existing.scalar_one_or_none():
            return {"status": "already_processed"}

        billing_event = BillingEvent(
            stripe_event_id=event["id"],
            event_type=event["type"],
            payload=json.dumps(dict(event["data"]["object"])),
            processed=False,
            created_at=datetime.now(UTC),
        )
        session.add(billing_event)

        obj = event["data"]["object"]

        if event["type"] in ("customer.subscription.created", "customer.subscription.updated"):
            customer_id = obj.get("customer")
            stripe_sub_id = obj.get("id")
            status = obj.get("status", "active")
            cancel_at_end = obj.get("cancel_at_period_end", False)
            period_end_ts = obj.get("current_period_end")
            current_period_end = datetime.fromtimestamp(period_end_ts, tz=UTC) if period_end_ts else None

            price_id = None
            items = obj.get("items", {}).get("data", [])
            if items:
                price_id = items[0].get("price", {}).get("id")

            plan = "free"
            for p, pid in PLAN_TO_PRICE.items():
                if pid and pid == price_id:
                    plan = p
                    break

            result = await session.execute(
                select(Subscription).where(Subscription.stripe_customer_id == customer_id)
            )
            sub = result.scalar_one_or_none()
            if sub:
                sub.plan = plan
                sub.status = status
                sub.stripe_subscription_id = stripe_sub_id
                sub.current_period_end = current_period_end
                sub.cancel_at_period_end = cancel_at_end
                sub.updated_at = datetime.now(UTC)

        elif event["type"] == "customer.subscription.deleted":
            customer_id = obj.get("customer")
            result = await session.execute(
                select(Subscription).where(Subscription.stripe_customer_id == customer_id)
            )
            sub = result.scalar_one_or_none()
            if sub:
                sub.plan = "free"
                sub.status = "canceled"
                sub.cancel_at_period_end = False
                sub.current_period_end = None
                sub.updated_at = datetime.now(UTC)

        elif event["type"] == "checkout.session.completed":
            customer_id = obj.get("customer")
            user_id = obj.get("metadata", {}).get("user_id")
            if user_id and customer_id:
                result = await session.execute(
                    select(Subscription).where(Subscription.user_id == user_id)
                )
                sub = result.scalar_one_or_none()
                if sub and not sub.stripe_customer_id:
                    sub.stripe_customer_id = customer_id
                    sub.updated_at = datetime.now(UTC)

        billing_event.processed = True
        await session.commit()

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# GET /api/billing/usage
# ---------------------------------------------------------------------------

class UsageResponse(BaseModel):
    plan: str
    signals_used_today: int
    signals_limit: int
    signals_remaining: int
    reset_at: str


@router.get("/usage", response_model=UsageResponse)
async def get_usage(
    current_user: UserInfo = Depends(get_current_user),
):
    """Return today's signal usage vs. plan limit for the authenticated user."""
    from datetime import date
    from sqlalchemy import func
    from app.db.models import Signal

    async with get_session() as session:
        sub_result = await session.execute(
            select(Subscription).where(Subscription.user_id == current_user.username)
        )
        sub = sub_result.scalar_one_or_none()
        plan = sub.plan if sub else "free"

        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=UTC)
        count_result = await session.execute(
            select(func.count()).select_from(Signal).where(Signal.created_at >= today_start)
        )
        used_today = count_result.scalar_one()

    meta = PLAN_META.get(plan, PLAN_META["free"])
    limit = meta["signals_day"]
    remaining = max(0, limit - used_today) if limit >= 0 else -1

    return UsageResponse(
        plan=plan,
        signals_used_today=used_today,
        signals_limit=limit,
        signals_remaining=remaining,
        reset_at=f"{date.today().isoformat()}T23:59:59Z",
    )
