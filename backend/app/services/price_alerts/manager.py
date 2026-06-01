"""
Price Alert Manager
-------------------
DB-backed alert store (PostgreSQL / SQLite) with in-memory cache.

Write-through strategy:
  - Every mutation persists to DB first, then updates _alerts cache
  - On startup load_from_db() populates cache from DB

Conditions:
  "above"      — triggers when price > threshold
  "below"      — triggers when price < threshold
  "change_pct" — triggers when |change_pct| >= threshold

When an alert fires:
  - DB row updated (status="fired", fired_at, fired_price)
  - In-memory cache updated
  - WebSocket broadcast on the "alerts" channel
"""
import asyncio
import logging
import smtplib
import uuid
from datetime import datetime, UTC
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Literal, Optional

from sqlalchemy import select, delete
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

AlertCondition = Literal["above", "below", "change_pct"]
AlertStatus = Literal["active", "fired"]

_MAX_ALERTS = 50


class PriceAlert:
    def __init__(
        self,
        alert_id: str,
        ticker: str,
        condition: AlertCondition,
        threshold: float,
        status: AlertStatus = "active",
        created_at: Optional[datetime] = None,
        fired_at: Optional[datetime] = None,
        fired_price: Optional[float] = None,
        username: Optional[str] = None,
    ):
        self.alert_id = alert_id
        self.ticker = ticker
        self.condition = condition
        self.threshold = threshold
        self.status: AlertStatus = status
        self.created_at: datetime = created_at or datetime.now(UTC)
        self.fired_at: Optional[datetime] = fired_at
        self.fired_price: Optional[float] = fired_price
        self.username: Optional[str] = username

    def to_dict(self) -> dict:
        return {
            "alert_id": self.alert_id,
            "ticker": self.ticker,
            "condition": self.condition,
            "threshold": self.threshold,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "fired_at": self.fired_at.isoformat() if self.fired_at else None,
            "fired_price": self.fired_price,
            "username": self.username,
        }


