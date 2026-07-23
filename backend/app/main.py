"""
Trading Dashboard — FastAPI Application Entry Point
----------------------------------------------------
Central orchestrator API for all 9 trading repos.

Architecture:
  REST  → analysis, backtesting, signal generation
  WS    → live prices, portfolio updates, alerts, new signals

Run with:
  uvicorn app.main:app --reload --port 8000
"""
import asyncio
import os
import time
from contextlib import asynccontextmanager

import structlog
from structlog.stdlib import LoggerFactory

from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import (
    settings,
    jwt_key_is_secure,
    is_hardened_environment,
    demo_password_is_default,
    stripe_webhook_secret_missing,
)
from app.core.rate_limits import limiter
from app.api.routes import health, signals, portfolio, sentiment, backtest, execution, risk, alerts, webhooks, analysis, waitlist, portfolio_mgmt, p2p, fints_routes, learning, billing, telegram, settings as settings_routes, brokers, admin, report, legal
from app.api import auth
from app.websocket.manager import ws_manager

# ---------------------------------------------------------------------------
# Structured Logging — JSON in production, pretty-console in development
# ---------------------------------------------------------------------------
_is_development = os.getenv("ENVIRONMENT", "development").lower() == "development"

from app.core.log_redaction import redact_processor as _redact_processor

_shared_processors = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
    # F-24: scrub tokens/cookies/passwords/keys from every event before render.
    _redact_processor,
]

if _is_development:
    structlog.configure(
        processors=[
            *_shared_processors,  # type: ignore[list-item]
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=LoggerFactory(),
        cache_logger_on_first_use=True,
    )
else:
    structlog.configure(
        processors=[
            *_shared_processors,  # type: ignore[list-item]
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=LoggerFactory(),
        cache_logger_on_first_use=True,
    )

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# RequestCounterMiddleware — counts requests & measures response time
# ---------------------------------------------------------------------------

class RequestCounterMiddleware(BaseHTTPMiddleware):
    """
    Lightweight middleware that:
    1. Increments a global request counter for every HTTP call.
    2. Measures wall-clock response time and accumulates it for avg computation.

    Uses the module-level helpers in app.api.routes.health to avoid circular
    imports at startup.
    """

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        try:
            from app.api.routes.health import record_request
            record_request(duration_ms)
        except Exception:
            pass   # Never crash the request over metrics
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # HSTS + baseline CSP (P2 audit finding). Applied only in hardened envs:
        # local http dev is unaffected AND the interactive /docs (Swagger UI,
        # served only off-prod) keeps its CDN assets. This JSON API serves no
        # first-party HTML/JS in production, so a strict CSP that forbids all
        # embedding and active content is safe there (the Next.js frontend ships
        # its own CSP).
        if is_hardened_environment():
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            )
        return response


# ---------------------------------------------------------------------------
# BodySizeLimitMiddleware — reject oversized request bodies early (F-23 / DoS)
# ---------------------------------------------------------------------------
import os as _os

# Max accepted request body in bytes (default 1 MiB). JSON APIs never need more;
# oversized payloads are a cheap DoS vector. Override via MAX_REQUEST_BODY_BYTES.
try:
    _MAX_BODY_BYTES = int(_os.getenv("MAX_REQUEST_BODY_BYTES", str(1024 * 1024)))
except ValueError:
    _MAX_BODY_BYTES = 1024 * 1024


# F-17: WebSocket inbound-message limits (per connection).
try:
    _WS_MAX_MESSAGE_BYTES = int(_os.getenv("WS_MAX_MESSAGE_BYTES", "4096"))
except ValueError:
    _WS_MAX_MESSAGE_BYTES = 4096
try:
    _WS_MAX_MESSAGES_PER_MIN = int(_os.getenv("WS_MAX_MESSAGES_PER_MIN", "120"))
except ValueError:
    _WS_MAX_MESSAGES_PER_MIN = 120


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose declared Content-Length exceeds the limit with 413,
    before the body is read into memory (F-23 resource-limit hardening)."""

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl:
            try:
                if int(cl) > _MAX_BODY_BYTES:
                    from starlette.responses import JSONResponse
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request-Body zu groß"},
                    )
            except ValueError:
                pass
        return await call_next(request)


# Default watchlist for live price streaming — covers common user additions beyond the demo portfolio
_PRICE_WATCHLIST = [
    "AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD",
    "AMZN", "GOOGL", "META", "AMD", "NFLX",
    "ETH-USD", "SPY", "QQQ",
]


async def _notify_signal_win(user_id: str, ticker: str, direction: str, entry: float, current: float, return_pct: float) -> None:
    """Send a Telegram notification when a user's signal is evaluated as a win."""
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from app.services.telegram.client import send_message as tg_send, inline_keyboard, is_configured_async
        from app.core.config import settings as _settings
        from sqlalchemy import select

        if not await is_configured_async():
            return

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            chat = result.scalar_one_or_none()

        if not chat:
            return

        dir_label = {"BUY": "Kauf", "STRONG_BUY": "Starker Kauf", "SELL": "Verkauf", "STRONG_SELL": "Starker Verkauf"}.get(direction, direction)
        pct_str = f"+{return_pct * 100:.2f}%"
        msg = (
            f"🎯 <b>Signal-Win: {ticker}</b>\n\n"
            f"📈 {dir_label} — Rendite: <b>{pct_str}</b>\n"
            f"Einstieg: <code>{entry:.2f}</code> → Aktuell: <code>{current:.2f}</code>"
        )
        await tg_send(
            chat.chat_id,
            msg,
            reply_markup=inline_keyboard(
                [
                    {"text": "📊 Meine Performance", "url": f"{_settings.FRONTEND_URL}/performance"},
                    {"text": "🎯 Neues Signal generieren", "url": f"{_settings.FRONTEND_URL}/signals"},
                ]
            ),
        )
        logger.info("signal_win_notification_sent", user_id=user_id, ticker=ticker, return_pct=return_pct)
    except Exception as e:
        logger.warning("signal_win_notification_failed", user_id=user_id, reason=str(e))


# De-dup: "user_id:signal_ticker:YYYY-MM-DD" — one win email per ticker per day.
# Bounded so a long-lived process can't grow this marker set without limit.
from app.core.cache import BoundedDedupSet
_signal_win_email_sent: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)


