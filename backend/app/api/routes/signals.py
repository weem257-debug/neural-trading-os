"""
/api/signals — Trading signal generation via TradingAgents multi-agent LLM.

Route order matters: specific paths (/generate, /demo, /batch, /export, /, /trending, /performance, /cache)
must be declared BEFORE parametrised paths (/{ticker}) to avoid FastAPI matching
those literals as a ticker value.
"""
import asyncio
import csv
import io
import logging
import random
import smtplib
import uuid
from collections import deque
from datetime import datetime, UTC
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.auth import UserInfo, get_current_user, get_current_user_optional
from app.core.config import settings
from app.models.schemas import (
    TradingSignal, SignalRequest, SignalDirection, ErrorResponse,
    SignalPerformanceResponse, SignalPerformanceEntry, ClearCacheResponse,
)
from app.services.tradingagents.client import generate_signal
from app.core.rate_limits import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/signals", tags=["Signals"])

# Plan signal limits — kept in sync with billing.py PLAN_META
_PLAN_LIMITS: dict[str, int] = {
    "free": 3,
    "basic": 10,
    "pro": 50,
    "signals": 10,
    "institutional": -1,  # unlimited
}


# In-memory de-dup: "username:YYYY-MM-DD" → already sent quota-exhaustion email/telegram today.
# FIFO-bounded so the marker sets can't grow without limit in a long-lived process.
from app.core.cache import BoundedDedupSet
_quota_notified: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)
_quota_telegram_notified: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)
# "username:YYYY-MM-DD" → 80%-approaching email already sent today
_quota_approaching_notified: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)


async def _send_quota_notification(username: str, email: str, plan: str, limit: int) -> None:
    """Fire-and-forget: notify user when their daily signal quota is exhausted."""
    from datetime import date as _date
    key = f"{username}:{_date.today().isoformat()}"
    if key in _quota_notified:
        return
    _quota_notified.add(key)

    upgrade_plan = "basic" if plan == "free" else "pro"
    upgrade_limits = {"basic": 10, "pro": 50}
    upgrade_limit = upgrade_limits.get(upgrade_plan, 10)

    if not settings.SMTP_HOST:
        logger.info("[DEV] Quota notification would be sent to %s (%s) plan=%s", username, email, plan)
        return

    from app.api.auth import _unsubscribe_url
    unsub_url = _unsubscribe_url(username)
    sender = settings.SMTP_FROM or settings.SMTP_USER
    subject = f"Tageskontingent aufgebraucht — Neural Trading OS"
    html = f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">
<div style="max-width:480px;margin:0 auto">
  <h2 style="color:#00D4FF;margin-bottom:8px">Dein Tageskontingent ist aufgebraucht</h2>
  <p>Hallo <strong>{username}</strong>,</p>
  <p>Du hast heute alle <strong>{limit} Signale</strong> deines {plan.capitalize()}-Plans genutzt.</p>
  <p style="color:#64748b">Dein Kontingent wird täglich um <strong>00:00 Uhr UTC</strong> zurückgesetzt.</p>
  <div style="margin:24px 0;padding:16px;background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.2);border-radius:12px">
    <p style="margin:0 0 8px;font-weight:600;color:#00D4FF">Mehr Signale mit einem Upgrade:</p>
    <p style="margin:0;color:#94a3b8">{upgrade_plan.capitalize()}: {upgrade_limit} Signale/Tag · mehr KI-Analyse-Tiefe</p>
  </div>
  <a href="{settings.FRONTEND_URL}/billing?plan={upgrade_plan}"
     style="display:inline-block;padding:12px 24px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:600">
    Jetzt auf {upgrade_plan.capitalize()} upgraden →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a></p>
