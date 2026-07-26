"""
Regression tests for the 2026-07-26 audit fix pass.

Each test pins one defect that was found and fixed:

  * scanner cost ledger — the ACTUAL token usage of a billed Anthropic call was
    discarded whenever the response failed to parse, so real spend vanished from
    the daily cap ledger.
  * scanner cost estimate — the pre-call reservation assumed fewer output tokens
    than the call is allowed to produce.
  * scanner LLM output coercion — a non-numeric price_target aborted the whole
    scan cycle at DB-flush time.
  * prefilter scoring — indicator readings that contradict the already-chosen
    direction still added points and "confirming" reason strings.
  * order idempotency — the cache read and write-back straddled an await, so two
    concurrent retries of the same Idempotency-Key each placed a real order.
"""
import asyncio

import numpy as np
import pandas as pd
import pytest


# ===========================================================================
class TestScannerCostEstimate:
    def test_estimate_covers_the_full_output_budget(self):
        """The reservation must never be smaller than what the call may cost."""
        from app.services.scanner import deep_analysis as da
        assert da._EST_OUTPUT_TOKENS >= da._MAX_OUTPUT_TOKENS

    def test_estimate_is_positive(self):
        from app.services.scanner.deep_analysis import estimate_call_cost
        assert estimate_call_cost() > 0


# ===========================================================================
class TestLLMFieldCoercion:
    @pytest.mark.parametrize("raw", ["n/a", "", None, "~180", [], {}, True, False])
    def test_unusable_price_becomes_none(self, raw):
        from app.services.scanner.deep_analysis import _coerce_price
        assert _coerce_price(raw) is None

    @pytest.mark.parametrize("raw,expected", [(180.5, 180.5), ("180.5", 180.5), (7, 7.0)])
    def test_numeric_price_passes_through(self, raw, expected):
        from app.services.scanner.deep_analysis import _coerce_price
        assert _coerce_price(raw) == expected

    def test_nan_and_inf_are_rejected(self):
        from app.services.scanner.deep_analysis import _coerce_price
        assert _coerce_price(float("nan")) is None
        assert _coerce_price(float("inf")) is None

    def test_non_numeric_confidence_falls_back_to_neutral(self):
        from app.services.scanner.deep_analysis import _coerce_confidence
        assert _coerce_confidence("high") == 0.5
        assert _coerce_confidence(None) == 0.5

    def test_confidence_is_clamped_to_unit_interval(self):
        from app.services.scanner.deep_analysis import _coerce_confidence
        assert _coerce_confidence(2.0) == 1.0
        assert _coerce_confidence(-1.0) == 0.0
        # An explicit zero must survive — it is a valid confidence, not "missing".
        assert _coerce_confidence(0.0) == 0.0


# ===========================================================================
class _FakeUsage:
    input_tokens = 1300
    output_tokens = 550
    cache_read_input_tokens = 0
    cache_creation_input_tokens = 0


class _FakeBlock:
    def __init__(self, text):
        self.text = text


class _FakeResponse:
    def __init__(self, text):
        self.usage = _FakeUsage()
        self.content = [_FakeBlock(text)]


class _FakeMessages:
    def __init__(self, text):
        self._text = text

    async def create(self, **_kwargs):
        return _FakeResponse(self._text)


class _FakeAnthropic:
    def __init__(self, text):
        self.messages = _FakeMessages(text)


class _Candidate:
    symbol = "AAPL"
    direction = "BUY"
    score = 60.0
    last_price = 180.0
    reasons: list = []
    indicators: dict = {}
    forecast = None


def _patch_anthropic(monkeypatch, text):
    import sys
    import types
    fake_mod = types.ModuleType("anthropic")
    fake_mod.AsyncAnthropic = lambda **_kw: _FakeAnthropic(text)
    monkeypatch.setitem(sys.modules, "anthropic", fake_mod)


