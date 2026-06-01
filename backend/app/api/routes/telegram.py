"""
/api/telegram — Telegram Bot notification management.

Endpoints:
  GET    /api/telegram/status     — Connection status for current user
  POST   /api/telegram/connect    — Generate connect code + bot link
  POST   /api/telegram/webhook    — Telegram webhook receiver (no auth)
  POST   /api/telegram/test       — Send test message
  DELETE /api/telegram/disconnect — Remove Telegram connection
"""
import asyncio
import logging
import random
import string
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.auth import get_current_user, UserInfo
from app.core.config import settings
from app.services.telegram.client import (
    get_bot_name,
    get_webhook_info,
    inline_keyboard,
    is_configured,
    is_configured_async,
    send_message,
    set_webhook,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["Telegram"])

# In-memory store: connect_code -> user_id
# Codes expire after 10 minutes (not enforced strictly — MVP)
_pending_codes: dict[str, str] = {}


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


# ---------------------------------------------------------------------------
# GET /api/telegram/status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Return Telegram connection status for the authenticated user."""
    user_id = current_user.username
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            chat = result.scalar_one_or_none()

        configured = await is_configured_async()
        webhook_info = await get_webhook_info() if configured else {"url": "", "pending_update_count": 0}
        return {
            "connected": chat is not None,
            "username": chat.username if chat else None,
            "configured": configured,
            "webhook_url": webhook_info.get("url", ""),
        }
    except Exception as e:
        logger.warning("telegram_status_error", extra={"reason": str(e)})
        return {"connected": False, "username": None, "configured": await is_configured_async(), "webhook_url": ""}