</div>
</body></html>"""
    text = f"Hallo {username},\ndein Tageskontingent von {limit} Signalen ({plan}) ist aufgebraucht.\nUpgrade: {settings.FRONTEND_URL}/billing?plan={upgrade_plan}"

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = email
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [email], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        logger.warning("quota_notification_failed for %s: %s", username, exc)


async def _send_quota_telegram_nudge(username: str, plan: str, limit: int) -> None:
    """Fire-and-forget: send Telegram upgrade nudge when daily quota is exhausted."""
    from datetime import date as _date
    key = f"{username}:{_date.today().isoformat()}"
    if key in _quota_telegram_notified:
        return
    _quota_telegram_notified.add(key)

    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import select
        from app.services.telegram.client import send_message, inline_keyboard, is_configured_async

        if not await is_configured_async():
            return

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == username)
            )
            chat = result.scalar_one_or_none()

        if not chat:
            return

        upgrade_plan = "basic" if plan == "free" else "pro"
        upgrade_limits = {"basic": 10, "pro": 50}
        upgrade_limit = upgrade_limits.get(upgrade_plan, 10)
        billing_url = f"{settings.FRONTEND_URL}/billing?plan={upgrade_plan}"

        await send_message(
            chat.chat_id,
            (
                f"🚫 <b>Tageslimit erreicht!</b>\n\n"
                f"Du hast heute alle <b>{limit} Signale</b> deines {plan.capitalize()}-Plans verbraucht.\n\n"
                f"⬆️ <b>{upgrade_plan.capitalize()}-Plan</b>: {upgrade_limit} Signale/Tag\n"
                f"<i>Kontingent wird täglich um 00:00 UTC zurückgesetzt.</i>"
            ),
            reply_markup=inline_keyboard(
                [{"text": f"⬆️ Jetzt auf {upgrade_plan.capitalize()} upgraden", "url": billing_url}]
            ),
        )
        logger.info("quota_telegram_nudge_sent", extra={"username": username, "plan": plan})
    except Exception as exc:
        logger.debug("quota_telegram_nudge_failed for %s: %s", username, exc)


async def _send_quota_approaching_notification(username: str, email: str, plan: str, used: int, limit: int) -> None:
    """Fire-and-forget: warn user at 80% daily quota consumption."""
    from datetime import date as _date
    key = f"{username}:{_date.today().isoformat()}"
    if key in _quota_approaching_notified:
        return
    _quota_approaching_notified.add(key)

    remaining = limit - used
    upgrade_plan = "basic" if plan == "free" else "pro"
    upgrade_limits = {"basic": 10, "pro": 50}
    upgrade_limit = upgrade_limits.get(upgrade_plan, 10)

    if not settings.SMTP_HOST:
        logger.info("[DEV] Quota-approaching notification would be sent to %s (%s) used=%d/%d", username, email, used, limit)
        return

    from app.api.auth import _unsubscribe_url
    unsub_url = _unsubscribe_url(username)
    sender = settings.SMTP_FROM or settings.SMTP_USER
    subject = f"Nur noch {remaining} Signal{'e' if remaining != 1 else ''} verfügbar — Neural Trading OS"
    html = f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">
<div style="max-width:480px;margin:0 auto">
  <h2 style="color:#f59e0b;margin-bottom:8px">⚠️ Fast aufgebraucht: {used}/{limit} Signale genutzt</h2>
  <p>Hallo <strong>{username}</strong>,</p>
  <p>Du hast heute bereits <strong>{used} von {limit} Signalen</strong> deines {plan.capitalize()}-Plans genutzt.</p>
  <p>Dir stehen heute noch <strong>{remaining} Signal{'e' if remaining != 1 else ''}</strong> zur Verfügung.</p>
  <div style="margin:24px 0;padding:16px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:12px">
    <p style="margin:0 0 8px;font-weight:600;color:#f59e0b">Mehr Signale mit einem Upgrade:</p>
    <p style="margin:0;color:#94a3b8">{upgrade_plan.capitalize()}: {upgrade_limit} Signale/Tag · keine Unterbrechung deiner Analyse</p>
  </div>
  <a href="{settings.FRONTEND_URL}/billing?plan={upgrade_plan}"
     style="display:inline-block;padding:12px 24px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:8px;color:#f59e0b;text-decoration:none;font-weight:600">
    Auf {upgrade_plan.capitalize()} upgraden →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a> · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>
</div>
</body></html>"""
    text = (
        f"Hallo {username},\n"
        f"du hast heute bereits {used} von {limit} Signalen ({plan}) genutzt.\n"
        f"Noch {remaining} Signal{'e' if remaining != 1 else ''} verfügbar.\n"
        f"Upgrade: {settings.FRONTEND_URL}/billing?plan={upgrade_plan}"
    )

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = email
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [email], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        logger.warning("quota_approaching_notification_failed for %s: %s", username, exc)


async def _check_signal_quota(user: Optional[UserInfo]) -> None:
    """Raise HTTP 429 if the caller has exhausted their daily signal quota."""
    from datetime import date
    from sqlalchemy import func, select
    from app.db.database import get_session
    from app.db.models import SignalRecord, Subscription

    plan = "free"
    if user:
        try:
            async with get_session() as session:
                sub_result = await session.execute(
                    select(Subscription).where(Subscription.user_id == user.username)
                )
                sub = sub_result.scalar_one_or_none()
                if sub:
                    plan = sub.plan
        except Exception:
            pass  # Fall back to free-plan limits on DB error

    limit = _PLAN_LIMITS.get(plan, 3)
    if limit < 0:  # unlimited plan
        return

    # Identify this caller: authenticated user_id or "anon" for unauthenticated
    caller_id = user.username if user else "anon"

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=UTC)
    try:
        async with get_session() as session:
            # Count signals for this specific caller today.
            # Legacy rows with NULL user_id are treated as "admin" by the migration backfill.
            count_result = await session.execute(
                select(func.count()).select_from(SignalRecord).where(
                    SignalRecord.generated_at >= today_start,
                    SignalRecord.user_id == caller_id,
                )
            )
            used_today = count_result.scalar_one()
    except Exception:
        return  # Skip quota check on DB error — fail open

    # 80% approaching warning (fire-and-forget, non-blocking)
    if user and user.email and limit > 0 and used_today >= max(1, int(limit * 0.8)) and used_today < limit:
        asyncio.create_task(
            _send_quota_approaching_notification(user.username, user.email, plan, used_today, limit)
        )

    if used_today >= limit:
        # Fire quota-exhaustion notifications on first hit per user per day (non-blocking)
        if user and user.email:
            asyncio.create_task(
                _send_quota_notification(user.username, user.email, plan, limit)
            )
        if user:
            asyncio.create_task(
                _send_quota_telegram_nudge(user.username, plan, limit)
            )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "signal_quota_exceeded",
                "message": f"Tageslimit von {limit} Signalen erreicht (Plan: {plan}). Upgrade für mehr Signale.",
                "plan": plan,
                "limit": limit,
                "used": used_today,
                "upgrade_url": "/billing",
            },
        )