async def _send_signal_win_email(user_id: str, ticker: str, direction: str, entry: float, current: float, return_pct: float) -> None:
    """Fire-and-forget: celebrate signal win via email with upgrade CTA."""
    from datetime import date as _date
    dedup_key = f"{user_id}:{ticker}:{_date.today().isoformat()}"
    if dedup_key in _signal_win_email_sent:
        return
    _signal_win_email_sent.add(dedup_key)

    try:
        from app.db.database import get_session
        from app.db.models import User
        from app.core.config import settings as _s
        from app.api.auth import _is_unsubscribed, _unsubscribe_url
        from sqlalchemy import select
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        if _is_unsubscribed(user_id):
            return
        if not _s.SMTP_HOST:
            logger.info("[DEV] Signal-win email would go to %s (%s +%.2f%%)", user_id, ticker, return_pct * 100)
            return

        async with get_session() as session:
            result = await session.execute(select(User).where(User.username == user_id))
            user = result.scalar_one_or_none()

        if not user or not user.email:
            return

        dir_label = {"BUY": "Kauf", "STRONG_BUY": "Starker Kauf", "SELL": "Verkauf", "STRONG_SELL": "Starker Verkauf"}.get(direction, direction)
        pct_str = f"+{return_pct * 100:.2f}%"
        upgrade_plan = "basic" if user.tier == "free" else "pro"
        upgrade_hint = ""
        if user.tier in ("free", "basic", "demo"):
            upgrade_hint = (
                f'<p style="margin:20px 0 0;padding:14px 18px;background:rgba(123,47,255,0.08);border:1px solid rgba(123,47,255,0.2);border-radius:10px;color:#94a3b8;font-size:13px">'
                f'Auf <strong style="color:#A78BFA">{upgrade_plan.capitalize()}</strong> upgraden für mehr Signale täglich — '
                f'<a href="{_s.FRONTEND_URL}/billing?plan={upgrade_plan}" style="color:#A78BFA;font-weight:700">Jetzt upgraden →</a>'
                f'</p>'
            )

        unsub_url = _unsubscribe_url(user_id)
        sender = _s.SMTP_FROM or _s.SMTP_USER
        html = (
            f'<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>'
            f'<body style="margin:0;padding:0;background:#080b14;font-family:\'Segoe UI\',Arial,sans-serif;color:#E2E8F0">'
            f'<div style="max-width:520px;margin:40px auto;padding:0 16px">'
            f'<div style="background:linear-gradient(135deg,rgba(0,212,255,0.07),rgba(0,255,136,0.07));border:1px solid rgba(0,255,136,0.2);border-radius:20px;padding:36px">'
            f'<p style="font-size:24px;font-weight:900;color:#00D4FF;margin:0 0 4px">Neural Trading OS</p>'
            f'<p style="font-size:12px;color:#475569;margin:0 0 28px;letter-spacing:2px">KI-SIGNAL AUSGEWERTET</p>'
            f'<h1 style="font-size:22px;font-weight:800;color:#fff;margin:0 0 6px">🎯 Dein Signal hat gewonnen!</h1>'
            f'<p style="color:#94a3b8;font-size:14px;margin:0 0 24px">Hallo <strong>{user_id}</strong>,</p>'
            f'<div style="background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.25);border-radius:14px;padding:20px;margin-bottom:22px">'
            f'<p style="font-size:36px;font-weight:900;color:#00FF88;margin:0 0 6px">{ticker} · {pct_str}</p>'
            f'<p style="font-size:14px;color:#94a3b8;margin:0">{dir_label} · Einstieg {entry:.2f} → Aktuell {current:.2f}</p>'
            f'</div>'
            f'<a href="{_s.FRONTEND_URL}/signals" style="display:block;text-align:center;background:linear-gradient(135deg,#00D4FF,#7B2FFF);color:#000;font-weight:900;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none">'
            f'Nächstes Signal generieren →</a>'
            f'{upgrade_hint}'
            f'<p style="text-align:center;margin:20px 0 0;font-size:11px;color:#334155">'
            f'Neural Trading OS · <a href="{_s.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a> · '
            f'<a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></div></body></html>'
        )
        text = f"Dein Signal {ticker} ({dir_label}) hat gewonnen: {pct_str}\nNächstes Signal: {_s.FRONTEND_URL}/signals"

        def _send_sync() -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"🎯 {ticker} {pct_str} — Dein KI-Signal hat gewonnen!"
            msg["From"] = sender
            msg["To"] = user.email
            msg["List-Unsubscribe"] = f"<{unsub_url}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(text, "plain", "utf-8"))
            msg.attach(MIMEText(html, "html", "utf-8"))
            with smtplib.SMTP(_s.SMTP_HOST, _s.SMTP_PORT) as srv:
                if _s.SMTP_HOST != "localhost":
                    srv.starttls()
                if _s.SMTP_USER:
                    srv.login(_s.SMTP_USER, _s.SMTP_PASSWORD or "")
                srv.sendmail(sender, [user.email], msg.as_string())

        await asyncio.to_thread(_send_sync)
        logger.info("signal_win_email_sent", user_id=user_id, ticker=ticker, return_pct=return_pct)
    except Exception as e:
        logger.debug("signal_win_email_failed", user_id=user_id, reason=str(e))


