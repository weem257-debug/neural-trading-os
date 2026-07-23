"""
Kronos forecasting signal for the 24/7 market scanner (additive enrichment).

This module is the ONLY supported entry point to the vendored Kronos K-line
foundation model. It attaches a forward-looking OHLCV forecast to the Top-N
prefilter candidates and derives a normalized directional signal from it, which
Stage 2 (Sonnet deep analysis) then consumes as one additional input.

Design guarantees (this runs in a LIVE, real-capital scanner):
  * FULLY OPTIONAL — gated behind ``settings.KRONOS_ENABLED`` (default False).
  * GUARDED IMPORT — torch / the vendored model are imported lazily inside a
    try/except. If the deps are absent or the model fails to load, forecasting
    is silently disabled for the process; the scanner behaves exactly as before.
  * NON-BLOCKING — inference is CPU-bound and synchronous, so it is offloaded to
    a worker thread with a hard wall-clock timeout. An overrun degrades to the
    technical-only path instead of stalling the async event loop / scan cycle.
  * ADDITIVE — a forecast is only ever *attached* to a candidate; it never drops,
    reorders, or blocks a candidate, and never affects the cost-guard.
"""
import asyncio
import logging
import threading
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Process-wide lazy singleton. ``_LOAD_FAILED`` latches so we log the failure
# once and then cheaply no-op for the rest of the process lifetime.
_predictor = None
_predictor_lock = threading.Lock()
_LOAD_FAILED = False


async def warm_up() -> bool:
    """
    Preload the Kronos model at startup so the first real scan cycle doesn't pay
    the cold-load + first-inference penalty. No-op (returns False) unless Kronos
    is enabled and the deps are present. Never raises.
    """
    if not settings.KRONOS_ENABLED:
        return False
    predictor = await asyncio.to_thread(_load_predictor)
    ok = predictor is not None
    logger.info("kronos_warm_up", extra={"loaded": ok})
    return ok


def _load_predictor():
    """
    Lazily build the Kronos predictor once per process. Returns the predictor or
    None if unavailable. Never raises. All heavy imports happen HERE so the base
    backend (without torch) is completely unaffected until Kronos is enabled.
    """
    global _predictor, _LOAD_FAILED
    if _predictor is not None:
        return _predictor
    if _LOAD_FAILED:
        return None

    with _predictor_lock:
        if _predictor is not None:
            return _predictor
        if _LOAD_FAILED:
            return None
        try:
            # Ensure a writable HuggingFace cache. In the container the app runs
            # as a non-root system user whose HOME may be unwritable, so the
            # default ~/.cache/huggingface download target fails. Honour an
            # explicit HF_HOME if set (Dockerfile), else fall back to a temp dir
            # that is always writable — otherwise from_pretrained cannot cache
            # the downloaded weights and load fails.
            import os
            import tempfile
            os.environ.setdefault(
                "HF_HOME", os.path.join(tempfile.gettempdir(), "kronos_hf_cache")
            )

            import torch  # noqa: F401  (heavy, optional dependency)
            from app.services.scanner.kronos_model import (
                Kronos,
                KronosTokenizer,
                KronosPredictor,
            )

            # Keep CPU inference from oversubscribing the container's cores and
            # starving the async web workers sharing this process.
            try:
                torch.set_num_threads(max(1, min(4, (torch.get_num_threads() or 4))))
            except Exception:
                pass

            tokenizer = KronosTokenizer.from_pretrained(settings.KRONOS_TOKENIZER)
            model = Kronos.from_pretrained(settings.KRONOS_MODEL)
            model.eval()
            predictor = KronosPredictor(
                model,
                tokenizer,
                device=settings.KRONOS_DEVICE,
                max_context=settings.KRONOS_MAX_CONTEXT,
            )
            _predictor = predictor
            logger.info(
                "kronos_predictor_loaded",
                extra={
                    "model": settings.KRONOS_MODEL,
                    "tokenizer": settings.KRONOS_TOKENIZER,
                    "device": settings.KRONOS_DEVICE,
                },
            )
            return _predictor
        except Exception as e:
            _LOAD_FAILED = True
            # Put the reason IN the message: this app renders logs via structlog,
            # where stdlib ``extra={}`` fields are dropped — so the reason must be
            # inline to be visible in the deploy logs.
            logger.warning(
                "kronos_predictor_load_failed_disabling reason=%r hf_home=%s",
                str(e), os.environ.get("HF_HOME"),
            )
            return None


