"""
Vendored Kronos foundation model for K-line (OHLCV) forecasting.

Source: https://github.com/shiyu-coder/Kronos  (MIT License, (c) 2025 ShiYu — see LICENSE).
Only ``kronos.py`` and ``module.py`` are vendored, with the upstream
``from model.module import *`` rewritten to a relative import so the package is
self-contained inside the backend deploy context (Railway builds from ./backend).

Importing this package pulls in ``torch``/``einops``/``huggingface_hub``, which are
NOT in the base backend requirements. Always import it lazily and guarded — see
``app.services.scanner.forecast`` for the only supported entry point.
"""
from .kronos import Kronos, KronosTokenizer, KronosPredictor  # noqa: F401

__all__ = ["Kronos", "KronosTokenizer", "KronosPredictor"]