class PriceAlertManager:
    """DB-backed (write-through) manager for price alerts with in-memory read cache."""

    def __init__(self):
        self._alerts: dict[str, PriceAlert] = {}
        self._lock = asyncio.Lock()
        self._db_ready = False

    # ---------------------------------------------------------------- startup

    async def load_from_db(self) -> None:
        """Load all alerts from DB into the in-memory cache. Call once on startup."""
        try:
            from app.db.database import _AsyncSessionFactory as async_session_factory
            from app.db.models import PriceAlertRecord

            async with async_session_factory() as session:
                result = await session.execute(select(PriceAlertRecord))
                rows = result.scalars().all()

            from datetime import timezone as _tz

            def _ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
                if dt is not None and dt.tzinfo is None:
                    return dt.replace(tzinfo=_tz.utc)
                return dt

            async with self._lock:
                self._alerts.clear()
                for row in rows:
                    alert = PriceAlert(
                        alert_id=row.alert_id,
                        ticker=row.ticker,
                        condition=row.condition,
                        threshold=row.threshold,
                        status=row.status,
                        created_at=_ensure_aware(row.created_at),
                        fired_at=_ensure_aware(row.fired_at),
                        fired_price=row.fired_price,
                        username=getattr(row, "username", None),
                    )
                    self._alerts[alert.alert_id] = alert

            self._db_ready = True
            logger.info("price_alerts_loaded_from_db", extra={"count": len(rows)})
        except Exception as e:
            logger.warning("price_alerts_db_load_failed", extra={"reason": str(e)})
            self._db_ready = False

    # ---------------------------------------------------------------- CRUD

    async def add_alert(
        self,
        ticker: str,
        condition: AlertCondition,
        threshold: float,
        username: Optional[str] = None,
    ) -> PriceAlert:
        """Add alert — persists to DB, then updates cache. Enforces max 50 alerts."""
        from app.db.database import _AsyncSessionFactory as async_session_factory
        from app.db.models import PriceAlertRecord

        alert = PriceAlert(
            alert_id=str(uuid.uuid4()),
            ticker=ticker.upper(),
            condition=condition,
            threshold=threshold,
            username=username,
        )

        # Persist to DB
        try:
            async with async_session_factory() as session:
                async with session.begin():
                    # Evict oldest fired alert from DB if at capacity
                    async with self._lock:
                        if len(self._alerts) >= _MAX_ALERTS:
                            fired = [a for a in self._alerts.values() if a.status == "fired"]
                            to_remove = (
                                min(fired, key=lambda a: a.created_at)
                                if fired
                                else min(self._alerts.values(), key=lambda a: a.created_at)
                            )
                            del self._alerts[to_remove.alert_id]
                            await session.execute(
                                delete(PriceAlertRecord).where(
                                    PriceAlertRecord.alert_id == to_remove.alert_id
                                )
                            )

                    session.add(PriceAlertRecord(
                        alert_id=alert.alert_id,
                        ticker=alert.ticker,
                        condition=alert.condition,
                        threshold=alert.threshold,
                        status=alert.status,
                        created_at=alert.created_at,
                        username=alert.username,
                    ))
        except SQLAlchemyError as e:
            logger.warning("alert_db_write_failed", extra={"reason": str(e)})

        async with self._lock:
            self._alerts[alert.alert_id] = alert

        logger.info("alert_added", extra={
            "alert_id": alert.alert_id,
            "ticker": alert.ticker,
            "condition": condition,
            "threshold": threshold,
        })
        return alert

    async def delete_alert(self, alert_id: str, owner_username: Optional[str] = None) -> bool:
        """Delete alert by ID from DB and cache. Returns True if found and authorized."""
        from app.db.database import _AsyncSessionFactory as async_session_factory
        from app.db.models import PriceAlertRecord

        async with self._lock:
            if alert_id not in self._alerts:
                return False
            if owner_username is not None and self._alerts[alert_id].username != owner_username:
                return False
            del self._alerts[alert_id]

        try:
            async with async_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        delete(PriceAlertRecord).where(
                            PriceAlertRecord.alert_id == alert_id
                        )
                    )
        except SQLAlchemyError as e:
            logger.warning("alert_db_delete_failed", extra={"reason": str(e)})

        return True

    async def get_all_alerts(self, username: Optional[str] = None) -> list[dict]:
        """Return alerts from in-memory cache, newest first. Filtered by username when provided."""
        from datetime import timezone as _tz
        def _sort_key(a: "PriceAlert") -> datetime:
            dt = a.created_at
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_tz.utc)
            return dt

        async with self._lock:
            alerts = self._alerts.values()
            if username is not None:
                alerts = [a for a in alerts if a.username == username]
            return [a.to_dict() for a in sorted(
                alerts,
                key=_sort_key,
                reverse=True,
            )]

    # ---------------------------------------------------------------- polling

    async def run_checker(self) -> None:
        """Background task: poll prices every 15s and fire matching alerts."""
        while True:
            await asyncio.sleep(15)
            try:
                await self._check_alerts()
            except Exception as err:
                logger.debug("alert_check_error", extra={"reason": str(err)})

    async def _check_alerts(self) -> None:
        """Fetch prices for active tickers and fire matching alerts."""
        async with self._lock:
            active = [a for a in self._alerts.values() if a.status == "active"]

        if not active:
            return

        tickers = list({a.ticker for a in active})
        prices = await _fetch_prices_async(tickers)

        fired_alerts: list[dict] = []

        async with self._lock:
            for alert in active:
                info = prices.get(alert.ticker)
                if not info:
                    continue
                price = info.get("price")
                change_pct = info.get("change_pct", 0.0)
                if price is None:
                    continue

                triggered = (
                    (alert.condition == "above" and price > alert.threshold)
                    or (alert.condition == "below" and price < alert.threshold)
                    or (alert.condition == "change_pct" and abs(change_pct) >= alert.threshold)
                )

                if triggered:
                    alert.status = "fired"
                    alert.fired_at = datetime.now(UTC)
                    alert.fired_price = price
                    fired_alerts.append(alert.to_dict())
                    logger.info("alert_fired", extra={
                        "alert_id": alert.alert_id,
                        "ticker": alert.ticker,
                        "price": price,
                    })

        # Persist fired status to DB
        if fired_alerts:
            await self._persist_fired(fired_alerts)

        # Broadcast outside lock
        if fired_alerts:
            try:
                from app.websocket.manager import ws_manager
                for alert_dict in fired_alerts:
                    await ws_manager.broadcast("alerts", {
                        "type": "price_alert_fired",
                        "alert": alert_dict,
                        "timestamp": datetime.now(UTC).isoformat(),
                    })
            except Exception as ws_err:
                logger.debug("alert_ws_broadcast_failed", extra={"reason": str(ws_err)})

        # Telegram notification for fired alerts — only send to alert owner
        if fired_alerts:
            for alert_dict in fired_alerts:
                owner = alert_dict.get("username")
                if owner:
                    asyncio.create_task(_send_price_alert_telegram(owner, alert_dict))

        # Outbound webhook dispatch for fired alerts
        if fired_alerts:
            try:
                import asyncio as _asyncio
                from app.services.webhooks.client import get_webhook_manager
                loop = _asyncio.get_event_loop()
                for alert_dict in fired_alerts:
                    loop.create_task(
                        get_webhook_manager().dispatch("alert.fired", {
                            "alert_id": alert_dict.get("alert_id"),
                            "ticker": alert_dict.get("ticker"),
                            "condition": alert_dict.get("condition"),
                            "threshold": alert_dict.get("threshold"),
                            "fired_price": alert_dict.get("fired_price"),
                            "fired_at": alert_dict.get("fired_at"),
                        })
                    )
            except Exception:
                pass  # Never block alert processing on webhook failure

        # E-Mail-Notification für den Alert-Eigentümer
        for alert_dict in fired_alerts:
            owner = alert_dict.get("username")
            if owner:
                asyncio.create_task(_send_price_alert_email(owner, alert_dict))

    async def _persist_fired(self, fired: list[dict]) -> None:
        """Update fired alerts in DB."""
        from app.db.database import _AsyncSessionFactory as async_session_factory
        from app.db.models import PriceAlertRecord

        try:
            async with async_session_factory() as session:
                async with session.begin():
                    for a in fired:
                        row = await session.get(PriceAlertRecord, a["alert_id"])
                        if row is None:
                            result = await session.execute(
                                select(PriceAlertRecord).where(
                                    PriceAlertRecord.alert_id == a["alert_id"]
                                )
                            )
                            row = result.scalar_one_or_none()
                        if row:
                            row.status = "fired"
                            row.fired_at = datetime.fromisoformat(a["fired_at"]) if a["fired_at"] else None
                            row.fired_price = a["fired_price"]
        except SQLAlchemyError as e:
            logger.warning("alert_fired_db_update_failed", extra={"reason": str(e)})