async def _signal_performance_loop() -> None:
    """
    Background task: runs daily at midnight UTC.
    Fetches signals from the last 7 days, computes current return vs entry price,
    and persists results in SignalPerformance table.
    """
    import math
    from datetime import timedelta

    while True:
        # Sleep until next midnight UTC
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        sleep_secs = (tomorrow - now).total_seconds()
        logger.info("signal_performance_loop_sleeping", seconds=int(sleep_secs))
        await asyncio.sleep(sleep_secs)

        try:
            from app.db.database import get_session
            from app.db.models import SignalRecord, SignalPerformance
            from sqlalchemy import select
            from datetime import datetime, timezone, timedelta as _timedelta
            import yfinance as yf

            now_utc = datetime.now(timezone.utc)
            # Only evaluate signals at least 24h old (T+1 price comparison)
            cutoff_old = now_utc - _timedelta(hours=24)
            cutoff_young = now_utc - _timedelta(days=7)

            async with get_session() as session:
                result = await session.execute(
                    select(SignalRecord).where(
                        SignalRecord.generated_at >= cutoff_young,
                        SignalRecord.generated_at <= cutoff_old,
                    )
                )
                signals = result.scalars().all()

                # Fetch already-evaluated signal IDs to avoid duplicates
                existing_result = await session.execute(select(SignalPerformance.signal_id))
                already_evaluated: set[str] = {row[0] for row in existing_result.all()}

            pending = [s for s in signals if s.id not in already_evaluated]
            logger.info("signal_performance_evaluating", total=len(signals), pending=len(pending))

            for sig in pending:
                try:
                    def _fetch_hist(ticker: str):
                        return yf.Ticker(ticker).history(period="1d")

                    hist = await asyncio.to_thread(_fetch_hist, sig.ticker)
                    if hist.empty:
                        continue
                    current_price = float(hist["Close"].iloc[-1])

                    gen_date = sig.generated_at.strftime("%Y-%m-%d") if hasattr(sig.generated_at, "strftime") else str(sig.generated_at)[:10]

                    def _fetch_entry(ticker: str, start: str):
                        import yfinance as _yf
                        from datetime import datetime as _dt, timedelta as _td
                        end = (_dt.strptime(start, "%Y-%m-%d") + _td(days=2)).strftime("%Y-%m-%d")
                        return _yf.Ticker(ticker).history(start=start, end=end)

                    entry_hist = await asyncio.to_thread(_fetch_entry, sig.ticker, gen_date)
                    entry_price = float(entry_hist["Close"].iloc[0]) if not entry_hist.empty else current_price

                    direction = (sig.direction or "HOLD").upper()
                    if direction in ("BUY", "STRONG_BUY"):
                        return_pct = (current_price - entry_price) / entry_price if entry_price else 0.0
                    elif direction in ("SELL", "STRONG_SELL"):
                        return_pct = (entry_price - current_price) / entry_price if entry_price else 0.0
                    else:
                        return_pct = 0.0

                    if math.isnan(return_pct) or math.isinf(return_pct):
                        return_pct = 0.0

                    async with get_session() as session:
                        perf = SignalPerformance(
                            signal_id=sig.id,
                            ticker=sig.ticker,
                            direction=direction,
                            entry_price=round(entry_price, 4),
                            current_price=round(current_price, 4),
                            return_pct=round(return_pct, 6),
                            evaluated_at=datetime.now(timezone.utc),
                        )
                        session.add(perf)
                        await session.commit()

                    # Self-learning feedback loop: feed the fresh outcome back into
                    # the knowledge base (online TradeLearning update + insight
                    # validation). Best-effort — never break the eval loop on it.
                    try:
                        from app.services.learning.trade_reviewer import process_new_performance
                        await process_new_performance(
                            signal_id=sig.id,
                            ticker=sig.ticker,
                            direction=direction,
                            return_pct=return_pct,
                            confidence=getattr(sig, "confidence", 0.5) or 0.5,
                            owner_username=sig.user_id,
                        )
                    except Exception as learn_err:
                        logger.warning("signal_learning_hook_failed", signal_id=sig.id, reason=str(learn_err))

                    # Telegram + email win-notification for signals with user_id
                    if sig.user_id and return_pct > 0.001:
                        asyncio.create_task(
                            _notify_signal_win(sig.user_id, sig.ticker, direction, entry_price, current_price, return_pct)
                        )
                        asyncio.create_task(
                            _send_signal_win_email(sig.user_id, sig.ticker, direction, entry_price, current_price, return_pct)
                        )

                except Exception as sig_err:
                    logger.warning("signal_performance_skip", signal_id=sig.id, reason=str(sig_err))

            logger.info("signal_performance_complete", evaluated=len(pending))

        except Exception as loop_err:
            logger.error("signal_performance_loop_error", reason=str(loop_err))


_SIGNAL_WATCHLIST = [
    # US Tech (core)
    "AAPL", "NVDA", "MSFT", "TSLA", "META", "AMD",
    # US Tech (extended)
    "GOOGL", "AMZN",
    # Crypto (high relevance in DE market)
    "BTC-USD", "ETH-USD",
    # ETFs / Indices
    "SPY", "QQQ",
]


