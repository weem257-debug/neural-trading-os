"""
FinRobot Fundamental Analysis Client
--------------------------------------
Provides structured fundamental data for a given ticker using yfinance
(free, no API key required).  Designed as a lightweight alternative /
complement to the full FinRobot repo.

Data pulled:
  - Valuation  : P/E, forward P/E, PEG, EPS (TTM), Market Cap
  - Profitability: Revenue (TTM), Gross Margin, Operating Margin, Net Margin
  - Growth     : Revenue YoY, EPS YoY
  - Price range: 52-week high/low, current price
  - Balance    : Debt/Equity, Current Ratio, Quick Ratio
  - Dividends  : Dividend Yield, Payout Ratio

All monetary values are in USD millions unless noted.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class FundamentalsReport:
    ticker: str
    generated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    # Valuation
    market_cap_m: Optional[float] = None           # USD millions
    pe_ratio: Optional[float] = None               # trailing 12m
    forward_pe: Optional[float] = None
    peg_ratio: Optional[float] = None
    eps_ttm: Optional[float] = None                # USD per share
    price_to_book: Optional[float] = None
    price_to_sales: Optional[float] = None

    # Profitability (TTM)
    revenue_ttm_m: Optional[float] = None          # USD millions
    gross_margin: Optional[float] = None           # 0-1
    operating_margin: Optional[float] = None       # 0-1
    net_margin: Optional[float] = None             # 0-1
    return_on_equity: Optional[float] = None       # 0-1
    return_on_assets: Optional[float] = None       # 0-1

    # Growth (YoY, latest annual)
    revenue_growth_yoy: Optional[float] = None     # 0-1  (e.g. 0.12 = +12%)
    earnings_growth_yoy: Optional[float] = None

    # Price range
    current_price: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None

    # Balance sheet
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None

    # Dividends
    dividend_yield: Optional[float] = None         # 0-1
    payout_ratio: Optional[float] = None           # 0-1

    # Income statement (from .financials — last 2 annual periods)
    income_statement: list[dict] = field(default_factory=list)

    # Meta
    company_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    employees: Optional[int] = None

    # Error handling
    error: bool = False
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        """Serialise to JSON-friendly dict (None values included)."""
        return {
            "ticker": self.ticker,
            "generated_at": self.generated_at.isoformat(),
            "company_name": self.company_name,
            "sector": self.sector,
            "industry": self.industry,
            "employees": self.employees,
            "valuation": {
                "market_cap_m": self.market_cap_m,
                "pe_ratio": self.pe_ratio,
                "forward_pe": self.forward_pe,
                "peg_ratio": self.peg_ratio,
                "eps_ttm": self.eps_ttm,
                "price_to_book": self.price_to_book,
                "price_to_sales": self.price_to_sales,
            },
            "profitability": {
                "revenue_ttm_m": self.revenue_ttm_m,
                "gross_margin": self.gross_margin,
                "operating_margin": self.operating_margin,
                "net_margin": self.net_margin,
                "return_on_equity": self.return_on_equity,
                "return_on_assets": self.return_on_assets,
            },
            "growth": {
                "revenue_growth_yoy": self.revenue_growth_yoy,
                "earnings_growth_yoy": self.earnings_growth_yoy,
            },
            "price_range": {
                "current_price": self.current_price,
                "week_52_high": self.week_52_high,
                "week_52_low": self.week_52_low,
            },
            "balance_sheet": {
                "debt_to_equity": self.debt_to_equity,
                "current_ratio": self.current_ratio,
                "quick_ratio": self.quick_ratio,
            },
            "dividends": {
                "dividend_yield": self.dividend_yield,
                "payout_ratio": self.payout_ratio,
            },
            "income_statement": self.income_statement,
            "error": self.error,
            "error_message": self.error_message,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(value, divisor: float = 1.0) -> Optional[float]:
    """Convert a potentially missing/None value to float, optionally scaled."""
    try:
        if value is None:
            return None
        return round(float(value) / divisor, 4)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _parse_income_statement(ticker_obj) -> list[dict]:
    """Extract last 2 annual periods from yfinance .financials DataFrame."""
    try:
        fin = ticker_obj.financials  # columns = fiscal year dates, rows = line items
        if fin is None or fin.empty:
            return []

        rows_of_interest = [
            "Total Revenue",
            "Gross Profit",
            "Operating Income",
            "Net Income",
            "EBITDA",
        ]

        records = []
        for col in fin.columns[:2]:          # latest 2 years
            record: dict = {"period": str(col)[:10]}
            for row in rows_of_interest:
                if row in fin.index:
                    val = fin.loc[row, col]
                    record[row.lower().replace(" ", "_")] = _safe_float(val, 1_000_000)
            records.append(record)
        return records
    except Exception as exc:
        logger.debug("Income statement parse error: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_fundamentals(ticker: str) -> FundamentalsReport:
    """
    Fetch fundamental data for *ticker* using yfinance.

    Returns a FundamentalsReport dataclass.  On any error the report has
    error=True and error_message set — it never raises.

    Parameters
    ----------
    ticker : str
        Stock or ETF ticker symbol (e.g. "AAPL", "MSFT").

    Returns
    -------
    FundamentalsReport
    """
    ticker_upper = ticker.upper().strip()
    report = FundamentalsReport(ticker=ticker_upper)

    try:
        import yfinance as yf  # lazy import — not needed at server start
    except ImportError:
        report.error = True
        report.error_message = (
            "yfinance not installed. Run: pip install yfinance"
        )
        logger.error(report.error_message)
        return report

    try:
        t = yf.Ticker(ticker_upper)
        info: dict = t.info or {}

        if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
            # yfinance returns an empty/minimal dict for unknown tickers
            report.error = True
            report.error_message = f"No data found for ticker '{ticker_upper}'. Check the symbol."
            logger.warning(report.error_message)
            return report

        # -- Company meta --
        report.company_name = info.get("longName") or info.get("shortName")
        report.sector = info.get("sector")
        report.industry = info.get("industry")
        report.employees = info.get("fullTimeEmployees")

        # -- Valuation --
        market_cap_raw = info.get("marketCap")
        report.market_cap_m = _safe_float(market_cap_raw, 1_000_000)
        report.pe_ratio = _safe_float(info.get("trailingPE"))
        report.forward_pe = _safe_float(info.get("forwardPE"))
        report.peg_ratio = _safe_float(info.get("pegRatio"))
        report.eps_ttm = _safe_float(info.get("trailingEps"))
        report.price_to_book = _safe_float(info.get("priceToBook"))
        report.price_to_sales = _safe_float(info.get("priceToSalesTrailing12Months"))

        # -- Profitability --
        revenue_raw = info.get("totalRevenue")
        report.revenue_ttm_m = _safe_float(revenue_raw, 1_000_000)
        report.gross_margin = _safe_float(info.get("grossMargins"))
        report.operating_margin = _safe_float(info.get("operatingMargins"))
        report.net_margin = _safe_float(info.get("profitMargins"))
        report.return_on_equity = _safe_float(info.get("returnOnEquity"))
        report.return_on_assets = _safe_float(info.get("returnOnAssets"))

        # -- Growth --
        report.revenue_growth_yoy = _safe_float(info.get("revenueGrowth"))
        report.earnings_growth_yoy = _safe_float(info.get("earningsGrowth"))

        # -- Price range --
        report.current_price = _safe_float(
            info.get("currentPrice") or info.get("regularMarketPrice")
        )
        report.week_52_high = _safe_float(info.get("fiftyTwoWeekHigh"))
        report.week_52_low = _safe_float(info.get("fiftyTwoWeekLow"))

        # -- Balance sheet --
        report.debt_to_equity = _safe_float(info.get("debtToEquity"))
        report.current_ratio = _safe_float(info.get("currentRatio"))
        report.quick_ratio = _safe_float(info.get("quickRatio"))

        # -- Dividends --
        report.dividend_yield = _safe_float(info.get("dividendYield"))
        report.payout_ratio = _safe_float(info.get("payoutRatio"))

        # -- Income Statement (last 2 annual periods) --
        report.income_statement = _parse_income_statement(t)

        logger.info(
            "Fundamentals fetched for %s: Market Cap $%.0fM, P/E %.1f",
            ticker_upper,
            report.market_cap_m or 0,
            report.pe_ratio or 0,
        )

    except Exception as exc:
        report.error = True
        report.error_message = f"Unexpected error fetching fundamentals: {exc}"
        logger.error("FinRobot fundamentals error for %s: %s", ticker_upper, exc)

    return report


async def get_fundamentals_async(ticker: str) -> FundamentalsReport:
    """
    Async wrapper around get_fundamentals — runs in a thread pool to avoid
    blocking the FastAPI event loop during yfinance HTTP calls.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_fundamentals, ticker)