# ---------------------------------------------------------------------------
# POST /api/telegram/connect
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Generate a one-time connect code and return the bot deep-link."""
    user_id = current_user.username
    code = _generate_code()
    _pending_codes[code] = user_id

    configured = await is_configured_async()
    if not configured:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN nicht konfiguriert. Bitte zuerst in den Einstellungen setzen.")

    bot_name = await get_bot_name()
    bot_link = f"https://t.me/{bot_name}?start={code}"

    logger.info("telegram_connect_code_generated", extra={"user_id": user_id, "code": code})
    return {
        "bot_link": bot_link,
        "code": code,
        "configured": True,
    }


# ---------------------------------------------------------------------------
# POST /api/telegram/webhook  (no auth — called by Telegram)
# ---------------------------------------------------------------------------

async def _get_chat_by_chat_id(chat_id: str):
    """Return the TelegramChat row for a given Telegram chat_id, or None."""
    from app.db.database import get_session
    from app.db.models import TelegramChat
    from sqlalchemy import select
    try:
        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.chat_id == chat_id)
            )
            return result.scalar_one_or_none()
    except Exception:
        return None


async def _handle_help(chat_id: str) -> None:
    await send_message(chat_id, (
        "🤖 <b>Neural Trading OS Bot</b>\n\n"
        "Verfügbare Befehle:\n\n"
        "📋 /briefing — Tagesbriefing: deine heutigen Signale auf einen Blick\n\n"
        "📊 /signal &lt;TICKER&gt; — Demo-Signal für einen Ticker\n"
        "   Bsp: <code>/signal AAPL</code> oder <code>/signal BTC-USD</code>\n\n"
        "📈 /performance — Globale KI-Trefferquote und Top-Ticker\n\n"
        "🎯 /mystats — Deine persönliche KI-Performance\n\n"
        "👤 /status — Dein Plan und heutiger Signal-Verbrauch\n\n"
        "🔔 /alerts — Deine aktiven Kursalarme\n\n"
        "⬆️ /upgrade — Plan upgraden und Preise anzeigen\n\n"
        "🔗 /refer — Deinen persönlichen Einladungslink anzeigen\n\n"
        "❓ /help — Diese Hilfe\n\n"
        "🔕 /stop — Benachrichtigungen deaktivieren\n\n"
        f"<i>Vollständige KI-Analyse unter {settings.FRONTEND_URL}</i>"
    ))


async def _handle_refer(chat_id: str, user_id: str) -> None:
    import base64
    ref_code = base64.b64encode(user_id.encode()).decode()
    ref_url = f"{settings.FRONTEND_URL}/register?ref={ref_code}"
    tg_share_url = f"https://t.me/share/url?url={ref_url}&text=Ich%20nutze%20Neural%20Trading%20OS%20f%C3%BCr%20KI-Signale%20%E2%80%94%20kostenlos%20testen"
    await send_message(
        chat_id,
        (
            f"🔗 <b>Dein persönlicher Einladungslink</b>\n\n"
            f"<code>{ref_url}</code>\n\n"
            f"Wer sich darüber registriert, startet mit dem Free Plan — "
            f"3 KI-Signale täglich, Paper Trading und Elliott-Wave-Analyse."
        ),
        reply_markup=inline_keyboard(
            [{"text": "📤 Link teilen", "url": tg_share_url}],
            [{"text": "📊 Meine Referrals ansehen", "url": f"{settings.FRONTEND_URL}/account"}],
        ),
    )


async def _handle_signal(chat_id: str, ticker: str) -> None:
    ticker = ticker.upper().strip() or "AAPL"
    try:
        from app.db.database import get_session
        from app.db.models import SignalRecord
        from sqlalchemy import select
        from datetime import timezone as _tz, timedelta

        # Prefer a real platform signal (user_id IS NULL) from the last 24 hours
        cutoff = datetime.now(_tz.utc) - timedelta(hours=24)
        platform_sig = None
        try:
            async with get_session() as session:
                result = await session.execute(
                    select(SignalRecord)
                    .where(SignalRecord.ticker == ticker)
                    .where(SignalRecord.user_id.is_(None))
                    .where(SignalRecord.generated_at >= cutoff)
                    .order_by(SignalRecord.generated_at.desc())
                    .limit(1)
                )
                platform_sig = result.scalar_one_or_none()
        except Exception:
            pass

        dir_emoji = {"BUY": "🟢", "STRONG_BUY": "🚀", "SELL": "🔴", "STRONG_SELL": "🩸", "HOLD": "🟡"}.get

        if platform_sig:
            conf_pct = round((platform_sig.confidence or 0) * 100)
            emoji = dir_emoji(platform_sig.direction, "⚪")
            target_line = f"\n🎯 Kursziel: <b>${platform_sig.price_target:.2f}</b>" if platform_sig.price_target else ""
            stop_line = f"\n🛑 Stop-Loss: <b>${platform_sig.stop_loss:.2f}</b>" if platform_sig.stop_loss else ""
            reasoning_short = (platform_sig.reasoning or "")[:220].rstrip()
            if len(platform_sig.reasoning or "") > 220:
                reasoning_short += "…"
            age_min = int((datetime.now(_tz.utc) - platform_sig.generated_at).total_seconds() / 60)
            age_str = f"{age_min} Min." if age_min < 60 else f"{age_min // 60} Std."
            await send_message(
                chat_id,
                (
                    f"{emoji} <b>{ticker}</b> — {platform_sig.direction}\n"
                    f"Konfidenz: <b>{conf_pct}%</b> · vor {age_str}"
                    f"{target_line}{stop_line}\n\n"
                    f"<i>{reasoning_short}</i>\n\n"
                    f"🤖 <b>KI-Signal</b>"
                ),
                reply_markup=inline_keyboard(
                    [{"text": "📊 Eigenes Signal generieren", "url": f"{settings.FRONTEND_URL}/signals"}]
                ),
            )
        else:
            from app.api.routes.signals import _make_demo_signal
            sig = _make_demo_signal(ticker, source_prefix="Telegram[demo]")
            conf_pct = round((sig.confidence or 0) * 100)
            emoji = dir_emoji(sig.direction, "⚪")
            target_line = f"\n🎯 Kursziel: <b>${sig.price_target:.2f}</b>" if sig.price_target else ""
            stop_line = f"\n🛑 Stop-Loss: <b>${sig.stop_loss:.2f}</b>" if sig.stop_loss else ""
            reasoning_short = (sig.reasoning or "")[:200].rstrip()
            if len(sig.reasoning or "") > 200:
                reasoning_short += "…"
            await send_message(
                chat_id,
                (
                    f"{emoji} <b>{ticker}</b> — {sig.direction}\n"
                    f"Konfidenz: <b>{conf_pct}%</b>"
                    f"{target_line}{stop_line}\n\n"
                    f"<i>{reasoning_short}</i>\n\n"
                    f"⚠️ <b>Demo-Signal</b> — Noch kein KI-Signal für {ticker} heute."
                ),
                reply_markup=inline_keyboard(
                    [{"text": "⚡ Echtzeit-Analyse öffnen", "url": f"{settings.FRONTEND_URL}/signals"}]
                ),
            )
    except Exception as e:
        logger.warning("telegram_signal_cmd_error", extra={"reason": str(e)})
        await send_message(chat_id, f"Signal für {ticker} konnte nicht abgerufen werden.")


async def _handle_status(chat_id: str, user_id: str) -> None:
    try:
        from app.db.database import get_session
        from app.db.models import User, SignalRecord
        from sqlalchemy import select, func
        from datetime import timezone as _tz

        today_start = datetime.now(_tz.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        async with get_session() as session:
            user_result = await session.execute(select(User).where(User.username == user_id))
            user = user_result.scalar_one_or_none()
            signals_result = await session.execute(
                select(func.count(SignalRecord.id))
                .where(SignalRecord.user_id == user_id)
                .where(SignalRecord.generated_at >= today_start)
            )
            signals_today = signals_result.scalar() or 0

        if not user:
            await send_message(chat_id, "Benutzerkonto nicht gefunden.")
            return

        limits = {"free": 3, "basic": 10, "pro": 50, "institutional": -1}
        limit = limits.get(user.tier, 3)
        limit_str = "∞" if limit == -1 else str(limit)
        tier_emoji = {"free": "🆓", "basic": "⚡", "pro": "💎", "institutional": "🏛️"}.get(user.tier, "🆓")

        status_rows: list[list[dict]] = [
            [{"text": "📊 Signale generieren", "url": f"{settings.FRONTEND_URL}/signals"}],
        ]
        if user.tier not in ("institutional", "pro"):
            status_rows.append([{"text": "⬆️ Plan upgraden", "url": f"{settings.FRONTEND_URL}/billing"}])

        await send_message(
            chat_id,
            (
                f"👤 <b>{user.username}</b>\n\n"
                f"{tier_emoji} Plan: <b>{user.tier.capitalize()}</b>\n"
                f"📊 Signale heute: <b>{signals_today} / {limit_str}</b>"
            ),
            reply_markup={"inline_keyboard": status_rows},
        )
    except Exception as e:
        logger.warning("telegram_status_cmd_error", extra={"reason": str(e)})
        await send_message(chat_id, "Status konnte nicht abgerufen werden.")


async def _handle_alerts(chat_id: str, user_id: str) -> None:
    try:
        from app.services.price_alerts.manager import get_alert_manager
        mgr = get_alert_manager()
        all_alerts = await mgr.get_all_alerts()
        active = [a for a in all_alerts if a["status"] == "active" and a.get("username") == user_id]

        if not active:
            await send_message(chat_id, "🔔 Keine aktiven Kursalarme.\n\nIn der App unter <i>Einstellungen → Kursalarme</i> erstellen.")
            return

        lines = [f"🔔 <b>{len(active)} aktive{'r' if len(active) == 1 else ''} Kursalarm{'e' if len(active) > 1 else ''}</b>\n"]
        for a in active[:8]:
            cond = {"above": "über", "below": "unter", "change_pct": "Änderung ≥"}.get(a["condition"], a["condition"])
            lines.append(f"• <b>{a['ticker']}</b> {cond} {a['threshold']}")
        if len(active) > 8:
            lines.append(f"…und {len(active) - 8} weitere")

        await send_message(chat_id, "\n".join(lines))
    except Exception as e:
        logger.warning("telegram_alerts_cmd_error", extra={"reason": str(e)})
        await send_message(chat_id, "Kursalarme konnten nicht abgerufen werden.")


async def _handle_upgrade(chat_id: str, user_id: str) -> None:
    try:
        from app.db.database import get_session
        from app.db.models import User
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(select(User).where(User.username == user_id))
            user = result.scalar_one_or_none()

        if not user:
            await send_message(chat_id, "Benutzerkonto nicht gefunden.")
            return

        if user.tier == "institutional":
            await send_message(chat_id, (
                "🏛️ Du bist bereits auf dem höchsten Plan (<b>Institutional</b>).\n\n"
                "Unbegrenzte Signale, voller API-Zugang und Priority-Support."
            ))
            return

        tier_emoji = {"free": "🆓", "basic": "⚡", "pro": "💎"}.get(user.tier, "🆓")
        next_plan = {"free": ("Basic", "⚡", "€29/Monat", "10 Signale/Tag"), "basic": ("Pro", "💎", "€99/Monat", "50 Signale/Tag"), "pro": ("Institutional", "🏛️", "€299/Monat", "Unbegrenzte Signale")}.get(user.tier)

        billing_url = f"{settings.FRONTEND_URL}/billing"
        if next_plan:
            name, emoji, price, signals = next_plan
            await send_message(
                chat_id,
                (
                    f"{tier_emoji} Aktueller Plan: <b>{user.tier.capitalize()}</b>\n\n"
                    f"⬆️ Nächstes Upgrade: {emoji} <b>{name}</b> — {price}\n"
                    f"   {signals}"
                ),
                reply_markup=inline_keyboard(
                    [{"text": f"⬆️ Jetzt auf {name} upgraden", "url": billing_url}]
                ),
            )
        else:
            await send_message(chat_id, f"Plan-Optionen: <a href='{billing_url}'>Billing öffnen</a>")
    except Exception as e:
        logger.warning("telegram_upgrade_cmd_error", extra={"reason": str(e)})
        await send_message(chat_id, "Plan-Informationen konnten nicht abgerufen werden.")


async def _handle_briefing(chat_id: str, user_id: str) -> None:
    try:
        from app.db.database import get_session
        from app.db.models import User, SignalRecord
        from sqlalchemy import select, func
        from datetime import timezone as _tz

        today_start = datetime.now(_tz.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        async with get_session() as session:
            user_result = await session.execute(select(User).where(User.username == user_id))
            user = user_result.scalar_one_or_none()
            signals_result = await session.execute(
                select(SignalRecord)
                .where(SignalRecord.user_id == user_id)
                .where(SignalRecord.generated_at >= today_start)
                .order_by(SignalRecord.confidence.desc())
                .limit(5)
            )
            signals_today = signals_result.scalars().all()

        if not user:
            await send_message(chat_id, "Benutzerkonto nicht gefunden.")
            return

        limits = {"free": 3, "basic": 10, "pro": 50, "institutional": -1}
        limit = limits.get(user.tier, 3)
        used = len(signals_today)

        if not signals_today:
            remaining_str = "∞" if limit == -1 else str(limit)
            await send_message(
                chat_id,
                (
                    f"📋 <b>Dein Tagesbriefing</b>\n\n"
                    f"Heute noch keine Signale generiert.\n"
                    f"🎯 {remaining_str} Signal{'e' if limit != 1 else ''} verfügbar"
                ),
                reply_markup=inline_keyboard(
                    [{"text": "📊 Jetzt erstes Signal generieren", "url": f"{settings.FRONTEND_URL}/signals"}]
                ),
            )
            return

        dir_emoji = {"BUY": "🟢", "STRONG_BUY": "🚀", "SELL": "🔴", "STRONG_SELL": "🩸", "HOLD": "🟡"}
        lines = [f"📋 <b>Dein Tagesbriefing</b> — {today_start.strftime('%d.%m.%Y')}\n"]
        for sig in signals_today[:3]:
            emoji = dir_emoji.get(sig.direction, "⚪")
            conf = round((sig.confidence or 0) * 100)
            direction_label = sig.direction.replace("_", " ")
            target = f" · 🎯 ${sig.price_target:.0f}" if sig.price_target else ""
            lines.append(f"{emoji} <b>{sig.ticker}</b> — {direction_label} ({conf}%){target}")

        if limit == -1:
            remaining = -1
            lines.append(f"\n📊 {used} Signal{'e' if used != 1 else ''} heute · ∞ verfügbar")
        else:
            remaining = limit - used
            lines.append(f"\n📊 {used}/{limit} Signale heute · noch {max(0, remaining)} übrig")

        keyboard_rows: list[list[dict]] = []
        if limit != -1 and remaining <= 1:
            keyboard_rows.append([{"text": "⬆️ Mehr Signale freischalten", "url": f"{settings.FRONTEND_URL}/billing"}])
        keyboard_rows.append([{"text": "📊 Weitere Signale generieren", "url": f"{settings.FRONTEND_URL}/signals"}])

        await send_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": keyboard_rows})
    except Exception as e:
        logger.warning("telegram_briefing_cmd_error", extra={"reason": str(e)})
        await send_message(chat_id, "Briefing konnte nicht abgerufen werden.")


async def _handle_mystats(chat_id: str, user_id: str) -> None:
    """Show the authenticated user's personal signal performance stats."""
    try:
        from app.db.database import get_session
        from app.db.models import SignalPerformance, SignalRecord
        from sqlalchemy import select

        async with get_session() as session:
            sig_result = await session.execute(
                select(SignalRecord.id).where(SignalRecord.user_id == user_id)
            )
            user_signal_ids: set[str] = {row[0] for row in sig_result.all()}

            if not user_signal_ids:
                await send_message(
                    chat_id,
                    (
                        "📊 <b>Meine KI-Performance</b>\n\n"
                        "Noch keine ausgewerteten Signale vorhanden.\n"
                        "Generiere Signale — nach 24 Stunden erscheinen hier deine persönlichen Stats."
                    ),
                    reply_markup=inline_keyboard(
                        [{"text": "📊 Erstes Signal generieren", "url": f"{settings.FRONTEND_URL}/signals"}]
                    ),
                )
                return

            perf_result = await session.execute(
                select(SignalPerformance)
                .where(SignalPerformance.signal_id.in_(user_signal_ids))
                .order_by(SignalPerformance.evaluated_at.desc())
            )
            all_rows = perf_result.scalars().all()

        if not all_rows:
            await send_message(
                chat_id,
                (
                    "📊 <b>Meine KI-Performance</b>\n\n"
                    "Deine Signale werden 24 Stunden nach Generierung ausgewertet."
                ),
                reply_markup=inline_keyboard(
                    [{"text": "👤 Konto ansehen", "url": f"{settings.FRONTEND_URL}/account"}]
                ),
            )
            return

        seen: set[str] = set()
        rows = []
        for r in all_rows:
            if r.signal_id not in seen:
                seen.add(r.signal_id)
                rows.append(r)

        returns = [r.return_pct for r in rows]
        avg_ret = round(sum(returns) / len(returns) * 100, 2)
        win_pct = round(sum(1 for r in returns if r > 0) / len(returns) * 100, 1)
        best = max(rows, key=lambda r: r.return_pct)
        sign = "+" if avg_ret >= 0 else ""

        await send_message(
            chat_id,
            (
                f"📊 <b>Meine KI-Performance</b>\n\n"
                f"✅ Trefferquote: <b>{win_pct}%</b>\n"
                f"📈 Ø Rendite: <b>{sign}{avg_ret}%</b>\n"
                f"🔬 Ausgewertet: <b>{len(rows)} Signale</b>\n\n"
                f"🏆 Bestes Signal: <b>{best.ticker}</b> "
                f"+{round(best.return_pct * 100, 2)}%"
            ),
            reply_markup=inline_keyboard(
                [{"text": "👤 Konto & Details ansehen", "url": f"{settings.FRONTEND_URL}/account"}]
            ),
        )
    except Exception as exc:
        logger.warning("telegram_mystats_failed reason=%s", exc)
        await send_message(chat_id, "⚠️ Deine Performance-Daten konnten nicht geladen werden.")


