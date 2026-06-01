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
import asyncio
import json
import logging
import smtplib
from datetime import datetime, UTC
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.rate_limits import limiter
from pydantic import BaseModel
from sqlalchemy import select

from app.api.auth import UserInfo, get_current_user
from app.core.config import settings
from app.db.database import get_session
from app.db.models import BillingEvent, Subscription, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])

PLAN_TO_PRICE: dict[str, str] = {
    "basic": settings.STRIPE_PRICE_BASIC,
    "pro": settings.STRIPE_PRICE_PRO,
    "institutional": settings.STRIPE_PRICE_INST,
    "signals": settings.STRIPE_PRICE_SIGNALS,
}

PLAN_TO_PRICE_ANNUAL: dict[str, str] = {
    "basic": settings.STRIPE_PRICE_BASIC_ANNUAL,
    "pro": settings.STRIPE_PRICE_PRO_ANNUAL,
    "institutional": settings.STRIPE_PRICE_INST_ANNUAL,
    "signals": settings.STRIPE_PRICE_SIGNALS_ANNUAL,
}

PLAN_META = {
    "free":          {"name": "Free",               "price_eur": 0,   "price_eur_annual": 0,    "signals_day": 3},
    "basic":         {"name": "Basic",               "price_eur": 29,  "price_eur_annual": 290,  "signals_day": 10},
    "pro":           {"name": "Pro",                 "price_eur": 99,  "price_eur_annual": 990,  "signals_day": 50},
    "institutional": {"name": "Institutional",       "price_eur": 299, "price_eur_annual": 2990, "signals_day": -1},
    "signals":       {"name": "Signal Marketplace",  "price_eur": 19,  "price_eur_annual": 190,  "signals_day": 10},
}


PLAN_FEATURES: dict[str, list[str]] = {
    "basic": [
        "10 KI-Signale täglich (Claude Haiku)",
        "5 beobachtete Ticker",
        "Preisalarme (DB-gespeichert)",
        "News-Sentiment-Analyse",
        "Basis-Risikokennzahlen (VaR, Drawdown)",
    ],
    "pro": [
        "50 KI-Signale täglich (Claude Sonnet 4.6)",
        "Unbegrenzte Ticker",
        "Backtesting: Jesse + Qlib + Vibe-Trading",
        "Multi-Portfolio (Aktien, Krypto, P2P)",
        "Selbstlernende KI (RAG-Feedback-Loop)",
        "Webhook-Integrationen & Prioritäts-Support",
    ],
    "institutional": [
        "Unbegrenzte KI-Signale",
        "REST-API-Zugang (rate-limited)",
        "White-Label-Dashboard",
        "Live-Trading: Nautilus Trader (15+ Broker)",
        "SLA 99,9 % Uptime + dediziertes Onboarding",
    ],
    "signals": [
        "10 Signale/Tag via TradingAgents Multi-Agenten-Konsens",
        "Kein vollständiges Dashboard erforderlich",
        "Upgrade-Pfad ins vollständige Dashboard",
    ],
}


