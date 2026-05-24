"""
Strategy parameter schemas and validation.
------------------------------------------
Defines the allowed parameters for each backtest strategy and provides
a validate_params() function that fills defaults and enforces constraints.
"""
from typing import Any
from fastapi import HTTPException


STRATEGY_PARAM_SCHEMAS: dict[str, dict[str, dict] | None] = {
    "ma_crossover": {
        "fast_period": {"type": int, "default": 20, "min": 5,  "max": 100},
        "slow_period": {"type": int, "default": 50, "min": 10, "max": 200},
    },
    "rsi_mean_reversion": {
        "rsi_period":  {"type": int, "default": 14, "min": 5,  "max": 50},
        "oversold":    {"type": int, "default": 30, "min": 10, "max": 45},
        "overbought":  {"type": int, "default": 70, "min": 55, "max": 90},
    },
    "buy_and_hold": {},
    # Legacy aliases — resolved via _ALIAS_MAP; None signals "not a canonical schema"
    "MA Crossover":       None,
    "RSI Mean Reversion": None,
    "Buy & Hold":         None,
}

# Alias resolution map (display name → slug)
_ALIAS_MAP: dict[str, str] = {
    "MA Crossover":       "ma_crossover",
    "RSI Mean Reversion": "rsi_mean_reversion",
    "Buy & Hold":         "buy_and_hold",
}


def _resolve_strategy(strategy: str) -> str:
    """Return the canonical slug for a strategy name or alias."""
    if strategy in STRATEGY_PARAM_SCHEMAS and STRATEGY_PARAM_SCHEMAS[strategy] is not None:
        return strategy
    return _ALIAS_MAP.get(strategy, strategy)


def validate_params(strategy: str, params: dict[str, Any]) -> dict[str, Any]:
    """
    Validate and normalise params for the given strategy.

    1. Resolves display-name aliases to slugs.
    2. Fills missing keys with defaults.
    3. Coerces values to the declared type.
    4. Checks min/max bounds.
    5. Applies cross-field constraints (e.g. fast_period < slow_period).

    Returns a new dict with all parameters resolved.
    Raises HTTPException(422) on invalid input.
    """
    slug = _resolve_strategy(strategy)
    schema = STRATEGY_PARAM_SCHEMAS.get(slug)

    # Unknown strategy — return params as-is (forward-compatible)
    if schema is None:
        return dict(params)

    result: dict[str, Any] = {}

    for key, rules in schema.items():
        raw = params.get(key, rules["default"])

        # Type coercion
        try:
            value = rules["type"](raw)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=422,
                detail=f"Parameter '{key}' must be of type {rules['type'].__name__}, got {type(raw).__name__}",
            )

        # Bounds check
        if value < rules["min"] or value > rules["max"]:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Parameter '{key}' = {value} is out of range "
                    f"[{rules['min']}, {rules['max']}]"
                ),
            )

        result[key] = value

    # Pass through any extra keys not in the schema (e.g. "fee")
    for key, val in params.items():
        if key not in result:
            result[key] = val

    # Cross-field constraint: fast_period < slow_period
    if slug == "ma_crossover":
        if result.get("fast_period", 0) >= result.get("slow_period", 1):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"ma_crossover: fast_period ({result['fast_period']}) "
                    f"must be less than slow_period ({result['slow_period']})"
                ),
            )

    return result


def get_params_schema(strategy: str) -> dict[str, Any]:
    """Return the JSON-serialisable params schema for a strategy (for /strategies endpoint)."""
    slug = _resolve_strategy(strategy)
    schema = STRATEGY_PARAM_SCHEMAS.get(slug)
    if not schema:
        return {}
    return {
        key: {
            "type":    rules["type"].__name__,
            "default": rules["default"],
            "min":     rules["min"],
            "max":     rules["max"],
        }
        for key, rules in schema.items()
    }