async def _daily_signal_loop() -> None:
    """
    Background task: generate fresh Claude signals for the watchlist once per day.
    Runs at 15:00 UTC (US market open + 30 min). Uses fast (Haiku) mode to keep costs low.
    Only runs if ANTHROPIC_API_KEY is configured.
    """
    import os
    from datetime import datetime, timedelta, timezone
    from app.core.config import settings

    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=15, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        sleep_secs = (next_run - now).total_seconds()
        logger.info("daily_signal_loop_sleeping", seconds=int(sleep_secs))
        await asyncio.sleep(sleep_secs)

        if not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY.startswith("your-"):
            logger.info("daily_signal_skipped_no_api_key")
            continue

        try:
            from app.services.tradingagents.client import generate_signal
            from app.db.database import get_session
            from app.db.models import SignalRecord
            from datetime import date
            import json

            today = date.today().isoformat()
            generated = 0
            for ticker in _SIGNAL_WATCHLIST:
                try:
                    signal = await generate_signal(ticker, today, fast_mode=True)
                    async with get_session() as session:
                        record = SignalRecord(
                            id=signal.id,
                            ticker=signal.ticker,
                            direction=signal.direction.value,
                            confidence=signal.confidence,
                            reasoning=signal.reasoning,
                            source=signal.source,
                            generated_at=signal.generated_at,
                            agents_consensus=json.dumps(signal.agents_consensus) if signal.agents_consensus else None,
                            price_target=signal.price_target,
                            stop_loss=signal.stop_loss,
                            time_horizon=signal.time_horizon,
                        )
                        session.add(record)
                        await session.commit()
                    generated += 1
                    await asyncio.sleep(2)  # polite API pacing
                except Exception as sig_err:
                    logger.warning("daily_signal_ticker_failed", ticker=ticker, reason=str(sig_err))

            logger.info("daily_signal_loop_complete", generated=generated)

            if generated > 0:
                try:
                    from app.api.routes.telegram import send_daily_signal_digest
                    await send_daily_signal_digest()
                except Exception as tg_err:
                    logger.warning("daily_signal_digest_failed", reason=str(tg_err))

                try:
                    from app.api.routes.admin import run_daily_signal_email_notification_job
                    e_sent, e_skipped, e_failed = await run_daily_signal_email_notification_job(_SIGNAL_WATCHLIST)
                    logger.info("daily_signal_email_notification_done sent=%d skipped=%d failed=%d", e_sent, e_skipped, e_failed)
                except Exception as email_err:
                    logger.warning("daily_signal_email_notification_failed", reason=str(email_err))

        except Exception as loop_err:
            logger.error("daily_signal_loop_error", reason=str(loop_err))


async def _telegram_morning_briefing_loop() -> None:
    """
    Background task: send personalized morning briefing via Telegram at 07:30 UTC daily.
    Calls send_morning_briefings() which uses the same logic as the /briefing command.
    """
    from datetime import datetime, timedelta, timezone

    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=7, minute=30, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        sleep_secs = (next_run - now).total_seconds()
        logger.info("telegram_morning_briefing_sleeping seconds=%d", int(sleep_secs))
        await asyncio.sleep(sleep_secs)
        try:
            from app.api.routes.telegram import send_morning_briefings
            await send_morning_briefings()
        except Exception as e:
            logger.error("telegram_morning_briefing_error reason=%s", e)


async def _p2p_snapshot_loop() -> None:
    """
    Background task: save P2P snapshots once per day at 02:00 UTC.
    Skips if no credentials are configured (demo data would just duplicate).
    """
    import os
    from datetime import datetime, timedelta, timezone

    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=2, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        sleep_secs = (next_run - now).total_seconds()
        logger.info("p2p_snapshot_loop_sleeping", seconds=int(sleep_secs))
        await asyncio.sleep(sleep_secs)

        has_credentials = any([
            os.getenv("MINTOS_API_KEY", ""),
            os.getenv("BONDORA_API_KEY", ""),
            os.getenv("PEERBERRY_EMAIL", ""),
        ])
        if not has_credentials:
            logger.info("p2p_snapshot_skipped_no_credentials")
            continue

        try:
            from app.services.p2p import mintos as mintos_svc
            from app.services.p2p import bondora as bondora_svc
            from app.services.p2p import peerberry as peerberry_svc
            from app.db.database import get_session
            from app.db.models import P2PSnapshot
            from datetime import datetime as _dt, UTC

            mintos_data, bondora_data, peerberry_data = await asyncio.gather(
                mintos_svc.fetch_summary(),
                bondora_svc.fetch_summary(),
                peerberry_svc.fetch_summary(),
            )
            async with get_session() as session:
                for svc_data in [mintos_data, bondora_data, peerberry_data]:
                    d = svc_data.to_dict()
                    snap = P2PSnapshot(
                        platform=d["platform"],
                        total_invested=svc_data.total_invested,
                        outstanding_principal=svc_data.outstanding_principal,
                        interest_month=svc_data.interest_month,
                        total_interest=svc_data.total_interest,
                        defaulted_amount=svc_data.defaulted_amount,
                        cash_balance=svc_data.cash_balance,
                        net_annual_return=svc_data.net_annual_return,
                        num_active_loans=svc_data.num_active_loans,
                        currency=svc_data.currency,
                        fetched_at=_dt.now(UTC),
                    )
                    session.add(snap)
                await session.commit()
            logger.info("p2p_snapshot_saved_daily")
        except Exception as snap_err:
            logger.warning("p2p_snapshot_loop_error", reason=str(snap_err))


