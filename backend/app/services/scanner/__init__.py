"""
24/7 market scanner (ADR 0003).

Money-critical foundation modules:
  cost.py          : price table + exact USD cost computation
  cost_guard.py    : hard daily-spend cap (can_spend / record_spend)
  single_runner.py : Postgres advisory-lock single-runner election
  universe.py      : ~500-symbol scan universe + market-hours gating
  prefilter.py     : Stage 1 free technical scoring
  deep_analysis.py : Stage 2 Sonnet deep analysis (paid, cap-gated)
  scan_loop.py     : orchestration (prefilter -> cap gate -> Sonnet -> dedup)
  delivery.py      : per-user watchlist match + quiet-hours + Telegram fanout
"""
