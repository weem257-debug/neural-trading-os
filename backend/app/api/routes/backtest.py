"""
/api/backtest — Strategy backtesting via Jesse, Vibe-Trading, or qlib.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from app.models.schemas import (
    BacktestRequest, BacktestResult, ErrorResponse,
    BacktestJobDeleteResponse, BacktestJobStartResponse, BacktestJobStatus,
    BacktestCompareEntry, BacktestCompareResponse, BacktestStrategyEntry,
)
from app.services.jesse.client import run_backtest as jesse_backtest
from app.core.rate_limits import limiter
from app.core.strategy_params import validate_params, get_params_schema
import asyncio
import csv
import io
import logging
import uuid
from datetime import datetime, UTC

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/backtest", tags=["Backtesting"])

# In-memory job store — replace with Redis/DB in production
_jobs: dict[str, dict] = {}


@router.post(
    "/run",
    response_model=BacktestJobStartResponse,
    summary="Start a backtest job",
)
@limiter.limit("10/minute")
async def start_backtest(
    request: Request, req: BacktestRequest, background_tasks: BackgroundTasks
) -> BacktestJobStartResponse:
    """
    Start an async backtest job.
    Returns a job_id — poll /backtest/jobs/{job_id} for results.

    Supported engines:
    - `jesse`       — Crypto, 300+ indicators
    - `vibe_trading`— 452 Alpha factors
    - `qlib`        — ML-based portfolio (Microsoft)
    """
    # Validate and normalise strategy parameters (raises 422 on invalid input)
    validated_params = validate_params(req.strategy_name, req.params)
    req = req.model_copy(update={"params": validated_params})

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "request": req.model_dump(),
        "created_at": datetime.now(UTC).isoformat(),
        "result": None,
        "error": None,
    }

    background_tasks.add_task(_run_backtest_task, job_id, req)
    return BacktestJobStartResponse(job_id=job_id, status="queued")


async def _run_backtest_task(job_id: str, req: BacktestRequest) -> None:
    """Background task: run the backtest and store result."""
    _jobs[job_id]["status"] = "running"
    _jobs[job_id]["started_at"] = datetime.now(UTC).isoformat()
    try:
        engine = req.engine.lower()
        if engine == "jesse":
            result = await jesse_backtest(req)
        elif engine == "vibe_trading":
            result = await _vibe_trading_backtest(req)
        elif engine == "qlib":
            result = await _qlib_backtest(req)
        else:
            raise ValueError(f"Unknown engine: {engine}. Use jesse/vibe_trading/qlib")

        _jobs[job_id]["status"] = "completed"
        _jobs[job_id]["result"] = result.model_dump()
    except Exception as e:
        logger.error("Backtest job %s failed: %s", job_id, e)
        _jobs[job_id]["status"] = "failed"
        _jobs[job_id]["error"] = str(e)
    finally:
        _jobs[job_id]["finished_at"] = datetime.now(UTC).isoformat()


async def _vibe_trading_backtest(req: BacktestRequest) -> BacktestResult:
    """
    RSI Mean-Reversion strategy — inspired by Vibe-Trading's factor library.
    Buy on RSI oversold (<30), sell on RSI overbought (>70).
    Falls back to stub only when yfinance/pandas are unavailable.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_rsi_reversion_sync, req)


