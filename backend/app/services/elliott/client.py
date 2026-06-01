"""
Elliott Wave Theory Engine
--------------------------
Standalone module (extractable as its own git repo).

Algorithm:
  1. Download OHLCV via yfinance
  2. Compute ZigZag pivot points (local highs/lows, min 5% swing filter)
  3. Label alternating swings as impulse waves (1-2-3-4-5) or corrective (A-B-C)
  4. Validate using Fibonacci ratios — score each labeling
  5. Return best-scoring wave sequence + Fibonacci levels

Fibonacci rules enforced:
  - Wave 2 retraces 38.2%–78.6% of Wave 1
  - Wave 3 >= 161.8% of Wave 1 (typically longest)
  - Wave 4 retraces 23.6%–61.8% of Wave 3, no overlap with Wave 1 territory
  - Wave 5 >= 61.8% of Wave 1
  - Wave A/B/C corrective: B retraces 38.2%–78.6% of A, C = 61.8%–161.8% of A
"""
from __future__ import annotations
import logging
from datetime import datetime, UTC
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fibonacci constants
# ---------------------------------------------------------------------------
FIB_RATIOS = [0.236, 0.382, 0.500, 0.618, 0.786, 1.000, 1.272, 1.618, 2.000, 2.618]
FIB_LABELS = ["23.6%", "38.2%", "50.0%", "61.8%", "78.6%", "100%", "127.2%", "161.8%", "200%", "261.8%"]

WAVE_LABELS_IMPULSE = ["0", "1", "2", "3", "4", "5"]
WAVE_LABELS_CORRECTIVE = ["W0", "A", "B", "C"]

# ---------------------------------------------------------------------------
# Data classes (plain dicts — no Pydantic here, layer is service-only)
# ---------------------------------------------------------------------------

def _wave_point(label: str, price: float, date: str, wave_type: str, is_current: bool = False) -> dict:
    return {"label": label, "price": round(price, 4), "date": date, "wave_type": wave_type, "is_current": is_current}


def _fib_level(ratio: float, label: str, price: float, level_type: str) -> dict:
    return {"ratio": ratio, "label": label, "price": round(price, 4), "type": level_type}


# ---------------------------------------------------------------------------
# Step 1: OHLCV download
# ---------------------------------------------------------------------------

def _fetch_ohlcv(ticker: str, period: str) -> list[dict]:
    """Download OHLCV from yfinance. Returns list of {date, open, high, low, close, volume}."""
    try:
        import yfinance as yf
        import pandas as pd
        df = yf.download(ticker, period=period, interval="1d", progress=False, auto_adjust=True)
        if df is None or df.empty:
            raise ValueError(f"No data for {ticker}")

        # yfinance >= 0.2.x returns MultiIndex columns like ('Close', 'AAPL') for single tickers
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df = df.reset_index()

        result = []
        for _, row in df.iterrows():
            date_val = row["Date"]
            if hasattr(date_val, "strftime"):
                date_str = date_val.strftime("%Y-%m-%d")
            else:
                date_str = str(date_val)[:10]

            def _get(col: str) -> float:
                v = row.get(col, 0.0)
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return 0.0

            result.append({
                "date":   date_str,
                "open":   _get("Open"),
                "high":   _get("High"),
                "low":    _get("Low"),
                "close":  _get("Close"),
                "volume": int(_get("Volume")),
            })
        return result
    except Exception as e:
        logger.error("ohlcv_fetch_error ticker=%s: %s", ticker, e)
        return []


# ---------------------------------------------------------------------------
# Step 2: ZigZag pivot detection
# ---------------------------------------------------------------------------