# In-memory cache — replace with Redis in production
_signal_cache: dict[str, TradingSignal] = {}

# Per-ticker per-day demo signal cache — key: "TICKER:YYYY-MM-DD"
# Demo signals are deterministic per ticker+date so we cache and skip DB writes on repeat calls
_demo_cache: dict[str, TradingSignal] = {}

# Persistent in-memory signal store — FIFO, max 100 entries
_MAX_STORE = 100
_signal_store: deque[TradingSignal] = deque(maxlen=_MAX_STORE)

# Demo data
_DEMO_TICKERS = ["AAPL", "TSLA", "NVDA", "MSFT", "BTC", "ETH", "GOOGL", "AMZN"]
_DEMO_DIRECTIONS = [
    SignalDirection.BUY, SignalDirection.STRONG_BUY,
    SignalDirection.HOLD, SignalDirection.SELL, SignalDirection.STRONG_SELL,
]
_DEMO_REASONINGS = [
    "Strong earnings momentum with RSI breakout at 200-day MA. Institutional accumulation detected.",
    "Bearish divergence on MACD. Insider selling pressure and weak sector rotation.",
    "Consolidation phase — wait for volume confirmation before entry.",
    "Oversold RSI with positive news catalyst. Reversion trade setup looks favourable.",
    "Parabolic advance — elevated risk/reward. Partial profit-taking recommended.",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _store_signal(signal: TradingSignal) -> None:
    """Append a signal to the persistent FIFO store."""
    _signal_store.append(signal)


async def _persist_signal_to_db(signal: TradingSignal, user_id: Optional[str] = None) -> None:
    """Non-blocking: persist signal to SQLite. Silently skips on DB error."""
    try:
        import json
        from app.db.database import get_session
        from app.db.models import SignalRecord, SignalInsightUsage

        async with get_session() as session:
            record = SignalRecord(
                id=signal.id,
                ticker=signal.ticker,
                direction=signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
                confidence=signal.confidence,
                reasoning=signal.reasoning,
                source=signal.source,
                generated_at=signal.generated_at,
                agents_consensus=json.dumps(signal.agents_consensus) if signal.agents_consensus else None,
                price_target=signal.price_target,
                stop_loss=signal.stop_loss,
                time_horizon=signal.time_horizon,
                user_id=user_id,
            )
            session.add(record)

            # Persist insight attribution: which insights actually fed this signal's
            # prompt. The feedback loop validates exactly these when the outcome lands.
            for rank, insight_id in enumerate(getattr(signal, "used_insight_ids", []) or []):
                session.add(SignalInsightUsage(
                    signal_id=signal.id,
                    insight_id=insight_id,
                    rank=rank,
                ))

            await session.commit()
    except Exception as db_err:
        logger.debug("signal_db_persist_skipped reason=%s", str(db_err))


def _fire_webhook(event: str, payload: dict) -> None:
    """Dispatch outbound webhook event — best-effort, non-blocking."""
    try:
        from app.services.webhooks.client import get_webhook_manager
        loop = asyncio.get_event_loop()
        loop.create_task(get_webhook_manager().dispatch(event, payload))
    except Exception:
        pass  # Never block signal generation on webhook failure


async def _notify_telegram_signal(signal: TradingSignal, username: Optional[str] = None) -> None:
    """Fire-and-forget: send signal result to the requesting user's Telegram chat (if connected)."""
    if not username:
        return
    try:
        from app.services.telegram.client import send_message, inline_keyboard, is_configured_async
        from app.db.database import get_session
        from sqlalchemy import select
        from app.db.models import TelegramChat

        if not await is_configured_async():
            return

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == username)
            )
            chat = result.scalar_one_or_none()

        if not chat:
            return

        dir_emoji = {
            "BUY": "📈",
            "STRONG_BUY": "🚀",
            "SELL": "📉",
            "STRONG_SELL": "🩸",
            "HOLD": "⏸️",
        }
        direction_str = signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction)
        emoji = dir_emoji.get(direction_str, "📊")
        conf = int((signal.confidence or 0.5) * 100)

        lines = [
            f"{emoji} <b>Neues Signal — {signal.ticker}</b>",
            "",
            f"Richtung: <b>{direction_str}</b>",
            f"Konfidenz: <b>{conf}%</b>",
        ]
        if signal.price_target:
            lines.append(f"Kursziel: <b>${signal.price_target:.2f}</b>")
        if signal.stop_loss:
            lines.append(f"Stop-Loss: <b>${signal.stop_loss:.2f}</b>")
        if signal.time_horizon:
            lines.append(f"Horizont: <b>{signal.time_horizon}</b>")
        lines.append(f"\n<i>{signal.source}</i>")

        signal_url = f"{settings.FRONTEND_URL}/signals/view/{signal.id}"
        await send_message(
            chat.chat_id,
            "\n".join(lines),
            reply_markup=inline_keyboard(
                [{"text": "📊 Signal ansehen", "url": signal_url}]
            ),
        )
        logger.debug("telegram_signal_notify_sent username=%s ticker=%s", username, signal.ticker)
    except Exception as e:
        logger.debug("telegram_signal_notify_failed username=%s reason=%s", username, str(e))


