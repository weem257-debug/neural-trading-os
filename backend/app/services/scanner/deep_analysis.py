"""
Stage 2 — Sonnet deep analysis for the 24/7 market scanner (ADR 0003).

This is the ONLY paid step in the scanner. It is called exclusively from
``scan_loop`` and only after the cost-guard's ``can_spend`` gate has approved
the call. It returns BOTH the structured analysis result AND the exact token
usage, so ``record_spend`` can post the real cost to the daily ledger.

A conservative pre-call cost estimate (``estimate_call_cost``) is used by the
scan loop to decide whether the call fits under the remaining daily budget.
"""
import json
import logging
from typing import Optional

from app.core.config import settings
from app.services.scanner.cost import cost_of_usage

logger = logging.getLogger(__name__)

# Conservative per-call token budget used for the PRE-call estimate. The prompt
# is a compact indicator snapshot; real usage is typically well under this, so
# the estimate errs toward over-reserving budget (never under).
_EST_INPUT_TOKENS = 1200
_EST_OUTPUT_TOKENS = 500


def _scan_model() -> str:
    """The model used for scanner deep analysis (Sonnet, per the fixed design)."""
    return settings.ANTHROPIC_MODEL_ANALYSIS


def estimate_call_cost() -> float:
    """Conservative USD estimate for one deep-analysis call (pre-call budgeting)."""
    return cost_of_usage(_scan_model(), _EST_INPUT_TOKENS, _EST_OUTPUT_TOKENS)


def _build_prompt(candidate) -> str:
    ind = candidate.indicators or {}
    lines = [
        f"Symbol: {candidate.symbol}",
        f"Prefilter-Score: {candidate.score}/100",
        f"Prefilter-Richtung: {candidate.direction}",
        f"Letzter Kurs: {candidate.last_price}",
        "Indikatoren:",
    ]
    for key in (
        "rsi_14", "adx", "di_plus", "di_minus", "stoch_k", "stoch_d",
        "macd_hist", "obv", "obv_avg_20", "volume", "volume_avg_20",
    ):
        if key in ind and ind[key] is not None:
            lines.append(f"  {key} = {ind[key]}")
    if candidate.reasons:
        lines.append("Prefilter-Begründung:")
        lines.extend(f"  - {r}" for r in candidate.reasons)
    return "\n".join(lines)


def _usage_from_response(resp) -> dict:
    """Extract token usage from an Anthropic response, robust to missing fields."""
    usage = getattr(resp, "usage", None)
    if usage is None:
        return {"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0}
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
        "cache_read_tokens": int(getattr(usage, "cache_read_input_tokens", 0) or 0),
        "cache_write_tokens": int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
    }


async def deep_analyze(candidate) -> tuple[Optional[dict], dict]:
    """
    Run the paid Sonnet deep analysis for one prefilter candidate.

    Returns ``(result, usage)`` where ``result`` is the parsed signal dict
    (direction/confidence/price_target/stop_loss/time_horizon/reasoning) or None
    on failure, and ``usage`` is the token-usage dict for ``record_spend``.
    A failed call still returns a usage dict (zeros) so the caller can record it.
    """
    import anthropic

    model = _scan_model()
    system_prompt = (
        "You are an expert quantitative trading analyst reviewing a symbol that a "
        "technical prefilter has flagged. Confirm or reject the setup and return a "
        "JSON trading signal. JSON schema (strict, no extra keys):\n"
        '{"direction": "BUY|SELL|HOLD|STRONG_BUY|STRONG_SELL", '
        '"confidence": 0.0-1.0, '
        '"price_target": float_or_null, '
        '"stop_loss": float_or_null, '
        '"time_horizon": "1d|1w|1m|3m|6m|null", '
        '"reasoning": "2-4 sentence rationale in German"}'
    )
    user_msg = (
        f"{_build_prompt(candidate)}\n\n"
        "Return ONLY valid JSON, no markdown, no explanation outside the JSON."
    )

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=model,
            max_tokens=600,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        usage = _usage_from_response(resp)
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        result = {
            "direction": str(data.get("direction", candidate.direction)).upper(),
            "confidence": float(data.get("confidence", 0.5)),
            "price_target": data.get("price_target"),
            "stop_loss": data.get("stop_loss"),
            "time_horizon": data.get("time_horizon"),
            "reasoning": str(data.get("reasoning", ""))[:1000],
            "model": model,
        }
        return result, usage
    except Exception as e:
        logger.error("scan_deep_analyze_failed", extra={"symbol": candidate.symbol, "reason": str(e)})
        return None, {"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0}
