"""
Tests for the 24/7 market scanner (ADR 0003) Stage 1: universe definition,
market-hours gating, single-symbol technical scoring, and the batch prefilter.
"""
import asyncio
from datetime import datetime, UTC

import numpy as np
import pandas as pd
import pytest


def _run(coro):
    return asyncio.run(coro)


def _make_frame(closes, volumes=None, highs=None, lows=None):
    n = len(closes)
    closes = np.asarray(closes, dtype=float)
    if highs is None:
        highs = closes * 1.01
    if lows is None:
        lows = closes * 0.99
    if volumes is None:
        volumes = np.full(n, 1_000_000.0)
    idx = pd.date_range("2025-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {"Open": closes, "High": highs, "Low": lows, "Close": closes, "Volume": volumes},
        index=idx,
    )


# ===========================================================================
class TestScannerUniverse:
    def test_universe_is_deduplicated_and_roughly_500(self):
        from app.services.scanner.universe import SCANNER_UNIVERSE
        assert len(SCANNER_UNIVERSE) == len(set(SCANNER_UNIVERSE))
        assert 450 <= len(SCANNER_UNIVERSE) <= 560

    def test_universe_contains_major_etfs_and_crypto(self):
        from app.services.scanner.universe import SCANNER_UNIVERSE
        for s in ("SPY", "QQQ", "IWM", "DIA", "BTC-USD", "ETH-USD"):
            assert s in SCANNER_UNIVERSE

    def test_universe_entries_are_nonempty_strings(self):
        from app.services.scanner.universe import SCANNER_UNIVERSE
        assert all(isinstance(s, str) and s for s in SCANNER_UNIVERSE)


# ===========================================================================
class TestMarketHoursGating:
    def test_weekday_during_core_session_is_open(self):
        from app.services.scanner.universe import is_equity_market_hours
        # Wed 2025-01-08 15:00 UTC
        assert is_equity_market_hours(datetime(2025, 1, 8, 15, 0, tzinfo=UTC)) is True

    def test_weekday_before_open_is_closed(self):
        from app.services.scanner.universe import is_equity_market_hours
        assert is_equity_market_hours(datetime(2025, 1, 8, 12, 0, tzinfo=UTC)) is False

    def test_weekday_after_close_is_closed(self):
        from app.services.scanner.universe import is_equity_market_hours
        assert is_equity_market_hours(datetime(2025, 1, 8, 21, 0, tzinfo=UTC)) is False

    def test_open_boundary_inclusive(self):
        from app.services.scanner.universe import is_equity_market_hours
        # 13:30 UTC exactly
        assert is_equity_market_hours(datetime(2025, 1, 8, 13, 30, tzinfo=UTC)) is True

    def test_close_boundary_exclusive(self):
        from app.services.scanner.universe import is_equity_market_hours
        # 20:00 UTC exactly -> closed
        assert is_equity_market_hours(datetime(2025, 1, 8, 20, 0, tzinfo=UTC)) is False

    def test_saturday_is_closed(self):
        from app.services.scanner.universe import is_equity_market_hours
        assert is_equity_market_hours(datetime(2025, 1, 11, 15, 0, tzinfo=UTC)) is False

    def test_sunday_is_closed(self):
        from app.services.scanner.universe import is_equity_market_hours
        assert is_equity_market_hours(datetime(2025, 1, 12, 15, 0, tzinfo=UTC)) is False

    def test_scan_symbols_during_market_hours_includes_equities_and_crypto(self):
        from app.services.scanner.universe import scan_symbols
        syms = scan_symbols(datetime(2025, 1, 8, 15, 0, tzinfo=UTC))
        assert "AAPL" in syms
        assert "BTC-USD" in syms

    def test_scan_symbols_outside_market_hours_is_crypto_only(self):
        from app.services.scanner.universe import scan_symbols
        syms = scan_symbols(datetime(2025, 1, 8, 3, 0, tzinfo=UTC))
        assert all(s.endswith("-USD") for s in syms)
        assert "BTC-USD" in syms
        assert "AAPL" not in syms