def _make_demo_signal(ticker: str, source_prefix: str = "Demo[mock]") -> TradingSignal:
    """Build a deterministic demo signal for a ticker."""
    resolved = ticker.upper().strip()
    rng = random.Random(resolved + datetime.now(UTC).strftime("%Y-%m-%d"))
    direction = rng.choice(_DEMO_DIRECTIONS)
    confidence = round(rng.uniform(0.55, 0.92), 2)
    reasoning = rng.choice(_DEMO_REASONINGS)
    base_price = rng.uniform(80, 450)

    if direction in (SignalDirection.BUY, SignalDirection.STRONG_BUY):
        price_target = round(base_price * rng.uniform(1.05, 1.18), 2)
        stop_loss = round(base_price * rng.uniform(0.92, 0.97), 2)
    elif direction in (SignalDirection.SELL, SignalDirection.STRONG_SELL):
        price_target = round(base_price * rng.uniform(0.82, 0.95), 2)
        stop_loss = round(base_price * rng.uniform(1.03, 1.08), 2)
    else:
        price_target = None
        stop_loss = None

    return TradingSignal(
        id=str(uuid.uuid4()),
        ticker=resolved,
        direction=direction,
        confidence=confidence,
        price_target=price_target,
        stop_loss=stop_loss,
        time_horizon=rng.choice(["1d", "1w", "2w", "1m"]),
        reasoning=reasoning,
        source=source_prefix,
        generated_at=datetime.now(UTC),
        agents_consensus={
            "fundamentals": rng.choice(["Bullish — strong FCF growth", "Neutral — mixed signals", "Bearish — declining margins"]),
            "sentiment":    rng.choice(["Positive news flow", "Mixed media coverage", "Negative social sentiment"]),
            "technicals":   rng.choice(["RSI breakout above 200-DMA", "Consolidation — no clear trend", "Death cross forming"]),
            "news":         rng.choice(["Positive earnings surprise", "No major catalysts", "Regulatory headwind"]),
            "risk":         rng.choice(["Low VaR, proceed", "Moderate risk, size down", "High volatility — stand aside"]),
        },
    )


# ---------------------------------------------------------------------------
# Pydantic request model for batch endpoint
# ---------------------------------------------------------------------------

class BatchSignalRequest(BaseModel):
    tickers: list[str] = Field(..., description="List of ticker symbols (max 10)")
    fast_mode: bool = Field(True, description="Use fast demo mode (always true for batch)")


# ---------------------------------------------------------------------------
# Routes — specific paths first, then parametric
# ---------------------------------------------------------------------------

@router.post(
    "/generate",
    response_model=TradingSignal,
    summary="Generate AI trading signal for a ticker",
    responses={422: {"model": ErrorResponse}, 429: {"description": "Rate limit or quota exceeded"}, 500: {"model": ErrorResponse}},
)
@limiter.limit("5/minute")
async def generate_trading_signal(
    request: Request,
    req: SignalRequest,
    current_user: Optional[UserInfo] = Depends(get_current_user_optional),
) -> TradingSignal:
    """
    Run TradingAgents multi-agent pipeline to produce a buy/sell/hold signal.

    - Uses Claude Sonnet (deep analysis) by default
    - Set `fast_mode=true` to use Claude Haiku for quick turnaround
    - Results are cached per ticker+date to avoid redundant API calls
    - Falls back to a neutral HOLD placeholder if TradingAgents repo or API
      key is unavailable, rather than raising a hard 500 error
    - Authenticated users get their plan's daily quota; unauthenticated callers
      are subject to the free-plan limit (3 signals/day)
    """
    await _check_signal_quota(current_user)

    cache_key = f"{req.ticker.upper()}:{req.analysis_date}:{req.fast_mode}"
    if cache_key in _signal_cache:
        logger.info("Cache hit for signal %s", cache_key)
        return _signal_cache[cache_key]

    try:
        signal = await generate_signal(
            ticker=req.ticker,
            analysis_date=req.analysis_date,
            fast_mode=req.fast_mode,
        )
        _signal_cache[cache_key] = signal
        _store_signal(signal)
        caller_id = current_user.username if current_user else "anon"
        await _persist_signal_to_db(signal, user_id=caller_id)
        _fire_webhook("signal.generated", {
            "id": signal.id,
            "ticker": signal.ticker,
            "direction": signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
            "confidence": signal.confidence,
            "source": signal.source,
        })
        asyncio.create_task(_notify_telegram_signal(signal, username=caller_id if current_user else None))
        return signal
    except FileNotFoundError as e:
        logger.warning("TradingAgents repo not found: %s", e)
        return TradingSignal(
            id=str(uuid.uuid4()),
            ticker=req.ticker.upper(),
            direction=SignalDirection.HOLD,
            confidence=0.0,
            reasoning="TradingAgents-Repository nicht gefunden. TauricResearch/TradingAgents klonen und TRADINGAGENTS_PATH setzen.",
            source="TradingAgents[missing_repo]",
            generated_at=datetime.now(UTC),
        )
    except PermissionError as e:
        logger.warning("API key missing or invalid: %s", e)
        return TradingSignal(
            id=str(uuid.uuid4()),
            ticker=req.ticker.upper(),
            direction=SignalDirection.HOLD,
            confidence=0.0,
            reasoning="Anthropic API-Key nicht konfiguriert. Bitte ANTHROPIC_API_KEY setzen und neu starten.",
            source="TradingAgents[no_api_key]",
            generated_at=datetime.now(UTC),
        )
    except Exception as e:
        logger.error("Signal generation failed: %s", e)
        error_msg = str(e)
        is_api_key_error = any(
            kw in error_msg.lower()
            for kw in ("api key", "authentication", "401", "403", "unauthorized")
        )
        if is_api_key_error:
            return TradingSignal(
                id=str(uuid.uuid4()),
                ticker=req.ticker.upper(),
                direction=SignalDirection.HOLD,
                confidence=0.0,
                reasoning="API-Key ungültig oder nicht gesetzt. Zum Testen ohne Key: /api/signals/demo verwenden.",
                source="TradingAgents[auth_error]",
                generated_at=datetime.now(UTC),
            )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post(
    "/demo",
    response_model=TradingSignal,
    summary="Generate a mock trading signal (no API key required)",
    responses={422: {"model": ErrorResponse}},
)
@limiter.limit("30/minute")
async def generate_demo_signal(request: Request, ticker: Optional[str] = None) -> TradingSignal:
    """
    Returns a realistic mock trading signal without calling any external API.

    Intended for:
    - UI development and testing without a configured API key
    - Onboarding / demo environments
    - Frontend smoke-tests in CI

    The signal is deterministically seeded from the ticker name so repeated
    calls for the same ticker return the same direction (stable for tests).
    Responses are cached per ticker per day to avoid redundant DB writes.
    """
    resolved_ticker = (ticker or random.choice(_DEMO_TICKERS)).upper()
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    demo_key = f"{resolved_ticker}:{today}"

    # Evict stale entries from previous days (lazy cleanup — O(n) but n is tiny)
    stale = [k for k in list(_demo_cache) if not k.endswith(today)]
    for k in stale:
        del _demo_cache[k]

    if demo_key in _demo_cache:
        logger.debug("Demo cache hit for %s", resolved_ticker)
        return _demo_cache[demo_key]

    signal = _make_demo_signal(resolved_ticker, source_prefix="Demo[mock]")
    _demo_cache[demo_key] = signal

    # Cache it so GET /signals/{ticker} can find it
    _signal_cache[f"{resolved_ticker}:demo:False"] = signal

    # Persist to FIFO store and DB (only on first request per ticker per day)
    _store_signal(signal)
    await _persist_signal_to_db(signal)

    # Fire outbound webhook event
    _fire_webhook("signal.generated", {
        "id": signal.id,
        "ticker": signal.ticker,
        "direction": signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
        "confidence": signal.confidence,
        "source": signal.source,
    })
    asyncio.create_task(_notify_telegram_signal(signal))

    logger.info("Demo signal generated for %s -> %s (%.0f%%)", resolved_ticker, signal.direction.value, signal.confidence * 100)
    return signal


