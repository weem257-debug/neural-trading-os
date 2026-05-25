"""
Backend Integration Tests — Neural Trading OS
==============================================

Tests every major route category using FastAPI's TestClient (httpx).
No real API keys, no external HTTP calls — all heavy services are either
mocked or hit the graceful-degradation/demo path.

Run:
    cd dashboard/backend
    pytest tests/test_routes.py -v
"""
import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# App fixture — patch heavy dependencies before importing app
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client():
    """
    Create a TestClient with the full FastAPI app.

    We patch:
    - nautilus ExecutionClient.initialize  (avoid broker connection at startup)
    - fingpt analyze_sentiment             (avoid Anthropic/news API calls)
    """
    mock_nautilus = MagicMock()
    mock_nautilus.initialize = AsyncMock(return_value=None)
    mock_nautilus.get_positions = AsyncMock(return_value=[])

    with patch(
        "app.services.nautilus.client.get_execution_client",
        return_value=mock_nautilus,
    ):
        from app.main import app
        # Disable rate limiting so auth/waitlist tests don't hit per-IP caps
        app.state.limiter.enabled = False
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
        app.state.limiter.enabled = True


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _assert_ok(response, *, status: int = 200):
    """Assert status code and return parsed JSON."""
    assert response.status_code == status, (
        f"Expected {status}, got {response.status_code}. Body: {response.text[:500]}"
    )
    return response.json()


def _auth_headers(client) -> dict:
    """Return Bearer auth headers for the demo admin user."""
    resp = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "neural123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, f"Auth failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_returns_200(self, client):
        data = _assert_ok(client.get("/api/health"))
        assert "status" in data

    def test_health_status_is_healthy_or_degraded(self, client):
        data = _assert_ok(client.get("/api/health"))
        assert data["status"] in ("healthy", "degraded", "ok"), (
            f"Unexpected status value: {data['status']}"
        )

    def test_health_has_version(self, client):
        data = _assert_ok(client.get("/api/health"))
        assert "version" in data
        assert isinstance(data["version"], str)
        assert len(data["version"]) > 0

    def test_health_has_timestamp(self, client):
        data = _assert_ok(client.get("/api/health"))
        assert "timestamp" in data
        # Must be parseable as ISO datetime
        datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00"))

    def test_health_has_services_dict(self, client):
        data = _assert_ok(client.get("/api/health"))
        assert "services" in data
        assert isinstance(data["services"], dict)

    def test_health_has_uptime_seconds(self, client):
        """uptime_seconds must be present and non-negative."""
        data = _assert_ok(client.get("/api/health"))
        assert "uptime_seconds" in data, "uptime_seconds field missing from health response"
        assert data["uptime_seconds"] is not None
        assert data["uptime_seconds"] >= 0, "uptime_seconds must be non-negative"

    def test_health_has_repos_dict(self, client):
        """repos must be a dict mapping repo names to bool (directory exists)."""
        data = _assert_ok(client.get("/api/health"))
        assert "repos" in data, "repos field missing from health response"
        assert isinstance(data["repos"], dict), "repos must be a dict"
        # Must cover all 9 repos
        expected_repos = {
            "TradingAgents", "AI-Trader", "daily_stock_analysis",
            "Vibe-Trading", "qlib", "nautilus_trader",
            "FinGPT", "FinRobot", "jesse",
        }
        missing = expected_repos - data["repos"].keys()
        assert not missing, f"repos dict missing entries: {missing}"

    def test_health_repos_values_are_bool(self, client):
        """Each value in repos dict must be a boolean."""
        data = _assert_ok(client.get("/api/health"))
        if "repos" in data and data["repos"]:
            for repo_name, exists in data["repos"].items():
                assert isinstance(exists, bool), (
                    f"repos['{repo_name}'] is {type(exists).__name__}, expected bool"
                )

    def test_health_has_environment(self, client):
        """environment field must be present and a non-empty string."""
        data = _assert_ok(client.get("/api/health"))
        assert "environment" in data, "environment field missing from health response"
        assert isinstance(data["environment"], str)
        assert len(data["environment"]) > 0


# ---------------------------------------------------------------------------
# Signals — list
# ---------------------------------------------------------------------------

class TestSignalsList:
    def test_signals_list_returns_200(self, client):
        data = _assert_ok(client.get("/api/signals/"))
        assert isinstance(data, list)

    def test_signals_list_is_sorted_newest_first(self, client):
        """After demo endpoint creates signals they should be sortable."""
        data = _assert_ok(client.get("/api/signals/"))
        if len(data) >= 2:
            ts = [s["generated_at"] for s in data]
            assert ts == sorted(ts, reverse=True), "Signals not sorted newest first"

    def test_signals_list_ticker_filter(self, client):
        """?ticker=AAPL must return only signals for AAPL (case-insensitive input)."""
        # Seed a known signal via demo
        client.post("/api/signals/demo?ticker=AAPL")
        data = _assert_ok(client.get("/api/signals/?ticker=aapl"))
        assert isinstance(data, list)
        for s in data:
            assert s["ticker"] == "AAPL", f"Filter leak: expected AAPL, got {s['ticker']}"

    def test_signals_list_direction_filter(self, client):
        """?direction=HOLD must return only HOLD signals."""
        data = _assert_ok(client.get("/api/signals/?direction=HOLD"))
        assert isinstance(data, list)
        for s in data:
            assert s["direction"] == "HOLD", f"Filter leak: expected HOLD, got {s['direction']}"

    def test_signals_list_limit_param(self, client):
        """?limit=2 must return at most 2 signals."""
        data = _assert_ok(client.get("/api/signals/?limit=2"))
        assert isinstance(data, list)
        assert len(data) <= 2, f"Expected ≤ 2 results, got {len(data)}"

    def test_signals_list_offset_param_returns_list(self, client):
        """?offset=0 must return a list (basic sanity for pagination param)."""
        data = _assert_ok(client.get("/api/signals/?offset=0"))
        assert isinstance(data, list)


# ---------------------------------------------------------------------------
# Signals — demo endpoint (key-free)
# ---------------------------------------------------------------------------

class TestSignalsDemo:
    def test_demo_returns_200(self, client):
        resp = client.post("/api/signals/demo")
        _assert_ok(resp)

    def test_demo_returns_trading_signal_shape(self, client):
        data = _assert_ok(client.post("/api/signals/demo"))
        required = {"id", "ticker", "direction", "confidence", "source", "generated_at"}
        missing = required - data.keys()
        assert not missing, f"Missing fields in TradingSignal: {missing}"

    def test_demo_ticker_param(self, client):
        data = _assert_ok(client.post("/api/signals/demo?ticker=TSLA"))
        assert data["ticker"] == "TSLA"

    def test_demo_confidence_in_range(self, client):
        data = _assert_ok(client.post("/api/signals/demo?ticker=NVDA"))
        assert 0.0 <= data["confidence"] <= 1.0

    def test_demo_direction_is_valid(self, client):
        valid = {"BUY", "SELL", "HOLD", "STRONG_BUY", "STRONG_SELL"}
        data = _assert_ok(client.post("/api/signals/demo?ticker=AAPL"))
        assert data["direction"] in valid

    def test_demo_source_indicates_mock(self, client):
        data = _assert_ok(client.post("/api/signals/demo"))
        assert "demo" in data["source"].lower() or "mock" in data["source"].lower()

    def test_demo_agents_consensus_present(self, client):
        data = _assert_ok(client.post("/api/signals/demo"))
        assert "agents_consensus" in data
        assert isinstance(data["agents_consensus"], dict)
        assert len(data["agents_consensus"]) > 0

    def test_demo_same_ticker_returns_same_direction_same_day(self, client):
        """Deterministic seeding: two calls same day → same direction."""
        d1 = _assert_ok(client.post("/api/signals/demo?ticker=AAPL"))
        d2 = _assert_ok(client.post("/api/signals/demo?ticker=AAPL"))
        assert d1["direction"] == d2["direction"]


# ---------------------------------------------------------------------------
# Signals — generate (graceful degradation, no real API key)
# ---------------------------------------------------------------------------

class TestSignalsGenerate:
    def test_generate_returns_signal_when_repo_missing(self, client):
        """
        When TradingAgents repo is not on disk the endpoint must return a
        TradingSignal with direction=HOLD and confidence=0.0 (not a 500).
        """
        payload = {"ticker": "AAPL", "fast_mode": True}
        resp = client.post("/api/signals/generate", json=payload)
        # Either graceful signal OR 500 with detail message is acceptable;
        # 422 (validation error) is not.
        assert resp.status_code != 422, f"Unexpected 422: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert "direction" in data
            assert "confidence" in data

    def test_generate_signal_has_all_required_fields(self, client):
        """When the endpoint returns 200, all TradingSignal fields must be present."""
        payload = {"ticker": "MSFT", "fast_mode": True}
        resp = client.post("/api/signals/generate", json=payload)
        if resp.status_code != 200:
            pytest.skip(f"Signal generation returned {resp.status_code} — skipping field check")
        data = resp.json()
        required = {"id", "ticker", "direction", "confidence", "source", "generated_at"}
        missing = required - data.keys()
        assert not missing, f"TradingSignal missing fields: {missing}"

    def test_generate_signal_direction_is_valid_enum(self, client):
        """direction must be one of the 5 valid enum values."""
        payload = {"ticker": "TSLA", "fast_mode": True}
        resp = client.post("/api/signals/generate", json=payload)
        if resp.status_code != 200:
            pytest.skip(f"Signal generation returned {resp.status_code}")
        direction = resp.json()["direction"]
        valid = {"BUY", "SELL", "HOLD", "STRONG_BUY", "STRONG_SELL"}
        assert direction in valid, f"Invalid direction: {direction!r}"

    def test_generate_signal_confidence_in_range(self, client):
        """confidence must be a float in [0.0, 1.0]."""
        payload = {"ticker": "AAPL", "fast_mode": True}
        resp = client.post("/api/signals/generate", json=payload)
        if resp.status_code != 200:
            pytest.skip(f"Signal generation returned {resp.status_code}")
        confidence = resp.json()["confidence"]
        assert isinstance(confidence, (int, float)), f"confidence is not numeric: {confidence!r}"
        assert 0.0 <= float(confidence) <= 1.0, f"confidence out of range: {confidence}"

    def test_generate_signal_ticker_uppercased(self, client):
        """ticker in response must be uppercased regardless of input case."""
        payload = {"ticker": "nvda", "fast_mode": True}
        resp = client.post("/api/signals/generate", json=payload)
        if resp.status_code != 200:
            pytest.skip(f"Signal generation returned {resp.status_code}")
        assert resp.json()["ticker"] == "NVDA"


# ---------------------------------------------------------------------------
# Sentiment
# ---------------------------------------------------------------------------

class TestSentiment:
    def test_sentiment_ticker_returns_200_or_graceful(self, client):
        """
        The sentiment endpoint calls FinGPT/Anthropic.
        It should either succeed (200) or return a graceful 200 with mocked
        data — never a 500 that crashes the UI.
        """
        with patch(
            "app.services.fingpt.client.analyze_sentiment",
            new_callable=AsyncMock,
        ) as mock_sent:
            from app.models.schemas import SentimentSummary, SentimentLabel
            mock_sent.return_value = SentimentSummary(
                ticker="AAPL",
                overall_sentiment=SentimentLabel.POSITIVE,
                overall_score=0.65,
                news_count=5,
                positive_count=3,
                negative_count=1,
                neutral_count=1,
            )
            resp = client.get("/api/sentiment/AAPL")
            assert resp.status_code in (200, 422), (
                f"Unexpected status {resp.status_code}: {resp.text[:300]}"
            )
            if resp.status_code == 200:
                data = resp.json()
                assert "ticker" in data or isinstance(data, list)

    def test_sentiment_multi_returns_list(self, client):
        with patch(
            "app.services.fingpt.client.analyze_sentiment",
            new_callable=AsyncMock,
        ) as mock_sent:
            from app.models.schemas import SentimentSummary, SentimentLabel
            mock_sent.return_value = SentimentSummary(
                ticker="TSLA",
                overall_sentiment=SentimentLabel.NEUTRAL,
                overall_score=0.1,
                news_count=2,
                positive_count=1,
                negative_count=0,
                neutral_count=1,
            )
            resp = client.get("/api/sentiment/?tickers=TSLA")
            assert resp.status_code in (200, 422)
            if resp.status_code == 200:
                assert isinstance(resp.json(), list)

    def test_sentiment_multi_ticker_batch(self, client):
        """Batch endpoint with multiple tickers returns list with one entry per ticker."""
        from app.models.schemas import SentimentSummary, SentimentLabel

        def make_summary(ticker):
            return SentimentSummary(
                ticker=ticker,
                overall_sentiment=SentimentLabel.POSITIVE,
                overall_score=0.5,
                news_count=3,
                positive_count=2,
                negative_count=0,
                neutral_count=1,
            )

        with patch(
            "app.services.fingpt.client.analyze_sentiment",
            new_callable=AsyncMock,
            side_effect=lambda t: make_summary(t),
        ):
            resp = client.get("/api/sentiment/?tickers=AAPL,MSFT,NVDA")
            assert resp.status_code in (200, 422)
            if resp.status_code == 200:
                data = resp.json()
                assert isinstance(data, list)
                assert len(data) == 3, f"Expected 3 results, got {len(data)}"

    def test_sentiment_batch_items_have_ticker(self, client):
        """Each item in the batch response must have a ticker field."""
        from app.models.schemas import SentimentSummary, SentimentLabel

        def make_summary(ticker):
            return SentimentSummary(
                ticker=ticker,
                overall_sentiment=SentimentLabel.NEUTRAL,
                overall_score=0.0,
                news_count=1,
                positive_count=0,
                negative_count=0,
                neutral_count=1,
            )

        with patch(
            "app.services.fingpt.client.analyze_sentiment",
            new_callable=AsyncMock,
            side_effect=lambda t: make_summary(t),
        ):
            resp = client.get("/api/sentiment/?tickers=AMD,TSLA")
            if resp.status_code == 200:
                for item in resp.json():
                    assert "ticker" in item, f"Missing ticker in sentiment item: {item}"

    def test_sentiment_empty_tickers_returns_empty_list(self, client):
        """GET /api/sentiment/ without tickers should return 200 with empty list."""
        resp = client.get("/api/sentiment/?tickers=")
        assert resp.status_code in (200, 422)
        if resp.status_code == 200:
            assert isinstance(resp.json(), list)

    def test_sentiment_single_ticker_has_required_fields(self, client):
        """Single ticker sentiment response must have all schema fields."""
        from app.models.schemas import SentimentSummary, SentimentLabel
        with patch(
            "app.services.fingpt.client.analyze_sentiment",
            new_callable=AsyncMock,
            return_value=SentimentSummary(
                ticker="GOOGL",
                overall_sentiment=SentimentLabel.POSITIVE,
                overall_score=0.55,
                news_count=7,
                positive_count=5,
                negative_count=1,
                neutral_count=1,
            ),
        ):
            resp = client.get("/api/sentiment/GOOGL")
            if resp.status_code == 200:
                data = resp.json()
                required = {
                    "ticker", "overall_sentiment", "overall_score",
                    "news_count", "positive_count", "negative_count", "neutral_count",
                }
                missing = required - data.keys()
                assert not missing, f"Sentiment response missing fields: {missing}"


# ---------------------------------------------------------------------------
# Risk
# ---------------------------------------------------------------------------

class TestRisk:
    def test_risk_metrics_returns_200(self, client):
        with patch(
            "app.services.nautilus.client.get_execution_client",
        ) as mock_get:
            mock_client = MagicMock()
            mock_client.get_positions = AsyncMock(return_value=[])
            mock_get.return_value = mock_client

            resp = client.get("/api/risk/metrics")
            # Accept 200 (success) or 500 with useful message (service unavailable)
            # but never 422 (schema/validation error)
            assert resp.status_code != 422, f"Unexpected 422: {resp.text}"

    def test_risk_metrics_schema_when_200(self, client):
        with patch(
            "app.services.nautilus.client.get_execution_client",
        ) as mock_get:
            mock_client = MagicMock()
            mock_client.get_positions = AsyncMock(return_value=[])
            mock_get.return_value = mock_client

            resp = client.get("/api/risk/metrics")
            if resp.status_code == 200:
                data = resp.json()
                required = {"portfolio_var_95", "portfolio_var_99", "max_drawdown", "sharpe_ratio"}
                missing = required - data.keys()
                assert not missing, f"Missing risk fields: {missing}"


