"""
LLM price table + exact cost computation for the 24/7 market scanner (ADR 0003).

Money-critical: this is the single place that translates raw token usage into
US-dollar cost. Every spend the cost-guard records flows through
``cost_of_usage``. Prices are USD per 1,000,000 tokens and reflect the
public Anthropic price list for the models the scanner is allowed to call.

Unknown models never cost 0 — they fall back to the most expensive known
per-field rate so an accidental model swap can only ever *over*-estimate the
spend, never silently under-count it against the daily hard cap.
"""
import logging

logger = logging.getLogger(__name__)

# USD per 1,000,000 tokens, per usage field. sonnet-5 is intentionally aliased
# to the same rate card as sonnet-4-6 (same tier, same price).
MODEL_PRICES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6": {
        "input": 3.0,
        "output": 15.0,
        "cache_read": 0.3,
        "cache_write": 3.75,
    },
    "claude-sonnet-5": {
        "input": 3.0,
        "output": 15.0,
        "cache_read": 0.3,
        "cache_write": 3.75,
    },
    "claude-haiku-4-5-20251001": {
        "input": 1.0,
        "output": 5.0,
        "cache_read": 0.1,
        "cache_write": 1.25,
    },
}

_PER_MILLION = 1000000.0

# Most-expensive-known rate per field. Used for unknown models so the cap can
# never be under-counted (fail-expensive, never fail-free).
_FALLBACK_PRICE: dict[str, float] = {
    field: max(prices[field] for prices in MODEL_PRICES.values())
    for field in ("input", "output", "cache_read", "cache_write")
}


def cost_of_usage(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> float:
    """
    Exact USD cost of one LLM call, given actual token usage.

    Falls back to the conservative (most expensive known) rate for an unknown
    model, logging a warning — the result is therefore never zero for a call
    that actually consumed tokens.
    """
    prices = MODEL_PRICES.get(model)
    if prices is None:
        logger.warning("scan_cost_unknown_model_fallback", extra={"model": model})
        prices = _FALLBACK_PRICE

    cost = (
        input_tokens * prices["input"]
        + output_tokens * prices["output"]
        + cache_read_tokens * prices["cache_read"]
        + cache_write_tokens * prices["cache_write"]
    ) / _PER_MILLION
    return float(cost)