class TestDeepAnalyzeUsageAccounting:
    def test_parse_failure_still_reports_the_real_usage(self, monkeypatch):
        """
        The API call was billed before parsing ran. Returning zeros here would
        under-report the day's spend and let the hard cap be silently overrun.
        """
        from app.services.scanner.deep_analysis import deep_analyze
        _patch_anthropic(monkeypatch, "this is not JSON at all")

        result, usage = asyncio.run(deep_analyze(_Candidate()))

        assert result is None
        assert usage["input_tokens"] == 1300
        assert usage["output_tokens"] == 550

    def test_successful_parse_reports_usage_and_result(self, monkeypatch):
        from app.services.scanner.deep_analysis import deep_analyze
        _patch_anthropic(
            monkeypatch,
            '{"direction":"BUY","confidence":0.8,"price_target":200.0,'
            '"stop_loss":170.0,"time_horizon":"1w","reasoning":"ok"}',
        )

        result, usage = asyncio.run(deep_analyze(_Candidate()))

        assert result is not None
        assert result["direction"] == "BUY"
        assert result["confidence"] == 0.8
        assert usage["input_tokens"] == 1300

    def test_garbage_price_fields_do_not_reach_the_numeric_columns(self, monkeypatch):
        from app.services.scanner.deep_analysis import deep_analyze
        _patch_anthropic(
            monkeypatch,
            '{"direction":"BUY","confidence":"high","price_target":"n/a",'
            '"stop_loss":"unknown","time_horizon":"1w","reasoning":"ok"}',
        )

        result, _usage = asyncio.run(deep_analyze(_Candidate()))

        assert result is not None, "a coercible response must not be dropped"
        assert result["price_target"] is None
        assert result["stop_loss"] is None
        assert result["confidence"] == 0.5


# ===========================================================================
class _Adx:
    def __init__(self, adx, di_plus, di_minus):
        self.adx, self.di_plus, self.di_minus = adx, di_plus, di_minus


class _Macd:
    def __init__(self, hist):
        self.hist = hist


class _Stoch:
    def __init__(self, k, d):
        self.k, self.d = k, d


def _rising_frame(n=220):
    closes = np.linspace(100, 200, n)
    idx = pd.date_range("2025-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {
            "Open": closes,
            "High": closes * 1.01,
            "Low": closes * 0.99,
            "Close": closes,
            "Volume": np.full(n, 1_000_000.0),
        },
        index=idx,
    )


class TestPrefilterDirectionConsistency:
    def test_overbought_rsi_and_stochastic_do_not_score_a_buy(self, monkeypatch):
        """
        ADX/DI fix the direction to BUY. An overbought RSI/%K argues the other
        way and must neither add points nor produce a 'confirming' reason.
        """
        import app.api.routes.analysis as analysis_mod
        from app.services.scanner.prefilter import _score_symbol

        monkeypatch.setattr(
            analysis_mod,
            "_compute_indicators",
            lambda _df: {
                "_last_close": 200.0,
                "rsi_14": 75.0,                    # overbought -> bearish
                "macd": _Macd(0.5),                # confirms BUY
                "adx": _Adx(30.0, 30.0, 10.0),     # -> BUY
                "stochastic": _Stoch(85.0, 80.0),  # overbought -> bearish
                "volume_avg_20": 10_000_000.0,     # above current volume -> no bonus
            },
        )

        cand = _score_symbol(_rising_frame())

        assert cand is not None
        assert cand.direction == "BUY"
        assert not any("überkauft" in r for r in cand.reasons), cand.reasons
        # ADX 25 + MACD 10 + OBV 20 = 55; the contradicting 20 + 15 are gone.
        assert cand.score == pytest.approx(55.0)

    def test_agreeing_rsi_and_stochastic_still_score(self, monkeypatch):
        import app.api.routes.analysis as analysis_mod
        from app.services.scanner.prefilter import _score_symbol

        monkeypatch.setattr(
            analysis_mod,
            "_compute_indicators",
            lambda _df: {
                "_last_close": 200.0,
                "rsi_14": 25.0,                    # oversold -> agrees with BUY
                "macd": _Macd(0.5),
                "adx": _Adx(30.0, 30.0, 10.0),
                "stochastic": _Stoch(15.0, 12.0),  # oversold -> agrees with BUY
                "volume_avg_20": 10_000_000.0,
            },
        )

        cand = _score_symbol(_rising_frame())

        assert cand is not None
        assert cand.direction == "BUY"
        assert cand.score == pytest.approx(90.0)  # 25 + 20 + 15 + 10 + 20


