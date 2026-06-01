"""
TradingAgents Service Client
----------------------------
Wraps the TauricResearch/TradingAgents repo to generate multi-agent
LLM trading signals.  The repo is imported as a Python package from
its path on disk (sys.path injection) so we avoid duplicating code.

Signal pipeline:
  ticker + date → TradingAgentsOrchestrator
      ├── Fundamentals Agent
      ├── Sentiment Agent
      ├── Technical Analyst
      ├── News Agent
      └── Risk Manager
  → final recommendation → TradingSignal (dashboard schema)
"""
import sys
import os
import uuid
import json
import asyncio
import logging
from datetime import datetime, date, UTC
from typing import Optional

from app.core.config import settings
from app.models.schemas import TradingSignal, SignalDirection

logger = logging.getLogger(__name__)


async def _claude_generate_signal(
    ticker: str,
    analysis_date: str,
    fast_mode: bool = False,
    learning_context: str = "",
) -> TradingSignal:
    """
    Native Claude signal generator — used when TradingAgents repo is unavailable.
    Fetches live price + technical data via yfinance, enriches with news sentiment,
    then asks Claude for a structured trading recommendation.
    """
    import anthropic

    # ── 1. Fetch price history (last 30 trading days) ──────────────────────────
    price_summary = "No price data available."
    try:
        import yfinance as yf
        from datetime import timedelta

        end = datetime.strptime(analysis_date, "%Y-%m-%d")
        start = (end - timedelta(days=45)).strftime("%Y-%m-%d")
        hist = await asyncio.to_thread(
            lambda: yf.Ticker(ticker).history(start=start, end=analysis_date, auto_adjust=True)
        )
        if not hist.empty:
            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else latest
            chg = ((latest["Close"] - prev["Close"]) / prev["Close"]) * 100
            hi52 = hist["High"].max()
            lo52 = hist["Low"].min()
            sma20 = hist["Close"].tail(20).mean()
            sma50 = hist["Close"].tail(50).mean() if len(hist) >= 50 else hist["Close"].mean()
            price_summary = (
                f"Current price: ${latest['Close']:.2f} ({chg:+.2f}% today)\n"
                f"Volume: {int(latest['Volume']):,}\n"
                f"30-day range: ${hist['Low'].tail(30).min():.2f} – ${hist['High'].tail(30).max():.2f}\n"
                f"52-week range: ${lo52:.2f} – ${hi52:.2f}\n"
                f"20-day SMA: ${sma20:.2f} | 50-day SMA: ${sma50:.2f}\n"
                f"Price vs SMA20: {'above' if latest['Close'] > sma20 else 'below'}"
            )
    except Exception as e:
        logger.debug("yfinance fetch failed for %s: %s", ticker, e)

    # ── 2. Fetch news sentiment ─────────────────────────────────────────────────
    sentiment_summary = ""
    try:
        from app.api.routes.sentiment import _cached_sentiment
        sentiment = await _cached_sentiment(ticker.upper())
        sentiment_summary = (
            f"News sentiment: {sentiment.overall_sentiment} "
            f"(score={sentiment.overall_score:.2f}, "
            f"{sentiment.news_count} articles, "
            f"{sentiment.positive_count}+ / {sentiment.negative_count}-)"
        )
    except Exception as e:
        logger.debug("Sentiment fetch failed for %s: %s", ticker, e)

    # ── 3. Call Claude ──────────────────────────────────────────────────────────
    model = settings.ANTHROPIC_MODEL_FAST if fast_mode else settings.ANTHROPIC_MODEL_ANALYSIS
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    system_prompt = (
        "You are an expert quantitative trading analyst. "
        "Analyse the provided market data and return a JSON trading signal. "
        "JSON schema (strict, no extra keys):\n"
        '{"direction": "BUY|SELL|HOLD|STRONG_BUY|STRONG_SELL", '
        '"confidence": 0.0-1.0, '
        '"price_target": float_or_null, '
        '"stop_loss": float_or_null, '
        '"time_horizon": "1d|1w|1m|3m|6m|null", '
        '"reasoning": "2-4 sentence rationale"}'
    )
    if learning_context:
        system_prompt += f"\n\n## Historical trading patterns:\n{learning_context}"

    user_msg = (
        f"Generate a trading signal for {ticker.upper()} as of {analysis_date}.\n\n"
        f"PRICE DATA:\n{price_summary}\n\n"
        f"{('SENTIMENT:\n' + sentiment_summary) if sentiment_summary else ''}\n\n"
        "Return ONLY valid JSON, no markdown, no explanation outside the JSON."
    )

    try:
        resp = await client.messages.create(
            model=model,
            max_tokens=400,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)

        direction_map = {
            "STRONG_BUY": SignalDirection.STRONG_BUY,
            "BUY": SignalDirection.BUY,
            "HOLD": SignalDirection.HOLD,
            "SELL": SignalDirection.SELL,
            "STRONG_SELL": SignalDirection.STRONG_SELL,
        }
        direction = direction_map.get(data.get("direction", "HOLD").upper(), SignalDirection.HOLD)

        return TradingSignal(
            id=str(uuid.uuid4()),
            ticker=ticker.upper(),
            direction=direction,
            confidence=float(data.get("confidence", 0.5)),
            price_target=data.get("price_target"),
            stop_loss=data.get("stop_loss"),
            time_horizon=data.get("time_horizon"),
            reasoning=str(data.get("reasoning", ""))[:1000],
            source=f"Claude[{model}]",
            generated_at=datetime.now(UTC),
        )
    except Exception as e:
        logger.error("Claude signal generation failed for %s: %s", ticker, e)
        return _placeholder_signal(ticker, analysis_date, f"claude_error:{e}")


