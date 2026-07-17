# ADR 0002 — Polymarket & commodities as an analysis/signal layer

- **Status:** Proposed (concept + Phase-0 groundwork — no code/data-source wired yet)
- **Date:** 2026-07-10
- **Context tag:** Feature-request "Polymarket + Rohstoffe" (Horizon gelddruckmaschine-tradingbot)
- **Supersedes / Superseded by:** —

## Context

A feature request asks to integrate **Polymarket** (prediction markets, on-chain
on Polygon/USDC) and **commodity markets** (gold, oil, gas, agriculture) "to make
money with the bot".

Two fundamentally different monetization paths exist:

- **A — trade with company capital** on these venues directly.
- **B — sell the analysis/signals** as a paid SaaS feature (existing tiers:
  Basic 29€ / Pro 99€ / Inst 299€ / Signals 19€).

Constraints already in force in this project:

- `ENABLE_LIVE_TRADING=false` — no automated order execution to production.
- Live trading is parked as a P2 regulatory item.
- Deploys only via `railway up`; secrets only in Railway env.

## Decision (proposed)

**Adopt path B: build both as a read-only analysis/signal layer we monetize as a
feature — not as a betting/execution engine with firm capital.** Path A is at
most a small, strictly isolated R&D/credibility lab, never a revenue pillar.

**Sequencing: commodities first, Polymarket second.**

### Rationale — earnings reality (unvarnished)

- **Polymarket:** liquid markets (elections) are effectively unbeatable; real but
  tiny edges exist only in intra-market inconsistency (YES+NO≠1), cross-venue
  spreads (vs. Kalshi/Betfair) and niche fair-value mispricing. Core limit is
  **liquidity** — most markets <100k USD depth, many <10k. Capital-based arb
  realistically ~500–5,000 EUR/mo, **not** scalable. Value is as a differentiating
  *discovery* feature, not as a trading account.
- **Commodities:** classic edges (trend/momentum, gas/agri seasonality, roll-yield
  contango/backwardation, COT positioning). Realistic retail Sharpe after costs
  ~0.3–0.7 — a credible decision-support dashboard, not a salary.
- **Scalable path:** as a SaaS feature (20–50 EUR/mo add-on) plausibly 2–20k EUR
  MRR with strong content/community. Positioned as "discovery / decision-support",
  never as a return promise.

## Architecture (target)

**Commodities (low effort, high reuse):**

- Category `"commodities"` already exists in `schemas.py`. Needs a
  `commodities_provider.py` + symbol list (GC=F gold, CL=F oil, NG=F gas,
  ZC=F agri).
- Data source: yfinance **prototyping only** (Yahoo ToS grey zone — not for a paid
  SaaS). Production: **Twelve Data** (free tier 800 req/day, commercial
  ~29 USD/mo) + **EIA API** (free, energy fundamentals) + **FRED** (free, macro).
  15-min delay is fine for an analysis tool — label it clearly in the UI.
- OHLCV format matches existing feeds ⇒ runs 1:1 through the neural-trader
  backtest pipeline. No new format.

**Polymarket (higher effort):**

- APIs: **Gamma** (markets/metadata, no auth), **CLOB** (orderbook/prices, read is
  auth-free — order placement would need a wallet, which we do **not** do), **Data**
  (history/positions). MVP uses adaptive polling (30s active / 5min idle), not
  WebSocket.
- New provider adapter as an anti-corruption layer; new tables
  (`prediction_markets`, `_prices`, `_outcomes`); category `"prediction_markets"`.
- **Key difference:** prediction-market prices are probabilities [0,1] with binary
  resolution — OHLCV backtesting does **not** apply. Needs a dedicated Python
  module using **Brier score / log-loss** as the quality metric instead of Sharpe.
  This is the only genuine net-new build.
- If a wallet is ever added: a separate, isolated signing service — never inside
  the FastAPI main process.

## Legal / compliance (traffic light)

- **Display/analyze public Polymarket data (aggregated):** GREEN. Like a finance
  site quoting betting odds.
- **Facilitate user trading / referral commission / wallet onboarding:** RED. In DE
  license-required under gambling law (§ 284/285 StGB, GlüStV), possibly KWG/MiCA.
  Hard line — do not touch.
- **Proprietary trading with firm capital:** YELLOW. Not generally KWG-regulated,
  but ToS/geoblocking/GwG issues; keep strictly separate from the SaaS; own review.
- **Commodity analysis:** generic signals GREEN/YELLOW; **personalized**
  recommendations = license-required investment advice (WpIG/KWG) → not without a
  license. Disclaimer mandatory: "Keine Anlageberatung, kein Angebot zum
  Kauf/Verkauf."
- **GDPR:** aggregated market data is uncritical. Individual wallet tracking /
  "whale watching" becomes GDPR-relevant → leave out of MVP.
- **MVP-safe scope:** aggregated display + disclaimer + explicit geo notice, no
  order routing, no personalized signals. Before any yellow/red step: consult a
  banking-/gambling-law specialist.

## Consequences

**Positive**

- Reuses the existing markets/backtest pipeline (commodities are near-free).
- Differentiating feature (prediction-market discovery) with a clear monetization.
- Stays inside the existing "no live trading" policy and green legal zone.

**Negative / costs**

- Twelve Data ~29 USD/mo (below the 50€ approval gate, but a running cost).
- One genuine net-new module (Brier-score backtesting) that breaks the OHLCV
  assumption — a misunderstanding trap in the code if not specified up front.
- DB migration for the prediction-market tables (Polymarket phase only).

## Phased plan

| Phase | Content | Effort | Risk |
|---|---|---|---|
| **0** | ADR (this file), disclaimer + geo-notice copy, final data-source decision | ~0.5 d | – |
| **1 — Commodities MVP** | `commodities_provider` (Twelve Data + EIA + FRED), `/api/analysis/markets?category=commodities`, frontend tile, through existing backtest pipeline | 3–5 d | low |
| **2 — Polymarket read-only** | Gamma+CLOB adapter, DB migration, market-browser UI, polling | 5–8 d | medium (ToS) |
| **3 — PM signal engine** | Brier-score module, inconsistency / cross-venue detector | 5–7 d | medium |
| **4 — Monetization** | Paywall/tier for the new analytics, slippage-realistic backtests | – | – |

MVP (Phase 0–2) ≈ 2 weeks of one fullstack dev. Phase 3 is the actual
differentiation investment.

## Red lines (non-negotiable)

1. No order routing and no wallet brokerage to EU users.
2. No personalized investment recommendations without a license.
3. Prediction-market data is displayed **aggregated** only; no individual wallet
   tracking in the MVP.
4. `ENABLE_LIVE_TRADING=false` stays untouched — this ADR is about analysis, not
   execution.

## Open decisions (need owner sign-off before Phase 1 build)

1. Approve sequencing commodities → Polymarket and the Twelve Data ~29 USD/mo cost.
2. Confirm the red line "no order routing / no wallet brokerage to EU users".
3. Green-light starting Phase 1 (commodities) implementation.

## Interim state (this change)

Only Phase 0 groundwork is done: this ADR records the direction. No provider,
no data source, no migration and no UI are wired yet — all of that is gated on
the owner sign-off above.