def _find_pivots(closes: list[float], dates: list[str], window: int = 5, min_swing_pct: float = 0.03) -> list[dict]:
    """
    Find alternating local highs and lows using a rolling window.
    min_swing_pct: minimum price move to register a new pivot (filters noise).
    """
    n = len(closes)
    if n < window * 2 + 1:
        return []

    raw: list[tuple[int, float, str]] = []  # (index, price, type: 'H' | 'L')

    for i in range(window, n - window):
        hi = max(closes[i - window: i + window + 1])
        lo = min(closes[i - window: i + window + 1])
        if closes[i] == hi:
            raw.append((i, closes[i], "H"))
        elif closes[i] == lo:
            raw.append((i, closes[i], "L"))

    # Deduplicate consecutive same-type pivots (keep extreme value)
    pivots: list[tuple[int, float, str]] = []
    for idx, price, ptype in raw:
        if pivots and pivots[-1][2] == ptype:
            if ptype == "H" and price > pivots[-1][1]:
                pivots[-1] = (idx, price, ptype)
            elif ptype == "L" and price < pivots[-1][1]:
                pivots[-1] = (idx, price, ptype)
        else:
            pivots.append((idx, price, ptype))

    # Filter by minimum swing size
    filtered: list[tuple[int, float, str]] = []
    for p in pivots:
        if not filtered:
            filtered.append(p)
            continue
        prev = filtered[-1]
        swing = abs(p[1] - prev[1]) / max(prev[1], 0.001)
        if swing >= min_swing_pct:
            filtered.append(p)

    return [
        {"index": idx, "price": price, "date": dates[idx], "type": ptype}
        for idx, price, ptype in filtered
    ]


# ---------------------------------------------------------------------------
# Step 3: Wave labeling + Fibonacci scoring
# ---------------------------------------------------------------------------

def _score_impulse(pts: list[dict]) -> float:
    """Score 6 pivot points (0-1-2-3-4-5) as impulse wave. 0=invalid, 1=perfect."""
    if len(pts) < 6:
        return 0.0
    p0, p1, p2, p3, p4, p5 = [p["price"] for p in pts[:6]]
    bullish = p1 > p0

    # Direction check
    if bullish:
        if not (p1 > p0 and p2 < p1 and p3 > p2 and p4 < p3 and p5 > p4):
            return 0.0
    else:
        if not (p1 < p0 and p2 > p1 and p3 < p2 and p4 > p3 and p5 < p4):
            return 0.0

    w1 = abs(p1 - p0)
    w2 = abs(p2 - p1)
    w3 = abs(p3 - p2)
    w4 = abs(p4 - p3)
    w5 = abs(p5 - p4)

    score = 0.0

    # Rule: Wave 2 retraces 38.2%–78.6% of Wave 1
    ret2 = w2 / w1 if w1 > 0 else 0
    if 0.382 <= ret2 <= 0.786:
        score += 0.25

    # Rule: Wave 3 is longest (or at least not the shortest) and >= 1.618 * Wave 1
    if w3 >= w1 and w3 >= w5:
        score += 0.20
    if w3 >= 1.618 * w1:
        score += 0.15

    # Rule: Wave 4 retraces 23.6%–61.8% of Wave 3, no overlap with Wave 1 territory
    ret4 = w4 / w3 if w3 > 0 else 0
    if 0.236 <= ret4 <= 0.618:
        score += 0.20
    if bullish and p4 > p1:
        score += 0.10
    elif not bullish and p4 < p1:
        score += 0.10

    # Rule: Wave 5 >= 61.8% of Wave 1
    if w5 >= 0.618 * w1:
        score += 0.10

    return min(score, 1.0)


def _score_corrective(pts: list[dict]) -> float:
    """Score 4 pivot points (W0-A-B-C) as A-B-C corrective. 0=invalid, 1=perfect."""
    if len(pts) < 4:
        return 0.0
    p0, pA, pB, pC = [p["price"] for p in pts[:4]]
    down_correction = pA < p0

    if down_correction:
        if not (pA < p0 and pB > pA and pC < pB):
            return 0.0
    else:
        if not (pA > p0 and pB < pA and pC > pB):
            return 0.0

    wA = abs(pA - p0)
    wB = abs(pB - pA)
    wC = abs(pC - pB)

    score = 0.0

    # B retraces 38.2%–78.6% of A
    retB = wB / wA if wA > 0 else 0
    if 0.382 <= retB <= 0.786:
        score += 0.5

    # C = 61.8%–161.8% of A
    ratioC = wC / wA if wA > 0 else 0
    if 0.618 <= ratioC <= 1.618:
        score += 0.5

    return score