async def _handle_performance(chat_id: str) -> None:
    """Show aggregate KI performance stats + top tickers by win rate."""
    try:
        from app.db.database import get_session
        from app.db.models import SignalPerformance
        from sqlalchemy import select
        from collections import defaultdict

        async with get_session() as session:
            result = await session.execute(select(SignalPerformance).order_by(SignalPerformance.evaluated_at.desc()))
            all_rows = result.scalars().all()

        if not all_rows:
            await send_message(
                chat_id,
                (
                    "📊 <b>KI-Performance</b>\n\n"
                    "Noch keine Signale ausgewertet.\n"
                    "Signale werden 24 Stunden nach Generierung automatisch bewertet."
                ),
                reply_markup=inline_keyboard(
                    [{"text": "📈 Performance-Seite öffnen", "url": f"{settings.FRONTEND_URL}/performance"}]
                ),
            )
            return

        seen: set[str] = set()
        rows = []
        for r in all_rows:
            if r.signal_id not in seen:
                seen.add(r.signal_id)
                rows.append(r)

        returns = [r.return_pct for r in rows]
        avg_ret = round(sum(returns) / len(returns) * 100, 2)
        win_pct = round(sum(1 for r in returns if r > 0) / len(returns) * 100, 1)

        ticker_returns: dict[str, list[float]] = defaultdict(list)
        for r in rows:
            ticker_returns[r.ticker].append(r.return_pct)

        top_tickers = sorted(
            [(t, rs) for t, rs in ticker_returns.items() if len(rs) >= 2],
            key=lambda x: sum(1 for r in x[1] if r > 0) / len(x[1]),
            reverse=True,
        )[:3]

        sign = "+" if avg_ret >= 0 else ""
        lines = [
            "📊 <b>KI-Performance</b>\n",
            f"✅ Trefferquote: <b>{win_pct}%</b>",
            f"📈 Ø Rendite: <b>{sign}{avg_ret}%</b>",
            f"🔬 Ausgewertet: <b>{len(rows)} Signale</b>",
        ]

        if top_tickers:
            lines.append("\n🏆 <b>Top Ticker</b>")
            for ticker, rets in top_tickers:
                w = round(sum(1 for r in rets if r > 0) / len(rets) * 100, 0)
                avg = round(sum(rets) / len(rets) * 100, 1)
                avg_sign = "+" if avg >= 0 else ""
                lines.append(f"  <b>{ticker}</b> — {w:.0f}% Win Rate · Ø {avg_sign}{avg}%")

        await send_message(
            chat_id,
            "\n".join(lines),
            reply_markup=inline_keyboard(
                [{"text": "📈 Vollständige Statistik ansehen", "url": f"{settings.FRONTEND_URL}/performance"}]
            ),
        )
    except Exception as exc:
        logger.warning("telegram_performance_failed reason=%s", exc)
        await send_message(chat_id, "⚠️ Performance-Daten konnten nicht geladen werden.")