def _run_rsi_reversion_sync(req: BacktestRequest) -> BacktestResult:
    try:
        import pandas as pd
        import yfinance as yf
    except ImportError as exc:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason=f"missing_dependency: {exc}")

    rsi_period: int = int(req.params.get("rsi_period", 14))
    oversold: float   = float(req.params.get("oversold",  30.0))
    overbought: float = float(req.params.get("overbought", 70.0))
    fee: float        = float(req.params.get("fee", 0.001))

    yf_sym = req.ticker.upper().replace("-USDT", "-USD")
    logger.info("Vibe-Trading RSI-Reversion: %s | %s→%s | rsi=%d", yf_sym, req.start_date, req.end_date, rsi_period)

    try:
        df = yf.download(yf_sym, start=req.start_date, end=req.end_date, progress=False, auto_adjust=True)
    except Exception as exc:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason=f"yfinance_error: {exc}")

    if df is None or df.empty:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason=f"no_price_data_for_{yf_sym}")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    close = df["Close"].dropna()
    if len(close) < rsi_period + 10:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason="insufficient_data")

    # RSI calculation
    delta = close.diff()
    gain  = delta.clip(lower=0).rolling(rsi_period).mean()
    loss  = (-delta.clip(upper=0)).rolling(rsi_period).mean()
    rs    = gain / loss.replace(0, float("nan"))
    rsi   = 100 - (100 / (1 + rs))

    capital = req.initial_capital
    in_position = False
    position_price = 0.0
    trades: list[dict] = []
    equity_curve: list[dict] = []

    for i in range(rsi_period + 1, len(close)):
        date_str = str(close.index[i])[:10]
        price    = float(close.iloc[i])
        rsi_val  = float(rsi.iloc[i])

        if not in_position and rsi_val < oversold:
            position_price = price * (1 + fee)
            in_position = True
            trades.append({"date": date_str, "side": "BUY", "price": round(position_price, 4), "rsi": round(rsi_val, 1)})

        elif in_position and rsi_val > overbought:
            exit_price = price * (1 - fee)
            pnl_pct = (exit_price - position_price) / position_price
            capital *= (1 + pnl_pct)
            trades.append({"date": date_str, "side": "SELL", "price": round(exit_price, 4), "rsi": round(rsi_val, 1), "pnl_pct": round(pnl_pct * 100, 3)})
            in_position = False
            position_price = 0.0

        if i % 5 == 0:
            eq = capital if not in_position else capital * (price / position_price)
            equity_curve.append({"date": date_str, "value": round(eq, 2)})

    if in_position:
        last_price = float(close.iloc[-1]) * (1 - fee)
        pnl_pct = (last_price - position_price) / position_price
        capital *= (1 + pnl_pct)
        trades.append({"date": str(close.index[-1])[:10], "side": "SELL[close]", "price": round(last_price, 4), "pnl_pct": round(pnl_pct * 100, 3)})
        equity_curve.append({"date": str(close.index[-1])[:10], "value": round(capital, 2)})

    sell_trades  = [t for t in trades if "SELL" in t["side"] and "pnl_pct" in t]
    total_return = (capital - req.initial_capital) / req.initial_capital * 100
    win_rate     = len([t for t in sell_trades if t["pnl_pct"] > 0]) / max(len(sell_trades), 1)
    n_days       = max((pd.to_datetime(req.end_date) - pd.to_datetime(req.start_date)).days, 1)
    ann_return   = ((capital / req.initial_capital) ** (365 / n_days) - 1) * 100

    max_dd = 0.0
    peak = req.initial_capital
    for pt in equity_curve:
        peak   = max(peak, pt["value"])
        max_dd = max(max_dd, (peak - pt["value"]) / peak if peak > 0 else 0.0)

    sharpe = 0.0
    try:
        if len(equity_curve) > 5:
            import numpy as np
            vals = pd.Series([p["value"] for p in equity_curve]).pct_change().dropna()
            if vals.std() > 0:
                sharpe = round(float((vals.mean() / vals.std()) * (252 ** 0.5)), 3)
    except Exception:
        pass

    logger.info("Vibe-Trading RSI-Reversion done: %s | return=%.1f%% | trades=%d", yf_sym, total_return, len(sell_trades))
    return BacktestResult(
        strategy_name=f"RSI-Reversion({rsi_period})",
        ticker=req.ticker,
        start_date=req.start_date,
        end_date=req.end_date,
        engine="vibe_trading",
        initial_capital=req.initial_capital,
        final_capital=round(capital, 2),
        total_return_pct=round(total_return, 3),
        annualized_return_pct=round(ann_return, 3),
        max_drawdown_pct=round(max_dd * 100, 3),
        sharpe_ratio=sharpe,
        win_rate=round(win_rate, 4),
        total_trades=len(sell_trades),
        equity_curve=equity_curve,
        trades=trades,
    )


