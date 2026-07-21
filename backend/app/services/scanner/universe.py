"""
Scan universe for the 24/7 market scanner (ADR 0003) — Stage 1 (prefilter) input.

``SCANNER_UNIVERSE`` is a broad, diversified ~500-symbol list: US large/mid-cap
equities across all 11 GICS sectors, the major broad-market ETFs, and the two
liquid crypto pairs. Deduplicated and order-preserving.

Equities are only scanned during the approximate NYSE core session; crypto
trades 24/7 and is always in scope.
"""
from datetime import datetime

_TECHNOLOGY = (
    "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "ADBE", "CSCO", "ACN", "AMD",
    "INTC", "IBM", "TXN", "QCOM", "INTU", "NOW", "AMAT", "MU", "ADI", "LRCX",
    "KLAC", "SNPS", "CDNS", "PANW", "FTNT", "MRVL", "ANET", "ON", "MCHP", "NXPI",
    "WDAY", "TEAM", "DDOG", "ZS", "CRWD", "PLTR", "SNOW", "HPQ", "HPE", "DELL",
    "JNPR", "GLW", "TER", "KEYS", "TDY", "TYL", "ANSS", "ROP", "ZBRA", "SWKS",
    "QRVO", "ENPH", "FSLR", "GEN", "AKAM", "EPAM", "FFIV", "NTAP", "STX", "WDC",
    "CTSH", "PTC", "MSI", "APH", "TRMB", "JBL", "SMCI", "ARW", "SANM", "FLEX",
)

_HEALTH_CARE = (
    "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "BMY",
    "AMGN", "MDT", "ISRG", "SYK", "GILD", "VRTX", "CVS", "ELV", "CI", "HCA",
    "ZTS", "BSX", "REGN", "HUM", "BDX", "EW", "IDXX", "IQV", "A", "MTD",
    "RMD", "DXCM", "BIIB", "WAT", "ALGN", "ILMN", "HOLX", "CAH", "MCK", "COR",
    "MRNA", "INCY", "UHS", "LH", "DGX", "CNC", "MOH", "PODD", "STE", "COO",
    "VTRS", "OGN", "BAX", "TFX", "XRAY", "CRL", "RVTY", "GEHC", "DVA", "ICLR",
)

_FINANCIALS = (
    "BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "SPGI", "BLK",
    "AXP", "SCHW", "C", "CB", "MMC", "PGR", "ICE", "CME", "AON", "USB",
    "PNC", "TFC", "AIG", "MET", "AFL", "TRV", "ALL", "PRU", "MSCI", "COF",
    "BK", "AMP", "DFS", "FIS", "FI", "TROW", "STT", "NDAQ", "WTW", "GPN",
    "SYF", "RJF", "HIG", "CINF", "L", "GL", "BRO", "MKTX", "JKHY", "FDS",
    "IVZ", "MTB", "FITB", "HBAN", "RF", "CFG", "KEY", "NTRS", "ZION", "CBOE",
)

_CONSUMER_DISCRETIONARY = (
    "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "BKNG", "TJX", "CMG",
    "ORLY", "MAR", "GM", "F", "HLT", "AZO", "ROST", "YUM", "DHI", "LEN",
    "NVR", "PHM", "EBAY", "ULTA", "BBY", "DPZ", "DRI", "POOL", "LVS", "WYNN",
    "MGM", "RCL", "CCL", "NCLH", "APTV", "GRMN", "TSCO", "KMX", "LKQ", "WHR",
    "MHK", "RL", "PVH", "VFC", "ETSY", "EXPE", "BWA", "GPC", "AAP", "DECK",
)

_COMMUNICATION_SERVICES = (
    "GOOGL", "GOOG", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "CHTR",
    "EA", "TTWO", "WBD", "PARA", "OMC", "IPG", "LYV", "MTCH", "NWSA", "FOXA",
    "FOX", "NWS", "PINS", "SNAP", "PYPL",
)

_INDUSTRIALS = (
    "GE", "CAT", "RTX", "HON", "UNP", "BA", "DE", "LMT", "UPS", "ADP",
    "GD", "NOC", "ETN", "ITW", "EMR", "CSX", "NSC", "WM", "TT", "PH",
    "CMI", "PCAR", "JCI", "CARR", "OTIS", "FDX", "ROK", "XYL", "DOV", "IEX",
    "AME", "FAST", "PWR", "LHX", "TDG", "HWM", "GWW", "EFX", "VRSK", "RSG",
    "CPRT", "PAYX", "BR", "CTAS", "EXPD", "JBHT", "ODFL", "LDOS", "HII", "TXT",
    "SNA", "PNR", "AOS", "IR", "SWK", "ALLE",
)