# In-memory de-dup: "chat_id:YYYY-MM-DD" → morning briefing already sent today
_morning_briefing_sent: set[str] = set()

# In-memory de-dup: "chat_id:YYYY-MM-DD" → daily signal digest already sent today
_signal_digest_sent: set[str] = set()

_DIR_EMOJI = {
    "STRONG_BUY": "🟢🟢",
    "BUY": "🟢",
    "HOLD": "🟡",
    "SELL": "🔴",
    "STRONG_SELL": "🔴🔴",
}


async def send_daily_signal_digest() -> None:
    """Send fresh daily AI signal digest to all connected Telegram users (called after daily signal loop)."""
    from app.db.database import get_session
    from app.db.models import TelegramChat, SignalRecord
    from sqlalchemy import select
    from datetime import date, datetime, timezone, timedelta

    today = date.today().isoformat()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)

    try:
        async with get_session() as session:
            chats_result = await session.execute(select(TelegramChat))
            chats = chats_result.scalars().all()

            sigs_result = await session.execute(
                select(SignalRecord)
                .where(SignalRecord.generated_at >= cutoff, SignalRecord.user_id.is_(None))
                .order_by(SignalRecord.confidence.desc())
            )
            signals = sigs_result.scalars().all()
    except Exception as e:
        logger.warning("daily_signal_digest_db_error reason=%s", e)
        return

    if not signals:
        return

    lines = [f"<b>📊 Tagesaktuelle KI-Signale — {today}</b>\n"]
    for s in signals[:8]:
        emoji = _DIR_EMOJI.get(s.direction.upper(), "⚪")
        conf = f"{int(s.confidence * 100)}%" if s.confidence else "—"
        lines.append(f"{emoji} <b>{s.ticker}</b> · {s.direction.replace('_', ' ')} · {conf}")

    msg = "\n".join(lines)
    keyboard = inline_keyboard(
        [
            {"text": "📊 Signale & Analyse öffnen", "url": f"{settings.FRONTEND_URL}/signals"},
            {"text": "📈 Performance ansehen", "url": f"{settings.FRONTEND_URL}/performance"},
        ]
    )

    sent = 0
    for chat in chats:
        key = f"{chat.chat_id}:{today}:digest"
        if key in _signal_digest_sent:
            continue
        _signal_digest_sent.add(key)
        try:
            await send_message(chat.chat_id, msg, reply_markup=keyboard)
            sent += 1
            await asyncio.sleep(0.3)
        except Exception as e:
            logger.warning("daily_signal_digest_send_error chat_id=%s reason=%s", chat.chat_id, e)

    logger.info("daily_signal_digests_sent count=%d", sent)


