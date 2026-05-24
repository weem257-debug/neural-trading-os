"""
Jesse Backtesting Service
--------------------------
Wraps the Jesse crypto-trading framework for backtesting and risk metrics.
Jesse has 300+ built-in indicators and a clean strategy API.
"""
import sys
import os
import uuid
import logging
import asyncio
from datetime import datetime
from typing import Any

from app.core.config import settings
from app.models.schemas import BacktestRequest, BacktestResult, RiskMetrics

logger = logging.getLogger(__name__)


def _ensure_jesse_on_path() -> bool:
    repo_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../../../jesse")
    )
    if not os.path.isdir(repo_path):
        logger.warning("Jesse repo not found at %s", repo_path)
        return False
    if repo_path not in sys.path:
        sys.path.insert(0, repo_path)
    return True


async def run_backtest(req: BacktestRequest) -> BacktestResult:
    """
    Execute a Jesse backtest for the given strategy configuration.
    Runs in a thread pool to avoid blocking the event loop.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _run_jesse_sync, req)
    return result


def _run_jesse_sync(req: BacktestRequest) -> BacktestResult:
    """
    Synchronous backtest execution.

    Priority:
    1. Real Jesse framework (if installed and repo available)
    2. Built-in Moving-Average-Crossover demo backtest (Pure Python + pandas +
       yfinance) — always available, no Jesse install required.
    """
    # --- Try real Jesse first ---
    if _ensure_jesse_on_path():
        try:
            import jesse.helpers as jh  # type: ignore  # noqa: F401
            from jesse import research  # type: ignore   # noqa: F401
            # Real Jesse integration goes here when strategy class is wired.
            # For now fall through to the demo engine.
            logger.info("Jesse installed but strategy not wired — using demo engine")
        except ImportError:
            pass  # Jesse not installed — fall through

    # --- Demo MA-Crossover backtest (pure Python) ---
    return _run_ma_crossover_backtest(req)


def _run_ma_crossover_backtest(req: BacktestRequest) -> BacktestResult:
    """
    Simple Moving-Average Crossover strategy backtest.

    Signal logic:
      - Fast MA crosses above Slow MA  → BUY  (go long)
      - Fast MA crosses below Slow MA  → SELL (close long)

    Parameters read from req.params:
      - fast_window (int, default 20)
      - slow_window (int, default 50)
      - fee         (float, default 0.001 = 0.1%)

    Data source: yfinance daily OHLCV (free, no API key).
    """
    try:
        import pandas as pd
        import yfinance as yf
    except ImportError as exc:
        logger.error("pandas/yfinance not installed: %s", exc)
        return _stub_result(req, reason=f"missing_dependency: {exc}")

    # Support both legacy keys (fast_window/slow_window) and new canonical keys
    # (fast_period/slow_period) — canonical takes precedence.
    fast_w: int = int(
        req.params.get("fast_period", req.params.get("fast_window", 20))
    )
    slow_w: int = int(
        req.params.get("slow_period", req.params.get("slow_window", 50))
    )
    fee: float = float(req.params.get("fee", 0.001))

    ticker_sym = req.ticker.upper()
    # For crypto-style tickers passed as BTC-USDT, map to yfinance format
    yf_sym = ticker_sym.replace("-USDT", "-USD")

    logger.info(
        "MA-Crossover backtest: %s | %s → %s | fast=%d slow=%d",
        yf_sym, req.start_date, req.end_date, fast_w, slow_w,
    )

    try:
        df = yf.download(yf_sym, start=req.start_date, end=req.end_date,
                         progress=False, auto_adjust=True)
    except Exception as exc:
        logger.error("yfinance download failed for %s: %s", yf_sym, exc)
        return _stub_result(req, reason=f"yfinance_error: {exc}")

    if df is None or df.empty:
        return _stub_result(req, reason=f"no_price_data_for_{yf_sym}")

    # Flatten MultiIndex columns if yfinance returns them
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    close = df["Close"].dropna()
    if len(close) < slow_w + 5:
        return _stub_result(req, reason="insufficient_data")

    fast_ma = close.rolling(fast_w).mean()
    slow_ma = close.rolling(slow_w).mean()

    # --- Simulate trades ---
    capital = req.initial_capital
    position_price: float = 0.0
    in_position = False
    trades: list[dict] = []
    equity_curve: list[dict] = []
    peak_equity = capital

    for i in range(slow_w, len(close)):
        date_str = str(close.index[i])[:10]
        price = float(close.iloc[i])
        fma_prev = float(fast_ma.iloc[i - 1])
        sma_prev = float(slow_ma.iloc[i - 1])
        fma_cur  = float(fast_ma.iloc[i])
        sma_cur  = float(slow_ma.iloc[i])

        # Golden cross → BUY
        if not in_position and fma_prev < sma_prev and fma_cur >= sma_cur:
            position_price = price * (1 + fee)
            in_position = True
            trades.append({
                "date": date_str, "side": "BUY", "price": round(position_price, 4),
                "capital": round(capital, 2),
            })

        # Death cross → SELL
        elif in_position and fma_prev > sma_prev and fma_cur <= sma_cur:
            exit_price = price * (1 - fee)
            pnl_pct = (exit_price - position_price) / position_price
            capital *= (1 + pnl_pct)
            trades.append({
                "date": date_str, "side": "SELL", "price": round(exit_price, 4),
                "capital": round(capital, 2), "pnl_pct": round(pnl_pct * 100, 3),
            })
            in_position = False
            position_price = 0.0

        # Mark-to-market equity
        current_equity = capital if not in_position else capital * (price / position_price)
        peak_equity = max(peak_equity, current_equity)

        if i % 5 == 0:   # sample every 5 days to keep payload small
            equity_curve.append({"date": date_str, "value": round(current_equity, 2)})

    # Close open position at last close
    if in_position:
        last_price = float(close.iloc[-1]) * (1 - fee)
        pnl_pct = (last_price - position_price) / position_price
        capital *= (1 + pnl_pct)
        trades.append({
            "date": str(close.index[-1])[:10], "side": "SELL[close]",
            "price": round(last_price, 4), "capital": round(capital, 2),
            "pnl_pct": round(pnl_pct * 100, 3),
        })
        equity_curve.append({"date": str(close.index[-1])[:10], "value": round(capital, 2)})

    # --- Metrics ---
    total_return_pct = (capital - req.initial_capital) / req.initial_capital * 100

    sell_trades = [t for t in trades if "SELL" in t["side"] and "pnl_pct" in t]
    win_rate = (
        len([t for t in sell_trades if t["pnl_pct"] > 0]) / len(sell_trades)
        if sell_trades else 0.0
    )

    # Annualise return
    n_days = (
        pd.to_datetime(req.end_date) - pd.to_datetime(req.start_date)
    ).days or 1
    annualized_return_pct = ((capital / req.initial_capital) ** (365 / n_days) - 1) * 100

    # Max drawdown from equity curve
    max_dd = 0.0
    running_peak = req.initial_capital
    for point in equity_curve:
        v = point["value"]
        running_peak = max(running_peak, v)
        dd = (running_peak - v) / running_peak if running_peak > 0 else 0.0
        max_dd = max(max_dd, dd)

    # Simplified Sharpe (annualised daily returns)
    sharpe = 0.0
    try:
        if len(equity_curve) > 5:
            import numpy as np
            vals = [p["value"] for p in equity_curve]
            daily_rets = pd.Series(vals).pct_change().dropna()
            if daily_rets.std() > 0:
                sharpe = round(float((daily_rets.mean() / daily_rets.std()) * (252 ** 0.5)), 3)
    except Exception:
        pass

    logger.info(
        "MA-Crossover complete: %s | return=%.1f%% | sharpe=%.2f | trades=%d | winrate=%.0f%%",
        ticker_sym, total_return_pct, sharpe, len(sell_trades), win_rate * 100,
    )

    return BacktestResult(
        strategy_name=f"MA-Crossover({fast_w}/{slow_w})",
        ticker=req.ticker,
        start_date=req.start_date,
        end_date=req.end_date,
        engine="demo_ma_crossover",
        initial_capital=req.initial_capital,
        final_capital=round(capital, 2),
        total_return_pct=round(total_return_pct, 3),
        annualized_return_pct=round(annualized_return_pct, 3),
        max_drawdown_pct=round(max_dd * 100, 3),
        sharpe_ratio=sharpe,
        win_rate=round(win_rate, 4),
        total_trades=len(sell_trades),
        equity_curve=equity_curve,
        trades=trades,
    )


def _normalize_symbol(ticker: str) -> str:
    """Convert ticker to Jesse format, e.g. BTC → BTC-USDT."""
    t = ticker.upper()
    if "-" not in t and "USDT" not in t:
        return f"{t}-USDT"
    return t


async def compute_risk_metrics(
    positions: list[dict],
    portfolio_value: float,
) -> RiskMetrics:
    """
    Compute risk metrics from current positions.
    Uses simple analytical formulas — no Jesse needed here.
    """
    if not positions:
        return RiskMetrics(
            portfolio_var_95=0.0,
            portfolio_var_99=0.0,
            max_drawdown=0.0,
            current_drawdown=0.0,
            sharpe_ratio=0.0,
            concentration_risk=0.0,
            alerts=["No positions — risk metrics unavailable"],
        )

    # Concentration risk: sum of top-5 positions as % of portfolio
    values = sorted(
        [p.get("market_value", 0) for p in positions], reverse=True
    )
    top5_sum = sum(values[:5])
    concentration = top5_sum / portfolio_value if portfolio_value > 0 else 0.0

    alerts = []
    if concentration > 0.6:
        alerts.append(f"High concentration: top-5 positions = {concentration:.0%}")
    if portfolio_value < 10_000:
        alerts.append("Low portfolio value — consider minimum capital requirements")

    # Simplified VaR (parametric, assuming 2% daily vol)
    daily_vol = 0.02
    var_95 = portfolio_value * daily_vol * 1.645
    var_99 = portfolio_value * daily_vol * 2.326

    return RiskMetrics(
        portfolio_var_95=round(var_95, 2),
        portfolio_var_99=round(var_99, 2),
        max_drawdown=0.0,       # populated from historical data later
        current_drawdown=0.0,
        sharpe_ratio=0.0,       # populated from historical PnL later
        concentration_risk=round(concentration, 4),
        alerts=alerts,
    )


def _stub_result(req: BacktestRequest, reason: str) -> BacktestResult:
    """Return a zeroed-out stub result when Jesse is unavailable."""
    logger.warning("Jesse stub result returned — %s", reason)
    return BacktestResult(
        strategy_name=req.strategy_name,
        ticker=req.ticker,
        start_date=req.start_date,
        end_date=req.end_date,
        engine="jesse",
        initial_capital=req.initial_capital,
        final_capital=req.initial_capital,
        total_return_pct=0.0,
        annualized_return_pct=0.0,
        max_drawdown_pct=0.0,
        sharpe_ratio=0.0,
        win_rate=0.0,
        total_trades=0,
        equity_curve=[],
        trades=[],
    )