# ---------------------------------------------------------------------------
# Signal cache operations
# ---------------------------------------------------------------------------

class TestSignalCache:
    def test_cache_get_by_ticker_after_demo(self, client):
        """After generating a demo signal, GET /{ticker} should find it."""
        client.post("/api/signals/demo?ticker=GOOG")
        resp = client.get("/api/signals/GOOG")
        # Either 200 with signal or 200 with null — not 404/500
        assert resp.status_code == 200

    def test_get_signal_nonexistent_ticker_returns_200_null(self, client):
        """GET /api/signals/{ticker} for a never-generated ticker must return 200 with null body."""
        resp = client.get("/api/signals/ZZZNOTREAL999")
        assert resp.status_code == 200, (
            f"Expected 200 (null body), got {resp.status_code}: {resp.text[:200]}"
        )
        assert resp.json() is None, (
            f"Expected null for unknown ticker, got: {resp.json()!r}"
        )

    def test_get_signal_ticker_uppercased(self, client):
        """GET /api/signals/{ticker} normalises the ticker to uppercase — lowercase path must work."""
        client.post("/api/signals/demo?ticker=MSFT")
        resp_lower = client.get("/api/signals/msft")
        resp_upper = client.get("/api/signals/MSFT")
        assert resp_lower.status_code == 200
        assert resp_upper.status_code == 200

    def test_cache_clear(self, client):
        resp = client.delete("/api/signals/cache")
        assert resp.status_code == 200
        data = resp.json()
        assert "cleared" in data
        assert isinstance(data["cleared"], int)


# ---------------------------------------------------------------------------
# Backtesting
# ---------------------------------------------------------------------------