@router.post(
    "/batch",
    response_model=list[TradingSignal],
    summary="Generate demo signals for multiple tickers in parallel",
    responses={422: {"model": ErrorResponse}},
)
@limiter.limit("3/minute")
async def batch_generate_signals(request: Request, req: BatchSignalRequest) -> list[TradingSignal]:
    """
    POST /api/signals/batch

    Generate demo trading signals for up to 10 tickers in parallel using
    asyncio.gather. All signals are persisted to the in-memory store and SQLite.

    Request body:
    ```json
    {"tickers": ["AAPL", "MSFT", "NVDA"], "fast_mode": true}
    ```

    Returns a list of TradingSignal objects, one per ticker.
    Returns 422 if more than 10 tickers are requested.
    """
    if len(req.tickers) > 10:
        raise HTTPException(
            status_code=422,
            detail=f"Maximal 10 Ticker pro Batch-Anfrage, erhalten: {len(req.tickers)}.",
        )
    if not req.tickers:
        return []

    async def _gen_one(ticker: str) -> TradingSignal:
        signal = _make_demo_signal(ticker, source_prefix="Batch[demo]")
        _store_signal(signal)
        await _persist_signal_to_db(signal)
        return signal

    results: list[TradingSignal] = list(
        await asyncio.gather(*[_gen_one(t) for t in req.tickers])
    )
    logger.info("Batch signals generated for %d tickers", len(results))
    return results


@router.get(
    "/export",
    summary="Export signals as CSV",
    responses={200: {"content": {"text/csv": {}}}},
)
async def export_signals(current_user: UserInfo = Depends(get_current_user)) -> StreamingResponse:
    """
    Return the authenticated user's signals as a CSV file download.
    Reads from SQLite (preferred) or in-memory FIFO store as fallback.
    """
    output = io.StringIO()
    fieldnames = [
        "id", "ticker", "direction", "confidence",
        "price_target", "stop_loss", "time_horizon",
        "source", "generated_at", "reasoning",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    db_signals: list = []
    try:
        from sqlalchemy import select, desc
        from app.db.database import get_session
        from app.db.models import SignalRecord

        async with get_session() as session:
            result = await session.execute(
                select(SignalRecord)
                .where(SignalRecord.user_id == current_user.username)
                .order_by(desc(SignalRecord.generated_at))
            )
            db_signals = list(result.scalars().all())
    except Exception:
        pass

    if db_signals:
        for row in db_signals:
            writer.writerow({
                "id": row.id,
                "ticker": row.ticker,
                "direction": row.direction,
                "confidence": row.confidence,
                "price_target": row.price_target or "",
                "stop_loss": row.stop_loss or "",
                "time_horizon": row.time_horizon or "",
                "source": row.source,
                "generated_at": row.generated_at.isoformat(),
                "reasoning": (row.reasoning or "").replace("\n", " "),
            })
    else:
        user_signals = [s for s in _signal_store if True]  # in-memory store has no user filter
        for signal in sorted(user_signals, key=lambda s: s.generated_at, reverse=True):
            writer.writerow({
                "id": signal.id,
                "ticker": signal.ticker,
                "direction": signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
                "confidence": signal.confidence,
                "price_target": signal.price_target or "",
                "stop_loss": signal.stop_loss or "",
                "time_horizon": signal.time_horizon or "",
                "source": signal.source,
                "generated_at": signal.generated_at.isoformat(),
                "reasoning": (signal.reasoning or "").replace("\n", " "),
            })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=signals.csv"},
    )