def _ohlcv_to_kronos_inputs(hist_df, lookback: int, pred_len: int):
    """
    Convert a yfinance OHLCV frame (columns Open/High/Low/Close/Volume, a
    DatetimeIndex) into the (df, x_timestamp, y_timestamp) triple Kronos expects:
    lowercase price/volume columns plus a synthetic future timestamp index.

    Returns None if the frame is too short or malformed.
    """
    import pandas as pd

    if hist_df is None or getattr(hist_df, "empty", True):
        return None
    if len(hist_df) < max(32, lookback // 4):
        # Not enough history to be meaningful.
        return None

    df = hist_df.tail(lookback).copy()
    # yfinance columns are capitalised; Kronos wants lowercase o/h/l/c/v.
    rename = {c: c.lower() for c in df.columns}
    df = df.rename(columns=rename)
    needed = ["open", "high", "low", "close", "volume"]
    if not all(col in df.columns for col in needed):
        return None
    df = df[needed].astype("float64")
    if df[needed].isnull().values.any():
        df = df.dropna()
        if len(df) < 32:
            return None

    # Timestamps. Use the frame's own index for history; synthesise the future
    # index by extending the observed median cadence (daily bars here).
    idx = pd.to_datetime(df.index)
    x_timestamp = pd.Series(idx)
    if len(idx) >= 2:
        step = (idx[-1] - idx[-2])
    else:
        step = pd.Timedelta(days=1)
    if step <= pd.Timedelta(0):
        step = pd.Timedelta(days=1)
    y_index = [idx[-1] + step * (i + 1) for i in range(pred_len)]
    y_timestamp = pd.Series(pd.to_datetime(y_index))
    return df.reset_index(drop=True), x_timestamp, y_timestamp


# Volatility-normalisation constant: an expected move of ``_VOL_KAPPA`` times the
# recent realised (per-bar) volatility maps to full model confidence (score→1).
_VOL_KAPPA = 2.0
# Fallback reference move when realised volatility can't be computed.
_FALLBACK_REF_MOVE = 0.03


def _derive_signal(
    last_close: float,
    pred_df,
    realized_vol: Optional[float],
    sample_dispersion: Optional[float] = None,
) -> dict:
    """
    Turn a Kronos OHLCV forecast into a normalized directional signal.

    Method (per ai-ml-engineer review — volatility-normalised so assets are
    directly comparable):
      * expected_return = (mean forecast close over the horizon / last_close) - 1
        (the horizon mean, not just the final bar, dampens single-step noise)
      * direction: BUY if expected_return > +MIN_ABS_RETURN, SELL if < -MIN,
        else NEUTRAL.
      * score in [0,1] = |expected_return| / (KAPPA * realized_vol), clipped.
        realized_vol is the recent per-bar return volatility of the SAME symbol,
        so a 1% forecast on a calm name scores higher than 1% on a wild one.
        Falls back to a fixed 3% reference move if vol is unavailable.
      * optional dispersion shrink when a multi-sample spread is supplied.
    """
    import numpy as np

    closes = np.asarray(pred_df["close"].values, dtype="float64")
    closes = closes[np.isfinite(closes)]
    if last_close is None or last_close <= 0 or closes.size == 0:
        return {
            "available": True,
            "direction": "NEUTRAL",
            "score": 0.0,
            "expected_return": 0.0,
            "horizon": int(closes.size),
        }

    mean_close = float(np.mean(closes))
    final_close = float(closes[-1])
    expected_return = (mean_close / last_close) - 1.0

    min_ret = settings.KRONOS_MIN_ABS_RETURN
    if expected_return > min_ret:
        direction = "BUY"
    elif expected_return < -min_ret:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    # Volatility-normalised magnitude.
    if realized_vol and realized_vol > 1e-9:
        ref = _VOL_KAPPA * realized_vol
    else:
        ref = _FALLBACK_REF_MOVE
    magnitude = abs(expected_return) / ref if ref > 0 else 0.0
    # Dispersion shrink: if provided (multi-sample), damp confidence when the
    # samples disagree relative to the move size.
    if sample_dispersion is not None and abs(expected_return) > 1e-9:
        noise_ratio = min(1.0, sample_dispersion / (abs(expected_return) + 1e-9))
        magnitude *= (1.0 - 0.5 * noise_ratio)
    score = round(max(0.0, min(1.0, magnitude)), 4)

    return {
        "available": True,
        "direction": direction,
        "score": score,
        "expected_return": round(expected_return, 6),
        "final_return": round((final_close / last_close) - 1.0, 6),
        "realized_vol": round(float(realized_vol), 6) if realized_vol else None,
        "horizon": int(closes.size),
        "model": settings.KRONOS_MODEL,
    }


def _run_batch_forecast(predictor, prepared: list) -> list:
    """
    Blocking Kronos batch inference over the prepared candidate inputs. Runs in a
    worker thread. Returns a list of signal dicts aligned with ``prepared`` (each
    item is (symbol, last_close, df, x_ts, y_ts)); entries that fail are None.
    """
    import numpy as np

    df_list = [p[2] for p in prepared]
    x_list = [p[3] for p in prepared]
    y_list = [p[4] for p in prepared]

    sample_count = max(1, int(settings.KRONOS_SAMPLE_COUNT))
    preds = predictor.predict_batch(
        df_list=df_list,
        x_timestamp_list=x_list,
        y_timestamp_list=y_list,
        pred_len=settings.KRONOS_PRED_LEN,
        T=settings.KRONOS_TEMPERATURE,
        top_p=settings.KRONOS_TOP_P,
        sample_count=sample_count,
        verbose=False,
    )

    signals = []
    for (symbol, last_close, hist_df, _x, _y), pred_df in zip(prepared, preds):
        try:
            realized_vol = _realized_vol(hist_df)
            # predict_batch already averages samples internally; we don't get the
            # per-sample spread back, so dispersion is left None here. (Set >1
            # sample_count only to smooth the mean, not for a spread measure.)
            sig = _derive_signal(last_close, pred_df, realized_vol, sample_dispersion=None)
            signals.append(sig)
        except Exception:
            signals.append(None)
    return signals


def _realized_vol(hist_df) -> Optional[float]:
    """Std of per-bar log returns over the lookback (per-bar realised vol)."""
    import numpy as np

    try:
        close = np.asarray(hist_df["close"].values, dtype="float64")
        close = close[np.isfinite(close) & (close > 0)]
        if close.size < 5:
            return None
        rets = np.diff(np.log(close))
        vol = float(np.std(rets))
        return vol if np.isfinite(vol) and vol > 0 else None
    except Exception:
        return None


async def attach_forecasts(candidates: list, now=None) -> None:
    """
    Attach a Kronos forecast (``candidate.forecast``) to each candidate in place.

    No-ops entirely when Kronos is disabled, the model can't load, or anything
    fails — candidates are left untouched (technical-only path). Never raises.

    Fetching reuses the same free yfinance daily history the prefilter uses, so
    no new paid data source is introduced. Inference is offloaded to a thread
    with a hard timeout.
    """
    if not settings.KRONOS_ENABLED or not candidates:
        return

    predictor = await asyncio.to_thread(_load_predictor)
    if predictor is None:
        return

    try:
        from app.services.scanner.prefilter import _download_chunk, _extract_symbol_frame

        symbols = [c.symbol for c in candidates]
        # One batch download for the Top-N (<= SCAN_TOP_N, small).
        data = await asyncio.to_thread(_download_chunk, symbols)
        multi = len(symbols) > 1

        prepared = []
        prepared_idx = []  # index into candidates
        for i, cand in enumerate(candidates):
            frame = _extract_symbol_frame(data, cand.symbol, multi)
            triple = _ohlcv_to_kronos_inputs(
                frame, settings.KRONOS_LOOKBACK, settings.KRONOS_PRED_LEN
            )
            if triple is None:
                continue
            df, x_ts, y_ts = triple
            last_close = float(df["close"].iloc[-1])
            prepared.append((cand.symbol, last_close, df, x_ts, y_ts))
            prepared_idx.append(i)

        if not prepared:
            return

        signals = await asyncio.wait_for(
            asyncio.to_thread(_run_batch_forecast, predictor, prepared),
            timeout=settings.KRONOS_TIMEOUT_SECONDS,
        )

        attached = 0
        for idx, sig in zip(prepared_idx, signals):
            if sig is not None:
                candidates[idx].forecast = sig
                attached += 1
        logger.info(
            "kronos_forecasts_attached",
            extra={"requested": len(candidates), "attached": attached},
        )
    except asyncio.TimeoutError:
        logger.warning(
            "kronos_forecast_timeout_skipped",
            extra={"timeout_s": settings.KRONOS_TIMEOUT_SECONDS, "n": len(candidates)},
        )
    except Exception as e:
        logger.warning("kronos_forecast_failed_skipped", extra={"reason": str(e)})
