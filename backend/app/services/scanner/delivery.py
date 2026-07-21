"""
Per-user delivery for the 24/7 market scanner (ADR 0003).

A scanner signal is global (not tied to one user). Delivery matches each signal
against every user's analysis watchlist and pushes it to the matching users via
Telegram — respecting a global quiet-hours window during which pushes are held
back (the signal is still persisted; only the notification is suppressed).

User identity chain (verified against the codebase):
  AnalysisWatchlist.owner_username == User.username == TelegramChat.user_id
"""
import logging
from datetime import datetime, UTC

from sqlalchemy import select

from app.core.config import settings
from app.db.database import get_session
from app.db.models import AnalysisWatchlist, TelegramChat
from app.services.telegram.client import send_message

logger = logging.getLogger(__name__)


def in_quiet_hours(now: datetime) -> bool:
    """
    True if ``now`` (UTC) is inside the configured quiet-hours window
    [START, END). A window that wraps midnight (START > END) is handled.
    START == END disables quiet hours entirely.
    """
    start = int(settings.SCAN_QUIET_HOURS_START_UTC)
    end = int(settings.SCAN_QUIET_HOURS_END_UTC)
    if start == end:
        return False
    hour = now.hour
    if start < end:
        return start <= hour < end
    # Wraps midnight, e.g. 22:00 .. 06:00.
    return hour >= start or hour < end


def _format_signal(signal) -> str:
    """Human-readable Telegram message for one scanner signal (HTML parse mode)."""
    conf_pct = int(round(float(signal.confidence) * 100))
    lines = [
        f"<b>Scanner-Signal: {signal.ticker}</b>",
        f"Richtung: <b>{signal.direction}</b>  ·  Konfidenz: {conf_pct}%",
    ]
    if signal.price_target is not None:
        lines.append(f"Kursziel: {signal.price_target}")
    if signal.stop_loss is not None:
        lines.append(f"Stop-Loss: {signal.stop_loss}")
    if signal.time_horizon:
        lines.append(f"Horizont: {signal.time_horizon}")
    if signal.reasoning:
        lines.append("")
        lines.append(signal.reasoning)
    lines.append("")
    lines.append("<i>Automatisch generiert — keine Anlageberatung.</i>")
    return "\n".join(lines)


async def _watchers_with_chats(symbol: str) -> list[tuple[str, str]]:
    """
    Return [(username, chat_id)] for every user who has ``symbol`` on their
    analysis watchlist AND has a connected Telegram chat.
    """
    async with get_session() as session:
        wl_result = await session.execute(
            select(AnalysisWatchlist.owner_username).where(AnalysisWatchlist.symbol == symbol)
        )
        usernames = {row[0] for row in wl_result.all()}
        if not usernames:
            return []
        chat_result = await session.execute(
            select(TelegramChat.user_id, TelegramChat.chat_id).where(
                TelegramChat.user_id.in_(usernames)
            )
        )
        return [(uid, cid) for uid, cid in chat_result.all()]


async def deliver_signal(signal, now: datetime | None = None) -> int:
    """
    Fan one persisted scanner signal out to the users watching its symbol.

    Returns the number of Telegram pushes actually sent. During quiet hours no
    push is sent (returns 0) — the signal remains persisted and visible in-app.
    """
    now = now or datetime.now(UTC)

    if in_quiet_hours(now):
        logger.info(
            "scan_delivery_suppressed_quiet_hours",
            extra={"ticker": signal.ticker, "hour_utc": now.hour},
        )
        return 0

    watchers = await _watchers_with_chats(signal.ticker)
    if not watchers:
        return 0

    text = _format_signal(signal)
    sent = 0
    for username, chat_id in watchers:
        try:
            ok = await send_message(chat_id, text)
            if ok:
                sent += 1
        except Exception as e:
            logger.warning(
                "scan_delivery_send_failed",
                extra={"username": username, "reason": str(e)},
            )
    logger.info("scan_delivery_done", extra={"ticker": signal.ticker, "sent": sent})
    return sent