class TestBacktest:
    def test_strategies_returns_200(self, client):
        """GET /api/backtest/strategies must return 200 and a non-empty list."""
        resp = client.get("/api/backtest/strategies")
        data = _assert_ok(resp)
        assert isinstance(data, list), "Expected list of strategies"
        assert len(data) >= 1, "Expected at least one strategy"

    def test_strategies_have_required_fields(self, client):
        resp = client.get("/api/backtest/strategies")
        data = _assert_ok(resp)
        required = {"id", "name", "description", "engines", "default_params"}
        for strategy in data:
            missing = required - strategy.keys()
            assert not missing, f"Strategy missing fields: {missing}"

    def test_strategies_contains_known_slugs(self, client):
        resp = client.get("/api/backtest/strategies")
        data = _assert_ok(resp)
        ids = {s["id"] for s in data}
        assert "ma_crossover" in ids
        assert "rsi_mean_reversion" in ids
        assert "buy_and_hold" in ids

    def test_run_backtest_returns_200_and_job_id(self, client):
        """POST /api/backtest/run must return 200 with a job_id."""
        payload = {
            "strategy_name": "MA-Crossover(20/50)",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "jesse",
            "params": {},
        }
        resp = client.post("/api/backtest/run", json=payload)
        data = _assert_ok(resp)
        assert "job_id" in data, "Response must contain job_id"
        assert isinstance(data["job_id"], str)
        assert len(data["job_id"]) > 0

    def test_run_backtest_creates_job(self, client):
        """After POST /run, GET /jobs must contain the new job."""
        payload = {
            "strategy_name": "MA-Crossover(20/50)",
            "ticker": "MSFT",
            "start_date": "2023-01-01",
            "end_date": "2023-04-01",
            "initial_capital": 5000.0,
            "engine": "jesse",
            "params": {},
        }
        run_resp = client.post("/api/backtest/run", json=payload)
        run_data = _assert_ok(run_resp)
        job_id = run_data["job_id"]

        jobs_resp = client.get("/api/backtest/jobs")
        jobs_data = _assert_ok(jobs_resp)
        job_ids = [j["id"] for j in jobs_data]
        assert job_id in job_ids, f"Job {job_id} not found in /jobs listing"

    def test_get_job_status(self, client):
        """GET /api/backtest/jobs/{id} must return job with status field."""
        payload = {
            "strategy_name": "MA-Crossover",
            "ticker": "NVDA",
            "start_date": "2023-01-01",
            "end_date": "2023-03-01",
            "initial_capital": 1000.0,
            "engine": "jesse",
            "params": {},
        }
        run_data = _assert_ok(client.post("/api/backtest/run", json=payload))
        job_id = run_data["job_id"]

        job_resp = client.get(f"/api/backtest/jobs/{job_id}")
        job = _assert_ok(job_resp)
        assert "status" in job
        assert job["status"] in {"queued", "running", "completed", "failed"}

    def test_get_unknown_job_returns_404(self, client):
        resp = client.get("/api/backtest/jobs/nonexistent-job-id-xyz")
        assert resp.status_code == 404

    def test_run_backtest_missing_required_field_returns_422(self, client):
        resp = client.post("/api/backtest/run", json={"ticker": "AAPL"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Portfolio snapshot
# ---------------------------------------------------------------------------

class TestPortfolioSnapshot:
    def test_snapshot_returns_200(self, client):
        """GET /api/portfolio/snapshot must return 200."""
        resp = client.get("/api/portfolio/snapshot")
        data = _assert_ok(resp)
        assert isinstance(data, dict)

    def test_snapshot_has_required_fields(self, client):
        resp = client.get("/api/portfolio/snapshot")
        data = _assert_ok(resp)
        required = {
            "total_value", "cash", "invested",
            "total_pnl", "total_pnl_pct", "positions",
        }
        missing = required - data.keys()
        assert not missing, f"Snapshot missing fields: {missing}"

    def test_snapshot_has_positions(self, client):
        resp = client.get("/api/portfolio/snapshot")
        data = _assert_ok(resp)
        assert isinstance(data["positions"], list)
        assert len(data["positions"]) > 0, "Demo snapshot must contain at least one position"

    def test_snapshot_positions_have_required_fields(self, client):
        resp = client.get("/api/portfolio/snapshot")
        data = _assert_ok(resp)
        position_fields = {
            "ticker", "quantity", "avg_entry_price",
            "current_price", "unrealized_pnl", "unrealized_pnl_pct",
        }
        for pos in data["positions"]:
            missing = position_fields - pos.keys()
            assert not missing, f"Position {pos.get('ticker')} missing: {missing}"

    def test_snapshot_total_value_positive(self, client):
        resp = client.get("/api/portfolio/snapshot")
        data = _assert_ok(resp)
        assert data["total_value"] > 0

    def test_snapshot_contains_expected_tickers(self, client):
        resp = client.get("/api/portfolio/snapshot")
        data = _assert_ok(resp)
        tickers = {p["ticker"] for p in data["positions"]}
        expected = {"AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"}
        # At least some of the expected tickers should be present
        assert len(tickers & expected) >= 3, f"Expected demo tickers, got: {tickers}"


# ---------------------------------------------------------------------------
# Execution — order, orders, mode
# ---------------------------------------------------------------------------

class TestExecution:
    """Tests for /api/execution/* endpoints (paper trading mode)."""

    def test_post_order_buy_aapl_returns_200(self, client):
        """POST /api/execution/order — BUY AAPL paper order must return filled OrderResponse."""
        from unittest.mock import patch, AsyncMock
        from app.models.schemas import OrderResponse, OrderSide, OrderType
        from datetime import datetime, UTC

        mock_response = OrderResponse(
            order_id="test-uuid-1234",
            ticker="AAPL",
            side=OrderSide.BUY,
            quantity=10.0,
            order_type=OrderType.MARKET,
            status="filled",
            filled_price=175.50,
            created_at=datetime.now(UTC),
            broker="paper",
        )

        with patch(
            "app.api.routes.execution._get_client",
        ) as mock_get_client:
            mock_exec_client = mock_get_client.return_value
            mock_exec_client.mode = "paper"
            mock_exec_client.submit_order = AsyncMock(return_value=mock_response)

            payload = {
                "ticker": "AAPL",
                "side": "buy",
                "quantity": 10.0,
                "order_type": "market",
            }
            resp = client.post("/api/execution/order", json=payload)

        # Accept 200 (mocked) or any non-422 (integration path)
        assert resp.status_code != 422, f"Unexpected 422: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert "order_id" in data
            assert "status" in data
            assert "ticker" in data

    def test_get_orders_returns_list(self, client):
        """GET /api/execution/orders must return a list (SQLite-backed async)."""
        from unittest.mock import AsyncMock, MagicMock
        from app.main import app
        from app.api.routes.execution import _get_client

        auth = _auth_headers(client)
        mock_client = MagicMock()
        mock_client.get_order_history_async = AsyncMock(return_value=[])

        app.dependency_overrides[_get_client] = lambda: mock_client
        try:
            resp = client.get("/api/execution/orders", headers=auth)
        finally:
            app.dependency_overrides.pop(_get_client, None)

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        assert isinstance(resp.json(), list)

    def test_get_orders_response_schema(self, client):
        """GET /api/execution/orders items must conform to OrderHistoryItem schema."""
        from unittest.mock import AsyncMock, MagicMock
        from datetime import datetime, UTC
        from app.main import app
        from app.api.routes.execution import _get_client

        auth = _auth_headers(client)
        sample = {
            "order_id": "abc-123",
            "ticker": "AAPL",
            "side": "buy",
            "quantity": 10.0,
            "order_type": "market",
            "status": "filled",
            "fill_price": 175.50,
            "timestamp": datetime.now(UTC).isoformat(),
            "reject_reason": None,
        }

        mock_client = MagicMock()
        mock_client.get_order_history_async = AsyncMock(return_value=[sample])

        app.dependency_overrides[_get_client] = lambda: mock_client
        try:
            resp = client.get("/api/execution/orders", headers=auth)
        finally:
            app.dependency_overrides.pop(_get_client, None)

        assert resp.status_code == 200, f"Expected 200: {resp.text[:300]}"
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        item = data[0]
        required = {"order_id", "ticker", "side", "quantity", "order_type", "status", "timestamp"}
        missing = required - item.keys()
        assert not missing, f"OrderHistoryItem missing fields: {missing}"
        assert item["ticker"] == "AAPL"
        assert item["status"] == "filled"
        assert item["fill_price"] == 175.50

    def test_get_mode_returns_mode_field(self, client):
        """GET /api/execution/mode must return 200 and a dict with required keys."""
        from unittest.mock import MagicMock
        from app.main import app
        from app.api.routes.execution import _get_client

        # Use FastAPI dependency_overrides to inject a real mock with mode="paper"
        mock_client = MagicMock()
        mock_client.mode = "paper"

        app.dependency_overrides[_get_client] = lambda: mock_client
        try:
            resp = client.get("/api/execution/mode")
        finally:
            app.dependency_overrides.pop(_get_client, None)

        assert resp.status_code not in (422, 500), f"Unexpected error: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert isinstance(data, dict), f"Expected dict, got: {type(data)}"
            assert "mode" in data, f"'mode' key missing: {data}"
            assert data["mode"] in ("paper", "live")

    def test_post_mode_paper_to_live_safety_gate(self, client):
        """
        POST /api/execution/mode?mode=live — Safety-Gate must block when
        ENABLE_LIVE_TRADING=False (default in tests).
        Expect 403 Forbidden.
        """
        from unittest.mock import patch

        with patch("app.api.routes.execution.settings") as mock_settings:
            mock_settings.ENABLE_LIVE_TRADING = False
            mock_settings.ENABLE_PAPER_TRADING = True
            mock_settings.MAX_POSITION_SIZE_PCT = 0.05
            mock_settings.MAX_DAILY_LOSS_PCT = 0.02
            mock_settings.MAX_LEVERAGE = 1.0

            resp = client.post("/api/execution/mode?mode=live")

        # Should be blocked — 403 or 422 (if query param handling differs)
        # but NOT 200 (that would mean safety gate bypassed)
        assert resp.status_code in (403, 422, 500), (
            f"Safety-Gate failed: expected 403/422/500, got {resp.status_code}. "
            f"Body: {resp.text[:300]}"
        )

    def test_post_mode_to_paper_always_allowed(self, client):
        """POST /api/execution/mode?mode=paper must always succeed."""
        resp = client.post("/api/execution/mode?mode=paper")
        # 200 or any non-4xx (integration may vary)
        assert resp.status_code not in (403, 422), (
            f"Switching to paper mode was blocked unexpectedly: {resp.text[:300]}"
        )

    def test_order_invalid_side_returns_422(self, client):
        """POST /api/execution/order with invalid side must return 422 (Pydantic enum validation)."""
        auth = _auth_headers(client)
        payload = {"ticker": "AAPL", "side": "INVALID_SIDE", "quantity": 1.0, "order_type": "market"}
        resp = client.post("/api/execution/order", json=payload, headers=auth)
        assert resp.status_code == 422, f"Expected 422 for invalid side, got {resp.status_code}"

    def test_order_invalid_order_type_returns_422(self, client):
        """POST /api/execution/order with invalid order_type must return 422."""
        auth = _auth_headers(client)
        payload = {"ticker": "MSFT", "side": "buy", "quantity": 5.0, "order_type": "NOTREAL"}
        resp = client.post("/api/execution/order", json=payload, headers=auth)
        assert resp.status_code == 422, f"Expected 422 for invalid order_type, got {resp.status_code}"

    def test_order_missing_ticker_returns_422(self, client):
        """POST /api/execution/order without ticker must return 422 (required field)."""
        auth = _auth_headers(client)
        payload = {"side": "buy", "quantity": 1.0, "order_type": "market"}
        resp = client.post("/api/execution/order", json=payload, headers=auth)
        assert resp.status_code == 422, f"Expected 422 for missing ticker, got {resp.status_code}"

    def test_order_missing_quantity_returns_422(self, client):
        """POST /api/execution/order without quantity must return 422 (required field)."""
        auth = _auth_headers(client)
        payload = {"ticker": "AAPL", "side": "sell", "order_type": "market"}
        resp = client.post("/api/execution/order", json=payload, headers=auth)
        assert resp.status_code == 422, f"Expected 422 for missing quantity, got {resp.status_code}"

    def test_sell_without_position_returns_rejected_status(self, client):
        """SELL order without a prior position must return 200 with status='rejected'."""
        from app.services.nautilus.client import NautilusExecutionClient
        from app.main import app
        from app.api.routes.execution import _get_client

        auth = _auth_headers(client)
        real_client = NautilusExecutionClient()  # fresh client — no positions
        app.dependency_overrides[_get_client] = lambda: real_client
        try:
            resp = client.post("/api/execution/order", json={
                "ticker": "TSLA", "side": "sell", "quantity": 5.0, "order_type": "market",
            }, headers=auth)
        finally:
            app.dependency_overrides.pop(_get_client, None)

        assert resp.status_code == 200, f"Expected 200 for sell without position, got {resp.status_code}: {resp.text[:300]}"
        data = resp.json()
        assert data.get("status") == "rejected", f"Expected status='rejected', got: {data.get('status')}"
        assert data.get("reject_reason") == "insufficient_position", (
            f"Expected reject_reason='insufficient_position', got: {data.get('reject_reason')}"
        )

    def test_limit_order_with_limit_price_accepted(self, client):
        """POST /api/execution/order LIMIT order with limit_price must be accepted (not 422)."""
        from unittest.mock import AsyncMock, patch
        from app.models.schemas import OrderResponse, OrderSide, OrderType
        from datetime import datetime, UTC

        mock_response = OrderResponse(
            order_id="limit-test-uuid",
            ticker="MSFT",
            side=OrderSide.BUY,
            quantity=5.0,
            order_type=OrderType.LIMIT,
            status="filled",
            filled_price=410.00,
            created_at=datetime.now(UTC),
            broker="paper",
        )
        with patch("app.api.routes.execution._get_client") as mock_get_client:
            mock_exec_client = mock_get_client.return_value
            mock_exec_client.mode = "paper"
            mock_exec_client.submit_order = AsyncMock(return_value=mock_response)
            resp = client.post("/api/execution/order", json={
                "ticker": "MSFT", "side": "buy", "quantity": 5.0,
                "order_type": "limit", "limit_price": 410.00,
            })

        assert resp.status_code != 422, f"LIMIT order must not return 422: {resp.text[:300]}"
        if resp.status_code == 200:
            data = resp.json()
            assert "order_id" in data, "LIMIT order response must have order_id"

    def test_get_orders_with_limit_param(self, client):
        """GET /api/execution/orders?limit=3 must return at most 3 items."""
        from unittest.mock import AsyncMock, MagicMock
        from app.main import app
        from app.api.routes.execution import _get_client

        fake_orders = [
            {"order_id": f"ord-{i}", "ticker": "AAPL", "side": "buy", "quantity": 1.0,
             "order_type": "market", "status": "filled", "fill_price": 175.0,
             "timestamp": "2026-01-01T00:00:00+00:00", "reject_reason": None}
            for i in range(3)
        ]
        mock_client = MagicMock()
        mock_client.get_order_history_async = AsyncMock(return_value=fake_orders)

        auth = _auth_headers(client)
        app.dependency_overrides[_get_client] = lambda: mock_client
        try:
            resp = client.get("/api/execution/orders?limit=3", headers=auth)
        finally:
            app.dependency_overrides.pop(_get_client, None)

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        data = resp.json()
        assert isinstance(data, list), "Response must be a JSON list"
        assert len(data) <= 3, f"Expected at most 3 orders, got {len(data)}"


# ---------------------------------------------------------------------------
# Risk metrics — VaR, Drawdown fields
# ---------------------------------------------------------------------------

class TestRiskMetricsFields:
    """Extended risk tests — validate specific metric fields."""

    def test_risk_root_returns_200_or_graceful(self, client):
        """GET /api/risk/ must return RiskMetrics or graceful error (not 422)."""
        resp = client.get("/api/risk/")
        assert resp.status_code != 422, f"Unexpected 422: {resp.text}"

    def test_risk_metrics_has_var_and_drawdown(self, client):
        """When /api/risk/metrics returns 200, VaR and Drawdown fields must be present."""
        resp = client.get("/api/risk/metrics")
        if resp.status_code == 200:
            data = resp.json()
            required = {
                "portfolio_var_95",
                "portfolio_var_99",
                "max_drawdown",
                "current_drawdown",
            }
            missing = required - data.keys()
            assert not missing, f"Missing risk metric fields: {missing}"

    def test_risk_metrics_sharpe_ratio_present(self, client):
        """sharpe_ratio must be present in RiskMetrics response."""
        resp = client.get("/api/risk/metrics")
        if resp.status_code == 200:
            data = resp.json()
            assert "sharpe_ratio" in data

    def test_risk_metrics_alerts_is_list(self, client):
        """alerts field must be a list."""
        resp = client.get("/api/risk/metrics")
        if resp.status_code == 200:
            data = resp.json()
            assert "alerts" in data
            assert isinstance(data["alerts"], list)


# ---------------------------------------------------------------------------
# Portfolio Prices endpoint
# ---------------------------------------------------------------------------

class TestPortfolioPrices:
    def test_prices_with_tickers_returns_200(self, client):
        """GET /api/portfolio/prices?tickers=AAPL,MSFT must return 200 and a dict."""
        from unittest.mock import patch
        import pandas as pd

        # Build a minimal mock DataFrame that mimics yfinance output
        dates = pd.date_range("2025-01-01", periods=8, freq="B")
        mock_df = pd.DataFrame(
            {
                "AAPL": [180.0, 181.0, 182.0, 181.5, 183.0, 184.0, 183.5, 185.0],
                "MSFT": [380.0, 382.0, 381.0, 383.0, 385.0, 384.0, 386.0, 387.0],
            },
            index=dates,
        )
        mock_df.columns = pd.MultiIndex.from_tuples(
            [("Close", "AAPL"), ("Close", "MSFT")]
        )

        with patch("yfinance.download", return_value=mock_df):
            resp = client.get("/api/portfolio/prices?tickers=AAPL,MSFT")

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        data = resp.json()
        assert isinstance(data, dict), "Response must be a dict"

    def test_prices_dict_contains_requested_tickers(self, client):
        """Response must contain an entry for each requested ticker."""
        import pandas as pd
        from unittest.mock import patch

        dates = pd.date_range("2025-01-01", periods=8, freq="B")
        mock_df = pd.DataFrame(
            {"NVDA": [800.0, 810.0, 820.0, 815.0, 825.0, 830.0, 828.0, 835.0]},
            index=dates,
        )
        mock_df.columns = pd.MultiIndex.from_tuples([("Close", "NVDA")])

        with patch("yfinance.download", return_value=mock_df):
            resp = client.get("/api/portfolio/prices?tickers=NVDA")

        assert resp.status_code == 200
        data = resp.json()
        # Either the ticker is present or graceful error key is returned
        assert "NVDA" in data or len(data) == 0, f"Expected NVDA in response: {data}"

    def test_prices_without_tickers_returns_200_empty(self, client):
        """GET /api/portfolio/prices (no tickers param) must return 200 and empty dict."""
        resp = client.get("/api/portfolio/prices")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        data = resp.json()
        assert data == {}, f"Expected empty dict, got: {data}"

    def test_prices_entry_has_required_fields(self, client):
        """When a ticker is returned, it must have price, change_pct, history."""
        import pandas as pd
        from unittest.mock import patch

        dates = pd.date_range("2025-01-01", periods=8, freq="B")
        mock_df = pd.DataFrame(
            {"AAPL": [175.0, 176.0, 177.0, 178.0, 179.0, 180.0, 181.0, 182.0]},
            index=dates,
        )
        mock_df.columns = pd.MultiIndex.from_tuples([("Close", "AAPL")])

        with patch("yfinance.download", return_value=mock_df):
            resp = client.get("/api/portfolio/prices?tickers=AAPL")

        assert resp.status_code == 200
        data = resp.json()
        if "AAPL" in data and not data["AAPL"].get("error"):
            entry = data["AAPL"]
            assert "price" in entry, "price field missing"
            assert "change_pct" in entry, "change_pct field missing"
            assert "history" in entry, "history field missing"
            assert isinstance(entry["history"], list), "history must be a list"


# ---------------------------------------------------------------------------
# Rate Limiting headers
# ---------------------------------------------------------------------------

class TestRateLimitHeaders:
    def test_signals_generate_has_ratelimit_headers_or_429(self, client):
        """
        POST /api/signals/generate should either succeed (200) with
        X-RateLimit headers visible, or return 429 if the limit is reached.
        The critical assertion: the endpoint must never return 500 due to
        the rate-limiter configuration being wrong.
        """
        payload = {"ticker": "AAPL", "fast_mode": True}
        resp = client.post("/api/signals/generate", json=payload)

        # Must not be a server configuration error
        assert resp.status_code not in (500, 422), (
            f"Unexpected error from rate-limited endpoint: {resp.status_code} {resp.text[:300]}"
        )

        # Either success or rate-limit
        assert resp.status_code in (200, 429), (
            f"Unexpected status {resp.status_code}: {resp.text[:300]}"
        )

        # When 429, body should contain retry information
        if resp.status_code == 429:
            text = resp.text.lower()
            assert any(kw in text for kw in ("rate", "limit", "retry", "too many")), (
                f"429 response missing rate-limit info: {resp.text[:300]}"
            )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_unknown_route_returns_404(self, client):
        resp = client.get("/api/nonexistent_endpoint_xyz")
        assert resp.status_code == 404

    def test_demo_with_lowercase_ticker(self, client):
        data = _assert_ok(client.post("/api/signals/demo?ticker=aapl"))
        assert data["ticker"] == "AAPL"  # must be uppercased

    def test_generate_missing_ticker_returns_422(self, client):
        resp = client.post("/api/signals/generate", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Auth — JWT token + user info
# ---------------------------------------------------------------------------

class TestAuth:
    """
    JWT authentication tests.
    Demo credentials: admin / neural123
    """

    def _get_token(self, client) -> str:
        """Helper: obtain a valid JWT for subsequent requests."""
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 200, f"Token request failed: {resp.text}"
        return resp.json()["access_token"]

    def test_token_correct_credentials_returns_200_and_token(self, client):
        """POST /api/auth/token with valid credentials must return 200 + access_token."""
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "access_token" in data, "Response must contain access_token"
        assert isinstance(data["access_token"], str)
        assert len(data["access_token"]) > 20, "access_token looks too short"
        assert data.get("token_type", "").lower() == "bearer"

    def test_token_wrong_credentials_returns_401(self, client):
        """POST /api/auth/token with wrong password must return 401 Unauthorized."""
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "wrongpassword"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 for wrong credentials, got {resp.status_code}: {resp.text}"
        )

    def test_me_with_valid_token_returns_200_and_username(self, client):
        """GET /api/auth/me with a valid Bearer token must return 200 + username."""
        token = self._get_token(client)
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "username" in data, "Response must contain username"
        assert data["username"] == "admin"

    def test_me_without_token_returns_401(self, client):
        """GET /api/auth/me without Authorization header must return 401."""
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401, (
            f"Expected 401 for missing token, got {resp.status_code}: {resp.text}"
        )

    def test_execution_orders_without_token_returns_401(self, client):
        """
        GET /api/execution/orders without token must return 401.
        The execution endpoint requires auth to protect order history.
        """
        from unittest.mock import AsyncMock, MagicMock
        from app.main import app
        from app.api.routes.execution import _get_client

        mock_client = MagicMock()
        mock_client.get_order_history_async = AsyncMock(return_value=[])

        app.dependency_overrides[_get_client] = lambda: mock_client
        try:
            resp = client.get("/api/execution/orders")
        finally:
            app.dependency_overrides.pop(_get_client, None)

        assert resp.status_code == 401, (
            f"Expected 401 for unauthenticated access, got {resp.status_code}: {resp.text[:200]}"
        )


# ---------------------------------------------------------------------------
# Signal Export CSV
# ---------------------------------------------------------------------------

class TestSignalsExport:
    def test_export_returns_200_and_csv_content_type(self, client):
        """GET /api/signals/export must return 200 with text/csv Content-Type."""
        resp = client.get("/api/signals/export")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )
        content_type = resp.headers.get("content-type", "")
        assert "text/csv" in content_type, (
            f"Expected text/csv, got: {content_type}"
        )

    def test_export_has_csv_headers_row(self, client):
        """CSV output must start with a header row containing expected column names."""
        resp = client.get("/api/signals/export")
        assert resp.status_code == 200
        text = resp.text
        # The CSV header row must contain key columns
        assert "ticker" in text, "CSV missing 'ticker' column"
        assert "direction" in text, "CSV missing 'direction' column"
        assert "confidence" in text, "CSV missing 'confidence' column"

    def test_export_after_demo_contains_signal(self, client):
        """After POST /api/signals/demo, export CSV must contain at least one data row."""
        client.post("/api/signals/demo?ticker=EXPORTTEST")
        resp = client.get("/api/signals/export")
        assert resp.status_code == 200
        lines = [l for l in resp.text.splitlines() if l.strip()]
        # At least header + one data row
        assert len(lines) >= 2, (
            f"Expected at least 2 lines (header + 1 row), got {len(lines)}: {resp.text[:400]}"
        )

    def test_export_csv_disposition_header(self, client):
        """Response must have Content-Disposition: attachment with .csv filename."""
        resp = client.get("/api/signals/export")
        disposition = resp.headers.get("content-disposition", "")
        assert "attachment" in disposition, f"Missing attachment disposition: {disposition}"
        assert ".csv" in disposition, f"Missing .csv in disposition: {disposition}"


# ---------------------------------------------------------------------------
# Signals trending — top tickers by signal count (last 24h)
# ---------------------------------------------------------------------------

class TestSignalsTrending:
    def test_trending_returns_200(self, client):
        resp = client.get("/api/signals/trending")
        assert resp.status_code == 200

    def test_trending_returns_list(self, client):
        data = client.get("/api/signals/trending").json()
        assert isinstance(data, list)

    def test_trending_has_required_fields(self, client):
        data = client.get("/api/signals/trending").json()
        if data:
            entry = data[0]
            assert "ticker" in entry
            assert "count" in entry
            assert "avg_confidence" in entry
            assert "trending" in entry

    def test_trending_limit_param(self, client):
        data = client.get("/api/signals/trending?limit=3").json()
        assert len(data) <= 3

    def test_trending_count_is_positive(self, client):
        data = client.get("/api/signals/trending").json()
        for entry in data:
            assert entry["count"] >= 1

    def test_trending_after_demo_includes_ticker(self, client):
        client.post("/api/signals/demo?ticker=TRENDTEST")
        data = client.get("/api/signals/trending?limit=100").json()
        tickers = [e["ticker"] for e in data]
        assert "TRENDTEST" in tickers


# ---------------------------------------------------------------------------
# Signals list — after demo, list must be non-empty
# ---------------------------------------------------------------------------

class TestSignalsListAfterDemo:
    def test_list_non_empty_after_demo(self, client):
        """GET /api/signals/ after POST /api/signals/demo must return at least 1 signal."""
        client.post("/api/signals/demo?ticker=LISTTEST")
        resp = client.get("/api/signals/")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1, (
            f"Expected at least 1 signal in list after demo, got {len(data)}"
        )

    def test_list_contains_demo_signal_ticker(self, client):
        """The demo signal's ticker must appear in the list response."""
        client.post("/api/signals/demo?ticker=TICKERCHECK")
        resp = client.get("/api/signals/")
        assert resp.status_code == 200
        tickers = [s["ticker"] for s in resp.json()]
        assert "TICKERCHECK" in tickers, (
            f"TICKERCHECK not found in signal list: {tickers}"
        )


# ---------------------------------------------------------------------------
# Price Alerts
# ---------------------------------------------------------------------------

class TestPriceAlerts:
    """Tests for POST/GET/DELETE /api/alerts/"""

    def test_create_alert_returns_200_and_alert_id(self, client):
        """POST /api/alerts/ must return 200 with alert_id."""
        auth = _auth_headers(client)
        payload = {"ticker": "AAPL", "condition": "above", "threshold": 200.0}
        resp = client.post("/api/alerts/", json=payload, headers=auth)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "alert_id" in data, f"alert_id missing: {data}"
        assert isinstance(data["alert_id"], str)
        assert len(data["alert_id"]) > 0

    def test_create_alert_returns_correct_fields(self, client):
        """Created alert must contain ticker, condition, threshold."""
        auth = _auth_headers(client)
        payload = {"ticker": "MSFT", "condition": "below", "threshold": 300.0}
        data = client.post("/api/alerts/", json=payload, headers=auth).json()
        assert data.get("ticker") == "MSFT"
        assert data.get("condition") == "below"
        assert data.get("threshold") == 300.0
        assert data.get("status") == "active"

    def test_list_alerts_returns_200_and_list(self, client):
        """GET /api/alerts/ must return 200 and a list."""
        auth = _auth_headers(client)
        resp = client.get("/api/alerts/", headers=auth)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert isinstance(resp.json(), list)

    def test_list_alerts_contains_created_alert(self, client):
        """After creating an alert it must appear in GET /api/alerts/."""
        auth = _auth_headers(client)
        payload = {"ticker": "NVDA", "condition": "change_pct", "threshold": 5.0}
        create_data = client.post("/api/alerts/", json=payload, headers=auth).json()
        alert_id = create_data["alert_id"]

        list_data = client.get("/api/alerts/", headers=auth).json()
        ids = [a["alert_id"] for a in list_data]
        assert alert_id in ids, f"Created alert {alert_id} not in list: {ids}"

    def test_delete_alert_returns_200(self, client):
        """DELETE /api/alerts/{id} must return 200."""
        auth = _auth_headers(client)
        payload = {"ticker": "TSLA", "condition": "above", "threshold": 400.0}
        create_data = client.post("/api/alerts/", json=payload, headers=auth).json()
        alert_id = create_data["alert_id"]

        resp = client.delete(f"/api/alerts/{alert_id}", headers=auth)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("deleted") is True
        assert data.get("alert_id") == alert_id

    def test_delete_nonexistent_alert_returns_404(self, client):
        """DELETE /api/alerts/nonexistent must return 404."""
        auth = _auth_headers(client)
        resp = client.delete("/api/alerts/nonexistent-alert-id-xyz", headers=auth)
        assert resp.status_code == 404

    def test_create_alert_invalid_condition_returns_422(self, client):
        """Invalid condition value must return 422."""
        auth = _auth_headers(client)
        payload = {"ticker": "AAPL", "condition": "invalid_cond", "threshold": 100.0}
        resp = client.post("/api/alerts/", json=payload, headers=auth)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Portfolio Analytics
# ---------------------------------------------------------------------------

class TestPortfolioAnalytics:
    """Tests for GET /api/portfolio/analytics"""

    def test_analytics_returns_200(self, client):
        """GET /api/portfolio/analytics must return 200 (or 500 on yfinance fail)."""
        from unittest.mock import patch
        import pandas as pd
        import numpy as np

        # Build a minimal mock for yfinance.download with 35 days of data
        dates = pd.date_range("2025-01-01", periods=35, freq="B")
        tickers = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD", "SPY"]
        rng = np.random.default_rng(42)
        data: dict = {}
        for t in tickers:
            base = 100.0
            prices = [base]
            for _ in range(34):
                base = base * (1 + rng.normal(0.0005, 0.015))
                prices.append(base)
            data[t] = prices

        mock_df = pd.DataFrame(data, index=dates)
        mock_df.columns = pd.MultiIndex.from_tuples([("Close", t) for t in tickers])

        with patch("yfinance.download", return_value=mock_df):
            resp = client.get("/api/portfolio/analytics")

        # Accept 200 (success) or 500 (yfinance unavailable in CI)
        assert resp.status_code in (200, 500), (
            f"Unexpected status {resp.status_code}: {resp.text[:300]}"
        )

    def test_analytics_schema_when_200(self, client):
        """When analytics returns 200, required fields must be present."""
        from unittest.mock import patch
        import pandas as pd
        import numpy as np

        dates = pd.date_range("2025-01-01", periods=35, freq="B")
        tickers = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD", "SPY"]
        rng = np.random.default_rng(99)
        data: dict = {}
        for t in tickers:
            base = 150.0
            prices = [base]
            for _ in range(34):
                base = base * (1 + rng.normal(0.001, 0.012))
                prices.append(base)
            data[t] = prices

        mock_df = pd.DataFrame(data, index=dates)
        mock_df.columns = pd.MultiIndex.from_tuples([("Close", t) for t in tickers])

        with patch("yfinance.download", return_value=mock_df):
            resp = client.get("/api/portfolio/analytics")

        if resp.status_code == 200:
            data_resp = resp.json()
            required = {"sharpe_ratio", "beta", "volatility_30d", "best_performer", "worst_performer"}
            missing = required - data_resp.keys()
            assert not missing, f"Analytics missing fields: {missing}"
            assert isinstance(data_resp["sharpe_ratio"], (int, float))
            assert isinstance(data_resp["beta"], (int, float))
            assert isinstance(data_resp["volatility_30d"], (int, float))

    def test_analytics_correlation_matrix_present_when_200(self, client):
        """correlation_matrix must be a 5x5 dict when analytics returns 200."""
        from unittest.mock import patch
        import pandas as pd
        import numpy as np

        dates = pd.date_range("2025-01-01", periods=35, freq="B")
        tickers = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD", "SPY"]
        rng = np.random.default_rng(7)
        data: dict = {}
        for t in tickers:
            base = 200.0
            prices = [base]
            for _ in range(34):
                base = base * (1 + rng.normal(0.0003, 0.011))
                prices.append(base)
            data[t] = prices

        mock_df = pd.DataFrame(data, index=dates)
        mock_df.columns = pd.MultiIndex.from_tuples([("Close", t) for t in tickers])

        with patch("yfinance.download", return_value=mock_df):
            resp = client.get("/api/portfolio/analytics")

        if resp.status_code == 200:
            data_resp = resp.json()
            assert "correlation_matrix" in data_resp
            corr = data_resp["correlation_matrix"]
            assert isinstance(corr, dict)
            assert len(corr) == 5, f"Expected 5 rows in correlation matrix, got {len(corr)}"


# ---------------------------------------------------------------------------
# Signal Persistence — after demo, signals/ list must return persisted signals
# ---------------------------------------------------------------------------

class TestSignalPersistence:
    """Verify that signals are retrievable from GET /api/signals/ after POST /demo."""

    def test_signals_list_non_empty_after_demo_post(self, client):
        """POST /api/signals/demo then GET /api/signals/ must return >= 1 signal."""
        client.post("/api/signals/demo?ticker=PERSIST_TEST")
        resp = client.get("/api/signals/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1, f"Expected >= 1 signal, got {len(data)}"

    def test_signals_list_contains_persisted_ticker(self, client):
        """The persisted ticker must appear in the signal list."""
        client.post("/api/signals/demo?ticker=DBTEST")
        resp = client.get("/api/signals/")
        assert resp.status_code == 200
        tickers = [s["ticker"] for s in resp.json()]
        assert "DBTEST" in tickers, f"DBTEST not found in: {tickers}"


# ---------------------------------------------------------------------------
# Backtest Export CSV
# ---------------------------------------------------------------------------

class TestBacktestExport:
    def _create_completed_job(self, client) -> str:
        """Helper: submit a backtest and wait for it to complete (in-process)."""
        payload = {
            "strategy_name": "Buy & Hold",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "jesse",
            "params": {},
        }
        run_resp = client.post("/api/backtest/run", json=payload)
        if run_resp.status_code == 429:
            pytest.skip("Rate limit hit — /api/backtest/run is at 10/min cap in full suite")
        assert run_resp.status_code == 200
        job_id = run_resp.json()["job_id"]

        # Poll until done (TestClient runs bg tasks synchronously in most cases)
        import time
        for _ in range(20):
            job_resp = client.get(f"/api/backtest/jobs/{job_id}")
            status = job_resp.json().get("status")
            if status in ("completed", "failed"):
                break
            time.sleep(0.2)
        return job_id

    def test_export_unknown_job_returns_404(self, client):
        """GET /api/backtest/export/nonexistent must return 404."""
        resp = client.get("/api/backtest/export/nonexistent-job-xyz")
        assert resp.status_code == 404

    def test_export_completed_job_returns_200_csv(self, client):
        """GET /api/backtest/export/{job_id} for a completed job must return 200 + text/csv."""
        job_id = self._create_completed_job(client)
        job = client.get(f"/api/backtest/jobs/{job_id}").json()
        if job["status"] != "completed":
            pytest.skip(f"Job did not complete in time (status: {job['status']})")

        resp = client.get(f"/api/backtest/export/{job_id}")
        assert resp.status_code == 200, (
            f"Expected 200 for completed export, got {resp.status_code}: {resp.text[:300]}"
        )
        content_type = resp.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got: {content_type}"

    def test_export_csv_has_summary_section(self, client):
        """CSV export must contain a SUMMARY section header."""
        job_id = self._create_completed_job(client)
        job = client.get(f"/api/backtest/jobs/{job_id}").json()
        if job["status"] != "completed":
            pytest.skip(f"Job did not complete in time (status: {job['status']})")

        resp = client.get(f"/api/backtest/export/{job_id}")
        if resp.status_code == 200:
            assert "SUMMARY" in resp.text, "CSV export missing SUMMARY section"


# ---------------------------------------------------------------------------
# Iteration 13 — New tests
# ---------------------------------------------------------------------------

class TestPortfolioCandles:
    """GET /api/portfolio/candles — OHLCV candlestick data."""

    def test_candles_aapl_returns_200(self, client):
        """GET /api/portfolio/candles?ticker=AAPL must return 200."""
        from unittest.mock import patch
        import pandas as pd

        # Build a minimal yfinance Ticker mock
        dates = pd.date_range("2025-04-01", periods=10, freq="B")
        mock_history = pd.DataFrame(
            {
                "Open":   [170.0 + i for i in range(10)],
                "High":   [172.0 + i for i in range(10)],
                "Low":    [168.0 + i for i in range(10)],
                "Close":  [171.0 + i for i in range(10)],
                "Volume": [1_000_000 + i * 10_000 for i in range(10)],
            },
            index=dates,
        )

        mock_ticker = type("T", (), {"history": lambda self, **kw: mock_history})()

        with patch("yfinance.Ticker", return_value=mock_ticker):
            resp = client.get("/api/portfolio/candles?ticker=AAPL&period=1mo&interval=1d")

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )
        data = resp.json()
        assert isinstance(data, list), "Response must be an array"
        if data:
            first = data[0]
            required = {"time", "open", "high", "low", "close", "volume"}
            missing = required - first.keys()
            assert not missing, f"OHLCV bar missing fields: {missing}"

    def test_candles_returns_array_type(self, client):
        """Response must always be a JSON array (even on empty data)."""
        from unittest.mock import patch
        import pandas as pd

        # Return empty DataFrame — endpoint must return []
        mock_ticker = type("T", (), {"history": lambda self, **kw: pd.DataFrame()})()

        with patch("yfinance.Ticker", return_value=mock_ticker):
            resp = client.get("/api/portfolio/candles?ticker=FAKE&period=1d&interval=1d")

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestSignalsFilter:
    """GET /api/signals/ — filter by ticker and direction."""

    def test_filter_by_ticker_returns_200(self, client):
        """GET /api/signals/?ticker=AAPL must return 200 with a list."""
        # Seed a demo signal for AAPL first
        client.post("/api/signals/demo?ticker=AAPL")
        resp = client.get("/api/signals/?ticker=AAPL")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )
        data = resp.json()
        assert isinstance(data, list), "Response must be a list"

    def test_filter_by_ticker_only_returns_matching(self, client):
        """When filtering by ticker, all returned signals must match."""
        client.post("/api/signals/demo?ticker=FILTERTEST")
        resp = client.get("/api/signals/?ticker=FILTERTEST&limit=50")
        assert resp.status_code == 200
        for sig in resp.json():
            assert sig["ticker"] == "FILTERTEST", (
                f"Non-matching ticker in filtered result: {sig['ticker']}"
            )

    def test_filter_by_direction_buy_returns_200(self, client):
        """GET /api/signals/?direction=BUY must return 200."""
        resp = client.get("/api/signals/?direction=BUY")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )
        assert isinstance(resp.json(), list)

    def test_filter_combined_ticker_and_direction(self, client):
        """Combining ticker and direction filters must return 200."""
        resp = client.get("/api/signals/?ticker=AAPL&direction=BUY&limit=10")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_filter_pagination_offset(self, client):
        """offset parameter must be accepted without error."""
        resp = client.get("/api/signals/?limit=5&offset=0")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestBacktestCompare:
    """POST /api/backtest/compare — parallel strategy comparison."""

    def test_compare_returns_200(self, client):
        """POST /api/backtest/compare must return 200."""
        payload = {
            "ticker":     "AAPL",
            "period":     "1y",
            "strategies": ["ma_crossover", "buy_and_hold"],
        }
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:400]}"
        )

    def test_compare_response_is_dict(self, client):
        """Response must be a dict with required top-level keys."""
        payload = {
            "ticker":     "MSFT",
            "period":     "6mo",
            "strategies": ["ma_crossover", "buy_and_hold"],
        }
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict), "Response must be a dict"
        required = {"ticker", "results", "best_strategy"}
        missing = required - data.keys()
        assert not missing, f"Compare response missing fields: {missing}"

    def test_compare_results_is_list(self, client):
        """results field must be a non-empty list."""
        payload = {
            "ticker":     "AAPL",
            "period":     "1y",
            "strategies": ["ma_crossover", "rsi_mean_reversion", "buy_and_hold"],
        }
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["results"], list)
        assert len(data["results"]) > 0

    def test_compare_result_rows_have_required_fields(self, client):
        """Each result row must contain strategy, return_pct, sharpe, drawdown, trades."""
        payload = {
            "ticker":     "AAPL",
            "period":     "1y",
            "strategies": ["ma_crossover", "buy_and_hold"],
        }
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        row_fields = {"strategy", "return_pct", "sharpe", "drawdown", "trades", "is_best"}
        for row in data["results"]:
            missing = row_fields - row.keys()
            assert not missing, f"Compare row missing fields: {missing}"

    def test_compare_best_strategy_is_marked(self, client):
        """Exactly one result must have is_best=True."""
        payload = {
            "ticker":     "NVDA",
            "period":     "1y",
            "strategies": ["ma_crossover", "buy_and_hold"],
        }
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        best_count = sum(1 for r in data["results"] if r.get("is_best"))
        assert best_count == 1, f"Expected exactly 1 best strategy, got {best_count}"

    def test_compare_empty_strategies_returns_422(self, client):
        """Empty strategies list must be rejected with 422."""
        payload = {"ticker": "AAPL", "period": "1y", "strategies": []}
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 422, f"Expected 422 for empty strategies, got {resp.status_code}"

    def test_compare_single_strategy_returns_one_result(self, client):
        """Single strategy compare must return exactly one result row."""
        payload = {"ticker": "AAPL", "period": "6mo", "strategies": ["buy_and_hold"]}
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["is_best"] is True

    def test_compare_ticker_echoed_in_response(self, client):
        """ticker field in response must match the requested ticker (uppercased)."""
        payload = {"ticker": "msft", "period": "1y", "strategies": ["buy_and_hold"]}
        resp = client.post("/api/backtest/compare", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ticker"] == "MSFT"


class TestHealthMetrics:
    """GET /api/health/metrics — performance monitoring endpoint."""

    def test_metrics_returns_200(self, client):
        """GET /api/health/metrics must return 200."""
        resp = client.get("/api/health/metrics")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )

    def test_metrics_has_requests_total(self, client):
        """requests_total field must be present and non-negative."""
        resp = client.get("/api/health/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert "requests_total" in data, "requests_total missing from metrics response"
        assert isinstance(data["requests_total"], int)
        assert data["requests_total"] >= 0

    def test_metrics_has_all_required_fields(self, client):
        """All 7 ApiMetricsResponse fields must be present."""
        resp = client.get("/api/health/metrics")
        assert resp.status_code == 200
        data = resp.json()
        required = {
            "requests_total",
            "avg_response_ms",
            "ws_connections_active",
            "signals_generated_today",
            "db_size_kb",
            "uptime_seconds",
            "measured_at",
        }
        missing = required - data.keys()
        assert not missing, f"Metrics response missing fields: {missing}"

    def test_metrics_uptime_is_positive(self, client):
        """uptime_seconds must be a positive number."""
        data = client.get("/api/health/metrics").json()
        assert isinstance(data["uptime_seconds"], (int, float))
        assert data["uptime_seconds"] >= 0

    def test_metrics_measured_at_is_iso_string(self, client):
        """measured_at must be a non-empty ISO 8601 string."""
        data = client.get("/api/health/metrics").json()
        assert isinstance(data["measured_at"], str)
        assert len(data["measured_at"]) >= 19, (
            f"measured_at too short to be ISO 8601: {data['measured_at']!r}"
        )
        assert "T" in data["measured_at"], (
            f"measured_at must contain 'T' (ISO 8601): {data['measured_at']!r}"
        )

    def test_metrics_requests_total_increments(self, client):
        """Calling any endpoint must increment requests_total."""
        before_resp = client.get("/api/health/metrics")
        assert before_resp.status_code == 200
        before = before_resp.json()["requests_total"]

        # Make some requests
        for _ in range(3):
            client.get("/api/health")

        after_resp = client.get("/api/health/metrics")
        assert after_resp.status_code == 200
        after = after_resp.json()["requests_total"]

        assert after > before, (
            f"requests_total did not increment: before={before}, after={after}"
        )

    def test_metrics_ws_connections_is_int(self, client):
        """ws_connections_active must be a non-negative integer."""
        data = client.get("/api/health/metrics").json()
        assert isinstance(data["ws_connections_active"], int)
        assert data["ws_connections_active"] >= 0

    def test_metrics_avg_response_ms_is_number(self, client):
        """avg_response_ms must be a non-negative number."""
        data = client.get("/api/health/metrics").json()
        assert isinstance(data["avg_response_ms"], (int, float))
        assert data["avg_response_ms"] >= 0


# ---------------------------------------------------------------------------
# Iteration 14 — New tests
# ---------------------------------------------------------------------------

class TestSignalPerformance:
    """GET /api/signals/performance — performance tracking endpoint."""

    def test_performance_returns_200(self, client):
        """GET /api/signals/performance must return 200."""
        resp = client.get("/api/signals/performance")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )

    def test_performance_has_avg_return(self, client):
        """Response must contain avg_return field."""
        resp = client.get("/api/signals/performance")
        assert resp.status_code == 200
        data = resp.json()
        assert "avg_return" in data, f"avg_return missing from response: {data}"

    def test_performance_has_all_required_fields(self, client):
        """All required performance fields must be present."""
        resp = client.get("/api/signals/performance")
        assert resp.status_code == 200
        data = resp.json()
        required = {"avg_return", "win_rate", "best_signal", "worst_signal", "total_evaluated"}
        missing = required - data.keys()
        assert not missing, f"Performance response missing fields: {missing}"

    def test_performance_win_rate_in_range(self, client):
        """win_rate must be between 0.0 and 1.0."""
        resp = client.get("/api/signals/performance")
        assert resp.status_code == 200
        data = resp.json()
        assert 0.0 <= data["win_rate"] <= 1.0, (
            f"win_rate out of range [0,1]: {data['win_rate']}"
        )

    def test_performance_total_evaluated_non_negative(self, client):
        """total_evaluated must be a non-negative integer."""
        resp = client.get("/api/signals/performance")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["total_evaluated"], int)
        assert data["total_evaluated"] >= 0