async def _price_stream_loop() -> None:
    """
    Background task: fetch current prices for the default watchlist every 10 s
    and broadcast them to all WebSocket subscribers on the 'prices' channel.

    Uses yfinance batch download (one HTTP call for all tickers) instead of
    sequential per-ticker calls — significantly faster for larger watchlists.
    """
    while True:
        try:
            import yfinance as yf
            import pandas as pd
            from datetime import datetime, UTC

            # Single batch download off the event loop — yfinance is synchronous I/O
            def _fetch_prices():
                return yf.download(
                    _PRICE_WATCHLIST,
                    period="2d",
                    interval="1d",
                    progress=False,
                    auto_adjust=True,
                )

            data = await asyncio.to_thread(_fetch_prices)

            prices: dict = {}
            if not data.empty and "Close" in data.columns:
                close = data["Close"]
                # Normalise to DataFrame regardless of single-vs-multi ticker
                if isinstance(close, pd.Series):
                    close = close.to_frame(name=_PRICE_WATCHLIST[0])
                elif isinstance(close.columns, pd.MultiIndex):
                    # Multi-index: flatten to (ticker,) columns
                    close = close.droplevel(0, axis=1) if close.columns.nlevels > 1 else close

                for ticker in _PRICE_WATCHLIST:
                    try:
                        series = close[ticker].dropna() if ticker in close.columns else pd.Series(dtype=float)
                        if len(series) < 1:
                            continue
                        current_price = float(series.iloc[-1])
                        prev_price = float(series.iloc[-2]) if len(series) >= 2 else current_price
                        change_pct = round((current_price - prev_price) / prev_price * 100, 2) if prev_price else 0.0
                        prices[ticker] = {
                            "price": round(current_price, 4),
                            "change_pct": change_pct,
                            "prev_close": round(prev_price, 4),
                        }
                    except Exception as ticker_err:
                        logger.debug("price_extract_skipped", ticker=ticker, reason=str(ticker_err))

            if prices:
                payload = {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "prices": prices,
                }
                await ws_manager.broadcast("prices", payload)
                logger.debug("price_broadcast_sent", tickers=list(prices.keys()))

        except Exception as err:
            logger.debug("price_stream_iteration_skipped", reason=str(err))

        await asyncio.sleep(10)


async def _auto_upgrade_nudge_loop() -> None:
    """Sends upgrade-nudge emails daily at 17:00 UTC to free/basic users active today."""
    from datetime import datetime, timedelta, timezone
    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=17, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            from app.api.routes.admin import run_bulk_upgrade_emails_job
            sent, skipped, failed = await run_bulk_upgrade_emails_job()
            logger.info("auto_upgrade_nudge_done sent=%d skipped=%d failed=%d", sent, skipped, failed)
        except Exception as exc:
            logger.error("auto_upgrade_nudge_loop_error reason=%s", exc)


async def _auto_reengagement_loop() -> None:
    """Sends re-engagement emails daily at 09:00 UTC to inactive free/basic users."""
    from datetime import datetime, timedelta, timezone
    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=9, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            from app.api.routes.admin import run_bulk_reengagement_emails_job
            sent, skipped, failed = await run_bulk_reengagement_emails_job()
            logger.info("auto_reengagement_done sent=%d skipped=%d failed=%d", sent, skipped, failed)
        except Exception as exc:
            logger.error("auto_reengagement_loop_error reason=%s", exc)


async def _auto_activation_followup_loop() -> None:
    """Daily at 10:00 UTC: send activation follow-up to users registered 24-48h ago without first signal."""
    from datetime import datetime, timedelta, timezone
    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=10, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            from app.api.routes.admin import run_activation_followup_job
            sent, skipped, failed = await run_activation_followup_job()
            logger.info("auto_activation_followup_done sent=%d skipped=%d failed=%d", sent, skipped, failed)
        except Exception as exc:
            logger.error("auto_activation_followup_loop_error reason=%s", exc)


