"""
Price Alert Manager
-------------------
In-memory alert store with background polling every 15 seconds.

Conditions:
  "above"      — triggers when price > threshold
  "below"      — triggers when price < threshold
  "change_pct" — triggers when |change_pct| >= threshold

When an alert fires:
  - status set to "fired"
  - WebSocket broadcast on the "alerts" channel
"""
import asyncio
import logging
import uuid
from datetime import datetime, UTC
from typing import Literal, Optional

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
    ):
        self.alert_id = alert_id
        self.ticker = ticker
        self.condition = condition
        self.threshold = threshold
        self.status: AlertStatus = "active"
        self.created_at: datetime = datetime.now(UTC)
        self.fired_at: Optional[datetime] = None
        self.fired_price: Optional[float] = None

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
    """Thread-safe (asyncio) manager for price alerts."""

    def __init__(self):
        self._alerts: dict[str, PriceAlert] = {}
        self._lock = asyncio.Lock()

    # ---------------------------------------------------------------- CRUD

    async def add_alert(
        self,
        ticker: str,
        condition: AlertCondition,
        threshold: float,
    ) -> PriceAlert:
        """Add a new alert. Enforces max 50 alerts (drops oldest fired ones first)."""
        async with self._lock:
            if len(self._alerts) >= _MAX_ALERTS:
                # Remove oldest fired alerts to make room
                fired = [a for a in self._alerts.values() if a.status == "fired"]
                if fired:
                    oldest = min(fired, key=lambda a: a.created_at)
                    del self._alerts[oldest.alert_id]
                else:
                    # All active — remove oldest
                    oldest = min(self._alerts.values(), key=lambda a: a.created_at)
                    del self._alerts[oldest.alert_id]

            alert = PriceAlert(
                alert_id=str(uuid.uuid4()),
                ticker=ticker.upper(),
                condition=condition,
                threshold=threshold,
            )
            self._alerts[alert.alert_id] = alert
            logger.info(
                "alert_added",
                extra={
                    "alert_id": alert.alert_id,
                    "ticker": alert.ticker,
                    "condition": condition,
                    "threshold": threshold,
                },
            )
            return alert

    async def delete_alert(self, alert_id: str) -> bool:
        """Delete alert by ID. Returns True if found and deleted."""
        async with self._lock:
            if alert_id in self._alerts:
                del self._alerts[alert_id]
                return True
            return False

    async def get_all_alerts(self) -> list[dict]:
        """Return all alerts as list of dicts."""
        async with self._lock:
            return [a.to_dict() for a in sorted(
                self._alerts.values(),
                key=lambda a: a.created_at,
                reverse=True,
            )]

    # ---------------------------------------------------------------- polling

    async def run_checker(self) -> None:
        """
        Background task: poll prices every 15s and fire matching alerts.
        Designed to run as asyncio.create_task — runs until cancelled.
        """
        while True:
            await asyncio.sleep(15)
            try:
                await self._check_alerts()
            except Exception as err:
                logger.debug("alert_check_error", extra={"reason": str(err)})

    async def _check_alerts(self) -> None:
        """Fetch prices for active alert tickers and evaluate conditions."""
        async with self._lock:
            active = [a for a in self._alerts.values() if a.status == "active"]

        if not active:
            return

        tickers = list({a.ticker for a in active})
        prices = await _fetch_prices_async(tickers)

        fired_alerts = []
        async with self._lock:
            for alert in active:
                info = prices.get(alert.ticker)
                if info is None:
                    continue
                price = info.get("price")
                change_pct = info.get("change_pct", 0.0)
                if price is None:
                    continue

                triggered = False
                if alert.condition == "above" and price > alert.threshold:
                    triggered = True
                elif alert.condition == "below" and price < alert.threshold:
                    triggered = True
                elif alert.condition == "change_pct" and abs(change_pct) >= alert.threshold:
                    triggered = True

                if triggered:
                    alert.status = "fired"
                    alert.fired_at = datetime.now(UTC)
                    alert.fired_price = price
                    fired_alerts.append(alert.to_dict())
                    logger.info(
                        "alert_fired",
                        extra={
                            "alert_id": alert.alert_id,
                            "ticker": alert.ticker,
                            "price": price,
                        },
                    )

        # Broadcast outside the lock
        if fired_alerts:
            try:
                from app.websocket.manager import ws_manager
                for alert_dict in fired_alerts:
                    await ws_manager.broadcast(
                        "alerts",
                        {
                            "type": "price_alert_fired",
                            "alert": alert_dict,
                            "timestamp": datetime.now(UTC).isoformat(),
                        },
                    )
            except Exception as ws_err:
                logger.debug("alert_ws_broadcast_failed", extra={"reason": str(ws_err)})


async def _fetch_prices_async(tickers: list[str]) -> dict[str, dict]:
    """Fetch prices via yfinance in executor (non-blocking)."""
    import asyncio

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_prices_sync, tickers)


def _fetch_prices_sync(tickers: list[str]) -> dict[str, dict]:
    """Sync yfinance price fetch for executor use."""
    result: dict[str, dict] = {}
    try:
        import yfinance as yf

        for ticker in tickers:
            try:
                t = yf.Ticker(ticker)
                info = t.fast_info
                price = getattr(info, "last_price", None)
                prev_close = getattr(info, "previous_close", None)
                if price is not None:
                    change_pct = (
                        round((price - prev_close) / prev_close * 100, 2)
                        if prev_close
                        else 0.0
                    )
                    result[ticker] = {
                        "price": round(float(price), 4),
                        "change_pct": change_pct,
                    }
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