@router.get(
    "/",
    response_model=list[TradingSignal],
    summary="List stored signals with optional filters",
)
async def list_signals(
    limit: int = 20,
    offset: int = 0,
    ticker: Optional[str] = None,
    direction: Optional[str] = None,
) -> list[TradingSignal]:
    """
    Return signals from SQLite (preferred) or the in-memory FIFO store.
    Sorted newest first.

    Query params:
    - ticker    — filter by ticker symbol (case-insensitive), e.g. ?ticker=AAPL
    - direction — filter by direction (BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL)
    - limit     — max results (default 20)
    - offset    — pagination offset (default 0)
    """
    ticker_upper    = ticker.upper().strip()    if ticker    else None
    direction_upper = direction.upper().strip() if direction else None

    try:
        from sqlalchemy import select, desc
        from app.db.database import get_session
        from app.db.models import SignalRecord

        async with get_session() as session:
            q = select(SignalRecord).order_by(desc(SignalRecord.generated_at))
            if ticker_upper:
                q = q.where(SignalRecord.ticker == ticker_upper)
            if direction_upper:
                q = q.where(SignalRecord.direction == direction_upper)
            q = q.offset(offset).limit(limit)

            result = await session.execute(q)
            rows = result.scalars().all()

        if rows:
            out = []
            for row in rows:
                out.append(TradingSignal(
                    id=row.id,
                    ticker=row.ticker,
                    direction=SignalDirection(row.direction),
                    confidence=row.confidence,
                    reasoning=row.reasoning,
                    source=row.source,
                    generated_at=row.generated_at,
                    agents_consensus=row.agents_consensus_as_dict() or None,
                    price_target=row.price_target,
                    stop_loss=row.stop_loss,
                    time_horizon=row.time_horizon,
                ))
            return out
    except Exception as db_err:
        logger.debug("signals_db_read_fallback reason=%s", str(db_err))

    # Fallback: in-memory store
    signals = list(_signal_store) if _signal_store else list(_signal_cache.values())
    signals = sorted(signals, key=lambda s: s.generated_at, reverse=True)

    if ticker_upper:
        signals = [s for s in signals if s.ticker == ticker_upper]
    if direction_upper:
        signals = [
            s for s in signals
            if (s.direction.value if hasattr(s.direction, "value") else str(s.direction)).upper() == direction_upper
        ]

    return signals[offset: offset + limit]


@router.get(
    "/trending",
    summary="Top tickers by signal count in the last 24 hours",
)
async def get_trending_tickers(limit: int = 10) -> list[dict]:
    """
    GET /api/signals/trending?limit=10

    Returns the most-analyzed tickers from the last 24 hours,
    with their dominant direction and signal count.
    """
    from datetime import timedelta
    from sqlalchemy import select, func, desc
    from app.db.database import get_session
    from app.db.models import SignalRecord

    cutoff = datetime.now(UTC) - timedelta(hours=24)
    try:
        async with get_session() as session:
            result = await session.execute(
                select(
                    SignalRecord.ticker,
                    func.count(SignalRecord.id).label("count"),
                    func.avg(SignalRecord.confidence).label("avg_conf"),
                )
                .where(SignalRecord.generated_at >= cutoff)
                .group_by(SignalRecord.ticker)
                .order_by(desc("count"))
                .limit(limit)
            )
            rows = result.all()

        if not rows:
            return [
                {"ticker": t, "count": 1, "avg_confidence": 0.72, "trending": True}
                for t in ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD"][:limit]
            ]

        return [
            {
                "ticker": row.ticker,
                "count": row.count,
                "avg_confidence": round(float(row.avg_conf or 0), 4),
                "trending": row.count >= 2,
            }
            for row in rows
        ]
    except Exception:
        return []


@router.get(
    "/total",
    summary="Total signals generated (all time, public) — for social proof",
)
async def get_signal_total() -> dict:
    """GET /api/signals/total — Returns all-time signal count. No auth required."""
    from sqlalchemy import func, select
    from app.db.database import get_session
    from app.db.models import SignalRecord

    try:
        async with get_session() as session:
            result = await session.execute(select(func.count()).select_from(SignalRecord))
            total = result.scalar_one()
        return {"total": total}
    except Exception:
        return {"total": 0}