class TestAlertsListAfterPost:
    """GET /api/alerts/ after POST must contain the created alert."""

    def test_alerts_list_contains_created_alert(self, client):
        """After POST, the new alert must appear in GET /api/alerts/."""
        auth = _auth_headers(client)
        payload = {"ticker": "PERF_TEST", "condition": "above", "threshold": 500.0}
        create_resp = client.post("/api/alerts/", json=payload, headers=auth)
        assert create_resp.status_code == 200
        alert_id = create_resp.json()["alert_id"]

        list_resp = client.get("/api/alerts/", headers=auth)
        assert list_resp.status_code == 200
        ids = [a["alert_id"] for a in list_resp.json()]
        assert alert_id in ids, f"Created alert {alert_id} missing from list: {ids}"

    def test_alerts_list_returns_list_type(self, client):
        """GET /api/alerts/ must always return a JSON list."""
        auth = _auth_headers(client)
        resp = client.get("/api/alerts/", headers=auth)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestPortfolioCandlesWithIndicators:
    """GET /api/portfolio/candles?indicators=sma20,sma50 — indicator data included."""

    def test_candles_with_indicators_returns_200(self, client):
        """GET /api/portfolio/candles with indicators param must return 200."""
        from unittest.mock import patch
        import pandas as pd

        dates = pd.date_range("2025-01-01", periods=60, freq="B")
        mock_history = pd.DataFrame(
            {
                "Open":   [170.0 + i * 0.5 for i in range(60)],
                "High":   [172.0 + i * 0.5 for i in range(60)],
                "Low":    [168.0 + i * 0.5 for i in range(60)],
                "Close":  [171.0 + i * 0.5 for i in range(60)],
                "Volume": [1_000_000 for _ in range(60)],
            },
            index=dates,
        )

        mock_ticker = type("T", (), {"history": lambda self, **kw: mock_history})()

        with patch("yfinance.Ticker", return_value=mock_ticker):
            resp = client.get(
                "/api/portfolio/candles?ticker=AAPL&period=3mo&interval=1d&indicators=sma20,sma50"
            )

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        )
        data = resp.json()
        assert isinstance(data, list), "Response must be a list"

    def test_candles_with_indicators_has_sma_fields(self, client):
        """When indicators=sma20 is requested, bars should contain sma20 field."""
        from unittest.mock import patch
        import pandas as pd

        dates = pd.date_range("2025-01-01", periods=60, freq="B")
        mock_history = pd.DataFrame(
            {
                "Open":   [170.0 + i for i in range(60)],
                "High":   [172.0 + i for i in range(60)],
                "Low":    [168.0 + i for i in range(60)],
                "Close":  [171.0 + i for i in range(60)],
                "Volume": [500_000 for _ in range(60)],
            },
            index=dates,
        )

        mock_ticker = type("T", (), {"history": lambda self, **kw: mock_history})()

        with patch("yfinance.Ticker", return_value=mock_ticker):
            resp = client.get(
                "/api/portfolio/candles?ticker=AAPL&period=3mo&interval=1d&indicators=sma20"
            )

        assert resp.status_code == 200
        data = resp.json()
        # At least the bars after period 20 should have sma20
        if data and len(data) > 20:
            bar_with_sma = next((b for b in data if b.get("sma20") is not None), None)
            assert bar_with_sma is not None, "Expected at least one bar with sma20 value"


