"""
/api/portfolio — Portfolio positions, P&L, performance.
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    PortfolioSnapshot, Position, AssetClass, ErrorResponse,
    PortfolioAnalytics, TickerPerformer, TickerPriceEntry, PortfolioPerformance,
)
from app.services.nautilus.client import get_execution_client
from app.core.cache import async_cached, cached as _cached
import logging
from datetime import datetime, UTC
import asyncio
from typing import TypedDict


class _DemoPosition(TypedDict):
    ticker: str
    asset_class: AssetClass
    quantity: float
    avg_entry_price: float
    fallback_price: float

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portfolio", tags=["Portfolio"])

# ---------------------------------------------------------------------------
# Demo portfolio definition — positions are enriched with live yfinance prices
# ---------------------------------------------------------------------------

_DEMO_POSITIONS: list[_DemoPosition] = [
    {
        "ticker": "AAPL",
        "asset_class": AssetClass.STOCK,
        "quantity": 50.0,
        "avg_entry_price": 165.00,
        "fallback_price": 178.50,
    },
    {
        "ticker": "MSFT",
        "asset_class": AssetClass.STOCK,
        "quantity": 30.0,
        "avg_entry_price": 310.00,
        "fallback_price": 378.00,
    },
    {
        "ticker": "NVDA",
        "asset_class": AssetClass.STOCK,
        "quantity": 20.0,
        "avg_entry_price": 450.00,
        "fallback_price": 875.00,
    },
    {
        "ticker": "TSLA",
        "asset_class": AssetClass.STOCK,
        "quantity": 40.0,
        "avg_entry_price": 220.00,
        "fallback_price": 172.00,
    },
    {
        "ticker": "BTC-USD",
        "asset_class": AssetClass.CRYPTO,
        "quantity": 0.5,
        "avg_entry_price": 42_000.00,
        "fallback_price": 67_500.00,
    },
]

_CASH = 25_000.0


def _fetch_prices(tickers: list[str]) -> dict[str, float]:
    """
    Fetch current prices via yfinance for a list of tickers.
    Returns a dict {ticker: price}.  On any error the ticker is omitted —
    callers should fall back to dummy prices for missing entries.
    """
    prices: dict[str, float] = {}
    try:
        import yfinance as yf

        data = yf.download(
            tickers,
            period="1d",
            interval="1m",
            progress=False,
            auto_adjust=True,
        )
        if data.empty:
            raise ValueError("yfinance returned empty data")

        close = data["Close"] if "Close" in data.columns else data

        # yfinance may return a MultiIndex or simple index depending on
        # whether multiple tickers were requested.
        import pandas as pd
        if isinstance(close.columns, pd.MultiIndex):
            for ticker in tickers:
                try:
                    val = float(close[ticker].dropna().iloc[-1])
                    prices[ticker] = round(val, 4)
                except Exception:
                    pass
        else:
            # Single ticker returned as Series
            for ticker in tickers:
                try:
                    val = float(close.dropna().iloc[-1])
                    prices[ticker] = round(val, 4)
                except Exception:
                    pass

    except Exception as exc:
        logger.warning("yfinance batch download failed (%s) — using fallback prices", exc)

    return prices


def _build_demo_portfolio() -> PortfolioSnapshot:
    """
    Build a realistic demo portfolio.
    1. Try to fetch live prices from yfinance for all tickers.
    2. Fall back to static dummy prices on any error.
    """
    tickers: list[str] = [str(p["ticker"]) for p in _DEMO_POSITIONS]
    live_prices = _fetch_prices(tickers)

    positions: list[Position] = []
    total_invested = 0.0

    for defn in _DEMO_POSITIONS:
        ticker = defn["ticker"]
        qty = defn["quantity"]
        avg_cost = defn["avg_entry_price"]
        current_price = live_prices.get(ticker, defn["fallback_price"])

        market_value = qty * current_price
        unrealized_pnl = (current_price - avg_cost) * qty
        unrealized_pnl_pct = (current_price - avg_cost) / avg_cost if avg_cost else 0.0

        total_invested += market_value

        positions.append(Position(
            ticker=ticker,
            asset_class=defn["asset_class"],
            quantity=qty,
            avg_entry_price=avg_cost,
            current_price=round(current_price, 4),
            market_value=round(market_value, 2),
            unrealized_pnl=round(unrealized_pnl, 2),
            unrealized_pnl_pct=round(unrealized_pnl_pct, 6),
            realized_pnl=0.0,
            weight=0.0,   # filled below after total is known
        ))

    total_value = _CASH + total_invested

    # Fill weights
    for pos in positions:
        pos.weight = round(pos.market_value / total_value, 6) if total_value else 0.0

    # Total P&L: compare market value vs cost basis
    total_cost_basis = sum(d["quantity"] * d["avg_entry_price"] for d in _DEMO_POSITIONS)
    total_pnl = total_invested - total_cost_basis
    total_pnl_pct = total_pnl / total_cost_basis if total_cost_basis else 0.0

    return PortfolioSnapshot(
        timestamp=datetime.now(UTC),
        total_value=round(total_value, 2),
        cash=_CASH,
        invested=round(total_invested, 2),
        total_pnl=round(total_pnl, 2),
        total_pnl_pct=round(total_pnl_pct, 6),
        day_pnl=0.0,    # intraday P&L requires tick-level history
        day_pnl_pct=0.0,
        positions=positions,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/prices",
    response_model=dict[str, TickerPriceEntry],
    summary="Batch price + 7-day history for a list of tickers",
)
async def get_prices(tickers: str = "") -> dict[str, TickerPriceEntry]:
    """
    GET /api/portfolio/prices?tickers=AAPL,MSFT,NVDA

    Returns current price, percentage change, and 7-day close history
    for each requested ticker.  Uses yfinance batch-download.

    Response shape:
    {
        "AAPL": {"price": 189.5, "change_pct": 1.2, "history": [185, ...]},
        ...
    }
    """
    if not tickers:
        return {}

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        return {}

    result: dict = {}
    try:
        import yfinance as yf
        import pandas as pd

        # Fetch 8 days so we always have 7 closes even on partial trading days
        data = yf.download(
            ticker_list,
            period="8d",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )

        if data.empty:
            logger.warning("yfinance returned empty data for tickers: %s", ticker_list)
            return {t: {"price": None, "change_pct": None, "history": [], "error": True} for t in ticker_list}

        close = data["Close"] if "Close" in data.columns else data

        # Normalise to DataFrame with tickers as columns
        if isinstance(close, pd.Series):
            # Single ticker — yfinance returns a Series
            close = close.to_frame(name=ticker_list[0])

        for ticker in ticker_list:
            try:
                if isinstance(close.columns, pd.MultiIndex):
                    series = close[ticker].dropna()
                else:
                    series = close[ticker].dropna() if ticker in close.columns else pd.Series(dtype=float)

                if series.empty:
                    result[ticker] = {"price": None, "change_pct": None, "history": [], "error": True}
                    continue

                history_raw = series.tail(7).tolist()
                current_price = round(float(history_raw[-1]), 4)
                prev_price = float(history_raw[-2]) if len(history_raw) >= 2 else current_price
                change_pct = round((current_price - prev_price) / prev_price * 100, 4) if prev_price else 0.0
                history = [round(float(v), 4) for v in history_raw]

                result[ticker] = {
                    "price": current_price,
                    "change_pct": change_pct,
                    "history": history,
                }
            except Exception as exc:
                logger.warning("Price extraction failed for %s: %s", ticker, exc)
                result[ticker] = {"price": None, "change_pct": None, "history": [], "error": True}

    except Exception as exc:
        logger.error("Batch price download failed: %s", exc)
        return {t: {"price": None, "change_pct": None, "history": [], "error": True} for t in ticker_list}

    return result


@async_cached(ttl_seconds=30)
async def _cached_portfolio_snapshot() -> PortfolioSnapshot:
    """Cached inner function for snapshot — TTL 30s."""
    return _build_demo_portfolio()


@router.get(
    "/snapshot",
    response_model=PortfolioSnapshot,
    summary="Demo portfolio snapshot with live yfinance prices",
)
async def get_portfolio_snapshot() -> PortfolioSnapshot:
    """
    Returns a demo portfolio snapshot for AAPL, MSFT, NVDA, TSLA, BTC-USD.
    Current prices are fetched from yfinance (no API key required).
    Falls back to static dummy prices if yfinance is unavailable or returns
    an error — the endpoint never crashes.
    """
    try:
        return await _cached_portfolio_snapshot()
    except Exception as exc:
        logger.error("Portfolio snapshot error (unexpected): %s", exc)
        # Last-resort static fallback — guarantees 200
        return PortfolioSnapshot(
            total_value=125_000.0,
            cash=_CASH,
            invested=100_000.0,
            total_pnl=8_500.0,
            total_pnl_pct=0.085,
            day_pnl=0.0,
            day_pnl_pct=0.0,
            positions=[],
        )


@router.get(
    "/",
    response_model=PortfolioSnapshot,
    summary="Get current portfolio snapshot (Nautilus engine)",
)
async def get_portfolio() -> PortfolioSnapshot:
    """
    Returns current portfolio state from the Nautilus execution engine.
    Delegates to Nautilus when initialised, falls back to demo portfolio.
    """
    try:
        client = get_execution_client()
        return await client.get_portfolio()
    except Exception as e:
        logger.warning("Portfolio fetch from Nautilus failed (%s) — using demo portfolio", e)
        return _build_demo_portfolio()


@router.get(
    "/positions",
    response_model=list[Position],
    summary="List open positions",
)
async def get_positions() -> list[Position]:
    """Returns only the open position list from the current portfolio."""
    try:
        client = get_execution_client()
        snapshot = await client.get_portfolio()
        return snapshot.positions
    except Exception as e:
        logger.warning("Positions fetch from Nautilus failed (%s) — using demo portfolio", e)
        demo = _build_demo_portfolio()
        return demo.positions


@router.get(
    "/analytics",
    response_model=PortfolioAnalytics,
    summary="Advanced portfolio analytics: Sharpe, Beta, Volatility, Correlation",
)
async def get_portfolio_analytics() -> PortfolioAnalytics:
    """
    Compute analytics for the demo portfolio (AAPL, MSFT, NVDA, TSLA, BTC-USD)
    using 30 days of daily returns from yfinance.

    Returns:
    - sharpe_ratio        — annualised Sharpe (rf=0)
    - correlation_matrix  — pairwise return correlations (5x5)
    - beta                — portfolio beta vs. SPY
    - volatility_30d      — annualised 30-day volatility
    - best_performer      — ticker with highest 30-day return
    - worst_performer     — ticker with lowest 30-day return
    """
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _compute_analytics)
        return result
    except Exception as exc:
        logger.error("portfolio_analytics_error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


def _compute_analytics() -> PortfolioAnalytics:
    """Blocking analytics computation — runs in executor."""
    import numpy as np
    import yfinance as yf
    import pandas as pd

    tickers = [p["ticker"] for p in _DEMO_POSITIONS]
    weights_def = {
        "AAPL": 50.0 * 165.0,
        "MSFT": 30.0 * 310.0,
        "NVDA": 20.0 * 450.0,
        "TSLA": 40.0 * 220.0,
        "BTC-USD": 0.5 * 42_000.0,
    }
    total_cost = sum(weights_def.values())
    weights = {t: v / total_cost for t, v in weights_def.items()}

    # Download 35 days to ensure >=30 trading days
    try:
        data = yf.download(
            tickers + ["SPY"],
            period="35d",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        close = data["Close"] if "Close" in data.columns else data
    except Exception as exc:
        raise RuntimeError(f"yfinance download failed: {exc}")

    if close.empty:
        raise RuntimeError("yfinance returned empty data")

    # Returns — drop first NaN row
    returns: pd.DataFrame = close.pct_change().dropna()

    # ---------------------------------------------------------------- helpers

    def _series(ticker: str) -> pd.Series:
        if isinstance(close.columns, pd.MultiIndex):
            try:
                return returns[ticker].dropna()
            except KeyError:
                return pd.Series(dtype=float)
        else:
            return returns[ticker].dropna() if ticker in returns.columns else pd.Series(dtype=float)

    # Portfolio daily returns (weighted sum)
    port_returns = pd.Series(0.0, index=returns.index)
    for t, w in weights.items():
        s = _series(t)
        aligned = s.reindex(port_returns.index).fillna(0.0)
        port_returns += aligned * w

    # ---------------------------------------------------------------- metrics

    trading_days = 252

    # Volatility (annualised)
    vol = float(port_returns.std() * (trading_days ** 0.5))

    # Sharpe (rf=0)
    mean_return = float(port_returns.mean())
    sharpe = float(mean_return / port_returns.std() * (trading_days ** 0.5)) if port_returns.std() > 0 else 0.0

    # Beta vs SPY
    spy = _series("SPY")
    common_idx = port_returns.index.intersection(spy.index)
    if len(common_idx) > 5:
        p_aligned = port_returns.reindex(common_idx)
        spy_aligned = spy.reindex(common_idx)
        cov = float(np.cov(p_aligned.values, spy_aligned.values)[0][1])
        spy_var = float(spy_aligned.var())
        beta = cov / spy_var if spy_var > 0 else 1.0
    else:
        beta = 1.0

    # Individual cumulative returns (30d)
    ticker_returns: dict[str, float] = {}
    for t in tickers:
        s = _series(t)
        if len(s) > 0:
            ticker_returns[t] = float((1 + s).prod() - 1)
        else:
            ticker_returns[t] = 0.0

    best_t = max(ticker_returns, key=ticker_returns.get)  # type: ignore[arg-type]
    worst_t = min(ticker_returns, key=ticker_returns.get)  # type: ignore[arg-type]

    # Correlation matrix (tickers only, no SPY)
    corr_dict: dict[str, dict[str, float]] = {}
    ticker_series: dict[str, pd.Series] = {t: _series(t) for t in tickers}
    for t1 in tickers:
        corr_dict[t1] = {}
        for t2 in tickers:
            s1, s2 = ticker_series[t1], ticker_series[t2]
            common = s1.index.intersection(s2.index)
            if len(common) > 3:
                corr_dict[t1][t2] = round(float(s1.reindex(common).corr(s2.reindex(common))), 4)
            else:
                corr_dict[t1][t2] = 1.0 if t1 == t2 else 0.0

    return PortfolioAnalytics(
        sharpe_ratio=round(sharpe, 4),
        beta=round(beta, 4),
        volatility_30d=round(vol, 4),
        best_performer=TickerPerformer(ticker=best_t, return_pct=round(ticker_returns[best_t] * 100, 2)),
        worst_performer=TickerPerformer(ticker=worst_t, return_pct=round(ticker_returns[worst_t] * 100, 2)),
        correlation_matrix=corr_dict,
        tickers=tickers,
        computed_at=datetime.now(UTC).isoformat(),
    )


@async_cached(ttl_seconds=60)
async def _fetch_candles(ticker: str, period: str, interval: str, indicators: str) -> list:
    """Cached candle fetch — TTL 60s. indicators is a comma-separated string."""
    import yfinance as yf
    import pandas as pd

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: yf.Ticker(ticker.upper()).history(period=period, interval=interval),
    )

    if data is None or data.empty:
        logger.warning("candles: no data for %s period=%s interval=%s", ticker, period, interval)
        return []

    # Compute indicators via pandas
    indicator_list = [i.strip().lower() for i in indicators.split(",") if i.strip()] if indicators else []
    closes = data["Close"].astype(float)

    ind_data: dict[str, list] = {}
    for ind in indicator_list:
        try:
            if ind == "sma20" and len(closes) >= 20:
                ind_data["sma20"] = closes.rolling(20).mean().round(4).tolist()
            elif ind == "sma50" and len(closes) >= 50:
                ind_data["sma50"] = closes.rolling(50).mean().round(4).tolist()
            elif ind == "ema12" and len(closes) >= 12:
                ind_data["ema12"] = closes.ewm(span=12, adjust=False).mean().round(4).tolist()
        except Exception as ind_err:
            logger.warning("indicator_compute_failed: %s: %s", ind, ind_err)

    import math

    candles = []
    for i, (ts, row) in enumerate(data.iterrows()):
        try:
            if hasattr(ts, "timestamp"):
                t = int(ts.timestamp())
            else:
                t = int(pd.Timestamp(ts).timestamp())
        except Exception:
            continue

        raw_vol = row["Volume"]
        vol = 0 if (raw_vol is None or (isinstance(raw_vol, float) and math.isnan(raw_vol))) else int(raw_vol)

        bar: dict = {
            "time": t,
            "open":   round(float(row["Open"]),   4),
            "high":   round(float(row["High"]),   4),
            "low":    round(float(row["Low"]),    4),
            "close":  round(float(row["Close"]),  4),
            "volume": vol,
        }
        for ind_key, values in ind_data.items():
            if i < len(values):
                v = values[i]
                bar[ind_key] = None if (v is None or (isinstance(v, float) and math.isnan(v))) else v

        candles.append(bar)

    return candles


@router.get(
    "/candles",
    summary="OHLCV candlestick data for a ticker",
)
async def get_candles(
    ticker: str = "AAPL",
    period: str = "1mo",
    interval: str = "1d",
    indicators: str = "",
) -> list:
    """
    GET /api/portfolio/candles?ticker=AAPL&period=1mo&interval=1d&indicators=sma20,sma50

    Returns OHLCV data as a JSON array suitable for lightweight-charts.
    Each element: { time, open, high, low, close, volume, [sma20?, sma50?, ema12?] }

    indicators: comma-separated list of sma20, sma50, ema12

    Supported periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, ytd, max
    Supported intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
    """
    try:
        return await _fetch_candles(ticker.upper(), period, interval, indicators)
    except Exception as exc:
        logger.error("candles_error ticker=%s: %s", ticker, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/equity-curve",
    summary="Historical portfolio value (equity curve)",
)
async def get_equity_curve(days: int = 30) -> list[dict]:
    """
    GET /api/portfolio/equity-curve?days=30

    Returns daily portfolio value for the last N trading days (7–365).
    Fetches historical close prices via yfinance for all demo positions and
    reconstructs the portfolio value as sum(quantity × daily_close) + cash.

    Falls back to a flat line at the current snapshot value on yfinance errors.
    """
    import yfinance as yf
    import pandas as pd

    days = min(max(days, 7), 365)
    tickers = [p["ticker"] for p in _DEMO_POSITIONS]
    quantities: dict[str, float] = {p["ticker"]: p["quantity"] for p in _DEMO_POSITIONS}
    fallbacks: dict[str, float] = {p["ticker"]: p["fallback_price"] for p in _DEMO_POSITIONS}

    try:
        fetch_period = f"{days + 10}d"   # buffer for weekends + holidays
        raw = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: yf.download(
                tickers,
                period=fetch_period,
                interval="1d",
                progress=False,
                auto_adjust=True,
            ),
        )

        if raw.empty or "Close" not in raw.columns:
            raise ValueError("yfinance returned empty data")

        close = raw["Close"]
        if isinstance(close, pd.Series):
            close = close.to_frame(name=tickers[0])
        elif hasattr(close.columns, "nlevels") and close.columns.nlevels > 1:
            close = close.droplevel(0, axis=1)

        result: list[dict] = []
        for date, row in close.tail(days).iterrows():
            daily_value = _CASH
            for ticker in tickers:
                raw_price = row.get(ticker)
                price = float(raw_price) if raw_price is not None and not pd.isna(raw_price) else fallbacks[ticker]
                daily_value += quantities[ticker] * price
            date_str = date.strftime("%b %d") if hasattr(date, "strftime") else str(date)[:10]
            result.append({"date": date_str, "value": round(daily_value, 2)})

        return result

    except Exception as exc:
        logger.warning("equity_curve_fallback reason=%s", exc)
        snap = _build_demo_portfolio()
        base = snap.total_value
        from datetime import timedelta
        return [
            {
                "date": (datetime.now(UTC) - timedelta(days=days - i - 1)).strftime("%b %d"),
                "value": round(base, 2),
            }
            for i in range(days)
        ]


@router.get(
    "/performance",
    response_model=PortfolioPerformance,
    summary="Portfolio performance metrics",
)
async def get_performance() -> PortfolioPerformance:
    """
    Returns aggregated performance: total return, day return, win rate etc.
    Falls back to demo portfolio data when Nautilus is unavailable.
    """
    try:
        client = get_execution_client()
        snapshot = await client.get_portfolio()
        return PortfolioPerformance(
            total_value=snapshot.total_value,
            total_pnl=snapshot.total_pnl,
            total_pnl_pct=snapshot.total_pnl_pct,
            day_pnl=snapshot.day_pnl,
            day_pnl_pct=snapshot.day_pnl_pct,
            position_count=len(snapshot.positions),
            cash_pct=snapshot.cash / snapshot.total_value if snapshot.total_value else 1.0,
        )
    except Exception as e:
        logger.warning("Performance fetch from Nautilus failed (%s) — using demo portfolio", e)
        demo = _build_demo_portfolio()
        return PortfolioPerformance(
            total_value=demo.total_value,
            total_pnl=demo.total_pnl,
            total_pnl_pct=demo.total_pnl_pct,
            day_pnl=demo.day_pnl,
            day_pnl_pct=demo.day_pnl_pct,
            position_count=len(demo.positions),
            cash_pct=demo.cash / demo.total_value if demo.total_value else 1.0,
        )