def _label_waves(pivots: list[dict]) -> tuple[str, list[dict], float]:
    """
    Try all windows of pivots to find best impulse or corrective labeling.
    Returns (sequence_type, labeled_wave_points, confidence_score).
    """
    best_score = 0.0
    best_type = "impulse"
    best_pts: list[dict] = []

    n = len(pivots)

    # Try impulse (needs 6 pivots)
    for start in range(max(0, n - 12), n - 5):
        window = pivots[start: start + 6]
        score = _score_impulse(window)
        if score > best_score:
            best_score = score
            best_type = "impulse"
            best_pts = window

    # Try corrective (needs 4 pivots)
    for start in range(max(0, n - 8), n - 3):
        window = pivots[start: start + 4]
        score = _score_corrective(window)
        if score > best_score:
            best_score = score
            best_type = "corrective"
            best_pts = window

    if not best_pts:
        # Fallback: use last 4 pivots as corrective
        best_pts = pivots[-4:] if len(pivots) >= 4 else pivots
        best_type = "corrective"
        best_score = 0.3

    return best_type, best_pts, best_score


# ---------------------------------------------------------------------------
# Step 4: Fibonacci level calculation
# ---------------------------------------------------------------------------

def _calc_fibonacci(wave_pts: list[dict], seq_type: str) -> list[dict]:
    """Compute Fibonacci retracement and extension levels from the wave range."""
    if not wave_pts:
        return []

    prices = [p["price"] for p in wave_pts]
    lo = min(prices)
    hi = max(prices)
    rng = hi - lo
    if rng < 0.001:
        return []

    levels = []
    for ratio, label in zip(FIB_RATIOS, FIB_LABELS):
        # Retracement levels (from high down)
        price_ret = hi - ratio * rng
        levels.append(_fib_level(ratio, label, price_ret, "support"))
        # Extension levels (above high)
        if ratio > 1.0:
            price_ext = lo + ratio * rng
            levels.append(_fib_level(ratio, f"+{label}", price_ext, "resistance"))

    return levels


# ---------------------------------------------------------------------------
# Step 5: Current wave identification + targets
# ---------------------------------------------------------------------------

def _identify_current_wave(seq_type: str, wave_pts: list[dict]) -> tuple[str, str]:
    """
    Determine which wave we're currently in based on the last pivot.
    Returns (current_wave_label, direction: 'bullish' | 'bearish').
    """
    if not wave_pts:
        return "?", "neutral"

    if seq_type == "impulse":
        last = wave_pts[-1]
        label = last["label"] if "label" in last else "5"
        # After wave 5 we enter corrective A-B-C
        if label == "5":
            return "Korrekturwelle A beginnt", "bearish" if last["wave_type"] == "peak" else "bullish"
        try:
            num = int(label)
            next_label = str(num + 1) if num < 5 else "Korrektur"
            direction = "bullish" if num % 2 == 1 else "bearish"
        except ValueError:
            next_label, direction = "?", "neutral"
        return f"Welle {next_label} steht bevor", direction
    else:
        last = wave_pts[-1]
        label = last.get("label", "C")
        if label == "C":
            return "C vollständig — neuer Impuls wahrscheinlich", "bullish" if last["wave_type"] == "trough" else "bearish"
        direction = "bearish" if label == "A" else "bullish"
        return f"Welle {label} in Bewegung", direction


def _price_targets(wave_pts: list[dict], seq_type: str) -> list[float]:
    """Estimate next 2 price targets using Fibonacci projections."""
    if len(wave_pts) < 2:
        return []
    p0 = wave_pts[0]["price"]
    p_last = wave_pts[-1]["price"]
    rng = abs(p_last - p0)
    targets = []
    for r in [1.618, 2.618]:
        if p_last > p0:
            targets.append(round(p0 + r * rng, 2))
        else:
            targets.append(round(p0 - r * rng, 2))
    return targets


# ---------------------------------------------------------------------------
# Step 6: Human-readable interpretation
# ---------------------------------------------------------------------------