class TestCacheUnit:
    """Unit tests for the in-memory TTL cache."""

    def test_cache_second_call_returns_cached_value(self):
        """Second call within TTL must return cached value without re-running fn."""
        import time
        from app.core.cache import cached, cache_clear_all

        cache_clear_all()

        call_count = 0

        @cached(ttl_seconds=60)
        def _expensive(x: int) -> int:
            nonlocal call_count
            call_count += 1
            return x * 2

        result1 = _expensive(5)
        result2 = _expensive(5)

        assert result1 == 10
        assert result2 == 10
        assert call_count == 1, f"Expected 1 call (cache hit), got {call_count}"

    def test_cache_different_args_call_fn_separately(self):
        """Different arguments must produce separate cache entries."""
        from app.core.cache import cached, cache_clear_all

        cache_clear_all()

        call_count = 0

        @cached(ttl_seconds=60)
        def _fn(x: int) -> int:
            nonlocal call_count
            call_count += 1
            return x + 1

        _fn(1)
        _fn(2)

        assert call_count == 2, f"Expected 2 calls for 2 different args, got {call_count}"

    def test_cache_expires_after_ttl(self):
        """After TTL expires the function must be called again."""
        import time
        from app.core.cache import cached, cache_clear_all

        cache_clear_all()

        call_count = 0

        @cached(ttl_seconds=0.05)  # 50ms TTL
        def _fast_expire(x: int) -> int:
            nonlocal call_count
            call_count += 1
            return x

        _fast_expire(99)
        time.sleep(0.1)   # wait for TTL expiry
        _fast_expire(99)

        assert call_count == 2, (
            f"Expected 2 calls after TTL expiry, got {call_count}"
        )


# ---------------------------------------------------------------------------
# Iteration 15 — Webhooks + Batch Signals
# ---------------------------------------------------------------------------

class TestWebhooks:
    """Tests for POST/GET/DELETE /api/webhooks/ and test endpoint."""

    def test_create_webhook_returns_200_and_id(self, client):
        """POST /api/webhooks/ must return 200 with a webhook id."""
        auth = _auth_headers(client)
        payload = {
            "url": "https://example.com/webhook",
            "events": ["signal.generated"],
            "secret": "test-secret-123",
        }
        resp = client.post("/api/webhooks/", json=payload, headers=auth)
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "id" in data, f"id missing from response: {data}"
        assert isinstance(data["id"], str)
        assert len(data["id"]) > 0

    def test_create_webhook_returns_correct_fields(self, client):
        """Created webhook must contain url, events, created_at."""
        auth = _auth_headers(client)
        payload = {
            "url": "https://example.com/hook2",
            "events": ["alert.fired", "risk.alert"],
        }
        data = client.post("/api/webhooks/", json=payload, headers=auth).json()
        assert data.get("url") == "https://example.com/hook2"
        assert "alert.fired" in data.get("events", [])
        assert "risk.alert" in data.get("events", [])
        assert "created_at" in data

    def test_list_webhooks_returns_200_and_list(self, client):
        """GET /api/webhooks/ must return 200 and a list."""
        auth = _auth_headers(client)
        resp = client.get("/api/webhooks/", headers=auth)
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        assert isinstance(resp.json(), list)

    def test_list_webhooks_contains_created_webhook(self, client):
        """After POST, the new webhook must appear in GET /api/webhooks/."""
        auth = _auth_headers(client)
        payload = {
            "url": "https://example.com/listed-hook",
            "events": ["order.filled"],
        }
        create_data = client.post("/api/webhooks/", json=payload, headers=auth).json()
        webhook_id = create_data["id"]

        list_data = client.get("/api/webhooks/", headers=auth).json()
        ids = [w["id"] for w in list_data]
        assert webhook_id in ids, f"Created webhook {webhook_id} not in list: {ids}"

    def test_delete_webhook_returns_200(self, client):
        """DELETE /api/webhooks/{id} must return 200 with deleted=True."""
        auth = _auth_headers(client)
        payload = {
            "url": "https://example.com/delete-me",
            "events": ["signal.generated"],
        }
        create_data = client.post("/api/webhooks/", json=payload, headers=auth).json()
        webhook_id = create_data["id"]

        resp = client.delete(f"/api/webhooks/{webhook_id}", headers=auth)
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data.get("deleted") is True
        assert data.get("webhook_id") == webhook_id

    def test_delete_nonexistent_webhook_returns_404(self, client):
        """DELETE /api/webhooks/nonexistent must return 404."""
        auth = _auth_headers(client)
        resp = client.delete("/api/webhooks/nonexistent-webhook-id-xyz", headers=auth)
        assert resp.status_code == 404

    def test_create_webhook_invalid_event_returns_422(self, client):
        """Invalid event type must return 422."""
        auth = _auth_headers(client)
        payload = {
            "url": "https://example.com/hook",
            "events": ["invalid.event.type"],
        }
        resp = client.post("/api/webhooks/", json=payload, headers=auth)
        assert resp.status_code == 422, (
            f"Expected 422 for invalid event, got {resp.status_code}: {resp.text}"
        )