_CONSUMER_STAPLES = (
    "PG", "KO", "PEP", "WMT", "COST", "PM", "MO", "MDLZ", "CL", "KMB",
    "GIS", "STZ", "SYY", "KDP", "KHC", "HSY", "MKC", "CHD", "CLX", "TAP",
    "CAG", "CPB", "HRL", "SJM", "TSN", "K", "ADM", "BG", "KR", "TGT",
    "DG", "DLTR", "EL", "LW", "MNST", "COTY", "BF-B",
)

_ENERGY = (
    "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "WMB", "OKE",
    "KMI", "OXY", "HES", "BKR", "HAL", "FANG", "DVN", "TRGP", "CTRA", "EQT",
    "MRO", "APA", "TPL", "CVI", "PBF",
)

_UTILITIES = (
    "NEE", "SO", "DUK", "AEP", "SRE", "D", "EXC", "XEL", "ED", "PEG",
    "WEC", "ES", "FE", "AEE", "CMS", "CNP", "ATO", "PPL", "DTE", "EIX",
    "PNW", "NI", "LNT", "EVRG", "AES", "CEG",
)

_REAL_ESTATE = (
    "PLD", "AMT", "EQIX", "PSA", "O", "WELL", "SPG", "DLR", "CCI", "VICI",
    "AVB", "EQR", "SBAC", "IRM", "CBRE", "EXR", "MAA", "INVH", "ESS", "UDR",
    "ARE", "KIM", "REG", "HST", "BXP",
)

_MATERIALS = (
    "LIN", "SHW", "ECL", "APD", "FCX", "NEM", "DOW", "DD", "PPG", "NUE",
    "VMC", "MLM", "ALB", "CTVA", "IFF", "LYB", "CF", "MOS", "IP", "PKG",
    "AVY", "BALL", "AMCR", "STLD", "EMN",
)

_ADDITIONAL_LIQUID_MIDCAPS = (
    "CDW", "GDDY", "PAYC", "VRSN", "MPWR", "COIN", "SQ", "DOCU", "OKTA", "CTLT",
    "WST", "ZBH", "JAZZ", "EXAS", "NBIX", "ALNY", "AJG", "ERIE", "WRB", "RE",
    "ACGL", "PFG", "UNM", "LNC", "CZR", "HAS", "LULU", "FIVE", "DKS", "MAS",
    "FTV", "XPO", "WAB", "GNRC", "WES", "NOV", "RRC", "WY", "FRT", "ROKU",
    "TTD", "WBA", "CASY",
)

_ETFS = ("SPY", "QQQ", "IWM", "DIA")

_CRYPTO = ("BTC-USD", "ETH-USD")

_ALL = (
    _TECHNOLOGY
    + _HEALTH_CARE
    + _FINANCIALS
    + _CONSUMER_DISCRETIONARY
    + _COMMUNICATION_SERVICES
    + _INDUSTRIALS
    + _CONSUMER_STAPLES
    + _ENERGY
    + _UTILITIES
    + _REAL_ESTATE
    + _MATERIALS
    + _ADDITIONAL_LIQUID_MIDCAPS
    + _ETFS
    + _CRYPTO
)

# Deduplicated, order-preserving.
SCANNER_UNIVERSE: list[str] = list(dict.fromkeys(_ALL))

# NYSE core session in UTC minutes-since-midnight: 13:30 (810) .. 20:00 (1200).
# Deliberately ignores holidays / DST — an over-inclusive window only means the
# prefilter runs on stale data, which the prefilter itself tolerates.
_MARKET_OPEN_UTC_MINUTES = 810
_MARKET_CLOSE_UTC_MINUTES = 1200


def is_equity_market_hours(now_utc: datetime) -> bool:
    """
    True during the approximate NYSE core session (Mon-Fri, ~13:30-20:00
    UTC). Holidays are intentionally ignored — see module note. The open
    boundary is inclusive, the close boundary exclusive.
    """
    if now_utc.weekday() >= 5:  # Saturday/Sunday
        return False
    minutes = now_utc.hour * 60 + now_utc.minute
    return _MARKET_OPEN_UTC_MINUTES <= minutes < _MARKET_CLOSE_UTC_MINUTES


def scan_symbols(now_utc: datetime) -> list[str]:
    """
    Which symbols the scanner should scan right now.

    - Crypto (symbol ends in "-USD"): always included — crypto markets never close.
    - Equities/ETFs: only during equity market hours.
    """
    if is_equity_market_hours(now_utc):
        return list(SCANNER_UNIVERSE)
    return [s for s in SCANNER_UNIVERSE if s.endswith("-USD")]