# ===========================================================================
class TestStdlibLoggingIsRedacted:
    """
    F-24 only covered structlog, which exactly one module uses; the other 47 log
    through stdlib `logging` and bypassed redaction entirely.
    """

    def test_redact_text_scrubs_jwt_bearer_and_cookies(self):
        from app.core.log_redaction import redact_text, _REDACTED
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig"
        assert jwt not in redact_text(f"reset token: {jwt}")
        assert _REDACTED in redact_text("Authorization: Bearer abc.def.ghi")
        assert "abc123" not in redact_text("cookie: access_token=abc123; path=/")

    def test_redact_text_passes_through_harmless_text(self):
        from app.core.log_redaction import redact_text
        assert redact_text("scan_cycle_complete symbols=42") == "scan_cycle_complete symbols=42"

    def test_root_handler_redacts_stdlib_records(self):
        """A plain logging.getLogger(...) call must come out scrubbed."""
        import logging
        import app.main  # noqa: F401  — installs the redacting root handler
        from app.core.log_redaction import _REDACTED

        root = logging.getLogger()
        handler = next(h for h in root.handlers if getattr(h, "_redacting", False))
        record = logging.LogRecord(
            name="app.api.auth", level=logging.INFO, pathname=__file__, lineno=1,
            msg="reset token: %s", args=("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig",),
            exc_info=None,
        )
        rendered = handler.format(record)

        assert "eyJhbGciOiJIUzI1NiJ9" not in rendered
        assert _REDACTED in rendered


# ===========================================================================
class _CountingClient:
    """Execution client whose submit_order awaits, so the race window is real."""

    mode = "paper"

    def __init__(self):
        self.calls = 0

    async def submit_order(self, req, owner_username=None):
        from app.models.schemas import OrderResponse
        self.calls += 1
        seq = self.calls          # capture BEFORE the await, else both see the last value
        await asyncio.sleep(0.05)
        return OrderResponse(
            order_id=f"ord_{seq:04d}",
            ticker=req.ticker,
            side=req.side,
            quantity=req.quantity,
            order_type=req.order_type,
            status="filled",
            filled_price=180.0,
        )


class TestOrderIdempotencyRace:
    def test_concurrent_same_key_submits_only_one_order(self):
        from app.api.routes import execution as ex
        from app.api.auth import UserInfo
        from app.models.schemas import OrderRequest

        ex._ORDER_IDEMPOTENCY.clear()
        ex._ORDER_IDEMPOTENCY_LOCKS.clear()

        client = _CountingClient()
        user = UserInfo(username="tester")
        req = OrderRequest(ticker="AAPL", side="buy", quantity=1.0)

        async def _both():
            return await asyncio.gather(
                ex.submit_order(req=req, client=client, current_user=user,
                                idempotency_key="dup-key"),
                ex.submit_order(req=req, client=client, current_user=user,
                                idempotency_key="dup-key"),
            )

        first, second = asyncio.run(_both())

        assert client.calls == 1, "duplicate order placed despite Idempotency-Key"
        assert first.order_id == second.order_id

    def test_distinct_keys_are_not_deduplicated(self):
        from app.api.routes import execution as ex
        from app.api.auth import UserInfo
        from app.models.schemas import OrderRequest

        ex._ORDER_IDEMPOTENCY.clear()
        ex._ORDER_IDEMPOTENCY_LOCKS.clear()

        client = _CountingClient()
        user = UserInfo(username="tester")
        req = OrderRequest(ticker="AAPL", side="buy", quantity=1.0)

        async def _both():
            return await asyncio.gather(
                ex.submit_order(req=req, client=client, current_user=user,
                                idempotency_key="key-a"),
                ex.submit_order(req=req, client=client, current_user=user,
                                idempotency_key="key-b"),
            )

        first, second = asyncio.run(_both())

        assert client.calls == 2
        assert first.order_id != second.order_id