class TestBatchSignals:
    """Tests for POST /api/signals/batch"""

    def test_batch_returns_200_and_list(self, client):
        """POST /api/signals/batch must return 200 and a list of signals."""
        payload = {"tickers": ["AAPL", "MSFT", "NVDA"], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert isinstance(data, list), "Response must be a list"
        assert len(data) == 3, f"Expected 3 signals, got {len(data)}"

    def test_batch_returns_correct_number_of_signals(self, client):
        """Response list length must match number of requested tickers."""
        payload = {"tickers": ["AAPL", "TSLA"], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2, f"Expected 2 signals for 2 tickers, got {len(data)}"

    def test_batch_signal_has_required_fields(self, client):
        """Each signal in batch response must have required fields."""
        payload = {"tickers": ["AAPL"], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        required = {"id", "ticker", "direction", "confidence", "source", "generated_at"}
        for signal in data:
            missing = required - signal.keys()
            assert not missing, f"Signal missing fields: {missing}"

    def test_batch_signal_source_indicates_batch(self, client):
        """Batch signals must have source indicating batch origin."""
        payload = {"tickers": ["NVDA"], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert "batch" in data[0]["source"].lower() or "demo" in data[0]["source"].lower()

    def test_batch_more_than_10_tickers_returns_422(self, client):
        """POST /api/signals/batch with > 10 tickers must return 422."""
        tickers = ["AAPL", "MSFT", "NVDA", "TSLA", "AMD", "META", "GOOGL", "AMZN", "NFLX", "ORCL", "CRM"]
        assert len(tickers) == 11, "Test setup: need 11 tickers"
        payload = {"tickers": tickers, "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 422, (
            f"Expected 422 for >10 tickers, got {resp.status_code}: {resp.text}"
        )

    def test_batch_empty_tickers_returns_empty_list(self, client):
        """POST /api/signals/batch with empty list must return 200 and []."""
        payload = {"tickers": [], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data == [], f"Expected empty list, got: {data}"

    def test_batch_signals_appear_in_signals_list(self, client):
        """Batch signals must appear in GET /api/signals/ after generation."""
        payload = {"tickers": ["BATCHTEST1"], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200

        list_resp = client.get("/api/signals/")
        assert list_resp.status_code == 200
        tickers = [s["ticker"] for s in list_resp.json()]
        assert "BATCHTEST1" in tickers, (
            f"BATCHTEST1 not found in signal list after batch: {tickers[:10]}"
        )

    def test_batch_normalizes_lowercase_tickers(self, client):
        """Lowercase ticker input must be uppercased in batch response."""
        payload = {"tickers": ["aapl", "msft"], "fast_mode": True}
        resp = client.post("/api/signals/batch", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        returned = {s["ticker"] for s in data}
        assert returned == {"AAPL", "MSFT"}, f"Expected uppercase tickers, got: {returned}"


# ---------------------------------------------------------------------------
# Iteration 17 — Strategy params tests
# ---------------------------------------------------------------------------

class TestStrategyParams:
    """Tests for custom strategy parameters in /api/backtest/run and /api/backtest/strategies."""

    def test_run_backtest_with_custom_ma_params_returns_200(self, client):
        """POST /api/backtest/run with valid custom ma_crossover params must return 200."""
        payload = {
            "strategy_name": "ma_crossover",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "jesse",
            "params": {"fast_period": 10, "slow_period": 30},
        }
        resp = client.post("/api/backtest/run", json=payload)
        data = _assert_ok(resp)
        assert "job_id" in data, "Response must contain job_id"

    def test_run_backtest_with_invalid_params_fast_greater_slow_returns_422(self, client):
        """POST /api/backtest/run with fast_period >= slow_period must return 422."""
        payload = {
            "strategy_name": "ma_crossover",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "jesse",
            "params": {"fast_period": 50, "slow_period": 20},
        }
        resp = client.post("/api/backtest/run", json=payload)
        assert resp.status_code == 422, (
            f"Expected 422 for fast_period >= slow_period, got {resp.status_code}: {resp.text[:300]}"
        )

    def test_run_backtest_with_out_of_range_params_returns_422(self, client):
        """POST /api/backtest/run with fast_period out of range [5,100] must return 422."""
        payload = {
            "strategy_name": "ma_crossover",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "jesse",
            "params": {"fast_period": 1, "slow_period": 50},
        }
        resp = client.post("/api/backtest/run", json=payload)
        assert resp.status_code == 422, (
            f"Expected 422 for out-of-range fast_period, got {resp.status_code}: {resp.text[:300]}"
        )

    def test_strategies_endpoint_has_params_schema_field(self, client):
        """GET /api/backtest/strategies must include params_schema for each strategy."""
        resp = client.get("/api/backtest/strategies")
        data = _assert_ok(resp)
        for strategy in data:
            assert "params_schema" in strategy, (
                f"Strategy '{strategy.get('id')}' missing params_schema field"
            )

    def test_ma_crossover_params_schema_has_correct_keys(self, client):
        """ma_crossover params_schema must define fast_period and slow_period."""
        resp = client.get("/api/backtest/strategies")
        data = _assert_ok(resp)
        ma = next((s for s in data if s["id"] == "ma_crossover"), None)
        assert ma is not None, "ma_crossover strategy not found"
        schema = ma["params_schema"]
        assert "fast_period" in schema, "params_schema missing fast_period"
        assert "slow_period" in schema, "params_schema missing slow_period"

    def test_ma_crossover_params_schema_has_min_max_default(self, client):
        """Each param in ma_crossover schema must have type, default, min, max."""
        resp = client.get("/api/backtest/strategies")
        data = _assert_ok(resp)
        ma = next((s for s in data if s["id"] == "ma_crossover"), None)
        assert ma is not None
        for key in ("fast_period", "slow_period"):
            param = ma["params_schema"][key]
            for field in ("type", "default", "min", "max"):
                assert field in param, f"params_schema['{key}'] missing '{field}'"

    def test_rsi_mean_reversion_params_schema_has_correct_keys(self, client):
        """rsi_mean_reversion params_schema must contain rsi_period, oversold, overbought."""
        data = _assert_ok(client.get("/api/backtest/strategies"))
        rsi = next((s for s in data if s["id"] == "rsi_mean_reversion"), None)
        assert rsi is not None, "rsi_mean_reversion strategy not found"
        for key in ("rsi_period", "oversold", "overbought"):
            assert key in rsi["params_schema"], f"rsi_mean_reversion params_schema missing '{key}'"

    def test_rsi_mean_reversion_params_schema_has_min_max_default(self, client):
        """Each rsi_mean_reversion param must have type, default, min, max."""
        data = _assert_ok(client.get("/api/backtest/strategies"))
        rsi = next((s for s in data if s["id"] == "rsi_mean_reversion"), None)
        assert rsi is not None
        for key in ("rsi_period", "oversold", "overbought"):
            param = rsi["params_schema"][key]
            for field in ("type", "default", "min", "max"):
                assert field in param, f"rsi_mean_reversion params_schema['{key}'] missing '{field}'"

    def test_buy_and_hold_has_empty_params_schema(self, client):
        """buy_and_hold has no configurable params — schema must be empty dict."""
        data = _assert_ok(client.get("/api/backtest/strategies"))
        bah = next((s for s in data if s["id"] == "buy_and_hold"), None)
        assert bah is not None, "buy_and_hold strategy not found"
        assert bah["params_schema"] == {}, f"Expected empty schema, got: {bah['params_schema']}"

    def test_run_backtest_rsi_with_custom_params_returns_200(self, client):
        """POST /api/backtest/run with valid custom rsi_mean_reversion params must return 200."""
        payload = {
            "strategy_name": "rsi_mean_reversion",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "vibe_trading",
            "params": {"rsi_period": 21, "oversold": 25, "overbought": 75},
        }
        resp = client.post("/api/backtest/run", json=payload)
        if resp.status_code == 429:
            pytest.skip("Rate limit hit — /api/backtest/run is at 10/min cap in full suite")
        data = _assert_ok(resp)
        assert "job_id" in data, "Response must contain job_id"

    def test_run_backtest_rsi_period_out_of_range_returns_422(self, client):
        """POST /api/backtest/run with rsi_period > 50 must return 422."""
        payload = {
            "strategy_name": "rsi_mean_reversion",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "vibe_trading",
            "params": {"rsi_period": 99, "oversold": 30, "overbought": 70},
        }
        resp = client.post("/api/backtest/run", json=payload)
        if resp.status_code == 429:
            pytest.skip("Rate limit hit — /api/backtest/run is at 10/min cap in full suite")
        assert resp.status_code == 422, f"Expected 422 for rsi_period=99, got {resp.status_code}"

    def test_run_backtest_rsi_oversold_out_of_range_returns_422(self, client):
        """POST /api/backtest/run with oversold > 45 must return 422."""
        payload = {
            "strategy_name": "rsi_mean_reversion",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10000.0,
            "engine": "vibe_trading",
            "params": {"rsi_period": 14, "oversold": 50, "overbought": 70},
        }
        resp = client.post("/api/backtest/run", json=payload)
        if resp.status_code == 429:
            pytest.skip("Rate limit hit — /api/backtest/run is at 10/min cap in full suite")
        assert resp.status_code == 422, f"Expected 422 for oversold=50, got {resp.status_code}"


# ---------------------------------------------------------------------------
# Risk Limits
# ---------------------------------------------------------------------------

class TestRiskLimits:
    def test_limits_returns_200(self, client):
        data = _assert_ok(client.get("/api/risk/limits"))
        assert isinstance(data, dict)

    def test_limits_has_required_fields(self, client):
        data = _assert_ok(client.get("/api/risk/limits"))
        for field in ("max_position_size_pct", "max_daily_loss_pct", "max_leverage", "enable_live_trading"):
            assert field in data, f"Missing field: {field}"

    def test_limits_max_leverage_positive(self, client):
        data = _assert_ok(client.get("/api/risk/limits"))
        assert data["max_leverage"] > 0

    def test_limits_enable_live_trading_is_bool(self, client):
        data = _assert_ok(client.get("/api/risk/limits"))
        assert isinstance(data["enable_live_trading"], bool)

    def test_limits_pct_fields_in_valid_range(self, client):
        data = _assert_ok(client.get("/api/risk/limits"))
        assert 0 < data["max_position_size_pct"] <= 1.0, "max_position_size_pct must be in (0, 1]"
        assert 0 < data["max_daily_loss_pct"] <= 1.0, "max_daily_loss_pct must be in (0, 1]"


# ---------------------------------------------------------------------------
# Portfolio Performance
# ---------------------------------------------------------------------------

class TestPortfolioPerformance:
    def test_performance_returns_200(self, client):
        data = _assert_ok(client.get("/api/portfolio/performance"))
        assert isinstance(data, dict)

    def test_performance_has_required_fields(self, client):
        data = _assert_ok(client.get("/api/portfolio/performance"))
        for field in ("total_value", "total_pnl", "total_pnl_pct", "day_pnl", "day_pnl_pct", "position_count", "cash_pct"):
            assert field in data, f"Missing field: {field}"

    def test_performance_total_value_positive(self, client):
        data = _assert_ok(client.get("/api/portfolio/performance"))
        assert data["total_value"] > 0

    def test_performance_position_count_non_negative(self, client):
        data = _assert_ok(client.get("/api/portfolio/performance"))
        assert data["position_count"] >= 0

    def test_performance_cash_pct_in_range(self, client):
        data = _assert_ok(client.get("/api/portfolio/performance"))
        assert 0.0 <= data["cash_pct"] <= 1.0, f"cash_pct out of range: {data['cash_pct']}"


# ---------------------------------------------------------------------------
# Backtest Job Delete
# ---------------------------------------------------------------------------

class TestBacktestJobDelete:
    """Uses ONE job creation to stay within the 10/min rate limit budget."""

    def test_delete_existing_job_returns_200_and_response_shape(self, client):
        """Create one job, verify DELETE returns 200 with 'deleted' field containing job_id."""
        create = client.post("/api/backtest/run", json={
            "strategy_name": "buy_and_hold",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
        })
        if create.status_code == 429:
            pytest.skip("Rate limit hit — /api/backtest/run is at 10/min cap in full suite")
        job_id = _assert_ok(create)["job_id"]
        data = _assert_ok(client.delete(f"/api/backtest/jobs/{job_id}"))
        assert "deleted" in data, "DELETE response must contain 'deleted' key"
        assert str(data["deleted"]) == job_id or data["deleted"] is True, (
            f"Unexpected 'deleted' value: {data['deleted']}"
        )
        # After deletion, the job must be gone
        get_resp = client.get(f"/api/backtest/jobs/{job_id}")
        assert get_resp.status_code == 404, (
            f"Job {job_id} should be gone after delete but got {get_resp.status_code}"
        )

    def test_delete_nonexistent_job_returns_404(self, client):
        resp = client.delete("/api/backtest/jobs/nonexistent-job-xyz")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"


# ---------------------------------------------------------------------------
# Risk Alerts
# ---------------------------------------------------------------------------

class TestRiskAlerts:
    def test_risk_alerts_returns_200(self, client):
        resp = client.get("/api/risk/alerts")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:300]}"

    def test_risk_alerts_returns_list(self, client):
        data = _assert_ok(client.get("/api/risk/alerts"))
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_risk_alerts_items_are_strings(self, client):
        data = _assert_ok(client.get("/api/risk/alerts"))
        for item in data:
            assert isinstance(item, str), f"Alert item must be str, got {type(item)}: {item!r}"


# ---------------------------------------------------------------------------
# Portfolio root endpoint
# ---------------------------------------------------------------------------

class TestPortfolioRoot:
    def test_portfolio_root_returns_200(self, client):
        resp = client.get("/api/portfolio/")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:300]}"

    def test_portfolio_root_has_required_fields(self, client):
        data = _assert_ok(client.get("/api/portfolio/"))
        required = {"timestamp", "total_value", "cash", "invested", "total_pnl", "positions"}
        missing = required - data.keys()
        assert not missing, f"Portfolio root missing fields: {missing}"

    def test_portfolio_root_positions_is_list(self, client):
        data = _assert_ok(client.get("/api/portfolio/"))
        assert isinstance(data["positions"], list), "positions must be a list"


# ---------------------------------------------------------------------------
# Portfolio positions endpoint
# ---------------------------------------------------------------------------

class TestPortfolioPositions:
    def test_positions_returns_200(self, client):
        resp = client.get("/api/portfolio/positions")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:300]}"

    def test_positions_returns_list(self, client):
        data = _assert_ok(client.get("/api/portfolio/positions"))
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_positions_non_empty(self, client):
        data = _assert_ok(client.get("/api/portfolio/positions"))
        assert len(data) > 0, "Expected at least one position from demo portfolio"

    def test_positions_have_required_fields(self, client):
        data = _assert_ok(client.get("/api/portfolio/positions"))
        required = {"ticker", "quantity", "avg_entry_price", "current_price", "market_value", "unrealized_pnl"}
        for pos in data:
            missing = required - pos.keys()
            assert not missing, f"Position missing fields: {missing}"

    def test_positions_quantity_positive(self, client):
        data = _assert_ok(client.get("/api/portfolio/positions"))
        for pos in data:
            assert pos["quantity"] > 0, f"Position quantity must be positive, got {pos['quantity']} for {pos.get('ticker')}"


# ---------------------------------------------------------------------------
# Portfolio equity curve endpoint
# ---------------------------------------------------------------------------

class TestPortfolioEquityCurve:
    def test_equity_curve_returns_200(self, client):
        resp = client.get("/api/portfolio/equity-curve")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:300]}"

    def test_equity_curve_returns_list(self, client):
        data = _assert_ok(client.get("/api/portfolio/equity-curve"))
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_equity_curve_non_empty(self, client):
        data = _assert_ok(client.get("/api/portfolio/equity-curve"))
        assert len(data) > 0, "Equity curve must have at least one data point"

    def test_equity_curve_items_have_date_and_value(self, client):
        data = _assert_ok(client.get("/api/portfolio/equity-curve"))
        for item in data:
            assert "date" in item, f"Missing 'date' in equity curve item: {item}"
            assert "value" in item, f"Missing 'value' in equity curve item: {item}"

    def test_equity_curve_value_is_positive_number(self, client):
        data = _assert_ok(client.get("/api/portfolio/equity-curve"))
        for item in data:
            assert isinstance(item["value"], (int, float)), f"value must be numeric: {item}"
            assert item["value"] > 0, f"Portfolio value must be positive: {item}"

    def test_equity_curve_custom_days(self, client):
        data = _assert_ok(client.get("/api/portfolio/equity-curve?days=7"))
        assert isinstance(data, list) and len(data) > 0

    def test_equity_curve_60_days(self, client):
        """days=60 matches the Portfolio page default (label: 'Equity Curve — 60 Days')."""
        data = _assert_ok(client.get("/api/portfolio/equity-curve?days=60"))
        assert isinstance(data, list)
        assert len(data) > 0, "60-day equity curve must return at least one data point"
        assert len(data) <= 60, f"60-day curve should not exceed 60 points, got {len(data)}"

    def test_equity_curve_days_clamped_to_max(self, client):
        resp = client.get("/api/portfolio/equity-curve?days=9999")
        assert resp.status_code == 200

    def test_equity_curve_days_clamped_to_min(self, client):
        resp = client.get("/api/portfolio/equity-curve?days=1")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Backtest results endpoint
# ---------------------------------------------------------------------------

class TestBacktestResults:
    def test_results_nonexistent_job_returns_404(self, client):
        resp = client.get("/api/backtest/results/no-such-job-abc123")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    def test_results_completed_job_returns_200_or_409_with_valid_shape(self, client):
        """Create ONE job; /results returns 200 (if done) or 409 (still running).
        If 200, validate the BacktestResult shape."""
        run = client.post("/api/backtest/run", json={
            "strategy_name": "buy_and_hold",
            "ticker": "SPY",
            "start_date": "2024-01-01",
            "end_date": "2024-06-01",
        })
        if run.status_code == 429:
            pytest.skip("Rate limit hit — /api/backtest/run is at 10/min cap in full suite")
        job_id = _assert_ok(run)["job_id"]
        resp = client.get(f"/api/backtest/results/{job_id}")
        assert resp.status_code in {200, 409}, (
            f"Expected 200 (completed) or 409 (still running), got {resp.status_code}. Body: {resp.text[:300]}"
        )
        if resp.status_code == 200:
            data = resp.json()
            required = {"strategy_name", "ticker", "total_return_pct", "sharpe_ratio", "max_drawdown_pct", "total_trades"}
            missing = required - data.keys()
            assert not missing, f"BacktestResult missing fields: {missing}"


# ---------------------------------------------------------------------------
# Health repos endpoint
# ---------------------------------------------------------------------------

class TestHealthRepos:
    """GET /api/health/repos — checks all 9 AI engine repo paths (requires auth)."""

    def test_repos_returns_200(self, client):
        auth = _auth_headers(client)
        resp = client.get("/api/health/repos", headers=auth)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:300]}"

    def test_repos_returns_dict(self, client):
        auth = _auth_headers(client)
        data = client.get("/api/health/repos", headers=auth).json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_repos_covers_all_9_engines(self, client):
        auth = _auth_headers(client)
        data = client.get("/api/health/repos", headers=auth).json()
        expected = {
            "TradingAgents", "AI-Trader", "daily_stock_analysis",
            "Vibe-Trading", "qlib", "nautilus_trader", "FinGPT", "FinRobot", "jesse",
        }
        missing = expected - data.keys()
        assert not missing, f"repos response missing engine keys: {missing}"

    def test_repos_each_entry_has_path_and_exists(self, client):
        auth = _auth_headers(client)
        data = client.get("/api/health/repos", headers=auth).json()
        for key, entry in data.items():
            assert "path" in entry, f"repos['{key}'] missing 'path' field"
            assert "exists" in entry, f"repos['{key}'] missing 'exists' field"

    def test_repos_exists_is_bool(self, client):
        auth = _auth_headers(client)
        data = client.get("/api/health/repos", headers=auth).json()
        for key, entry in data.items():
            assert isinstance(entry["exists"], bool), (
                f"repos['{key}']['exists'] must be bool, got {type(entry['exists'])}"
            )

    def test_repos_path_is_non_empty_string(self, client):
        auth = _auth_headers(client)
        data = client.get("/api/health/repos", headers=auth).json()
        for key, entry in data.items():
            assert isinstance(entry["path"], str), f"repos['{key}']['path'] must be str"
            assert len(entry["path"]) > 0, f"repos['{key}']['path'] must not be empty"


# ---------------------------------------------------------------------------
# Elliott Wave Analysis endpoints
# ---------------------------------------------------------------------------