async def _send_price_alert_telegram(username: str, alert_dict: dict) -> None:
    """Telegram notification for a fired price alert — sent only to the alert owner."""
    try:
        from app.services.telegram.client import send_message, inline_keyboard, is_configured_async
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from app.core.config import settings
        from sqlalchemy import select as _select

        if not await is_configured_async():
            return

        async with get_session() as session:
            result = await session.execute(
                _select(TelegramChat).where(TelegramChat.user_id == username)
            )
            chat = result.scalar_one_or_none()

        if not chat:
            return

        cond_label = {"above": "überschritten", "below": "unterschritten", "change_pct": "Änderung %"}.get(
            alert_dict.get("condition", ""), alert_dict.get("condition", "")
        )
        ticker = alert_dict.get("ticker", "")
        threshold = alert_dict.get("threshold", "")
        fired_price = alert_dict.get("fired_price", "—")

        cond_emoji = {"above": "⬆️", "below": "⬇️", "change_pct": "📊"}.get(
            alert_dict.get("condition", ""), "🔔"
        )

        msg = (
            f"🔔 <b>Kursalarm: {ticker}</b>\n\n"
            f"{cond_emoji} Schwelle <b>{threshold}</b> {cond_label}\n"
            f"Aktueller Kurs: <b>{fired_price}</b>"
        )
        signal_url = f"{settings.FRONTEND_URL}/signals?ticker={ticker}"
        alerts_url = f"{settings.FRONTEND_URL}/alerts"
        await send_message(
            chat.chat_id,
            msg,
            reply_markup=inline_keyboard(
                [
                    {"text": f"📊 Signal für {ticker}", "url": signal_url},
                    {"text": "🔔 Alarme verwalten", "url": alerts_url},
                ]
            ),
        )
        logger.info("price_alert_telegram_sent", extra={"username": username, "ticker": ticker})
    except Exception as e:
        logger.debug("price_alert_telegram_failed", extra={"reason": str(e)})