async def send_morning_briefings() -> None:
    """Send daily morning briefings to all connected Telegram users (called by background loop)."""
    from app.db.database import get_session
    from app.db.models import TelegramChat
    from sqlalchemy import select
    from datetime import date

    today = date.today().isoformat()
    try:
        async with get_session() as session:
            result = await session.execute(select(TelegramChat))
            chats = result.scalars().all()
    except Exception as e:
        logger.warning("morning_briefing_db_error reason=%s", e)
        return

    sent = 0
    for chat in chats:
        key = f"{chat.chat_id}:{today}"
        if key in _morning_briefing_sent:
            continue
        _morning_briefing_sent.add(key)
        try:
            await _handle_briefing(chat.chat_id, chat.user_id)
            sent += 1
            await asyncio.sleep(0.3)  # polite pacing for Telegram API rate limits
        except Exception as e:
            logger.warning("morning_briefing_send_error chat_id=%s reason=%s", chat.chat_id, e)

    logger.info("morning_briefings_sent count=%d", sent)


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    """
    Receive Telegram webhook updates.
    Handles /start <CODE> for connection and bot commands for connected users.
    """
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    try:
        message = body.get("message", {})
        text: str = (message.get("text") or "").strip()
        chat_id = str(message.get("chat", {}).get("id", ""))
        from_user = message.get("from", {})
        username: Optional[str] = from_user.get("username")

        if not text or not chat_id:
            return {"ok": True}

        # ── /start CODE — account connection ──────────────────────────────
        if text.startswith("/start"):
            parts = text.split(None, 1)
            if len(parts) < 2:
                reg_url = f"{settings.FRONTEND_URL}/register"
                await send_message(chat_id, (
                    "Willkommen bei <b>Neural Trading OS</b>! 🤖\n\n"
                    f"<b>Noch kein Konto?</b> → <a href='{reg_url}'>Kostenlos registrieren</a>\n\n"
                    "<b>Bereits registriert?</b> So verbindest du Telegram:\n"
                    "1. Öffne Neural Trading OS\n"
                    "2. Einstellungen → Telegram\n"
                    "3. Klicke auf 'Verbinden' und schicke mir den Code\n\n"
                    "/help — alle Befehle anzeigen"
                ))
                return {"ok": True}

            code = parts[1].strip()
            user_id = _pending_codes.pop(code, None)

            if not user_id:
                logger.warning("telegram_webhook_unknown_code", extra={"code": code})
                await send_message(chat_id, "Ungültiger oder abgelaufener Code. Bitte einen neuen Code in der App generieren.")
                return {"ok": True}

            from app.db.database import get_session
            from app.db.models import TelegramChat
            from sqlalchemy import select, delete as sa_delete

            async with get_session() as session:
                await session.execute(
                    sa_delete(TelegramChat).where(TelegramChat.user_id == user_id)
                )
                chat = TelegramChat(
                    user_id=user_id,
                    chat_id=chat_id,
                    username=username,
                    connected_at=datetime.now(UTC),
                )
                session.add(chat)
                await session.commit()

            logger.info("telegram_chat_connected", extra={"user_id": user_id, "chat_id": chat_id})
            await send_message(
                chat_id,
                f"✅ Verbunden mit <b>Neural Trading OS</b>.\n\nDu erhältst ab jetzt Kursalarme und KI-Signal-Benachrichtigungen hier.\n\n/help — alle Befehle anzeigen",
            )
            return {"ok": True}

        # ── All other commands: require connected account ──────────────────
        if not text.startswith("/"):
            return {"ok": True}

        chat_row = await _get_chat_by_chat_id(chat_id)
        if not chat_row:
            await send_message(chat_id, (
                "⚠️ Dein Account ist noch nicht verbunden.\n\n"
                "1. Öffne Neural Trading OS\n"
                "2. Einstellungen → Telegram → Verbinden"
            ))
            return {"ok": True}

        cmd_parts = text.split(None, 1)
        cmd = cmd_parts[0].lower().split("@")[0]  # strip @botname suffix if present
        arg = cmd_parts[1].strip() if len(cmd_parts) > 1 else ""

        if cmd in ("/stop", "/unsubscribe", "/disconnect", "/opt_out"):
            from app.db.database import get_session
            from app.db.models import TelegramChat
            from sqlalchemy import delete as sa_delete
            async with get_session() as session:
                await session.execute(
                    sa_delete(TelegramChat).where(TelegramChat.chat_id == chat_id)
                )
                await session.commit()
            reg_url = f"{settings.FRONTEND_URL}/settings"
            await send_message(
                chat_id,
                (
                    "🔕 <b>Benachrichtigungen deaktiviert.</b>\n\n"
                    "Du erhältst keine weiteren Nachrichten von Neural Trading OS.\n\n"
                    "<i>Du kannst dich jederzeit unter Einstellungen → Telegram "
                    "erneut verbinden.</i>"
                ),
                reply_markup=inline_keyboard(
                    [{"text": "⚙️ Erneut verbinden", "url": reg_url}]
                ),
            )
            return {"ok": True}

        if cmd == "/help":
            await _handle_help(chat_id)
        elif cmd in ("/signal", "/s"):
            await _handle_signal(chat_id, arg)
        elif cmd in ("/status", "/me"):
            await _handle_status(chat_id, chat_row.user_id)
        elif cmd in ("/alerts", "/a"):
            await _handle_alerts(chat_id, chat_row.user_id)
        elif cmd in ("/upgrade", "/u"):
            await _handle_upgrade(chat_id, chat_row.user_id)
        elif cmd in ("/briefing", "/b"):
            await _handle_briefing(chat_id, chat_row.user_id)
        elif cmd in ("/refer", "/ref", "/invite"):
            await _handle_refer(chat_id, chat_row.user_id)
        elif cmd in ("/performance", "/perf", "/stats"):
            await _handle_performance(chat_id)
        elif cmd in ("/mystats", "/myperformance", "/myperf"):
            await _handle_mystats(chat_id, chat_row.user_id)
        else:
            await send_message(chat_id, f"Unbekannter Befehl: <code>{cmd}</code>\n/help — alle Befehle anzeigen")

    except Exception as e:
        logger.warning("telegram_webhook_error", extra={"reason": str(e)})

    return {"ok": True}