@router.get(
    "/stats",
    summary="Daily signal statistics — counts by direction",
)
async def get_signal_stats() -> dict:
    """
    GET /api/signals/stats

    Returns today's signal counts broken down by direction,
    plus total count. Useful for the Dashboard 'Signals Today' widget.
    """
    from datetime import date, timedelta
    from sqlalchemy import select, func
    from app.db.database import get_session
    from app.db.models import SignalRecord

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=UTC)
    try:
        async with get_session() as session:
            result = await session.execute(
                select(SignalRecord.direction, func.count(SignalRecord.id).label("count"))
                .where(SignalRecord.generated_at >= today_start)
                .group_by(SignalRecord.direction)
            )
            rows = result.all()

        counts: dict[str, int] = {}
        total = 0
        for row in rows:
            d = (row.direction or "HOLD").upper()
            counts[d] = row.count
            total += row.count

        buy_total = sum(v for k, v in counts.items() if "BUY" in k)
        sell_total = sum(v for k, v in counts.items() if "SELL" in k)
        hold_total = counts.get("HOLD", 0)

        return {
            "total_today": total,
            "buy": buy_total,
            "sell": sell_total,
            "hold": hold_total,
            "by_direction": counts,
            "date": date.today().isoformat(),
        }
    except Exception:
        return {"total_today": 0, "buy": 0, "sell": 0, "hold": 0, "by_direction": {}, "date": date.today().isoformat()}


@router.get(
    "/performance",
    summary="Signal performance tracking — avg return, win rate, best/worst",
    response_model=SignalPerformanceResponse,
)
async def get_signal_performance() -> SignalPerformanceResponse:
    """
    GET /api/signals/performance

    Aggregates SignalPerformance records (evaluated daily).
    """
    _empty = SignalPerformanceResponse(
        avg_return=0.0,
        win_rate=0.0,
        best_signal=None,
        worst_signal=None,
        total_evaluated=0,
    )
    try:
        from sqlalchemy import select
        from app.db.database import get_session
        from app.db.models import SignalPerformance

        async with get_session() as session:
            result = await session.execute(select(SignalPerformance).order_by(SignalPerformance.evaluated_at.desc()))
            all_rows = result.scalars().all()

        if not all_rows:
            return _empty

        # Dedup by signal_id — keep most-recent evaluation per signal
        seen: set[str] = set()
        rows = []
        for r in all_rows:
            if r.signal_id not in seen:
                seen.add(r.signal_id)
                rows.append(r)

        returns = [r.return_pct for r in rows]
        avg_return = round(sum(returns) / len(returns), 4)
        win_rate = round(sum(1 for r in returns if r > 0) / len(returns), 4)

        best = max(rows, key=lambda r: r.return_pct)
        worst = min(rows, key=lambda r: r.return_pct)

        return SignalPerformanceResponse(
            avg_return=avg_return,
            win_rate=win_rate,
            best_signal=SignalPerformanceEntry(
                signal_id=best.signal_id,
                ticker=best.ticker,
                direction=best.direction,
                return_pct=round(best.return_pct, 4),
            ),
            worst_signal=SignalPerformanceEntry(
                signal_id=worst.signal_id,
                ticker=worst.ticker,
                direction=worst.direction,
                return_pct=round(worst.return_pct, 4),
            ),
            total_evaluated=len(rows),
        )
    except Exception as exc:
        logger.error("signal_performance_error: %s", exc)
        return _empty


class _TickerPerfEntry(BaseModel):
    ticker: str
    total: int
    wins: int
    win_rate: float
    avg_return: float

class _TickerPerformanceResponse(BaseModel):
    tickers: list[_TickerPerfEntry]


@router.get(
    "/performance/by-ticker",
    summary="Per-ticker win rate and average return (public)",
)
async def get_performance_by_ticker() -> _TickerPerformanceResponse:
    """Returns top-10 tickers ranked by win rate (min 2 evaluated signals)."""
    try:
        from collections import defaultdict as _dd
        from sqlalchemy import select as _sel
        from app.db.database import get_session
        from app.db.models import SignalPerformance

        async with get_session() as session:
            result = await session.execute(
                _sel(SignalPerformance).order_by(SignalPerformance.evaluated_at.desc())
            )
            all_rows = result.scalars().all()

        if not all_rows:
            return _TickerPerformanceResponse(tickers=[])

        seen: set[str] = set()
        rows = []
        for r in all_rows:
            if r.signal_id not in seen:
                seen.add(r.signal_id)
                rows.append(r)

        ticker_returns: dict[str, list[float]] = _dd(list)
        for r in rows:
            ticker_returns[r.ticker].append(r.return_pct)

        entries: list[_TickerPerfEntry] = []
        for ticker, rets in ticker_returns.items():
            if len(rets) < 2:
                continue
            wins = sum(1 for r in rets if r > 0)
            entries.append(_TickerPerfEntry(
                ticker=ticker,
                total=len(rets),
                wins=wins,
                win_rate=round(wins / len(rets), 4),
                avg_return=round(sum(rets) / len(rets), 4),
            ))

        entries.sort(key=lambda e: (e.win_rate, e.avg_return), reverse=True)
        return _TickerPerformanceResponse(tickers=entries[:10])
    except Exception as exc:
        logger.error("performance_by_ticker_error: %s", exc)
        return _TickerPerformanceResponse(tickers=[])


