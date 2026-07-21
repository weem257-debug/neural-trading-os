"""
BINDING ROLLOUT GATE (ADR 0003): dry-run with SCAN_DAILY_CAP_USD = 1.0 that
proves the hard daily cap stops spend at the boundary with NO overspend.

This is an end-to-end run of the real scan loop with the REAL cost-guard
(can_spend / record_spend) against a real DB — only the network-bound stages
(prefilter download + Sonnet call) are faked with deterministic token usage.

Deterministic cost: each faked analysis reports 100_000 input tokens on
claude-sonnet-4-6 => 100_000 * 3.0 / 1e6 = exactly $0.30 per call.
With a $1.00 cap the guard must allow 3 calls ($0.90) and block the 4th
(0.90 + 0.30 = 1.20 > 1.00), leaving recorded spend at $0.90 — never above cap.
"""
import asyncio
import os
import tempfile

import pytest


def _run(coro):
    return asyncio.run(coro)


COST_PER_CALL = 0.30
CAP = 1.0
# 100_000 input tokens * $3.0 / 1e6 = $0.30
_DETERMINISTIC_USAGE = {"input_tokens": 100_000, "output_tokens": 0,
                        "cache_read_tokens": 0, "cache_write_tokens": 0}


@pytest.fixture(scope="module")
def dryrun_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_scan_dryrun_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ANTHROPIC_API_KEY", None)

    from app.db.database import create_all_tables, get_session
    from app.db import models

    _run(create_all_tables())
    yield {"get_session": get_session, "models": models}
    try:
        os.remove(db_path)
    except OSError:
        pass


def _candidates(n):
    from app.services.scanner.prefilter import Candidate
    return [
        Candidate(symbol=f"SYM{i}", score=90.0 - i, direction="BUY",
                  reasons=["dryrun"], last_price=100.0, indicators={"rsi_14": 20.0})
        for i in range(n)
    ]


def test_dry_run_cap_1usd_stops_spend_at_boundary(dryrun_db, monkeypatch, capsys):
    from app.services.scanner import scan_loop
    from app.services.scanner.cost_guard import _today_utc
    from sqlalchemy import select, func

    gs, models = dryrun_db["get_session"], dryrun_db["models"]

    # Hard cap = $1.00 everywhere the guard reads it.
    monkeypatch.setattr(scan_loop.settings, "SCAN_DAILY_CAP_USD", CAP)
    import app.services.scanner.cost_guard as cg
    monkeypatch.setattr(cg.settings, "SCAN_DAILY_CAP_USD", CAP)

    # 10 candidates offered — far more than the cap can afford.
    cands = _candidates(10)

    async def fake_prefilter(symbols, top_n=None):
        return cands[:top_n] if top_n else cands

    async def fake_deep(candidate):
        # Real Sonnet model id so the REAL price table computes the cost.
        return (
            {"direction": "BUY", "confidence": 0.8, "price_target": None,
             "stop_loss": None, "time_horizon": "1w", "reasoning": "dry run",
             "model": "claude-sonnet-4-6"},
            dict(_DETERMINISTIC_USAGE),
        )

    async def no_deliver(signal, now=None):
        return 0

    monkeypatch.setattr(scan_loop, "run_prefilter", fake_prefilter)
    monkeypatch.setattr(scan_loop, "deep_analyze", fake_deep)
    monkeypatch.setattr(scan_loop, "deliver_signal", no_deliver)
    # Pre-call estimate MUST equal the true per-call cost for a tight gate.
    monkeypatch.setattr(scan_loop, "estimate_call_cost", lambda: COST_PER_CALL)
    # SQLite -> single-runner lock always granted (no-op), which is correct here.

    out = _run(scan_loop.run_scan_cycle(top_n=10, deliver=False))

    # Read the authoritative recorded spend from the ledger.
    async def _read():
        async with gs() as s:
            row = (await s.execute(
                select(models.ScanCostDaily).where(models.ScanCostDaily.date_utc == _today_utc())
            )).scalar_one_or_none()
            entries = (await s.execute(
                select(func.count()).select_from(models.ScanCostEntry)
            )).scalar()
            return row, entries

    row, entries = _run(_read())
    recorded_spend = float(row.spent_usd)
    max_affordable = int(CAP // COST_PER_CALL)  # = 3

    # ---- The binding assertions ----
    assert out["cap_reached"] is True, "cap gate must have fired"
    assert out["analyzed"] == max_affordable == 3
    assert entries == max_affordable == 3
    # Recorded spend never exceeds the cap.
    assert recorded_spend <= CAP + 1e-9
    assert recorded_spend == pytest.approx(max_affordable * COST_PER_CALL)  # $0.90
    # And one more call would have breached the cap — proving the gate is tight.
    assert recorded_spend + COST_PER_CALL > CAP

    print(
        f"\n[DRY-RUN CAP GATE] cap=${CAP:.2f} cost/call=${COST_PER_CALL:.2f} "
        f"-> analyzed={out['analyzed']} recorded_spend=${recorded_spend:.2f} "
        f"cap_reached={out['cap_reached']} (one more would be "
        f"${recorded_spend + COST_PER_CALL:.2f} > ${CAP:.2f}) :: NO OVERSPEND"
    )
