# ADR 0001 — Extract background loops into a dedicated worker service

- **Status:** Proposed (concept only — not implemented in this change)
- **Date:** 2026-06-15
- **Context tag:** P1-5 (paper-state + loops review)
- **Supersedes / Superseded by:** —

## Context

The FastAPI app (`dashboard/backend/app/main.py`) runs a number of recurring
background tasks inside the web process via the lifespan / asyncio loops, e.g.:

- signal-win notifications (email + Telegram)
- daily signal digest / morning briefing (Telegram)
- weekly digest, re-engagement and upgrade emails (`admin.py`)
- waitlist invites, activation follow-ups
- quota-exhaustion notifications (`signals.py`)
- the weekly-digest auto loop in `lifespan`

These loops share process memory with the request-serving workers and keep
state in module-level structures. Two concrete problems motivated P1-5:

1. **Unbounded in-memory de-dup sets.** Each loop used a plain `set()` of
   `"user:ticker:date"` markers that grew for the lifetime of the process —
   a slow memory leak. *(Addressed now: replaced with `BoundedDedupSet`,
   FIFO-bounded. This is the risk-low part of P1-5.)*

2. **Coupling of cadence to the web tier.** Because the loops live in the API
   process:
   - scaling the web tier horizontally would run every loop N times (duplicate
     emails) unless guarded by a leader-election / single-instance assumption;
   - a slow loop competes with request latency for the event loop;
   - de-dup state is per-process and lost on every redeploy/restart, so the
     bounded sets are a *correctness-by-luck* mechanism, not a guarantee.

This ADR records the **target architecture** for (2). It is deliberately **not**
implemented in this change set — only documented — per the P1-5 brief.

## Decision (proposed)

Extract the recurring jobs into a **separate worker service** that runs as its
own Railway service (own process, own scaling = exactly 1 replica), sharing the
same codebase and database as the API.

Key elements:

- **Scheduler:** a single-replica worker (`python -m app.worker`) using
  APScheduler (or an equivalent async scheduler) for cadence. One replica ⇒ no
  duplicate sends; no leader election needed initially.
- **Durable de-dup:** move the "already sent" markers from in-memory sets to a
  small DB table (`notification_log(user_id, kind, dedup_key, sent_at)`) with a
  unique constraint on `(kind, dedup_key)`. An `INSERT ... ON CONFLICT DO
  NOTHING` becomes the idempotency guard — survives restarts and is correct
  under any number of replicas. `BoundedDedupSet` then becomes a pure in-process
  fast-path cache in front of that table (optional).
- **API process:** stops running loops entirely; it only enqueues ad-hoc jobs
  (if any) via the DB or a lightweight queue.
- **Shared code:** notification senders stay in `app/services/...`; both the
  API and worker import them. No business-logic duplication.

## Consequences

**Positive**

- Web tier becomes horizontally scalable without duplicate notifications.
- Loop work no longer competes with request latency.
- De-dup correctness is durable (DB-backed) instead of per-process/best-effort.
- Clear ownership boundary; easier to reason about and to add new jobs.

**Negative / costs**

- A second Railway service to deploy, monitor and pay for.
- A DB migration for `notification_log` (Numeric/index review — coordinate with
  the P1-2 money-math migration so both land in one migration train).
- Slightly more operational surface (worker health, backfill on first deploy
  to seed the unsubscribe/dedup tables).

## Migration sketch (when implemented)

1. Add `notification_log` table + unique index (migration).
2. Add `app/worker.py` entrypoint + scheduler registering each existing loop.
3. Convert one loop at a time: swap its `BoundedDedupSet.add/contains` for the
   `INSERT ON CONFLICT` guard; verify; move its registration from `lifespan`
   to the worker.
4. Once all loops are migrated, delete the loop registrations from `lifespan`
   and add a Railway service definition (`worker`) with `replicas = 1`.
5. Keep `ENABLE_LIVE_TRADING=false` untouched — this ADR is about notification
   cadence, not trade execution.

## Interim state (this change)

Only step 0 is done: the in-memory marker sets are now `BoundedDedupSet`
(bounded, FIFO). This removes the leak without changing topology. The worker
extraction above remains the agreed direction but is out of scope until the
P1-2 migration work creates a migration train to ride along with.