# ===========================================================================
class TestScoreSymbol:
    def test_strong_uptrend_yields_buy_candidate_with_high_score(self):
        from app.services.scanner.prefilter import _score_symbol, MIN_SCORE_THRESHOLD
        closes = np.linspace(100, 200, 220)
        vols = np.concatenate([np.full(219, 1_000_000.0), [5_000_000.0]])
        cand = _score_symbol(_make_frame(closes, volumes=vols))
        assert cand is not None
        assert cand.direction == "BUY"
        assert cand.score >= MIN_SCORE_THRESHOLD

    def test_strong_downtrend_yields_sell_candidate_with_high_score(self):
        from app.services.scanner.prefilter import _score_symbol, MIN_SCORE_THRESHOLD
        closes = np.linspace(200, 100, 220)
        vols = np.concatenate([np.full(219, 1_000_000.0), [5_000_000.0]])
        cand = _score_symbol(_make_frame(closes, volumes=vols))
        assert cand is not None
        assert cand.direction == "SELL"
        assert cand.score >= MIN_SCORE_THRESHOLD

    def test_flat_noisy_series_yields_no_candidate(self):
        from app.services.scanner.prefilter import _score_symbol
        rng = np.random.default_rng(42)
        closes = 100 + rng.normal(0, 0.2, 220)
        cand = _score_symbol(_make_frame(closes))
        assert cand is None

    def test_empty_dataframe_returns_none(self):
        from app.services.scanner.prefilter import _score_symbol
        assert _score_symbol(pd.DataFrame()) is None

    def test_none_dataframe_returns_none(self):
        from app.services.scanner.prefilter import _score_symbol
        assert _score_symbol(None) is None

    def test_too_little_data_returns_none_not_exception(self):
        from app.services.scanner.prefilter import _score_symbol
        cand = _score_symbol(_make_frame([100, 101, 102]))
        assert cand is None

    def test_missing_columns_returns_none_not_exception(self):
        from app.services.scanner.prefilter import _score_symbol
        df = pd.DataFrame({"Close": np.linspace(100, 200, 220)})
        # No High/Low/Volume -> handled gracefully, never raises.
        assert _score_symbol(df) is None


# ===========================================================================
class TestRunPrefilter:
    def test_returns_sorted_candidates_and_skips_bad_symbols(self, monkeypatch):
        from app.services.scanner import prefilter

        up = _make_frame(np.linspace(100, 200, 220),
                         volumes=np.concatenate([np.full(219, 1e6), [5e6]]))
        down = _make_frame(np.linspace(200, 100, 220),
                           volumes=np.concatenate([np.full(219, 1e6), [5e6]]))

        def fake_download(symbols, **kwargs):
            return {"GOOD_UP": up, "GOOD_DOWN": down, "BAD": pd.DataFrame()}

        monkeypatch.setattr(prefilter, "_download_chunk", lambda symbols: fake_download(symbols))
        cands = _run(prefilter.run_prefilter(["GOOD_UP", "GOOD_DOWN", "BAD"]))
        syms = [c.symbol for c in cands]
        assert "GOOD_UP" in syms and "GOOD_DOWN" in syms
        assert "BAD" not in syms
        # sorted by score descending
        assert cands == sorted(cands, key=lambda c: c.score, reverse=True)

    def test_top_n_truncates_results(self, monkeypatch):
        from app.services.scanner import prefilter
        up = _make_frame(np.linspace(100, 200, 220),
                         volumes=np.concatenate([np.full(219, 1e6), [5e6]]))

        def fake(symbols):
            return {s: up for s in symbols}

        monkeypatch.setattr(prefilter, "_download_chunk", fake)
        cands = _run(prefilter.run_prefilter(["A", "B", "C", "D"], top_n=2))
        assert len(cands) == 2

    def test_empty_symbol_list_returns_empty_without_network_call(self, monkeypatch):
        from app.services.scanner import prefilter

        def fail_if_called(symbols):
            raise AssertionError("must not download for empty input")

        monkeypatch.setattr(prefilter, "_download_chunk", fail_if_called)
        assert _run(prefilter.run_prefilter([])) == []

    def test_chunk_download_failure_is_skipped_not_raised(self, monkeypatch):
        from app.services.scanner import prefilter

        def boom(symbols):
            raise RuntimeError("network down")

        monkeypatch.setattr(prefilter, "_download_chunk", boom)
        # Must not raise; just yields no candidates.
        assert _run(prefilter.run_prefilter(["AAPL", "MSFT"])) == []

    def test_single_symbol_chunk_uses_flat_frame_shape(self, monkeypatch):
        from app.services.scanner import prefilter
        up = _make_frame(np.linspace(100, 200, 220),
                         volumes=np.concatenate([np.full(219, 1e6), [5e6]]))

        # With a single symbol yfinance returns a flat frame, not a dict keyed by ticker.
        monkeypatch.setattr(prefilter, "_download_chunk", lambda symbols: up)
        cands = _run(prefilter.run_prefilter(["ONLY"]))
        assert len(cands) == 1
        assert cands[0].symbol == "ONLY"
