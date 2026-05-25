# Neural Trading OS

> **AI-powered unified trading cockpit** — 9 specialized engines, live Claude signals, real-time WebSocket dashboard, paper/live trading, and P2P portfolio management. Deployed on Railway. Built with FastAPI + Next.js + PostgreSQL.

[![Live Demo](https://img.shields.io/badge/Live_Demo-railway.app-blueviolet?style=flat-square)](https://frontend-production-8a00.up.railway.app)
[![Backend API](https://img.shields.io/badge/API_Docs-/docs-00D4FF?style=flat-square)](https://neural-trading-os-production.up.railway.app/docs)
[![Python](https://img.shields.io/badge/Python-3.12-3776ab?style=flat-square&logo=python)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-orange?style=flat-square)](https://anthropic.com)
[![Railway](https://img.shields.io/badge/Deployed_on-Railway-8B5CF6?style=flat-square)](https://railway.app)

---

## What it does

Neural Trading OS connects 9 open-source trading repos into a single dashboard. You get:

| Feature | Description |
|---|---|
| **AI Signals** | Claude Sonnet 4.6 analyses live yfinance data + news sentiment → structured BUY/SELL/HOLD signal with confidence, price target, stop-loss |
| **Real-time WebSocket** | Live prices for 10 tickers, portfolio updates, alert broadcasts — no polling, pure push |
| **Paper Trading** | 100k virtual capital via Nautilus Trader execution engine. Safety-gated switch to live |
| **Backtesting** | MA-Crossover, RSI Mean-Reversion, Buy-and-Hold via Jesse + Qlib + Vibe-Trading |
| **Sentiment Analysis** | NLP scoring on live news per ticker (positive/negative/neutral + score) |
| **P2P Portfolio** | Mintos, Bondora, PeerBerry — allocation chart, history snapshots, weighted NAR |
| **Risk Management** | VaR 95%/99%, Max Drawdown, Sharpe Ratio, position concentration alerts |
| **Price Alerts** | DB-backed (survives restarts), WebSocket broadcast on fire |
| **Multi-Portfolio** | Stocks, crypto, P2P, bank (FinTS/HBCI) in one net-worth view |
| **Self-Learning AI** | YouTube trading insight extraction + trade outcome learning (RAG-injected into signals) |

---

## Live Demo

```
URL:      https://frontend-production-8a00.up.railway.app
Username: admin
Password: NeuralTrading2026!
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js 14 Frontend            │
│  Dashboard · Signals · P2P · Alerts · Risk  │
│         WebSocket client (Recharts)         │
└──────────────────┬──────────────────────────┘
                   │ REST + WebSocket
┌──────────────────▼──────────────────────────┐
│           FastAPI Backend (Python 3.12)     │
│                                             │
│  /api/signals   ←── Claude Sonnet/Haiku     │
│  /api/sentiment ←── yfinance + NLP          │
│  /api/backtest  ←── Jesse / Qlib            │
│  /api/portfolio ←── Nautilus Trader         │
│  /api/risk      ←── VaR / Drawdown          │
│  /api/p2p       ←── Mintos / Bondora / PB   │
│  /ws/{channel}  ←── prices / alerts / risk  │
└──────────────────┬──────────────────────────┘
                   │ asyncpg / psycopg2
┌──────────────────▼──────────────────────────┐
│         PostgreSQL (Railway managed)        │
│  signals · alerts · portfolios · p2p ·      │
│  orders · learning · waitlist · bank        │
└─────────────────────────────────────────────┘
```

**Background tasks running 24/7:**
- `_price_stream_loop()` — broadcasts live prices every 10 s via WebSocket
- `_daily_signal_loop()` — generates Claude signals at 15:00 UTC for 6 tickers
- `_p2p_snapshot_loop()` — saves P2P snapshots at 02:00 UTC
- `alert_manager.run_checker()` — checks price alerts every 15 s
- `_signal_performance_loop()` — evaluates signal P&L at midnight UTC

---

## Quick Start (local)

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL (or use the included SQLite fallback)
- Anthropic API key ([get one here](https://console.anthropic.com))

### Backend

```bash
cd dashboard/backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET_KEY

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000` · Swagger UI at `http://localhost:8000/docs`.

### Frontend

```bash
cd dashboard/frontend
npm install

# Configure API endpoint
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Start dev server
npm run dev
```

Dashboard at `http://localhost:3000`.

### Docker Compose (full stack)

```bash
cd dashboard
docker compose up -d
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key — powers all AI signals |
| `DATABASE_URL` | ✅ | PostgreSQL: `postgresql+asyncpg://user:pass@host/db` |
| `JWT_SECRET_KEY` | ✅ | ≥32 random chars — signs auth tokens |
| `ADMIN_USERNAME` | — | Dashboard login (default: `admin`) |
| `ADMIN_PASSWORD` | — | Dashboard password (default: `changeme`) |
| `MINTOS_API_KEY` | — | Mintos P2P live data |
| `BONDORA_API_KEY` | — | Bondora P2P live data |
| `PEERBERRY_EMAIL` | — | PeerBerry login |
| `PEERBERRY_PASSWORD` | — | PeerBerry login |

---

## Deploy to Railway (one click)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/neural-trading-os)

Or manually:

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Deploy backend
cd dashboard/backend
railway up --service neural-trading-os

# Deploy frontend
cd ../frontend
railway up --service frontend

# Set env vars
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set JWT_SECRET_KEY=$(openssl rand -hex 32)
```

---

## API Reference

Full interactive docs at `/docs` (Swagger UI) or `/redoc`.

Key endpoints:

```
POST /api/auth/token            — Login (returns JWT)
GET  /api/signals/              — List AI signals (DB-backed)
POST /api/signals/generate      — Generate signal for a ticker
POST /api/signals/batch         — Batch generate for multiple tickers
GET  /api/sentiment/{ticker}    — News sentiment analysis
GET  /api/portfolio/snapshot    — Live-priced portfolio
POST /api/backtest/run          — Run backtest strategy
GET  /api/risk/metrics          — VaR, drawdown, Sharpe
GET  /api/p2p/summary           — All P2P platforms aggregated
GET  /api/p2p/history           — Historical snapshots
POST /api/p2p/snapshot          — Save current snapshot to DB
GET  /api/alerts/               — List price alerts
POST /api/alerts/               — Create price alert
WS   /ws/{channel}              — prices · alerts · risk · signals
```

---

## Tech Stack

### Backend
- **FastAPI** + **Pydantic v2** — typed REST API with automatic OpenAPI docs
- **SQLAlchemy 2 async** — asyncpg driver for PostgreSQL
- **Alembic** — database migrations (runs automatically on startup)
- **structlog** — structured JSON logging (pretty console in dev)
- **slowapi** — rate limiting (per-IP, per-endpoint)
- **yfinance** — live market data (prices, OHLCV history)
- **anthropic** — Claude API client for signal generation

### Frontend
- **Next.js 14** App Router — SSR + client components
- **TailwindCSS** — utility-first styling with custom neon design system
- **Recharts 2** — interactive charts (line, bar, candlestick, pie)
- **Framer Motion** — smooth page + component animations
- **Zustand** — lightweight state management (auth, signals, prices)
- **lightweight-charts** — TradingView-style candlestick charts

### Integrated Trading Engines

| Engine | Function |
|---|---|
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) | Multi-agent LLM signal consensus (Fundamental + Technical + Sentiment + News + Risk) |
| [FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) | Financial NLP sentiment analysis |
| [Jesse](https://github.com/jesse-ai/jesse) | Crypto backtesting, 300+ indicators |
| [Vibe-Trading](https://github.com/vibe-trading/vibe-trading) | Alpha-factor backtesting, 452 factors |
| [qlib](https://github.com/microsoft/qlib) | Microsoft ML portfolio management |
| [nautilus_trader](https://github.com/nautechsystems/nautilus_trader) | High-performance execution (15+ brokers) |
| [AI-Trader](https://github.com/AI4Finance-Foundation/AI-Trader) | Agent-native trading platform |
| [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | Fundamental analysis reports |
| [daily_stock_analysis](https://github.com/virattt/daily-stock-analysis) | Daily LLM stock analysis |

---

## Testing

```bash
cd dashboard/backend
pytest -v                    # 289 tests, all passing
pytest tests/test_signals.py # Run specific module
```

Test coverage: health, signals, sentiment, risk, backtest, portfolio, execution, auth, alerts, P2P, learning.

---

## Project Structure

```
dashboard/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # FastAPI route handlers
│   │   ├── core/            # Config, rate limits, auth
│   │   ├── db/              # SQLAlchemy models + migrations
│   │   ├── models/          # Pydantic schemas
│   │   ├── services/        # Business logic (signals, P2P, learning)
│   │   └── websocket/       # WebSocket channel manager
│   ├── alembic/             # Database migrations
│   └── tests/               # pytest test suite (289 tests)
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # Reusable UI components
│   │   ├── store/           # Zustand state stores
│   │   ├── hooks/           # Custom React hooks
│   │   └── i18n/            # DE/EN translations
│   └── messages/            # Translation JSON files
└── docker-compose.yml
```

---

## Roadmap

- [ ] Stripe billing integration (Basic €29 / Pro €99 / Institutional €299)
- [ ] Signal Marketplace — verified AI signals as standalone subscription
- [ ] Mobile app (React Native)
- [ ] Custom signal model fine-tuning (user-uploaded trade history)
- [ ] Live trading with Interactive Brokers + IBKR TWS

---

## Contributing

PRs welcome. Please:
1. Fork and create a feature branch
2. Run `pytest` — all 289 tests must pass
3. Run `npm run build` in `frontend/` — no TypeScript errors
4. Open PR with a clear description

---

## License

MIT — see [LICENSE](LICENSE)

---

*Powered by [Claude](https://anthropic.com) · Deployed on [Railway](https://railway.app) · Built with ❤️ and 9 trading engines*
