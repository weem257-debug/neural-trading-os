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
import logging
from datetime import datetime, date, UTC
from typing import Optional

from app.core.config import settings
from app.models.schemas import TradingSignal, SignalDirection

logger = logging.getLogger(__name__)


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
        # Repo not available — return a neutral placeholder (with learning context logged)
        if learning_context:
            logger.debug("RAG context for %s (repo unavailable): %s", ticker, learning_context[:200])
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
        reasoning=f"Signal unavailable — reason: {reason}",
        source="TradingAgents[unavailable]",
        generated_at=datetime.now(UTC),
    )
