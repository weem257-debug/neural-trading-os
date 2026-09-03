"""Centralized numeric-parsing helpers.

Two small "safe float" helpers were duplicated across the codebase with
subtly different semantics — consolidated here so both variants live in
one place instead of eight-plus byte-identical copies.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def safe_float(v: Any, default: Optional[float] = 0.0) -> Optional[float]:
    """Parse ``v`` as a float, returning ``default`` if that fails.

    This mirrors the ``_safe_float(v)`` helper duplicated across the
    broker/P2P integrations (``app/services/brokers/*.py``,
    ``app/services/p2p/*.py``): those all returned ``None`` on failure or
    on a ``None`` input, so callers there should pass ``default=None``
    explicitly to keep that behavior. Unlike :func:`finite_float`, this
    does **not** check for NaN/Infinity — a non-finite float is returned
    as-is.
    """
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def finite_float(v: Any, default: float = 0.0) -> float:
    """Parse ``v`` as a float, returning ``default`` on error, NaN or Infinity.

    Mirrors the ``_sf(v, default=0.0)`` helper duplicated in
    ``app/services/report/aggregator.py`` and
    ``app/services/report/risk_single.py``.
    """
    try:
        f = float(v)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default