# ---------------------------------------------------------------------------
# POST /api/telegram/test
# ---------------------------------------------------------------------------

@router.post("/test")
async def send_test(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Send a test notification to the connected Telegram chat."""
    user_id = current_user.username
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            chat = result.scalar_one_or_none()

        if not chat:
            raise HTTPException(status_code=404, detail="Keine Telegram-Verbindung gefunden. Bitte zuerst verbinden.")

        sent = await send_message(
            chat.chat_id,
            "Neural Trading OS — Testbenachrichtigung.\n\nDeine Telegram-Benachrichtigungen funktionieren korrekt.",
        )
        return {"sent": sent}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("telegram_test_error", extra={"reason": str(e)})
        raise HTTPException(status_code=500, detail="Test-Nachricht konnte nicht gesendet werden")


# ---------------------------------------------------------------------------
# DELETE /api/telegram/disconnect
# ---------------------------------------------------------------------------

@router.delete("/disconnect")
async def disconnect(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Remove the Telegram connection for the current user."""
    user_id = current_user.username
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import delete as sa_delete

        async with get_session() as session:
            await session.execute(
                sa_delete(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            await session.commit()

        logger.info("telegram_chat_disconnected", extra={"user_id": user_id})
        return {"disconnected": True}
    except Exception as e:
        logger.warning("telegram_disconnect_error", extra={"reason": str(e)})
        raise HTTPException(status_code=500, detail="Verbindung konnte nicht getrennt werden")


# ---------------------------------------------------------------------------
# POST /api/telegram/setup-webhook
# ---------------------------------------------------------------------------

@router.post("/setup-webhook")
async def setup_webhook(
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Register the webhook URL with Telegram automatically.
    Uses the request's base URL to construct the webhook target.
    Can be overridden via X-Backend-Url header for Railway deployments.
    """
    if not await is_configured_async():
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN nicht konfiguriert. Bitte zuerst in den Einstellungen setzen.")

    # Determine backend base URL
    override = request.headers.get("X-Backend-Url")
    if override:
        base = override.rstrip("/")
    else:
        base = str(request.base_url).rstrip("/")

    webhook_url = f"{base}/api/telegram/webhook"
    result = await set_webhook(webhook_url)

    logger.info("telegram_webhook_setup", extra={"url": webhook_url, "ok": result.get("ok")})

    if not result.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=f"Telegram hat Webhook abgelehnt: {result.get('description', 'unbekannter Fehler')}",
        )
    return {"ok": True, "webhook_url": webhook_url, "description": result.get("description", "")}