async def _send_price_alert_email(username: str, alert_dict: dict) -> None:
    """E-Mail-Notification wenn ein Preis-Alarm ausgelöst wird (fire-and-forget)."""
    try:
        from app.core.config import get_settings
        from app.api.auth import _is_unsubscribed
        settings = get_settings()

        if not settings.SMTP_HOST:
            logger.debug("price_alert_email_skipped_no_smtp", extra={"username": username})
            return

        if _is_unsubscribed(username):
            return

        # Nutzer-E-Mail aus DB laden
        try:
            from app.db.database import _AsyncSessionFactory as _sf
            from app.db.models import User
            from sqlalchemy import select as _select
            async with _sf() as session:
                result = await session.execute(_select(User).where(User.username == username))
                user = result.scalar_one_or_none()
            if not user or not user.email:
                return
            to_email = user.email
        except Exception:
            return

        ticker = alert_dict.get("ticker", "")
        condition = alert_dict.get("condition", "")
        threshold = alert_dict.get("threshold", 0)
        fired_price = alert_dict.get("fired_price", "—")

        cond_label = {"above": "über", "below": "unter", "change_pct": "Änderung %"}.get(condition, condition)
        subject = f"Kursalarm: {ticker} hat die Bedingung erfüllt"

        from app.api.auth import _unsubscribe_url
        unsub_url = _unsubscribe_url(username)
        app_url = settings.FRONTEND_URL

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#e2e8f0;padding:24px;border-radius:12px">
          <h2 style="color:#00D4FF;margin:0 0 16px">&#128276; Kursalarm ausgelöst</h2>
          <div style="background:#1a1f2e;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#fff">{ticker}</p>
            <p style="margin:0 0 4px;color:#94a3b8">Bedingung: {cond_label} {threshold}</p>
            <p style="margin:0;font-size:18px;color:#00D4FF">Ausgelöst bei: <strong>${fired_price}</strong></p>
          </div>
          <a href="{app_url}/dashboard" style="display:inline-block;background:#00D4FF;color:#0f1117;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;margin-bottom:24px">
            Dashboard öffnen
          </a>
          <p style="font-size:11px;color:#64748b;margin-top:24px">
            Neural Trading OS · <a href="{unsub_url}" style="color:#64748b">E-Mail-Benachrichtigungen abbestellen</a>
          </p>
        </div>"""

        text = f"Kursalarm: {ticker} {cond_label} {threshold} — Ausgelöst bei ${fired_price}\n\nDashboard: {app_url}/dashboard"

        def _send() -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.SMTP_FROM or settings.SMTP_USER or "noreply@neural-trading.os"
            msg["To"] = to_email
            msg["List-Unsubscribe"] = f"<{unsub_url}>"
            msg.attach(MIMEText(text, "plain", "utf-8"))
            msg.attach(MIMEText(html, "html", "utf-8"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT or 587) as server:
                server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(msg["From"], [to_email], msg.as_string())

        await asyncio.to_thread(_send)
        logger.info("price_alert_email_sent", extra={"username": username, "ticker": ticker})
    except Exception as e:
        logger.debug("price_alert_email_failed", extra={"reason": str(e)})


async def _fetch_prices_async(tickers: list[str]) -> dict[str, dict]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_prices_sync, tickers)


def _fetch_prices_sync(tickers: list[str]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    try:
        import yfinance as yf
        for ticker in tickers:
            try:
                info = yf.Ticker(ticker).fast_info
                price = getattr(info, "last_price", None)
                prev_close = getattr(info, "previous_close", None)
                if price is not None:
                    change_pct = (
                        round((price - prev_close) / prev_close * 100, 2) if prev_close else 0.0
                    )
                    result[ticker] = {"price": round(float(price), 4), "change_pct": change_pct}
            except Exception:
                pass
    except Exception:
        pass
    return result


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_manager: Optional[PriceAlertManager] = None


def get_alert_manager() -> PriceAlertManager:
    global _manager
    if _manager is None:
        _manager = PriceAlertManager()
    return _manager