@router.get(
    "/performance/mine",
    response_model=SignalPerformanceResponse,
    summary="Personal signal performance for authenticated user",
)
@limiter.limit("60/minute")
async def get_my_performance(
    request: Request,
    user: Optional[UserInfo] = Depends(get_current_user_optional),
) -> SignalPerformanceResponse:
    """Returns performance stats for signals generated by the authenticated user."""
    _empty = SignalPerformanceResponse(
        avg_return=0.0, win_rate=0.0,
        best_signal=None, worst_signal=None, total_evaluated=0,
    )
    if not user:
        return _empty
    try:
        from sqlalchemy import select as _sel
        from app.db.database import get_session
        from app.db.models import SignalPerformance, SignalRecord

        async with get_session() as session:
            sig_result = await session.execute(
                _sel(SignalRecord.id).where(SignalRecord.user_id == user.username)
            )
            user_signal_ids: set[str] = {row[0] for row in sig_result.all()}

            if not user_signal_ids:
                return _empty

            perf_result = await session.execute(
                _sel(SignalPerformance)
                .where(SignalPerformance.signal_id.in_(user_signal_ids))
                .order_by(SignalPerformance.evaluated_at.desc())
            )
            all_rows = perf_result.scalars().all()

        if not all_rows:
            return _empty

        seen: set[str] = set()
        rows = []
        for r in all_rows:
            if r.signal_id not in seen:
                seen.add(r.signal_id)
                rows.append(r)

        returns = [r.return_pct for r in rows]
        avg_return = round(sum(returns) / len(returns), 4)
        win_rate = round(sum(1 for r in returns if r > 0) / len(returns), 4)
        best = max(rows, key=lambda r: r.return_pct)
        worst = min(rows, key=lambda r: r.return_pct)

        return SignalPerformanceResponse(
            avg_return=avg_return,
            win_rate=win_rate,
            best_signal=SignalPerformanceEntry(
                signal_id=best.signal_id, ticker=best.ticker,
                direction=best.direction, return_pct=round(best.return_pct, 4),
            ),
            worst_signal=SignalPerformanceEntry(
                signal_id=worst.signal_id, ticker=worst.ticker,
                direction=worst.direction, return_pct=round(worst.return_pct, 4),
            ),
            total_evaluated=len(rows),
        )
    except Exception as exc:
        logger.error("my_performance_error: %s", exc)
        return _empty


@router.get(
    "/history",
    summary="User signal history from DB",
)
@limiter.limit("60/minute")
async def get_signal_history(
    request: Request,
    limit: int = 10,
    user: Optional[UserInfo] = Depends(get_current_user_optional),
) -> list[dict]:
    """Return the authenticated user's last N signals from the database, newest first."""
    if not user:
        return []
    limit = max(1, min(limit, 50))
    try:
        from sqlalchemy import select, desc
        from app.db.database import get_session
        from app.db.models import SignalRecord

        async with get_session() as session:
            result = await session.execute(
                select(SignalRecord)
                .where(SignalRecord.user_id == user.username)
                .order_by(desc(SignalRecord.generated_at))
                .limit(limit)
            )
            rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "ticker": r.ticker,
                "direction": r.direction,
                "confidence": r.confidence,
                "source": r.source,
                "generated_at": r.generated_at.isoformat(),
                "reasoning": r.reasoning,
                "price_target": r.price_target,
                "stop_loss": r.stop_loss,
                "time_horizon": r.time_horizon,
            }
            for r in rows
        ]
    except Exception:
        return []


@router.get(
    "/by-id/{signal_id}",
    response_model=Optional[TradingSignal],
    summary="Get a specific signal by its UUID (public, no auth required)",
)
@limiter.limit("20/minute")
async def get_signal_by_id(request: Request, signal_id: str) -> Optional[TradingSignal]:
    """
    GET /api/signals/by-id/{signal_id}

    Looks up a signal by its UUID, first from in-memory cache/store,
    then from the DB. Used by the public signal share page.
    Returns null if not found (404 not raised to avoid enumeration).
    """
    # Search in-memory store first
    for sig in list(_signal_store):
        if sig.id == signal_id:
            return sig
    for sig in _signal_cache.values():
        if sig.id == signal_id:
            return sig

    # Fall back to DB lookup
    try:
        from sqlalchemy import select as _select
        from app.db.database import get_session
        from app.db.models import SignalRecord
        async with get_session() as session:
            result = await session.execute(
                _select(SignalRecord).where(SignalRecord.id == signal_id)
            )
            row = result.scalar_one_or_none()
        if row:
            return TradingSignal(
                id=row.id,
                ticker=row.ticker,
                direction=SignalDirection(row.direction),
                confidence=row.confidence,
                reasoning=row.reasoning,
                source=row.source,
                generated_at=row.generated_at,
                agents_consensus=row.agents_consensus_as_dict() or None,
                price_target=row.price_target,
                stop_loss=row.stop_loss,
                time_horizon=row.time_horizon,
            )
    except Exception:
        pass
    return None


@router.delete(
    "/cache",
    response_model=ClearCacheResponse,
    summary="Clear signal cache",
)
async def clear_cache(_: UserInfo = Depends(get_current_user)) -> ClearCacheResponse:
    """Clear the in-memory signal cache. Requires authentication."""
    count = len(_signal_cache)
    _signal_cache.clear()
    return ClearCacheResponse(cleared=count, message=f"{count} gecachte Signale gelöscht")


@router.get(
    "/{ticker}",
    response_model=Optional[TradingSignal],
    summary="Get latest cached signal for a ticker",
)
async def get_signal(ticker: str) -> Optional[TradingSignal]:
    """
    Return the most recently generated signal for a ticker from cache.
    Returns null if no signal has been generated yet.
    """
    ticker = ticker.upper()
    matches = {k: v for k, v in _signal_cache.items() if v.ticker == ticker}
    if not matches:
        return None
    return max(matches.values(), key=lambda s: s.generated_at)