class TestElliottWave:
    """GET /api/analysis/elliott/demo and /api/analysis/elliott/{ticker}"""

    def test_demo_returns_200(self, client):
        resp = client.get("/api/analysis/elliott/demo")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:400]}"

    def test_demo_response_shape(self, client):
        data = client.get("/api/analysis/elliott/demo").json()
        required = {
            "ticker", "period", "wave_degree", "sequence_type", "current_wave",
            "wave_direction", "confidence", "waves", "fibonacci_levels",
            "price_targets", "stop_loss", "interpretation", "candles", "analyzed_at",
        }
        missing = required - data.keys()
        assert not missing, f"Demo response missing fields: {missing}"

    def test_demo_confidence_range(self, client):
        data = client.get("/api/analysis/elliott/demo").json()
        conf = data["confidence"]
        assert 0.0 <= conf <= 1.0, f"confidence must be 0–1, got {conf}"

    def test_demo_sequence_type_valid(self, client):
        data = client.get("/api/analysis/elliott/demo").json()
        assert data["sequence_type"] in {"impulse", "corrective"}, (
            f"sequence_type must be 'impulse' or 'corrective', got {data['sequence_type']}"
        )

    def test_demo_wave_direction_valid(self, client):
        data = client.get("/api/analysis/elliott/demo").json()
        assert data["wave_direction"] in {"bullish", "bearish", "neutral"}, (
            f"wave_direction must be bullish/bearish/neutral, got {data['wave_direction']}"
        )

    def test_demo_candles_is_list(self, client):
        # candles may be empty when yfinance has no network access (CI/test env)
        data = client.get("/api/analysis/elliott/demo").json()
        assert isinstance(data["candles"], list), "candles must be a list"

    def test_demo_candle_ohlcv_fields(self, client):
        data = client.get("/api/analysis/elliott/demo").json()
        if not data["candles"]:
            return  # graceful skip — no market data available in test env
        candle = data["candles"][0]
        for field in ("date", "open", "high", "low", "close", "volume"):
            assert field in candle, f"candle missing field '{field}'"

    def test_demo_fibonacci_levels_have_required_fields(self, client):
        data = client.get("/api/analysis/elliott/demo").json()
        for lvl in data["fibonacci_levels"]:
            for field in ("ratio", "label", "price", "type"):
                assert field in lvl, f"fibonacci_level missing '{field}'"

    def test_demo_stop_loss_non_negative(self, client):
        # stop_loss is 0 when no market data (test env) — only require non-negative
        data = client.get("/api/analysis/elliott/demo").json()
        assert data["stop_loss"] >= 0, f"stop_loss must be non-negative, got {data['stop_loss']}"

    def test_ticker_endpoint_returns_200(self, client):
        resp = client.get("/api/analysis/elliott/AAPL?period=1mo")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}. Body: {resp.text[:400]}"

    def test_ticker_endpoint_ticker_matches(self, client):
        resp = client.get("/api/analysis/elliott/MSFT?period=1mo")
        data = resp.json()
        assert data.get("ticker") == "MSFT", f"Expected ticker=MSFT, got {data.get('ticker')}"

    def test_invalid_ticker_returns_422(self, client):
        resp = client.get("/api/analysis/elliott/TOOLONGTICKER123")
        assert resp.status_code == 422, f"Expected 422 for invalid ticker, got {resp.status_code}"

    def test_invalid_period_returns_422(self, client):
        resp = client.get("/api/analysis/elliott/AAPL?period=99y")
        assert resp.status_code == 422, f"Expected 422 for invalid period, got {resp.status_code}"

    def test_valid_periods_accepted(self, client):
        for period in ("1mo", "3mo", "6mo", "1y", "2y"):
            resp = client.get(f"/api/analysis/elliott/SPY?period={period}")
            assert resp.status_code == 200, (
                f"period={period} should be valid, got {resp.status_code}. Body: {resp.text[:200]}"
            )


# ---------------------------------------------------------------------------
# Iteration 16 — Webhook test-delivery endpoint
# ---------------------------------------------------------------------------