async def _qlib_backtest(req: BacktestRequest) -> BacktestResult:
    """
    Dual-Momentum strategy — inspired by qlib's ML ranking pipeline.
    Goes long when both short-term (20d) and long-term (60d) momentum are
    positive; exits when either turns negative.
    Falls back to stub only when yfinance/pandas are unavailable.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_dual_momentum_sync, req)


def _run_dual_momentum_sync(req: BacktestRequest) -> BacktestResult:
    try:
        import pandas as pd
        import yfinance as yf
    except ImportError as exc:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason=f"missing_dependency: {exc}")

    short_w: int = int(req.params.get("short_window", 20))
    long_w:  int = int(req.params.get("long_window",  60))
    fee:     float = float(req.params.get("fee", 0.001))

    yf_sym = req.ticker.upper().replace("-USDT", "-USD")
    logger.info("qlib Dual-Momentum: %s | %s→%s | short=%d long=%d", yf_sym, req.start_date, req.end_date, short_w, long_w)

    try:
        df = yf.download(yf_sym, start=req.start_date, end=req.end_date, progress=False, auto_adjust=True)
    except Exception as exc:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason=f"yfinance_error: {exc}")

    if df is None or df.empty:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason=f"no_price_data_for_{yf_sym}")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    close = df["Close"].dropna()
    if len(close) < long_w + 10:
        from app.services.jesse.client import _stub_result
        return _stub_result(req, reason="insufficient_data")

    # Momentum: price / price[n days ago] - 1
    mom_short = close / close.shift(short_w) - 1
    mom_long  = close / close.shift(long_w)  - 1

    capital = req.initial_capital
    in_position = False
    position_price = 0.0
    trades: list[dict] = []
    equity_curve: list[dict] = []

    for i in range(long_w + 1, len(close)):
        date_str  = str(close.index[i])[:10]
        price     = float(close.iloc[i])
        ms        = float(mom_short.iloc[i])
        ml        = float(mom_long.iloc[i])
        both_pos  = ms > 0 and ml > 0
        both_neg  = ms < 0 and ml < 0

        if not in_position and both_pos:
            position_price = price * (1 + fee)
            in_position = True
            trades.append({"date": date_str, "side": "BUY", "price": round(position_price, 4), "mom_short": round(ms, 4), "mom_long": round(ml, 4)})

        elif in_position and both_neg:
            exit_price = price * (1 - fee)
            pnl_pct = (exit_price - position_price) / position_price
            capital *= (1 + pnl_pct)
            trades.append({"date": date_str, "side": "SELL", "price": round(exit_price, 4), "pnl_pct": round(pnl_pct * 100, 3)})
            in_position = False
            position_price = 0.0

        if i % 5 == 0:
            eq = capital if not in_position else capital * (price / position_price)
            equity_curve.append({"date": date_str, "value": round(eq, 2)})

    if in_position:
        last_price = float(close.iloc[-1]) * (1 - fee)
        pnl_pct = (last_price - position_price) / position_price
        capital *= (1 + pnl_pct)
        trades.append({"date": str(close.index[-1])[:10], "side": "SELL[close]", "price": round(last_price, 4), "pnl_pct": round(pnl_pct * 100, 3)})
        equity_curve.append({"date": str(close.index[-1])[:10], "value": round(capital, 2)})

    sell_trades  = [t for t in trades if "SELL" in t["side"] and "pnl_pct" in t]
    total_return = (capital - req.initial_capital) / req.initial_capital * 100
    win_rate     = len([t for t in sell_trades if t["pnl_pct"] > 0]) / max(len(sell_trades), 1)
    n_days       = max((pd.to_datetime(req.end_date) - pd.to_datetime(req.start_date)).days, 1)
    ann_return   = ((capital / req.initial_capital) ** (365 / n_days) - 1) * 100

    max_dd = 0.0
    peak = req.initial_capital
    for pt in equity_curve:
        peak   = max(peak, pt["value"])
        max_dd = max(max_dd, (peak - pt["value"]) / peak if peak > 0 else 0.0)

    sharpe = 0.0
    try:
        if len(equity_curve) > 5:
            import numpy as np
            vals = pd.Series([p["value"] for p in equity_curve]).pct_change().dropna()
            if vals.std() > 0:
                sharpe = round(float((vals.mean() / vals.std()) * (252 ** 0.5)), 3)
    except Exception:
        pass

    logger.info("qlib Dual-Momentum done: %s | return=%.1f%% | trades=%d", yf_sym, total_return, len(sell_trades))
    return BacktestResult(
        strategy_name=f"Dual-Momentum({short_w}/{long_w})",
        ticker=req.ticker,
        start_date=req.start_date,
        end_date=req.end_date,
        engine="qlib",
        initial_capital=req.initial_capital,
        final_capital=round(capital, 2),
        total_return_pct=round(total_return, 3),
        annualized_return_pct=round(ann_return, 3),
        max_drawdown_pct=round(max_dd * 100, 3),
        sharpe_ratio=sharpe,
        win_rate=round(win_rate, 4),
        total_trades=len(sell_trades),
        equity_curve=equity_curve,
        trades=trades,
    )


@router.post(
    "/compare",
    response_model=BacktestCompareResponse,
    summary="Run multiple strategies in parallel and return comparison table",
)
async def compare_strategies(body: dict) -> BacktestCompareResponse:
    """
    POST /api/backtest/compare

    Body:
    {
        "ticker":     "AAPL",
        "period":     "1y",
        "strategies": ["ma_crossover", "rsi_mean_reversion", "buy_and_hold"]
    }

    Runs all requested strategies concurrently via asyncio.gather and returns
    a comparison table sorted by total_return_pct descending.

    Returns:
    {
        "ticker": "AAPL",
        "period": "1y",
        "best_strategy": "buy_and_hold",
        "results": [
            {
                "strategy":    "buy_and_hold",
                "return_pct":  18.4,
                "sharpe":      1.12,
                "drawdown":    8.3,
                "trades":      1,
                "is_best":     true,
            },
            ...
        ]
    }
    """
    ticker       = str(body.get("ticker",     "AAPL")).upper()
    period       = str(body.get("period",     "1y"))
    strategy_ids = list(body.get("strategies", ["ma_crossover", "rsi_mean_reversion", "buy_and_hold"]))

    if not strategy_ids:
        raise HTTPException(status_code=422, detail="strategies list must not be empty")

    # Map strategy slug → BacktestRequest parameters
    _STRATEGY_MAP: dict[str, dict] = {
        "ma_crossover":       {"strategy_name": "MA Crossover",       "params": {"fast_window": 20, "slow_window": 50, "fee": 0.001}},
        "rsi_mean_reversion": {"strategy_name": "RSI Mean Reversion",  "params": {"rsi_period": 14, "oversold": 30, "overbought": 70, "fee": 0.001}},
        "buy_and_hold":       {"strategy_name": "Buy & Hold",          "params": {"fee": 0.001}},
    }

    # Determine date range from period string
    from datetime import date, timedelta
    period_days_map = {
        "1mo": 30, "3mo": 90, "6mo": 180,
        "1y": 365, "2y": 730, "5y": 1825, "ytd": None,
    }
    p_days = period_days_map.get(period.lower(), 365)
    end_dt   = date.today()
    if p_days is None:
        start_dt = date(end_dt.year, 1, 1)
    else:
        start_dt = end_dt - timedelta(days=p_days)

    start_str = start_dt.isoformat()
    end_str   = end_dt.isoformat()

    async def _run_one(slug: str) -> dict:
        meta = _STRATEGY_MAP.get(slug, {"strategy_name": slug, "params": {}})
        req = BacktestRequest(
            strategy_name=meta["strategy_name"],
            ticker=ticker,
            start_date=start_str,
            end_date=end_str,
            initial_capital=10_000.0,
            engine="jesse",
            params=meta["params"],
        )
        try:
            result: BacktestResult = await jesse_backtest(req)
            return {
                "strategy":   slug,
                "return_pct": round(result.total_return_pct, 2),
                "sharpe":     round(result.sharpe_ratio, 3),
                "drawdown":   round(result.max_drawdown_pct, 2),
                "trades":     result.total_trades,
                "is_best":    False,
            }
        except Exception as exc:
            logger.warning("compare strategy %s failed: %s", slug, exc)
            return {
                "strategy":   slug,
                "return_pct": 0.0,
                "sharpe":     0.0,
                "drawdown":   0.0,
                "trades":     0,
                "is_best":    False,
                "error":      str(exc),
            }

    # Run all strategies in parallel
    tasks   = [_run_one(slug) for slug in strategy_ids]
    results = await asyncio.gather(*tasks)
    rows    = list(results)

    # Sort by return descending
    rows.sort(key=lambda r: r["return_pct"], reverse=True)

    # Mark best
    if rows:
        rows[0]["is_best"] = True
        best_name = rows[0]["strategy"]
    else:
        best_name = ""

    typed_rows = [BacktestCompareEntry(**r) for r in rows]
    return BacktestCompareResponse(
        ticker=ticker,
        period=period,
        start_date=start_str,
        end_date=end_str,
        best_strategy=best_name,
        results=typed_rows,
        computed_at=datetime.now(UTC).isoformat(),
    )


@router.get(
    "/strategies",
    response_model=list[BacktestStrategyEntry],
    summary="List available backtest strategies",
)
async def list_strategies() -> list[BacktestStrategyEntry]:
    """
    Returns the catalogue of available backtest strategies.

    Each entry contains:
    - id           : machine-readable slug used in BacktestRequest.strategy_name
    - name         : human-readable display name
    - description  : brief explanation
    - engines      : list of compatible engines
    - default_params: suggested parameter defaults
    """
    return [
        BacktestStrategyEntry(
            id="ma_crossover",
            name="MA Crossover",
            description="Golden/death cross signal using fast (20) and slow (50) moving averages.",
            engines=["jesse", "vibe_trading", "qlib"],
            default_params={"fast_period": 20, "slow_period": 50, "fee": 0.001},
            params_schema=get_params_schema("ma_crossover"),
        ),
        BacktestStrategyEntry(
            id="rsi_mean_reversion",
            name="RSI Mean Reversion",
            description="Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought). Period: 14.",
            engines=["jesse", "vibe_trading"],
            default_params={"rsi_period": 14, "oversold": 30, "overbought": 70, "fee": 0.001},
            params_schema=get_params_schema("rsi_mean_reversion"),
        ),
        BacktestStrategyEntry(
            id="buy_and_hold",
            name="Buy & Hold",
            description="Baseline: buy on day 1, hold until end date. No rebalancing.",
            engines=["jesse", "vibe_trading", "qlib"],
            default_params={"fee": 0.001},
            params_schema=get_params_schema("buy_and_hold"),
        ),
    ]


@router.get(
    "/export/{job_id}",
    summary="Export backtest result as CSV",
    responses={200: {"content": {"text/csv": {}}}},
)
async def export_backtest(job_id: str) -> StreamingResponse:
    """
    Download equity-curve and trade-list for a completed backtest job as CSV.
    Returns 404 if job not found, 409 if job not yet completed.
    """
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    job = _jobs[job_id]
    if job["status"] == "failed":
        raise HTTPException(status_code=409, detail=f"Job {job_id} failed: {job.get('error', 'unknown')}")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Job {job_id} not yet completed (status: {job['status']})")

    result = job.get("result") or {}
    output = io.StringIO()

    # ---- Section 1: summary metrics ----
    output.write("# SUMMARY\r\n")
    summary_fields = [
        "strategy_name", "ticker", "engine", "start_date", "end_date",
        "initial_capital", "final_capital", "total_return_pct",
        "annualized_return_pct", "sharpe_ratio", "max_drawdown_pct",
        "win_rate", "total_trades", "profit_factor",
    ]
    req = job.get("request", {})
    summary_writer = csv.writer(output)
    summary_writer.writerow(["field", "value"])
    for f in summary_fields:
        val = result.get(f) or req.get(f) or ""
        summary_writer.writerow([f, val])

    # ---- Section 2: equity curve ----
    output.write("\r\n# EQUITY_CURVE\r\n")
    equity_curve = result.get("equity_curve", [])
    if equity_curve:
        eq_writer = csv.DictWriter(output, fieldnames=["date", "value"], extrasaction="ignore")
        eq_writer.writeheader()
        for point in equity_curve:
            eq_writer.writerow(point)

    # ---- Section 3: trades ----
    output.write("\r\n# TRADES\r\n")
    trades = result.get("trades", [])
    if trades:
        trade_fields = list(trades[0].keys()) if trades else []
        trade_writer = csv.DictWriter(output, fieldnames=trade_fields, extrasaction="ignore")
        trade_writer.writeheader()
        for trade in trades:
            trade_writer.writerow(trade)

    output.seek(0)
    filename = f"backtest_{job_id[:8]}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get(
    "/results/{job_id}",
    response_model=BacktestResult,
    summary="Get the full BacktestResult for a completed job",
)
async def get_result(job_id: str) -> BacktestResult:
    """
    Returns the complete BacktestResult (including equity_curve and trades)
    for a completed job.  Returns 404 if job does not exist, 409 if not yet
    completed or failed.
    """
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    job = _jobs[job_id]
    if job["status"] == "failed":
        raise HTTPException(
            status_code=409,
            detail=f"Job {job_id} failed: {job.get('error', 'unknown error')}",
        )
    if job["status"] != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Job {job_id} is not yet completed (status: {job['status']})",
        )
    if job.get("result") is None:
        raise HTTPException(status_code=500, detail="Job completed but result is missing")
    return BacktestResult(**job["result"])


@router.get(
    "/jobs",
    response_model=list[BacktestJobStatus],
    summary="List all backtest jobs",
)
async def list_jobs() -> list[BacktestJobStatus]:
    return [BacktestJobStatus(**j) for j in _jobs.values()]


@router.get(
    "/jobs/{job_id}",
    response_model=BacktestJobStatus,
    summary="Get backtest job status and result",
)
async def get_job(job_id: str) -> BacktestJobStatus:
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return BacktestJobStatus(**_jobs[job_id])


@router.delete(
    "/jobs/{job_id}",
    response_model=BacktestJobDeleteResponse,
    summary="Delete a backtest job",
)
async def delete_job(job_id: str) -> BacktestJobDeleteResponse:
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    del _jobs[job_id]
    return BacktestJobDeleteResponse(deleted=job_id)