async def _auto_weekly_digest_loop() -> None:
    """Sends personalized weekly performance digest every Monday at 08:00 UTC."""
    from datetime import datetime, timedelta, timezone
    while True:
        now = datetime.now(timezone.utc)
        # Monday = weekday 0; days_ahead = 0 if today is Monday before 08:00, else next Monday
        days_ahead = (7 - now.weekday()) % 7
        if days_ahead == 0 and now.hour >= 8:
            days_ahead = 7
        next_run = (now + timedelta(days=days_ahead)).replace(hour=8, minute=0, second=0, microsecond=0)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            from app.api.routes.admin import run_weekly_digest_job
            sent, skipped, failed = await run_weekly_digest_job()
            logger.info("auto_weekly_digest_done sent=%d skipped=%d failed=%d", sent, skipped, failed)
        except Exception as exc:
            logger.error("auto_weekly_digest_loop_error reason=%s", exc)


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifecycle.
    """
    logger.info(
        "trading_dashboard_startup",
        version=settings.APP_VERSION,
        environment=os.getenv("ENVIRONMENT", "development"),
    )

    is_production = is_hardened_environment()
    if not jwt_key_is_secure():
        if is_production:
            raise RuntimeError(
                "FATAL: JWT_SECRET_KEY is weak or uses the default value. "
                "Set a strong random secret (≥32 chars) in your .env / environment variables "
                "before starting in production. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        logger.warning(
            "jwt_secret_weak",
            hint="Set a strong JWT_SECRET_KEY (≥32 random chars) in .env before production",
        )

    # C3 — never boot a hardened deployment with the built-in demo/admin
    # credentials still set to their default value.
    if is_production and demo_password_is_default():
        raise RuntimeError(
            "FATAL: DEMO_PASSWORD is unset or uses a well-known default value while "
            f"ENVIRONMENT={os.getenv('ENVIRONMENT', 'development')!r}. The built-in demo/admin "
            "account would be exploitable. Either set a strong DEMO_PASSWORD via environment "
            "variable, or (recommended) leave it at the default and rely solely on registered "
            "users — the demo account is automatically disabled in production. This guard exists "
            "to prevent an accidental admin/neural123 login in production."
        )

    # APP_ENCRYPTION_KEY guard (C2): refuse to boot a hardened deployment
    # without an at-rest encryption key for stored credentials.
    if is_production:
        from app.core.crypto import encryption_key_configured
        if not encryption_key_configured():
            raise RuntimeError(
                "FATAL: APP_ENCRYPTION_KEY is not configured. Stored broker/API credentials "
                "would be written to the database in clear text. Generate a key with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
                "and set it as the APP_ENCRYPTION_KEY environment variable before starting."
            )

    # C4 — when Stripe billing is enabled (STRIPE_SECRET_KEY set) a hardened
    # deployment MUST also carry the webhook signing secret. Without it the
    # signature check in the /api/billing/webhook handler fails on every event,
    # so paid upgrades/downgrades silently never apply — a cash-critical, hard
    # to detect failure. Fail closed at boot instead.
    if is_production and stripe_webhook_secret_missing():
        raise RuntimeError(
            "FATAL: STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing while "
            f"ENVIRONMENT={os.getenv('ENVIRONMENT', 'development')!r}. Inbound Stripe "
            "webhooks are authenticated solely by their signature; without the signing "
            "secret every event is rejected and paid subscription changes never reach the "
            "database. Set STRIPE_WEBHOOK_SECRET (Stripe Dashboard → Developers → Webhooks → "
            "signing secret, 'whsec_...') before starting, or unset STRIPE_SECRET_KEY to run "
            "without billing."
        )

    # NOTE: Alembic migrations are intentionally NOT run here.
    # Migrations are applied exclusively in a controlled step (railway.toml
    # startCommand / a dedicated pre-deploy step), never on every app boot.
    # Running `alembic upgrade head` inside lifespan() duplicated the migration
    # run already triggered by startCommand and — because the NUMERIC money-math
    # migration takes an ACCESS EXCLUSIVE lock — could block or deadlock app
    # startup against the concurrent startCommand migration. The web process must
    # boot fast and serve traffic; schema changes are a separate, deliberate step.

    # Ensure all ORM-registered tables exist (safety net for SQLite dev/test environments
    # where Alembic may target a different relative path than the async engine)
    try:
        from app.db.database import create_all_tables
        await create_all_tables()
        logger.info("db_tables_ensured")
    except Exception as tbl_err:
        logger.warning("db_tables_ensure_failed", reason=str(tbl_err))

    # Promote INITIAL_ADMIN_USERNAME to admin role (idempotent — runs on every startup)
    if settings.INITIAL_ADMIN_USERNAME:
        try:
            from sqlalchemy import select
            from app.db.database import get_session
            from app.db.models import User
            async with get_session() as session:
                result = await session.execute(
                    select(User).where(User.username == settings.INITIAL_ADMIN_USERNAME)
                )
                user = result.scalar_one_or_none()
                if user and user.role != "admin":
                    user.role = "admin"
                    await session.commit()
                    logger.info("initial_admin_promoted", username=settings.INITIAL_ADMIN_USERNAME)
                elif user:
                    logger.info("initial_admin_already_set", username=settings.INITIAL_ADMIN_USERNAME)
                else:
                    logger.warning("initial_admin_not_found", username=settings.INITIAL_ADMIN_USERNAME)
        except Exception as admin_err:
            logger.warning("initial_admin_promotion_failed", reason=str(admin_err))

    # Restore email unsubscribe list from DB (DSGVO Art. 21 persistence across restarts)
    try:
        from app.db.database import get_session
        from app.db.models import User as _UserModel
        from sqlalchemy import select as _select
        from app.api.auth import _unsubscribed
        async with get_session() as _unsub_session:
            _unsub_result = await _unsub_session.execute(
                _select(_UserModel.username).where(_UserModel.email_unsubscribed == True)  # noqa: E712
            )
            for (_uname,) in _unsub_result.all():
                _unsubscribed.add(_uname)
        logger.info("unsubscribe_list_restored", count=len(_unsubscribed))
    except Exception as _unsub_err:
        logger.warning("unsubscribe_list_restore_failed", reason=str(_unsub_err))

    # Initialize execution client
    from app.services.nautilus.client import get_execution_client
    client = get_execution_client()
    await client.initialize()

    # Start background risk monitor (broadcasts WebSocket alerts every 30s)
    from app.api.routes.risk import start_risk_monitor
    risk_monitor_task = asyncio.create_task(start_risk_monitor())
    logger.info("risk_monitor_started")

    # Start live price streaming (broadcasts prices every 10s via WebSocket)
    price_stream_task = asyncio.create_task(_price_stream_loop())
    logger.info("price_stream_started")

    # Start daily signal performance tracker (runs at midnight UTC)
    signal_perf_task = asyncio.create_task(_signal_performance_loop())
    logger.info("signal_performance_tracker_started")

    # Start daily P2P snapshot (runs at 02:00 UTC — only when credentials set)
    p2p_snapshot_task = asyncio.create_task(_p2p_snapshot_loop())
    logger.info("p2p_snapshot_scheduler_started")

    # Start daily signal generation (runs at 15:00 UTC — only when API key set)
    daily_signal_task = asyncio.create_task(_daily_signal_loop())
    logger.info("daily_signal_generator_started")

    # Start Telegram morning briefing (runs at 07:30 UTC daily)
    morning_briefing_task = asyncio.create_task(_telegram_morning_briefing_loop())
    logger.info("telegram_morning_briefing_started")

    # Start auto upgrade nudge (runs at 17:00 UTC daily)
    auto_upgrade_task = asyncio.create_task(_auto_upgrade_nudge_loop())
    logger.info("auto_upgrade_nudge_loop_started")

    # Start auto re-engagement loop (runs at 09:00 UTC daily)
    auto_reengagement_task = asyncio.create_task(_auto_reengagement_loop())
    logger.info("auto_reengagement_loop_started")

    # Start auto weekly digest (runs every Monday at 08:00 UTC)
    auto_weekly_digest_task = asyncio.create_task(_auto_weekly_digest_loop())
    logger.info("auto_weekly_digest_loop_started")

    # Start activation follow-up loop (runs daily at 10:00 UTC)
    auto_activation_task = asyncio.create_task(_auto_activation_followup_loop())
    logger.info("auto_activation_followup_loop_started")

    # Start price alert checker (polls every 15s) — load from DB first
    from app.services.price_alerts.manager import get_alert_manager
    alert_manager = get_alert_manager()
    await alert_manager.load_from_db()
    alert_task = asyncio.create_task(alert_manager.run_checker())
    logger.info("price_alert_checker_started")

    # Start self-learning scheduler (YouTube daily + weekly trade review)
    from app.services.learning.scheduler import start_scheduler
    learning_scheduler = start_scheduler()
    logger.info("learning_scheduler_started")

    # Start 24/7 market scanner (ADR 0003). Idles unless SCANNER_ENABLED and an
    # Anthropic key are set — so this is a no-op cost-wise on a default deploy.
    from app.services.scanner.scan_loop import scanner_loop
    scanner_task = asyncio.create_task(scanner_loop())
    logger.info("market_scanner_started", enabled=settings.SCANNER_ENABLED)

    # Optional Kronos forecasting model warm-up (additive; no-op unless
    # KRONOS_ENABLED and the optional deps are installed). Scheduled as a
    # background task so a slow model load never delays app readiness.
    if settings.KRONOS_ENABLED:
        from app.services.scanner.forecast import warm_up as _kronos_warm_up
        asyncio.create_task(_kronos_warm_up())
        logger.info("kronos_warmup_scheduled", model=settings.KRONOS_MODEL)

    logger.info("api_ready", live_trading=settings.ENABLE_LIVE_TRADING)
    yield

    # Shutdown cleanup
    risk_monitor_task.cancel()
    try:
        await risk_monitor_task
    except asyncio.CancelledError:
        pass

    price_stream_task.cancel()
    try:
        await price_stream_task
    except asyncio.CancelledError:
        pass

    alert_task.cancel()
    try:
        await alert_task
    except asyncio.CancelledError:
        pass

    signal_perf_task.cancel()
    try:
        await signal_perf_task
    except asyncio.CancelledError:
        pass

    p2p_snapshot_task.cancel()
    try:
        await p2p_snapshot_task
    except asyncio.CancelledError:
        pass

    daily_signal_task.cancel()
    try:
        await daily_signal_task
    except asyncio.CancelledError:
        pass

    morning_briefing_task.cancel()
    try:
        await morning_briefing_task
    except asyncio.CancelledError:
        pass

    auto_upgrade_task.cancel()
    try:
        await auto_upgrade_task
    except asyncio.CancelledError:
        pass

    auto_reengagement_task.cancel()
    try:
        await auto_reengagement_task
    except asyncio.CancelledError:
        pass

    auto_weekly_digest_task.cancel()
    try:
        await auto_weekly_digest_task
    except asyncio.CancelledError:
        pass

    auto_activation_task.cancel()
    try:
        await auto_activation_task
    except asyncio.CancelledError:
        pass

    scanner_task.cancel()
    try:
        await scanner_task
    except asyncio.CancelledError:
        pass

    from app.services.learning.scheduler import stop_scheduler
    stop_scheduler(learning_scheduler)

    logger.info("trading_dashboard_shutdown")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## Trading Dashboard API

Central orchestrator for 9 specialized trading repos:
- **TradingAgents** — Multi-agent LLM signal generation
- **FinGPT** — News sentiment analysis
- **Jesse** — Crypto backtesting (300+ indicators)
- **Vibe-Trading** — Alpha factor backtesting (452 factors)
- **qlib** — ML portfolio management (Microsoft)
- **nautilus_trader** — High-performance order execution (15+ brokers)
- **AI-Trader** — Agent-native trading platform
- **FinRobot** — Fundamental analysis & reports
- **daily_stock_analysis** — Daily LLM stock analysis

All LLM calls use Anthropic Claude (Sonnet 4.6 for analysis, Haiku for fast tasks).
    """,
    # H4: expose interactive API docs only outside hardened environments.
    docs_url=None if is_hardened_environment() else "/docs",
    redoc_url=None if is_hardened_environment() else "/redoc",
    openapi_url=None if is_hardened_environment() else "/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiting — attach limiter to app state + middleware
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]  # slowapi handler signature
app.add_middleware(SlowAPIMiddleware)

