"""Shared ticker watchlists used by background jobs and admin trigger endpoints."""

SIGNAL_WATCHLIST = [
    # US Tech (core)
    "AAPL", "NVDA", "MSFT", "TSLA", "META", "AMD",
    # US Tech (extended)
    "GOOGL", "AMZN",
    # Crypto (high relevance in DE market)
    "BTC-USD", "ETH-USD",
    # ETFs / Indices
    "SPY", "QQQ",
]