async def _send_upgrade_email(to: str, username: str, plan: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("[DEV] Upgrade email would be sent to %s (%s) plan=%s", username, to, plan)
        return

    meta = PLAN_META.get(plan, PLAN_META["free"])
    features = PLAN_FEATURES.get(plan, [])
    plan_name = meta["name"]
    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
    billing_url = f"{settings.FRONTEND_URL}/billing"
    sender = getattr(settings, "SMTP_FROM", None) or settings.SMTP_USER

    features_html = "".join(f"<li style='margin-bottom:4px;'>{f}</li>" for f in features)
    features_text = "\n".join(f"  • {f}" for f in features)

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Dein {plan_name}-Plan ist aktiv — Neural Trading OS"
        msg["From"] = sender
        msg["To"] = to

        text = (
            f"Hallo {username},\n\n"
            f"dein Upgrade auf den {plan_name}-Plan ist aktiv!\n\n"
            f"Dein {plan_name}-Plan enthält:\n{features_text}\n\n"
            f"Jetzt loslegen: {dashboard_url}\n\n"
            f"Plan verwalten: {billing_url}\n\n"
            f"Bei Fragen: weem257@gmail.com\n\n"
            f"Neural Trading OS"
        )
        html = (
            f"<html><body style='font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px;'>"
            f"<div style='max-width:560px;margin:0 auto;'>"
            f"<h1 style='color:#00D4FF;font-size:24px;margin-bottom:8px;'>Neural Trading OS</h1>"
            f"<p>Hallo <strong>{username}</strong>,</p>"
            f"<p>dein Upgrade auf den <strong style='color:#00FF88;'>{plan_name}-Plan</strong> ist aktiv! 🎉</p>"
            f"<h3 style='color:#00D4FF;'>Dein {plan_name}-Plan enthält:</h3>"
            f"<ul style='color:#94a3b8;'>{features_html}</ul>"
            f"<p style='margin-top:24px;'>"
            f"<a href='{dashboard_url}' style='background:#00D4FF;color:#000;padding:12px 24px;"
            f"border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;'>"
            f"Zum Dashboard →</a></p>"
            f"<p style='color:#64748b;font-size:12px;margin-top:24px;'>"
            f"Plan verwalten: <a href='{billing_url}' style='color:#00D4FF;'>Abrechnung</a> · "
            f"Fragen: <a href='mailto:weem257@gmail.com' style='color:#00D4FF;'>weem257@gmail.com</a>"
            f"</p>"
            f"</div></body></html>"
        )
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        logger.warning("upgrade_email_failed for %s plan=%s: %s", username, plan, exc)


async def _send_payment_failed_email(to: str, username: str, plan: str, billing_url: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("[DEV] Payment-failed email would be sent to %s (%s)", username, to)
        return

    plan_name = PLAN_META.get(plan, PLAN_META["free"])["name"]
    sender = getattr(settings, "SMTP_FROM", None) or settings.SMTP_USER

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Zahlung fehlgeschlagen — dein {plan_name}-Plan ist in Gefahr"
        msg["From"] = sender
        msg["To"] = to

        text = (
            f"Hallo {username},\n\n"
            f"leider konnte die Zahlung für deinen {plan_name}-Plan nicht verarbeitet werden.\n\n"
            f"Um deinen Zugang zu erhalten, aktualisiere bitte deine Zahlungsmethode:\n"
            f"{billing_url}\n\n"
            f"Falls du nichts unternimmst, wird dein Abonnement automatisch beendet "
            f"und dein Konto auf den Free-Plan zurückgesetzt.\n\n"
            f"Bei Fragen: weem257@gmail.com\n\n"
            f"Neural Trading OS"
        )
        html = (
            f"<html><body style='font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px;'>"
            f"<div style='max-width:560px;margin:0 auto;'>"
            f"<h1 style='color:#00D4FF;font-size:24px;margin-bottom:8px;'>Neural Trading OS</h1>"
            f"<div style='background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);"
            f"border-radius:8px;padding:16px;margin-bottom:24px;'>"
            f"<p style='color:#f87171;font-weight:bold;margin:0;'>⚠️ Zahlung fehlgeschlagen</p>"
            f"</div>"
            f"<p>Hallo <strong>{username}</strong>,</p>"
            f"<p>leider konnte die Zahlung für deinen <strong style='color:#f87171;'>{plan_name}-Plan</strong> "
            f"nicht verarbeitet werden.</p>"
            f"<p style='color:#94a3b8;'>Um deinen Zugang zu erhalten, aktualisiere bitte deine Zahlungsmethode. "
            f"Falls du nichts unternimmst, wird dein Abonnement beendet und dein Konto auf den Free-Plan "
            f"zurückgesetzt.</p>"
            f"<p style='margin-top:24px;'>"
            f"<a href='{billing_url}' style='background:#ef4444;color:#fff;padding:12px 24px;"
            f"border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;'>"
            f"Zahlungsmethode aktualisieren →</a></p>"
            f"<p style='color:#64748b;font-size:12px;margin-top:24px;'>"
            f"Fragen: <a href='mailto:weem257@gmail.com' style='color:#00D4FF;'>weem257@gmail.com</a>"
            f"</p>"
            f"</div></body></html>"
        )
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        logger.warning("payment_failed_email_error for %s: %s", username, exc)


async def _send_cancellation_email(to: str, username: str, old_plan: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("[DEV] Cancellation email would be sent to %s (%s) plan=%s", username, to, old_plan)
        return

    plan_name = PLAN_META.get(old_plan, PLAN_META["free"])["name"]
    billing_url = f"{settings.FRONTEND_URL}/billing"
    sender = getattr(settings, "SMTP_FROM", None) or settings.SMTP_USER

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Dein {plan_name}-Abo wurde beendet — wir vermissen dich!"
        msg["From"] = sender
        msg["To"] = to

        text = (
            f"Hallo {username},\n\n"
            f"dein {plan_name}-Abonnement bei Neural Trading OS wurde beendet.\n\n"
            f"Dein Konto wurde auf den kostenlosen Free-Plan zurückgesetzt (3 Signale/Tag).\n\n"
            f"Du kannst dein Abo jederzeit wieder aktivieren:\n{billing_url}\n\n"
            f"Bei Fragen: weem257@gmail.com\n\n"
            f"Neural Trading OS"
        )
        html = (
            f"<html><body style='font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px;'>"
            f"<div style='max-width:560px;margin:0 auto;'>"
            f"<h1 style='color:#00D4FF;font-size:24px;margin-bottom:8px;'>Neural Trading OS</h1>"
            f"<p>Hallo <strong>{username}</strong>,</p>"
            f"<p>dein <strong style='color:#A78BFA;'>{plan_name}-Abonnement</strong> wurde beendet. "
            f"Dein Konto läuft jetzt im Free-Plan weiter (3 Signale/Tag).</p>"
            f"<div style='margin:24px 0;padding:16px;background:rgba(123,47,255,0.08);"
            f"border:1px solid rgba(123,47,255,0.25);border-radius:12px;'>"
            f"<p style='margin:0 0 8px;font-weight:bold;color:#e2e8f0;'>Was du verpasst:</p>"
            f"<ul style='margin:0;padding-left:20px;color:#94a3b8;line-height:1.8;'>"
            f"<li>Mehr KI-Signale pro Tag (bis zu ∞ beim Institutional-Plan)</li>"
            f"<li>Elliott-Wave-Analyse und Multi-Agent-Konsens</li>"
            f"<li>Erweiterte Backtesting-Kapazitäten</li>"
            f"</ul>"
            f"</div>"
            f"<p><a href='{billing_url}' style='background:rgba(123,47,255,0.2);border:1px solid rgba(123,47,255,0.5);"
            f"color:#A78BFA;padding:12px 24px;border-radius:6px;text-decoration:none;"
            f"font-weight:700;display:inline-block;'>Jetzt wieder aktivieren →</a></p>"
            f"<p style='color:#64748b;font-size:12px;margin-top:24px;'>"
            f"Fragen: <a href='mailto:weem257@gmail.com' style='color:#00D4FF;'>weem257@gmail.com</a>"
            f"</p>"
            f"</div></body></html>"
        )
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        logger.warning("cancellation_email_error for %s: %s", username, exc)


def _stripe_enabled() -> bool:
    return bool((settings.STRIPE_SECRET_KEY or "").strip())


def _require_stripe():
    if not _stripe_enabled():
        raise HTTPException(
            status_code=503,
            detail="Stripe-Abrechnung ist auf dieser Instanz nicht konfiguriert. Setze STRIPE_SECRET_KEY zum Aktivieren.",
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
                "stripe_price_id_annual": PLAN_TO_PRICE_ANNUAL.get(plan_id, ""),
                "available": plan_id == "free" or bool(PLAN_TO_PRICE.get(plan_id, "").strip()),
                "annual_available": bool(PLAN_TO_PRICE_ANNUAL.get(plan_id, "").strip()),
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
@limiter.limit("5/minute")
async def create_checkout_session(
    request: Request,
    req: CheckoutRequest,
    current_user: UserInfo = Depends(get_current_user),
):
    """Create a Stripe Checkout session for the requested plan."""
    _require_stripe()

    import stripe  # lazy import — only needed when Stripe is configured

    if req.plan not in PLAN_TO_PRICE:
        raise HTTPException(status_code=400, detail=f"Unbekannter Plan: {req.plan}")

    if req.annual:
        price_id = PLAN_TO_PRICE_ANNUAL.get(req.plan, "")
        if not price_id:
            # Fall back to monthly if annual price not configured
            price_id = PLAN_TO_PRICE[req.plan]
    else:
        price_id = PLAN_TO_PRICE[req.plan]

    if not price_id:
        raise HTTPException(status_code=503, detail=f"Preis-ID für Plan '{req.plan}' nicht konfiguriert.")

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
        raise HTTPException(status_code=502, detail="Stripe-Fehler — siehe Server-Logs.") from exc

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
        raise HTTPException(status_code=400, detail="Kein aktives Stripe-Abonnement gefunden.")

    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        portal = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/billing",
        )
    except stripe.StripeError as exc:
        logger.error("Stripe portal error: %s", exc)
        raise HTTPException(status_code=502, detail="Stripe-Fehler — siehe Server-Logs.") from exc

    return PortalResponse(portal_url=portal.url)


# ---------------------------------------------------------------------------
# POST /api/billing/webhook
# ---------------------------------------------------------------------------

@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request):
    """Stripe webhook receiver with signature verification and idempotency guard."""
    if not _stripe_enabled():
        raise HTTPException(status_code=503, detail="Stripe nicht konfiguriert.")

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Ungültige Stripe-Signatur.")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Webhook-Verarbeitung fehlgeschlagen.") from exc

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
        upgrade_email_to: str | None = None
        upgrade_email_username: str | None = None
        valid_plan: str | None = None
        payment_fail_email_to: str | None = None
        payment_fail_username: str | None = None
        payment_fail_plan: str | None = None
        cancel_email_to: str | None = None
        cancel_email_username: str | None = None
        cancel_email_plan: str | None = None

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
                # Sync User.tier so quota checks reflect the paid plan immediately
                if sub.user_id:
                    user_res = await session.execute(
                        select(User).where(User.username == sub.user_id)
                    )
                    db_user = user_res.scalar_one_or_none()
                    if db_user:
                        db_user.tier = plan
                        logger.info("billing_tier_sync: user=%s tier=%s", sub.user_id, plan)

        elif event["type"] == "customer.subscription.deleted":
            customer_id = obj.get("customer")
            result = await session.execute(
                select(Subscription).where(Subscription.stripe_customer_id == customer_id)
            )
            sub = result.scalar_one_or_none()
            if sub:
                old_plan = sub.plan  # capture before downgrade for win-back email
                sub.plan = "free"
                sub.status = "canceled"
                sub.cancel_at_period_end = False
                sub.current_period_end = None
                sub.updated_at = datetime.now(UTC)
                # Downgrade user tier back to free on cancellation
                if sub.user_id:
                    user_res = await session.execute(
                        select(User).where(User.username == sub.user_id)
                    )
                    db_user = user_res.scalar_one_or_none()
                    if db_user:
                        db_user.tier = "free"
                        logger.info("billing_tier_downgrade: user=%s", sub.user_id)
                        if db_user.email and old_plan and old_plan != "free":
                            cancel_email_to = db_user.email
                            cancel_email_username = db_user.username
                            cancel_email_plan = old_plan

        elif event["type"] == "checkout.session.completed":
            customer_id = obj.get("customer")
            user_id = obj.get("metadata", {}).get("user_id")
            plan_meta = obj.get("metadata", {}).get("plan")
            valid_plan = plan_meta if plan_meta in ("basic", "pro", "institutional", "signals") else None  # type: ignore[assignment]
            if user_id and customer_id:
                result = await session.execute(
                    select(Subscription).where(Subscription.user_id == user_id)
                )
                sub = result.scalar_one_or_none()
                if sub:
                    if not sub.stripe_customer_id:
                        sub.stripe_customer_id = customer_id
                    if valid_plan:
                        sub.plan = valid_plan
                    sub.updated_at = datetime.now(UTC)
                else:
                    # First-time checkout: create subscription row so future webhook events can find it
                    new_sub = Subscription(
                        user_id=user_id,
                        stripe_customer_id=customer_id,
                        plan=valid_plan or "free",
                        status="active",
                        created_at=datetime.now(UTC),
                        updated_at=datetime.now(UTC),
                    )
                    session.add(new_sub)
                    logger.info("billing_sub_created_from_checkout: user=%s plan=%s", user_id, valid_plan)
                # Immediately upgrade User.tier so quota applies without waiting for subscription event
                upgrade_email_to: str | None = None
                upgrade_email_username: str | None = None
                if valid_plan:
                    user_res = await session.execute(
                        select(User).where(User.username == user_id)
                    )
                    db_user = user_res.scalar_one_or_none()
                    if db_user:
                        db_user.tier = valid_plan
                        logger.info("billing_checkout_tier_upgrade: user=%s tier=%s", user_id, valid_plan)
                        if db_user.email:
                            upgrade_email_to = db_user.email
                            upgrade_email_username = db_user.username

        elif event["type"] == "invoice.payment_failed":
            customer_id = obj.get("customer")
            if customer_id:
                sub_res = await session.execute(
                    select(Subscription).where(Subscription.stripe_customer_id == customer_id)
                )
                failed_sub = sub_res.scalar_one_or_none()
                if failed_sub:
                    user_res = await session.execute(
                        select(User).where(User.username == failed_sub.user_id)
                    )
                    failed_user = user_res.scalar_one_or_none()
                    if failed_user and failed_user.email:
                        payment_fail_email_to = failed_user.email
                        payment_fail_username = failed_user.username
                        payment_fail_plan = failed_sub.plan

        billing_event.processed = True
        await session.commit()

        # Fire-and-forget upgrade email AFTER commit so DB state is consistent
        if upgrade_email_to and upgrade_email_username and valid_plan:
            asyncio.create_task(
                _send_upgrade_email(upgrade_email_to, upgrade_email_username, valid_plan)
            )

        if payment_fail_email_to and payment_fail_username and payment_fail_plan:
            asyncio.create_task(
                _send_payment_failed_email(
                    payment_fail_email_to,
                    payment_fail_username,
                    payment_fail_plan,
                    f"{settings.FRONTEND_URL}/billing",
                )
            )

        if cancel_email_to and cancel_email_username and cancel_email_plan:
            asyncio.create_task(
                _send_cancellation_email(cancel_email_to, cancel_email_username, cancel_email_plan)
            )

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
    from app.db.models import SignalRecord

    async with get_session() as session:
        sub_result = await session.execute(
            select(Subscription).where(Subscription.user_id == current_user.username)
        )
        sub = sub_result.scalar_one_or_none()
        plan = sub.plan if sub else "free"

        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=UTC)
        count_result = await session.execute(
            select(func.count()).select_from(SignalRecord).where(
                SignalRecord.generated_at >= today_start,
                SignalRecord.user_id == current_user.username,
            )
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


# ---------------------------------------------------------------------------
# GET /api/billing/invoices
# ---------------------------------------------------------------------------

class InvoiceItem(BaseModel):
    id: str
    number: Optional[str]
    date: str
    amount_eur: float
    status: str
    pdf_url: Optional[str]
    hosted_url: Optional[str]


class InvoicesResponse(BaseModel):
    invoices: list[InvoiceItem]


@router.get("/invoices", response_model=InvoicesResponse)
@limiter.limit("10/minute")
async def get_invoices(
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
):
    """Return the last 10 Stripe invoices for the authenticated user."""
    _require_stripe()

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY

    async with get_session() as session:
        result = await session.execute(
            select(Subscription).where(Subscription.user_id == current_user.username)
        )
        sub = result.scalar_one_or_none()

    if not sub or not sub.stripe_customer_id:
        return InvoicesResponse(invoices=[])

    try:
        raw = stripe.Invoice.list(customer=sub.stripe_customer_id, limit=10)
        items: list[InvoiceItem] = []
        for inv in raw.auto_paging_iter():
            if inv.get("status") in ("void", "draft"):
                continue
            items.append(InvoiceItem(
                id=inv["id"],
                number=inv.get("number"),
                date=datetime.fromtimestamp(inv["created"], tz=UTC).strftime("%d.%m.%Y"),
                amount_eur=round((inv.get("amount_paid") or inv.get("amount_due") or 0) / 100, 2),
                status=inv.get("status", "unknown"),
                pdf_url=inv.get("invoice_pdf"),
                hosted_url=inv.get("hosted_invoice_url"),
            ))
            if len(items) >= 10:
                break
        return InvoicesResponse(invoices=items)
    except Exception as exc:
        logger.warning("invoices_fetch_error user=%s: %s", current_user.username, exc)
        return InvoicesResponse(invoices=[])