# ---------------------------------------------------------------------------
# Request Counter + Timing Middleware
# ---------------------------------------------------------------------------
app.add_middleware(RequestCounterMiddleware)

# F-23: reject oversized request bodies early (DoS hardening).
app.add_middleware(BodySizeLimitMiddleware)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# F-16: single source of truth for the exact origin allow-list — shared by the
# CORS middleware, the WebSocket origin check, and the CSRF Origin/Referer check
# (app.api.auth._check_origin_allowlist). Exact-match only, no regex/suffix.
from app.core.config import cors_allowed_origins as _cors_allowed_origins
_cors_origins: list[str] = _cors_allowed_origins()
if is_hardened_environment() and not _cors_origins:
    logger.warning(
        "cors_no_production_origins",
        hint="Set ALLOWED_ORIGINS / PRODUCTION_URL / FRONTEND_URL to your real "
             "frontend origin(s); CORS will reject all cross-origin requests until then.",
    )

# Explicit method/header allow-lists instead of "*" (required anyway once
# allow_credentials=True is combined with concrete origins).
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-CSRF-Token"],
    max_age=600,
)

# ---------------------------------------------------------------------------
# Regulatory disclaimer header (P2 audit finding)
# ---------------------------------------------------------------------------
# Attach a "not investment advice" notice to every response so the
# disclaimer travels with the data regardless of which client consumes it.
# Header values must be latin-1 / ASCII-safe, so we use the EN short notice.
from app.core.disclaimer import DISCLAIMER_SHORT_EN as _DISCLAIMER_HEADER


