# ADR 0003 — 24/7 market scanner with a hard-capped LLM cost guard

- **Status:** Accepted (implemented)
- **Date:** 2026-07-21
- **Context tag:** Scanner / Gelddruckmaschine
- **Supersedes / Superseded by:** —

## Context

The product goal is a continuous market scanner that runs 24/7 — including
while the user sleeps — scans a broad universe of markets, and pushes concrete
trade *recommendations* (never live orders; live trading stays off, P2
regulatory) to each user via Telegram, matched against that user's watchlist.

The hard constraint is money. The deep analysis step uses an LLM (Sonnet, per
an explicit product decision — not Haiku). Left unbounded, a 24/7 loop over a
500-symbol universe could spend without limit. A daily USD hard cap is
therefore a first-class, money-critical requirement, not a nice-to-have.

Additionally, Railway may run more than one backend replica. Without
coordination each replica would run the loop, producing duplicate signals AND
duplicate paid LLM calls.

## Decision

A **two-stage scanner**, gated by a **fail-closed daily dollar cap** and a
**single-runner advisory lock**:

1. **Stage 1 — Prefilter (free).** `yfinance` batch OHLCV over the ~500-symbol
   universe (`universe.py`), scored 0–100 from ADX/DI, RSI, Stochastic, MACD
   histogram, OBV trend and volume (`prefilter.py`). Pure computation, zero LLM
   cost. Only candidates ≥ threshold (40) advance.

2. **Stage 2 — Sonnet deep analysis (paid, cap-gated).** Only the top-N
   candidates get an LLM call (`deep_analysis.py`). Every call is preceded by
   `cost_guard.can_spend(estimate)` and followed by
   `cost_guard.record_spend(actual_usage)`.

3. **Per-user delivery.** Each resulting signal is matched against every user's
   analysis watchlist, filtered by a global quiet-hours window, and pushed via
   Telegram (`delivery.py`).

### Money-critical invariants

- **Fail-closed cap.** `can_spend` returns `False` on *any* error (DB
  unreachable, etc.) — the scanner never spends blind. The boundary is
  inclusive: spend exactly equal to the cap is allowed; a spend that would
  strictly exceed it is blocked. Because the gate runs *before every* paid
  call, total spend can never exceed the cap by more than a single in-flight
  call's actual cost.
- **Atomic ledger.** `record_spend` writes an immutable `ScanCostEntry` and
  atomically increments the `ScanCostDaily` aggregate
  (`spent_usd = spent_usd + delta`) so concurrent writers never lose an
  increment.
- **Unknown-model pricing fails expensive.** `cost.py` falls back to the most
  expensive known per-field rate for an unknown model — an accidental model
  swap can only over-count against the cap, never silently under-count.

### Single-runner election

`single_runner.try_acquire_scan_lock` uses a Postgres session-level advisory
lock (`pg_try_advisory_lock`). Only the replica that wins runs the cycle; the
others skip. On non-Postgres dialects (SQLite dev/test) it is a no-op that
always grants the lock (single process).

## Configuration

- `SCANNER_ENABLED` (default **False**) — the background loop idles until this
  is set, so a default deploy spends nothing.
- `SCAN_DAILY_CAP_USD` (default 1000.0) — the hard daily cap.
- `SCAN_TOP_N`, `SCAN_INTERVAL_SECONDS`, `SCAN_DEDUP_WINDOW_HOURS`,
  `SCAN_QUIET_HOURS_START_UTC`, `SCAN_QUIET_HOURS_END_UTC`.

## Rollout gate (binding)

Before any deploy toward live operation, a **dry-run with cap = 1 USD MUST
prove** that the hard cap stops spend exactly at the boundary (no overspend).
This is a verification requirement, not optional.

## Consequences

- Spend is bounded and auditable per day and per call.
- Duplicate signals/costs across replicas are prevented.
- The scanner is opt-in and off by default; enabling it is a deliberate,
  env-flag decision.