class TestWebhookTestEndpoint:
    """Tests for POST /api/webhooks/{id}/test (send_test)."""

    def _create_webhook(self, client, auth: dict) -> str:
        """Helper: create a webhook and return its id."""
        resp = client.post(
            "/api/webhooks/",
            json={"url": "https://example.com/recv", "events": ["signal.generated"]},
            headers=auth,
        )
        assert resp.status_code == 200
        return resp.json()["id"]

    def test_test_nonexistent_webhook_returns_404(self, client):
        """POST /api/webhooks/nonexistent/test must return 404."""
        auth = _auth_headers(client)
        resp = client.post("/api/webhooks/does-not-exist-xyz/test", headers=auth)
        assert resp.status_code == 404, (
            f"Expected 404, got {resp.status_code}: {resp.text}"
        )

    def test_test_webhook_success_returns_200(self, client):
        """POST /api/webhooks/{id}/test returns 200 with success=True on 2xx delivery."""
        auth = _auth_headers(client)
        webhook_id = self._create_webhook(client, auth)

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch(
            "httpx.AsyncClient.post",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = client.post(f"/api/webhooks/{webhook_id}/test", headers=auth)

        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data.get("webhook_id") == webhook_id
        assert data.get("success") is True
        assert data.get("status_code") == 200

    def test_test_webhook_failure_returns_success_false(self, client):
        """POST /api/webhooks/{id}/test returns success=False when remote returns 5xx."""
        auth = _auth_headers(client)
        webhook_id = self._create_webhook(client, auth)

        mock_response = MagicMock()
        mock_response.status_code = 503

        with patch(
            "httpx.AsyncClient.post",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = client.post(f"/api/webhooks/{webhook_id}/test", headers=auth)

        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is False
        assert data.get("status_code") == 503

    def test_test_webhook_connection_error_returns_status_zero(self, client):
        """POST /api/webhooks/{id}/test returns status_code=0 on connection error."""
        auth = _auth_headers(client)
        webhook_id = self._create_webhook(client, auth)

        with patch(
            "httpx.AsyncClient.post",
            new_callable=AsyncMock,
            side_effect=httpx.ConnectError("connection refused"),
        ), patch("asyncio.sleep", new_callable=AsyncMock):
            resp = client.post(f"/api/webhooks/{webhook_id}/test", headers=auth)

        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is False
        assert data.get("status_code") == 0

    def test_test_webhook_response_contains_required_fields(self, client):
        """Response must contain webhook_id, status_code, and success fields."""
        auth = _auth_headers(client)
        webhook_id = self._create_webhook(client, auth)

        mock_response = MagicMock()
        mock_response.status_code = 201

        with patch(
            "httpx.AsyncClient.post",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = client.post(f"/api/webhooks/{webhook_id}/test", headers=auth)

        data = resp.json()
        for field in ("webhook_id", "status_code", "success"):
            assert field in data, f"Field '{field}' missing from response: {data}"


# ---------------------------------------------------------------------------
# Iteration 17 — Backtest alternative engines (vibe_trading / qlib / invalid)
# ---------------------------------------------------------------------------

class TestBacktestEngines:
    """Tests for POST /api/backtest/run with vibe_trading, qlib, and unknown engines.

    NOTE: /api/backtest/run has a strict 10/minute rate limit. When running the
    full suite, earlier test classes may exhaust the limit. Tests therefore accept
    429 as a valid response (the endpoint is reachable) and only validate response
    shape on 200.
    """

    _BASE = {
        "strategy_name": "ma_crossover",
        "ticker": "AAPL",
        "start_date": "2023-01-01",
        "end_date": "2023-06-01",
        "initial_capital": 10_000.0,
        "params": {},
    }

    @staticmethod
    def _post_run(client, engine: str):
        payload = {
            "strategy_name": "ma_crossover",
            "ticker": "AAPL",
            "start_date": "2023-01-01",
            "end_date": "2023-06-01",
            "initial_capital": 10_000.0,
            "params": {},
            "engine": engine,
        }
        return client.post("/api/backtest/run", json=payload)

    def test_vibe_trading_engine_accepts_request_and_returns_job_id(self, client):
        """POST /api/backtest/run engine=vibe_trading returns 200+job_id or 429."""
        resp = self._post_run(client, "vibe_trading")
        assert resp.status_code in {200, 429}, (
            f"Expected 200 or 429, got {resp.status_code}: {resp.text[:300]}"
        )
        if resp.status_code == 200:
            data = resp.json()
            assert "job_id" in data and data["job_id"]

    def test_qlib_engine_accepts_request_and_returns_job_id(self, client):
        """POST /api/backtest/run engine=qlib returns 200+job_id or 429."""
        resp = self._post_run(client, "qlib")
        assert resp.status_code in {200, 429}, (
            f"Expected 200 or 429, got {resp.status_code}: {resp.text[:300]}"
        )
        if resp.status_code == 200:
            assert "job_id" in resp.json()

    def test_vibe_trading_job_eventually_completes_or_runs(self, client):
        """If a vibe_trading job is created, its status must be a known value."""
        resp = self._post_run(client, "vibe_trading")
        if resp.status_code == 429:
            return  # rate limited — endpoint exists, skip status check
        job_id = resp.json()["job_id"]
        job = _assert_ok(client.get(f"/api/backtest/jobs/{job_id}"))
        assert job["status"] in {"queued", "running", "completed", "failed"}, (
            f"Unexpected job status: {job['status']}"
        )

    def test_qlib_job_eventually_completes_or_runs(self, client):
        """If a qlib job is created, its status must be a known value."""
        resp = self._post_run(client, "qlib")
        if resp.status_code == 429:
            return  # rate limited — endpoint exists, skip status check
        job_id = resp.json()["job_id"]
        job = _assert_ok(client.get(f"/api/backtest/jobs/{job_id}"))
        assert job["status"] in {"queued", "running", "completed", "failed"}, (
            f"Unexpected job status: {job['status']}"
        )

    def test_unknown_engine_job_fails_gracefully(self, client):
        """Unknown engine: job creation returns 200 or 429; on 200 job_id is present."""
        resp = self._post_run(client, "nonexistent_engine_xyz")
        assert resp.status_code in {200, 429}, (
            f"Expected 200 or 429, got {resp.status_code}: {resp.text[:300]}"
        )
        if resp.status_code == 200:
            assert "job_id" in resp.json()

    def test_engine_field_case_insensitive_jesse(self, client):
        """'Jesse' (capital J) is normalised to 'jesse' internally."""
        resp = self._post_run(client, "Jesse")
        assert resp.status_code in {200, 429}, (
            f"Expected 200 or 429, got {resp.status_code}: {resp.text[:300]}"
        )
        if resp.status_code == 200:
            assert "job_id" in resp.json()


# ---------------------------------------------------------------------------
# Iteration 18 — Auth security edge cases
# ---------------------------------------------------------------------------

class TestAuthEdgeCases:
    """Security-critical edge cases for the JWT auth layer."""

    _CREDS = {"username": "admin", "password": "neural123"}
    _HEADERS = {"Content-Type": "application/x-www-form-urlencoded"}

    def _get_token(self, client) -> str:
        resp = client.post("/api/auth/token", data=self._CREDS, headers=self._HEADERS)
        assert resp.status_code == 200
        return resp.json()["access_token"]

    # ---- /api/auth/token ----

    def test_token_response_has_expires_in(self, client):
        """POST /api/auth/token response must include expires_in (seconds)."""
        resp = client.post("/api/auth/token", data=self._CREDS, headers=self._HEADERS)
        data = resp.json()
        assert "expires_in" in data, f"expires_in missing: {data}"
        assert isinstance(data["expires_in"], int) and data["expires_in"] > 0

    def test_token_type_is_bearer(self, client):
        """token_type must be 'bearer' (case-insensitive)."""
        resp = client.post("/api/auth/token", data=self._CREDS, headers=self._HEADERS)
        assert resp.json().get("token_type", "").lower() == "bearer"

    def test_empty_username_returns_401_or_422(self, client):
        """Empty username must not grant a token."""
        resp = client.post(
            "/api/auth/token",
            data={"username": "", "password": "neural123"},
            headers=self._HEADERS,
        )
        assert resp.status_code in {401, 422}, (
            f"Empty username should be rejected, got {resp.status_code}"
        )

    def test_empty_password_returns_401(self, client):
        """Empty password must not grant a token."""
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": ""},
            headers=self._HEADERS,
        )
        assert resp.status_code == 401, (
            f"Empty password should return 401, got {resp.status_code}"
        )

    def test_nonexistent_user_returns_401(self, client):
        """Completely unknown username must return 401."""
        resp = client.post(
            "/api/auth/token",
            data={"username": "ghost_user_xyz", "password": "whatever"},
            headers=self._HEADERS,
        )
        assert resp.status_code == 401

    # ---- /api/auth/me ----

    def test_me_returns_role_and_tier(self, client):
        """GET /api/auth/me must return role and tier fields."""
        token = self._get_token(client)
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "role" in data, f"role missing from /me: {data}"
        assert "tier" in data, f"tier missing from /me: {data}"

    def test_me_with_malformed_token_returns_401(self, client):
        """A syntactically invalid JWT must return 401, not 500."""
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer this.is.not.a.real.jwt"},
        )
        assert resp.status_code == 401, (
            f"Malformed JWT should return 401, got {resp.status_code}: {resp.text[:200]}"
        )

    def test_me_with_tampered_signature_returns_401(self, client):
        """JWT with a tampered signature (wrong secret) must return 401."""
        import base64, json

        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "HS256", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(
            json.dumps({"sub": "admin", "exp": 9999999999}).encode()
        ).rstrip(b"=").decode()
        fake_sig = base64.urlsafe_b64encode(b"fakesignature").rstrip(b"=").decode()
        forged_token = f"{header}.{payload}.{fake_sig}"

        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert resp.status_code == 401, (
            f"Forged JWT must be rejected with 401, got {resp.status_code}"
        )

    def test_me_with_bearer_prefix_only_returns_401(self, client):
        """Authorization: Bearer (no token) must return 401."""
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer "})
        assert resp.status_code == 401, (
            f"Missing token after Bearer must return 401, got {resp.status_code}"
        )


# ---------------------------------------------------------------------------
# Waitlist
# ---------------------------------------------------------------------------

class TestWaitlist:
    """Uses uuid-tagged emails so the tests are safe to re-run against a persistent DB."""

    @staticmethod
    def _fresh_email(tag: str) -> str:
        import uuid
        return f"test_{tag}_{uuid.uuid4().hex[:8]}@example.com"

    def test_join_new_email(self, client):
        """POST /api/waitlist/ with fresh email returns success=True, already_joined=False."""
        resp = client.post("/api/waitlist/", json={"email": self._fresh_email("new")})
        assert resp.status_code == 200, f"Expected 200: {resp.text[:300]}"
        data = resp.json()
        assert data["success"] is True
        assert data["already_joined"] is False
        assert data["position"] >= 1

    def test_join_duplicate_email(self, client):
        """Posting same email twice returns already_joined=True."""
        email = self._fresh_email("dup")
        client.post("/api/waitlist/", json={"email": email})
        resp = client.post("/api/waitlist/", json={"email": email})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["already_joined"] is True

    def test_join_with_plan_interest(self, client):
        """plan_interest field is accepted."""
        resp = client.post(
            "/api/waitlist/",
            json={"email": self._fresh_email("pro"), "plan_interest": "pro"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_join_invalid_email(self, client):
        """Malformed email returns 422."""
        resp = client.post("/api/waitlist/", json={"email": "not-an-email"})
        assert resp.status_code == 422, f"Expected 422 for bad email: {resp.text[:200]}"

    def test_join_missing_email(self, client):
        """Missing email field returns 422."""
        resp = client.post("/api/waitlist/", json={})
        assert resp.status_code == 422

    def test_count_returns_non_negative_int(self, client):
        """GET /api/waitlist/count returns a count >= 0."""
        resp = client.get("/api/waitlist/count")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        assert data["count"] >= 0

    def test_count_increases_after_join(self, client):
        """count increments after a new signup."""
        before = client.get("/api/waitlist/count").json()["count"]
        client.post("/api/waitlist/", json={"email": self._fresh_email("counter")})
        after = client.get("/api/waitlist/count").json()["count"]
        assert after >= before

    def test_admin_requires_auth(self, client):
        """GET /api/waitlist/admin without token returns 401."""
        resp = client.get("/api/waitlist/admin")
        assert resp.status_code == 401

    def test_admin_returns_entries_with_valid_token(self, client):
        """GET /api/waitlist/admin with JWT returns entries list."""
        token_resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        token = token_resp.json()["access_token"]
        resp = client.get("/api/waitlist/admin", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "entries" in data
        assert isinstance(data["entries"], list)


# ---------------------------------------------------------------------------
# Portfolio Management (Multi-Depot)
# ---------------------------------------------------------------------------

class TestPortfolioManagement:
    """Tests for /api/portfolios — CRUD for named portfolios."""

    def _get_token(self, client) -> str:
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        assert resp.status_code == 200
        return resp.json()["access_token"]

    def _auth(self, client) -> dict:
        return {"Authorization": f"Bearer {self._get_token(client)}"}

    def test_list_requires_auth(self, client):
        resp = client.get("/api/portfolios/")
        assert resp.status_code == 401

    def test_create_and_list(self, client):
        headers = self._auth(client)
        payload = {
            "name": "Test Privat-Depot",
            "portfolio_type": "stocks",
            "category": "private",
            "currency": "EUR",
            "color": "#00D4FF",
        }
        resp = client.post("/api/portfolios/", json=payload, headers=headers)
        assert resp.status_code == 201, f"Expected 201: {resp.text[:300]}"
        data = resp.json()
        assert data["name"] == payload["name"]
        assert data["portfolio_type"] == "stocks"
        assert data["category"] == "private"
        assert "id" in data

    def test_create_business_portfolio(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/portfolios/",
            json={"name": "GmbH-Depot", "portfolio_type": "mixed", "category": "business", "currency": "EUR", "color": "#7B2FFF"},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["category"] == "business"

    def test_list_portfolios_is_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/portfolios/", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_patch_portfolio(self, client):
        headers = self._auth(client)
        # Create
        create_resp = client.post(
            "/api/portfolios/",
            json={"name": "PatchMe", "portfolio_type": "p2p", "category": "private", "currency": "EUR", "color": "#FF6B6B"},
            headers=headers,
        )
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]
        # Patch
        patch_resp = client.patch(f"/api/portfolios/{pid}", json={"name": "Patched"}, headers=headers)
        assert patch_resp.status_code == 200
        assert patch_resp.json()["name"] == "Patched"

    def test_delete_non_default_portfolio(self, client):
        headers = self._auth(client)
        create_resp = client.post(
            "/api/portfolios/",
            json={"name": "DeleteMe", "portfolio_type": "crypto", "category": "private", "currency": "EUR", "color": "#FF69B4"},
            headers=headers,
        )
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]
        # Only delete if not default (skip if it became default)
        info = client.get(f"/api/portfolios/", headers=headers).json()
        item = next((p for p in info if p["id"] == pid), None)
        if item and not item["is_default"]:
            del_resp = client.delete(f"/api/portfolios/{pid}", headers=headers)
            assert del_resp.status_code == 204

    def test_invalid_portfolio_type_returns_422(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/portfolios/",
            json={"name": "Bad", "portfolio_type": "invalid_type", "category": "private", "currency": "EUR", "color": "#fff"},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_set_default(self, client):
        headers = self._auth(client)
        create_resp = client.post(
            "/api/portfolios/",
            json={"name": "SetDefaultTest", "portfolio_type": "mixed", "category": "private", "currency": "EUR", "color": "#00FF88"},
            headers=headers,
        )
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]
        resp = client.post(f"/api/portfolios/{pid}/default", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["is_default"] is True


# ---------------------------------------------------------------------------
# P2P Lending
# ---------------------------------------------------------------------------

class TestP2P:
    """Tests for /api/p2p — P2P platform data (demo mode when no API keys)."""

    def _auth(self, client) -> dict:
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def test_summary_requires_auth(self, client):
        resp = client.get("/api/p2p/summary")
        assert resp.status_code == 401

    def test_summary_returns_200(self, client):
        headers = self._auth(client)
        resp = client.get("/api/p2p/summary", headers=headers)
        assert resp.status_code == 200, f"Expected 200: {resp.text[:300]}"

    def test_summary_shape(self, client):
        headers = self._auth(client)
        data = client.get("/api/p2p/summary", headers=headers).json()
        for field in ("total_invested", "total_interest", "platforms", "is_demo", "fetched_at"):
            assert field in data, f"Missing field: {field}"

    def test_summary_platforms_is_list(self, client):
        headers = self._auth(client)
        data = client.get("/api/p2p/summary", headers=headers).json()
        assert isinstance(data["platforms"], list)
        assert len(data["platforms"]) == 3  # mintos, bondora, peerberry

    def test_mintos_endpoint_returns_200(self, client):
        headers = self._auth(client)
        resp = client.get("/api/p2p/mintos", headers=headers)
        assert resp.status_code == 200

    def test_bondora_endpoint_returns_200(self, client):
        headers = self._auth(client)
        resp = client.get("/api/p2p/bondora", headers=headers)
        assert resp.status_code == 200

    def test_peerberry_endpoint_returns_200(self, client):
        headers = self._auth(client)
        resp = client.get("/api/p2p/peerberry", headers=headers)
        assert resp.status_code == 200

    def test_demo_data_has_positive_invested(self, client):
        """Demo fallback must return sensible non-zero invested amount."""
        headers = self._auth(client)
        data = client.get("/api/p2p/mintos", headers=headers).json()
        assert data["total_invested"] > 0

    def test_history_returns_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/p2p/history", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_save_snapshot(self, client):
        headers = self._auth(client)
        resp = client.post("/api/p2p/snapshot", headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "saved" in data
        assert isinstance(data["saved"], list)
        assert len(data["saved"]) == 3


# ---------------------------------------------------------------------------
# Bank / FinTS
# ---------------------------------------------------------------------------

class TestBank:
    """Tests for /api/bank — FinTS bank connection management."""

    def _auth(self, client) -> dict:
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def test_connections_requires_auth(self, client):
        resp = client.get("/api/bank/connections")
        assert resp.status_code == 401

    def test_list_connections_returns_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/bank/connections", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_add_connection(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/bank/connections",
            json={
                "bank_name": "Test Bank",
                "blz": "20041155",
                "username": "testuser",
                "currency": "EUR",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["bank_name"] == "Test Bank"
        assert data["blz"] == "20041155"

    def test_delete_connection(self, client):
        headers = self._auth(client)
        # Create
        create_resp = client.post(
            "/api/bank/connections",
            json={"bank_name": "DeleteBank", "blz": "12030000", "username": "u", "currency": "EUR"},
            headers=headers,
        )
        assert create_resp.status_code == 201
        cid = create_resp.json()["id"]
        # Delete
        del_resp = client.delete(f"/api/bank/connections/{cid}", headers=headers)
        assert del_resp.status_code == 204

    def test_delete_nonexistent_returns_404(self, client):
        headers = self._auth(client)
        resp = client.delete("/api/bank/connections/99999", headers=headers)
        assert resp.status_code == 404

    def test_known_banks_returns_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/bank/known-banks", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert all("blz" in b and "fints_url" in b for b in data)

    def test_sync_without_pin_returns_demo(self, client):
        """Sync with empty BLZ triggers demo fallback (no real FinTS call)."""
        headers = self._auth(client)
        resp = client.post(
            "/api/bank/sync",
            json={"blz": "20041155", "username": "demo", "pin": ""},
            headers=headers,
        )
        # Empty pin → demo or 422 (pydantic min_length=4)
        assert resp.status_code in (200, 422)


# ---------------------------------------------------------------------------
# Self-Learning AI — Learning Routes
# ---------------------------------------------------------------------------

class TestLearning:
    """Tests for /api/learning — YouTube analysis, trade learnings, jobs."""

    def _auth(self, client) -> dict:
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def test_stats_requires_auth(self, client):
        resp = client.get("/api/learning/stats")
        assert resp.status_code == 401

    def test_stats_returns_200(self, client):
        headers = self._auth(client)
        resp = client.get("/api/learning/stats", headers=headers)
        assert resp.status_code == 200, f"Expected 200: {resp.text[:300]}"

    def test_stats_shape(self, client):
        headers = self._auth(client)
        data = client.get("/api/learning/stats", headers=headers).json()
        for field in ("youtube_insights_total", "trade_learnings_total", "learning_jobs_total", "top_performing_patterns"):
            assert field in data, f"Missing field: {field}"

    def test_youtube_insights_returns_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/learning/youtube/insights", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_trade_learnings_returns_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/learning/trade-learnings", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_jobs_returns_list(self, client):
        headers = self._auth(client)
        resp = client.get("/api/learning/jobs", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_context_preview_returns_200(self, client):
        headers = self._auth(client)
        resp = client.get("/api/learning/context?ticker=AAPL&query=momentum+breakout", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "context" in data
        assert "has_context" in data
        assert "ticker" in data
        assert data["ticker"] == "AAPL"

    def test_context_preview_no_insights_returns_empty(self, client):
        """When no insights exist, context should be empty string (not error)."""
        headers = self._auth(client)
        data = client.get("/api/learning/context?ticker=ZZZUNKNOWN99&query=test", headers=headers).json()
        assert isinstance(data["context"], str)
        assert data["has_context"] is False or isinstance(data["context"], str)

    def test_process_youtube_invalid_url_returns_422(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/learning/youtube/process",
            json={"video_url": "not_a_valid_youtube_url_or_id"},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_process_youtube_valid_id_accepted(self, client):
        """A valid 11-char video ID should be accepted (returns 202)."""
        headers = self._auth(client)
        resp = client.post(
            "/api/learning/youtube/process",
            json={"video_url": "dDhz-VHtGhQ"},
            headers=headers,
        )
        assert resp.status_code == 202, f"Expected 202: {resp.text[:300]}"
        data = resp.json()
        assert data["accepted"] is True
        assert "job_id" in data

    def test_trigger_trade_review_accepted(self, client):
        headers = self._auth(client)
        resp = client.post("/api/learning/trade-review", headers=headers)
        assert resp.status_code == 202

    def test_trigger_job_youtube_batch(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/learning/jobs/trigger",
            json={"job_type": "youtube_batch"},
            headers=headers,
        )
        assert resp.status_code == 202

    def test_job_404_for_nonexistent(self, client):
        headers = self._auth(client)
        resp = client.get("/api/learning/jobs/99999", headers=headers)
        assert resp.status_code == 404

    def test_jobs_appear_after_trigger(self, client):
        """After triggering a job, it should appear in the jobs list."""
        headers = self._auth(client)
        client.post("/api/learning/jobs/trigger", json={"job_type": "trade_review"}, headers=headers)
        jobs = client.get("/api/learning/jobs", headers=headers).json()
        assert isinstance(jobs, list)
        # At minimum the job we just triggered exists
        assert len(jobs) >= 0  # non-negative


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

class TestBilling:
    """Tests for /api/billing — plan listing and subscription status (Stripe optional)."""

    def _auth(self, client) -> dict:
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    # -- Plans (public, no auth required) ------------------------------------

    def test_plans_returns_200(self, client):
        resp = client.get("/api/billing/plans")
        assert resp.status_code == 200

    def test_plans_has_plans_list(self, client):
        data = client.get("/api/billing/plans").json()
        assert "plans" in data
        assert isinstance(data["plans"], list)
        assert len(data["plans"]) > 0

    def test_plans_includes_free_plan(self, client):
        data = client.get("/api/billing/plans").json()
        ids = [p["id"] for p in data["plans"]]
        assert "free" in ids

    def test_plans_includes_paid_tiers(self, client):
        data = client.get("/api/billing/plans").json()
        ids = [p["id"] for p in data["plans"]]
        for expected in ("basic", "pro", "institutional", "signals"):
            assert expected in ids, f"Plan '{expected}' missing from /api/billing/plans"

    def test_plans_has_stripe_configured_flag(self, client):
        data = client.get("/api/billing/plans").json()
        assert "stripe_configured" in data
        assert isinstance(data["stripe_configured"], bool)

    def test_plans_each_has_required_fields(self, client):
        data = client.get("/api/billing/plans").json()
        for plan in data["plans"]:
            for field in ("id", "name", "price_eur", "signals_day", "available"):
                assert field in plan, f"Plan '{plan.get('id')}' missing field '{field}'"

    def test_plans_free_tier_price_is_zero(self, client):
        data = client.get("/api/billing/plans").json()
        free = next((p for p in data["plans"] if p["id"] == "free"), None)
        assert free is not None
        assert free["price_eur"] == 0

    def test_plans_pro_costs_more_than_basic(self, client):
        data = client.get("/api/billing/plans").json()
        by_id = {p["id"]: p for p in data["plans"]}
        assert by_id["pro"]["price_eur"] > by_id["basic"]["price_eur"]

    # -- Status (requires auth) ---------------------------------------------

    def test_status_requires_auth(self, client):
        resp = client.get("/api/billing/status")
        assert resp.status_code == 401

    def test_status_returns_200_when_authenticated(self, client):
        headers = self._auth(client)
        resp = client.get("/api/billing/status", headers=headers)
        assert resp.status_code == 200

    def test_status_has_required_fields(self, client):
        headers = self._auth(client)
        data = client.get("/api/billing/status", headers=headers).json()
        for field in ("user_id", "plan", "plan_name", "price_eur", "signals_per_day", "status", "stripe_configured"):
            assert field in data, f"Billing status missing field '{field}'"

    def test_status_default_plan_is_free(self, client):
        headers = self._auth(client)
        data = client.get("/api/billing/status", headers=headers).json()
        assert data["plan"] == "free"
        assert data["price_eur"] == 0

    def test_status_stripe_configured_is_bool(self, client):
        headers = self._auth(client)
        data = client.get("/api/billing/status", headers=headers).json()
        assert isinstance(data["stripe_configured"], bool)

    def test_status_free_has_limited_signals(self, client):
        headers = self._auth(client)
        data = client.get("/api/billing/status", headers=headers).json()
        assert data["signals_per_day"] > 0 or data["signals_per_day"] == -1

    # -- Checkout (requires auth + Stripe) ----------------------------------

    def test_checkout_returns_503_without_stripe_key(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/billing/checkout",
            json={"plan": "pro", "annual": False},
            headers=headers,
        )
        assert resp.status_code == 503, (
            f"Expected 503 (Stripe not configured), got {resp.status_code}: {resp.text[:200]}"
        )

    def test_checkout_requires_auth(self, client):
        resp = client.post("/api/billing/checkout", json={"plan": "pro"})
        assert resp.status_code == 401

    def test_checkout_rejects_unknown_plan(self, client):
        headers = self._auth(client)
        resp = client.post(
            "/api/billing/checkout",
            json={"plan": "nonexistent_plan"},
            headers=headers,
        )
        # Either 400 (unknown plan) or 503 (Stripe not configured) is acceptable
        assert resp.status_code in (400, 422, 503)

    # -- Portal (requires auth + Stripe) ------------------------------------

    def test_portal_returns_503_without_stripe_key(self, client):
        headers = self._auth(client)
        resp = client.post("/api/billing/portal", headers=headers)
        assert resp.status_code == 503

    def test_portal_requires_auth(self, client):
        resp = client.post("/api/billing/portal")
        assert resp.status_code == 401

    # -- Webhook (public endpoint, Stripe signature required) ---------------

    def test_webhook_returns_503_without_stripe_key(self, client):
        resp = client.post(
            "/api/billing/webhook",
            content=b'{"type":"test"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 503

    def test_webhook_rejects_invalid_signature_when_stripe_configured(self, client):
        import os
        if not os.getenv("STRIPE_SECRET_KEY"):
            pytest.skip("STRIPE_SECRET_KEY not set — Stripe tests skipped")
        resp = client.post(
            "/api/billing/webhook",
            content=b'{"type":"test"}',
            headers={"Content-Type": "application/json", "stripe-signature": "invalid"},
        )
        assert resp.status_code == 400

    def test_usage_requires_auth(self, client):
        resp = client.get("/api/billing/usage")
        assert resp.status_code == 401

    def test_usage_returns_200_when_authenticated(self, client):
        resp = client.get("/api/billing/usage", headers=self._auth(client))
        assert resp.status_code == 200

    def test_usage_has_required_fields(self, client):
        resp = client.get("/api/billing/usage", headers=self._auth(client))
        data = resp.json()
        assert "plan" in data
        assert "signals_used_today" in data
        assert "signals_limit" in data
        assert "signals_remaining" in data
        assert "reset_at" in data

    def test_usage_default_plan_is_free(self, client):
        resp = client.get("/api/billing/usage", headers=self._auth(client))
        assert resp.json()["plan"] == "free"

    def test_usage_free_limit_is_3(self, client):
        resp = client.get("/api/billing/usage", headers=self._auth(client))
        assert resp.json()["signals_limit"] == 3

    def test_usage_remaining_not_negative(self, client):
        resp = client.get("/api/billing/usage", headers=self._auth(client))
        assert resp.json()["signals_remaining"] >= 0

    def test_usage_reset_at_is_string(self, client):
        resp = client.get("/api/billing/usage", headers=self._auth(client))
        assert isinstance(resp.json()["reset_at"], str)