def _ensure_repo_on_path() -> bool:
    """Add TradingAgents repo to sys.path if not already there."""
    repo_path = os.path.abspath(settings.TRADINGAGENTS_PATH)
    if not os.path.isdir(repo_path):
        logger.warning(
            "TradingAgents repo not found at %s — signal generation disabled",
            repo_path,
        )
        return False
    if repo_path not in sys.path:
        sys.path.insert(0, repo_path)
    return True


def _parse_direction(recommendation: str) -> SignalDirection:
    """Map TradingAgents text recommendation to SignalDirection enum."""
    rec = recommendation.upper().strip()
    mapping = {
        "STRONG BUY": SignalDirection.STRONG_BUY,
        "BUY": SignalDirection.BUY,
        "HOLD": SignalDirection.HOLD,
        "SELL": SignalDirection.SELL,
        "STRONG SELL": SignalDirection.STRONG_SELL,
    }
    for key, val in mapping.items():
        if key in rec:
            return val
    return SignalDirection.HOLD


async def generate_signal(
    ticker: str,
    analysis_date: Optional[str] = None,
    fast_mode: bool = False,
) -> TradingSignal:
    """
    Run TradingAgents multi-agent pipeline for a given ticker.

    Parameters
    ----------
    ticker       : Stock/crypto symbol, e.g. "AAPL", "BTC"
    analysis_date: ISO date string YYYY-MM-DD (defaults to today)
    fast_mode    : If True, use the fast Haiku model instead of Sonnet

    Returns
    -------
    TradingSignal  — unified dashboard signal schema
    """
    if analysis_date is None:
        analysis_date = date.today().isoformat()

    model = (
        settings.ANTHROPIC_MODEL_FAST if fast_mode
        else settings.ANTHROPIC_MODEL_ANALYSIS
    )

    # Retrieve relevant learning context (RAG injection) — zero-cost if no insights yet
    learning_context = ""
    try:
        from app.services.learning.rag_retriever import get_relevant_context
        learning_context = await get_relevant_context(
            query=f"{ticker} trading signal {analysis_date}",
            ticker=ticker,
            top_n=5,
        )
    except Exception as rag_err:
        logger.debug("RAG context retrieval skipped: %s", rag_err)

    if not _ensure_repo_on_path():
        # TradingAgents repo unavailable — fall back to native Claude analysis
        if settings.ANTHROPIC_API_KEY and not settings.ANTHROPIC_API_KEY.startswith("your-"):
            logger.info("TradingAgents unavailable, using Claude fallback for %s", ticker)
            return await _claude_generate_signal(ticker, analysis_date, fast_mode, learning_context)
        return _placeholder_signal(ticker, analysis_date, "repo_unavailable")

    try:
        # Dynamic import after path injection
        from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore
        from tradingagents.default_config import DEFAULT_CONFIG  # type: ignore

        config = {**DEFAULT_CONFIG}
        config["llm_provider"] = "anthropic"
        config["backend_url"] = "https://api.anthropic.com"
        config["deep_think_llm"] = model
        config["quick_think_llm"] = settings.ANTHROPIC_MODEL_FAST
        config["max_debate_rounds"] = 1
        config["online_tools"] = True

        # Inject learning context into the analysis pipeline if available
        if learning_context:
            config["system_prompt_prefix"] = (
                "## TRADING KNOWLEDGE BASE (from past performance + YouTube analysis)\n\n"
                f"{learning_context}\n\n"
                "---\nUse the above knowledge to improve signal quality. "
                "Consider historical win rates and patterns when making your recommendation.\n\n"
            )

        ta = TradingAgentsGraph(debug=False, config=config)

        # Run the full multi-agent analysis
        state, decision = ta.propagate(ticker, analysis_date)

        agents_consensus = {}
        for agent_name in ["fundamentals", "sentiment", "technicals", "news", "risk"]:
            if agent_name in state:
                agents_consensus[agent_name] = str(state[agent_name])[:200]

        return TradingSignal(
            id=str(uuid.uuid4()),
            ticker=ticker.upper(),
            direction=_parse_direction(decision),
            confidence=_extract_confidence(state),
            reasoning=str(decision)[:1000],
            source="TradingAgents",
            generated_at=datetime.now(UTC),
            agents_consensus=agents_consensus,
        )

    except ImportError as e:
        logger.error("TradingAgents import failed: %s", e)
        return _placeholder_signal(ticker, analysis_date, "import_error")
    except Exception as e:
        logger.error("TradingAgents pipeline error for %s: %s", ticker, e)
        return _placeholder_signal(ticker, analysis_date, str(e))


def _extract_confidence(state: dict) -> float:
    """
    Attempt to extract a consensus confidence score from agent state.
    Falls back to 0.5 if not available.
    """
    try:
        # TradingAgents stores risk metrics in state["risk_report"]
        risk = state.get("risk_report", {})
        if isinstance(risk, dict) and "confidence" in risk:
            return float(risk["confidence"])
    except Exception:
        pass
    return 0.5


def _placeholder_signal(ticker: str, analysis_date: str, reason: str) -> TradingSignal:
    """Return a neutral HOLD signal when the real pipeline is unavailable."""
    return TradingSignal(
        id=str(uuid.uuid4()),
        ticker=ticker.upper(),
        direction=SignalDirection.HOLD,
        confidence=0.0,
        reasoning=f"Signal nicht verfügbar — Ursache: {reason}",
        source="TradingAgents[unavailable]",
        generated_at=datetime.now(UTC),
    )