_INTERPRETATIONS = {
    "impulse_bullish": (
        "Bullisches Impuls-Muster erkannt (5-Wellen-Sequenz nach Elliott). "
        "Die Wellen 1, 3 und 5 sind Aufwärtsbewegungen (Impulswellen), "
        "Wellen 2 und 4 sind Korrekturen. "
        "Welle 3 ist typischerweise die stärkste und längste. "
        "Nach Abschluss von Welle 5 folgt meist eine A-B-C-Korrektur nach unten."
    ),
    "impulse_bearish": (
        "Bärisches Impuls-Muster erkannt (5-Wellen-Abwärtssequenz). "
        "Wellen 1, 3, 5 sind Abwärtsbewegungen; Wellen 2 und 4 Gegenbewegungen. "
        "Nach Welle 5 erwartet man eine Erholungsbewegung (A-B-C aufwärts)."
    ),
    "corrective_bullish": (
        "A-B-C-Korrekturmuster erkannt (bullisch). "
        "Welle A ist eine kurze Aufwärtsbewegung, B eine Korrektur nach unten, "
        "C schließt die Korrekturphase nach oben ab. "
        "Danach ist ein neuer Impuls möglich."
    ),
    "corrective_bearish": (
        "A-B-C-Korrekturmuster erkannt (bearisch). "
        "Welle A fällt, Welle B erholiert sich, Welle C setzt den Rückgang fort. "
        "Typische Zielzone: 61.8%–100% Retracement der vorigen Impulsbewegung."
    ),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_elliott_waves(
    ticker: str,
    period: str = "6mo",
    window: int = 5,
    min_swing_pct: float = 0.03,
) -> dict:
    """
    Main entry point.
    Returns a dict matching ElliottWaveAnalysis schema.
    """
    candles = _fetch_ohlcv(ticker, period)
    if not candles:
        return _empty_analysis(ticker, period, "No market data available")

    closes = [c["close"] for c in candles]
    dates = [c["date"] for c in candles]

    # Adaptive pivot detection: relax swing filter until we have ≥ 4 pivots
    pivots: list[dict] = []
    for swing in [min_swing_pct, 0.02, 0.015, 0.01]:
        pivots = _find_pivots(closes, dates, window=window, min_swing_pct=swing)
        if len(pivots) >= 4:
            break

    if len(pivots) < 4:
        return _empty_analysis(ticker, period, "Insufficient pivot points — try a longer period")

    seq_type, wave_pts, confidence = _label_waves(pivots)

    # Assign labels
    labels = WAVE_LABELS_IMPULSE if seq_type == "impulse" else WAVE_LABELS_CORRECTIVE
    labeled: list[dict] = []
    for i, pt in enumerate(wave_pts):
        lbl = labels[i] if i < len(labels) else str(i)
        wtype = "peak" if pt["type"] == "H" else "trough"
        is_current = (i == len(wave_pts) - 1)
        labeled.append(_wave_point(lbl, pt["price"], pt["date"], wtype, is_current))

    fib_levels = _calc_fibonacci(labeled, seq_type)
    current_wave, direction = _identify_current_wave(seq_type, labeled)
    targets = _price_targets(labeled, seq_type)

    interp_key = f"{seq_type}_{direction.split()[0] if direction != 'neutral' else 'bullish'}"
    interpretation = _INTERPRETATIONS.get(interp_key, _INTERPRETATIONS["impulse_bullish"])

    # Slim down candles: last 120 bars for chart rendering
    chart_candles = candles[-120:]

    return {
        "ticker": ticker.upper(),
        "period": period,
        "wave_degree": "minor",
        "sequence_type": seq_type,
        "current_wave": current_wave,
        "wave_direction": direction,
        "confidence": round(confidence, 3),
        "waves": labeled,
        "fibonacci_levels": fib_levels[:18],  # cap for response size
        "price_targets": targets,
        "stop_loss": round(labeled[0]["price"] * 0.97, 2) if labeled else 0.0,
        "interpretation": interpretation,
        "candles": chart_candles,
        "analyzed_at": datetime.now(UTC).isoformat(),
    }


def _empty_analysis(ticker: str, period: str, reason: str) -> dict:
    return {
        "ticker": ticker.upper(),
        "period": period,
        "wave_degree": "minor",
        "sequence_type": "impulse",
        "current_wave": "N/A",
        "wave_direction": "neutral",
        "confidence": 0.0,
        "waves": [],
        "fibonacci_levels": [],
        "price_targets": [],
        "stop_loss": 0.0,
        "interpretation": reason,
        "candles": [],
        "analyzed_at": datetime.now(UTC).isoformat(),
    }