@app.middleware("http")
async def _add_disclaimer_header(request, call_next):
    response = await call_next(request)
    response.headers["X-Legal-Disclaimer"] = _DISCLAIMER_HEADER
    return response


# ---------------------------------------------------------------------------
# REST Routes
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(signals.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(sentiment.router, prefix="/api")
app.include_router(backtest.router, prefix="/api")
app.include_router(execution.router, prefix="/api")
app.include_router(risk.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(waitlist.router, prefix="/api")
app.include_router(portfolio_mgmt.router, prefix="/api")
app.include_router(p2p.router, prefix="/api")
app.include_router(fints_routes.router, prefix="/api")
app.include_router(learning.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(telegram.router, prefix="/api")
app.include_router(settings_routes.router, prefix="/api")
app.include_router(brokers.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(legal.router, prefix="/api")


# ---------------------------------------------------------------------------
# WebSocket Endpoints
# ---------------------------------------------------------------------------
@app.websocket("/ws/{channel}")
async def websocket_endpoint(
    websocket: WebSocket,
    channel: str,
    token: str = Query(default=""),
):
    """
    WebSocket endpoint for real-time data streaming.

    Channels:
    - /ws/signals   — new AI trading signals
    - /ws/portfolio — portfolio value updates
    - /ws/sentiment — sentiment score updates
    - /ws/prices    — live price ticks
    - /ws/alerts    — risk alerts
    - /ws/all       — all events combined

    Auth (P1 audit finding — priority order):
    1. Sec-WebSocket-Protocol handshake header. Browsers can set this via
       `new WebSocket(url, [jwt])` — it's the only place a browser WebSocket
       client can attach a custom value without it landing in the request
       URL (and therefore in proxy/access logs and browser history).
    2. httpOnly `access_token` cookie — automatic for a browser already
       logged in via the REST API (same cookie as /api/auth/token).
    3. `?token=<jwt>` query param — DEPRECATED. Leaks the JWT into URLs
       (server logs, proxies, browser history). Kept only for backward
       compatibility with existing clients; logs a deprecation warning.
    """
    from app.api.auth import _verify_ws_token

    # Origin allow-list: browsers always send Origin on WebSocket handshakes;
    # a foreign origin means a cross-site page is opening the socket (CSWSH).
    # Non-browser clients (tests, monitoring) send no Origin and pass through —
    # they still have to present a valid token below.
    ws_origin = websocket.headers.get("origin", "").rstrip("/")
    if ws_origin and ws_origin not in _cors_origins:
        logger.warning("websocket_origin_rejected", origin=ws_origin, channel=channel)
        await websocket.close(code=1008)
        return

    protocol_token = websocket.headers.get("sec-websocket-protocol", "").split(",")[0].strip()
    cookie_token = websocket.cookies.get(settings.AUTH_COOKIE_NAME, "")
    resolved_token = protocol_token or cookie_token

    if not resolved_token and token:
        resolved_token = token
        logger.warning(
            "websocket_auth_via_query_param_deprecated",
            channel=channel,
        )

    # F-14/F-17: validate the token AND enforce server-side revocation
    # (is_active + token_version) before accepting the socket, and bind the
    # connection to its owning user for owner-scoped channels (price alerts).
    ws_username = await _verify_ws_token(resolved_token)
    if ws_username is None:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(
        websocket, channel, subprotocol=protocol_token or None, username=ws_username
    )
    try:
        # F-17: per-connection inbound message size + frequency limits. The
        # client only ever sends tiny "ping" keep-alives, so anything large or
        # high-rate is abuse; close with a policy/oversize code.
        import time as _time
        _win_start = _time.monotonic()
        _msg_count = 0
        while True:
            data = await websocket.receive_text()
            if len(data) > _WS_MAX_MESSAGE_BYTES:
                await websocket.close(code=1009)  # message too big
                await ws_manager.disconnect(websocket, channel)
                logger.warning("websocket_message_too_large", channel=channel, size=len(data))
                return
            now = _time.monotonic()
            if now - _win_start >= 60:
                _win_start = now
                _msg_count = 0
            _msg_count += 1
            if _msg_count > _WS_MAX_MESSAGES_PER_MIN:
                await websocket.close(code=1008)  # policy violation (flood)
                await ws_manager.disconnect(websocket, channel)
                logger.warning("websocket_message_flood", channel=channel)
                return
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, channel)
        logger.info("websocket_disconnected", channel=channel)


@app.websocket("/ws")
async def websocket_all(websocket: WebSocket, token: str = Query(default="")):
    """Default WebSocket — subscribes to all channels."""
    await websocket_endpoint(websocket, "all", token)


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/api/health",
        "mode": "live" if settings.ENABLE_LIVE_TRADING else "paper",
    }


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(
        "unhandled_exception",
        exc_type=type(exc).__name__,
        exc_msg=str(exc),
        path=str(request.url),
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Interner Serverfehler",
            "detail": str(exc) if settings.DEBUG else "Support kontaktieren",
        },
    )
