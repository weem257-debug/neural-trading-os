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
import uuid
from datetime import datetime, UTC
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
    ):
        self.alert_id = alert_id
        self.ticker = ticker
        self.condition = condition
        self.threshold = threshold
        self.status: AlertStatus = status
        self.created_at: datetime = created_at or datetime.now(UTC)
        self.fired_at: Optional[datetime] = fired_at
        self.fired_price: Optional[float] = fired_price

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

            async with self._lock:
                self._alerts.clear()
                for row in rows:
                    alert = PriceAlert(
                        alert_id=row.alert_id,
                        ticker=row.ticker,
                        condition=row.condition,
                        threshold=row.threshold,
                        status=row.status,
                        created_at=row.created_at,
                        fired_at=row.fired_at,
                        fired_price=row.fired_price,
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
    ) -> PriceAlert:
        """Add alert — persists to DB, then updates cache. Enforces max 50 alerts."""
        from app.db.database import _AsyncSessionFactory as async_session_factory
        from app.db.models import PriceAlertRecord

        alert = PriceAlert(
            alert_id=str(uuid.uuid4()),
            ticker=ticker.upper(),
            condition=condition,
            threshold=threshold,
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

    async def delete_alert(self, alert_id: str) -> bool:
        """Delete alert by ID from DB and cache. Returns True if found."""
        from app.db.database import _AsyncSessionFactory as async_session_factory
        from app.db.models import PriceAlertRecord

        async with self._lock:
            if alert_id not in self._alerts:
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

    async def get_all_alerts(self) -> list[dict]:
        """Return all alerts from in-memory cache, newest first."""
        async with self._lock:
            return [a.to_dict() for a in sorted(
                self._alerts.values(),
                key=lambda a: a.created_at,
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
