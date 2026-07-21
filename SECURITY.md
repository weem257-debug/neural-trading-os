# Security Overview & Audit Remediation Status — Neural Trading OS

Last updated: 2026-07-21. This document satisfies **F-11** (audit governance /
scope transparency) and **F-22** (backup/restore & incident runbook), and records
the concrete implementation plans for the security items that were deliberately
deferred rather than half-shipped.

---

## 1. Audit scope matrix (F-11)

The original "Code-Audit" (2026-07-19 + 2026-07-18 addendum) was an
**unauthenticated black-box test** of `frontend-production-8a00.up.railway.app`.
It did **not** inspect repo/server code, CI/CD, data models, migrations, auth
internals, broker adapters, workers, Docker or IaC. The remediation work since
then is white-box (source-level). The table below states what has been verified
at which level.

| Area | Black-box (audit) | White-box (remediation) | Status |
|------|-------------------|-------------------------|--------|
| HTTP security headers / HSTS | yes | yes | done, live |
| CSP (HTML routes) | yes | yes (nonce, enforce on auth/dashboard) | done, live |
| Login rate limiting | yes | yes (slowapi + proxy-IP hardening) | done, live |
| Token storage (localStorage) | yes | yes (httpOnly cookie, no persist) | done, live |
| Open redirect | yes | yes (safeRedirectPath) | done, live |
| AuthZ / IDOR (REST) | no | yes (owner-scoping review) | verified |
| WebSocket authz / limits | no | yes (ticket, origin, owner-scope, msg limits) | done, live |
| Session revocation | no | yes (token_version) | done, live |
| CORS/CSRF | partial | yes (exact allow-list + Origin/Referer) | done, live |
| Broker secrets at rest | no | yes (Fernet/MultiFernet) | verified |
| SSRF | no | guard utility ready (no active surface) | prepared |
| CI/CD supply chain | no | pip-audit + gitleaks + dependabot live | partial |
| Backup/restore/IR | no | this runbook | documented |
| Refresh-token families | no | token_version live; family rotation spec below | partial |

Full per-finding status is in the project memory and commit history
(`fix(security): F-…` commits on `master`).

---

## 2. Backup / Restore / Incident Response runbook (F-22)

### 2.1 Data stores
- **Postgres** (Railway managed) — system of record: users, portfolios, orders,
  signals, encrypted broker secrets, scan-cost ledger.
- **Redis** (Railway) — ephemeral: caching, (optional) rate-limit backing.
  Contains no source-of-truth data; safe to lose.

### 2.2 RPO / RTO targets (realistic for this Railway setup)
- **RPO ≤ 24 h** via Railway's automated daily Postgres backups.
  (Tighten to ≤ 1 h later with WAL/PITR if Railway plan supports it.)
- **RTO ≤ 2 h** — restore a backup into a new Postgres service and repoint
  `DATABASE_URL`.

### 2.3 Backup verification / restore drill (MUST be done in isolation)
> Never restore onto the production database. Restore into a **separate** test
> Postgres instance only.
1. Provision a throwaway Postgres service (or local container).
2. Load the latest Railway backup dump into it.
3. Point a local backend (`DATABASE_URL=<test-instance>`) at it, run
   `alembic upgrade head`, boot, hit `/api/health` and a couple of read
   endpoints, confirm row counts are sane.
4. Record date + result. **This automated remediation run did NOT execute a
   restore drill** (no isolated instance was provisioned, and touching prod data
   was out of scope) — it must be performed manually/in staging.

### 2.4 Degradation behaviour
- **Redis down**: rate limiter falls back to in-process memory (per-worker
  buckets) — limits still apply, just not shared across replicas. App keeps
  serving. Verify slowapi storage config degrades, does not hard-fail.
- **Postgres down**: app returns 5xx on data routes; `get_current_user` fails
  closed (401) rather than granting access. No writes are lost silently.
- **Scanner**: `scanner_loop` catches per-cycle errors and continues; a DB
  outage simply skips cycles. Kill switch: set `SCANNER_ENABLED=false`.

### 2.5 Incident response quick steps
1. Check `/api/health` and Railway service logs.
2. Auth/rate-limit anomaly → confirm `TRUST_PROXY=true`, inspect
   `X-Real-IP`-derived buckets.
3. Suspected token/session compromise → bump affected users' `token_version`
   (logout-all) or rotate `JWT_SECRET_KEY` (invalidates all sessions).
4. Suspected secret leak → rotate `APP_ENCRYPTION_KEY` (keep old key in
   `APP_ENCRYPTION_KEYS_OLD`) and re-encrypt.
5. Scanner misbehaviour / cost runaway → `SCANNER_ENABLED=false` (emergency stop).

---

## 3. SSRF guard usage (F-18)

There is currently **no** server-side outbound broker/import fetch. Before any
such code is added it MUST route target URLs through
`app.core.ssrf_guard.assert_url_allowed(url, allowed_hosts={...})`, which blocks
private/loopback/link-local/reserved IPs (v4+v6), enforces https, and an optional
host allow-list. Tested in `tests/test_hardening_utils.py`.

---

## 4. Deferred items — concrete plans

### 4.1 Refresh-token families with replay detection (F-14-Rest)
`token_version` (live) already gives hard, server-side, all-session revocation.
The finer-grained family/replay layer is deferred to avoid an unproven change to
the live auth core, and specified here:

- **New additive table** `refresh_tokens(id, user_id, family_id, generation,
  token_hash, issued_at, expires_at, revoked_at, replaced_by)`. No ALTER on
  existing tables. Migration additive.
- **Issue**: on login, mint a refresh token (random, store only its hash), set a
  separate httpOnly `refresh_token` cookie; keep the short access token as today.
- **Rotate on every /refresh**: validate presented refresh hash → mark it
  `replaced_by` the new generation, issue new access+refresh. Old generation now
  invalid.
- **Replay detection**: if a refresh token that is already `replaced_by`/revoked
  is presented → treat as theft: revoke the entire `family_id` **and** bump the
  user's `token_version` (belt-and-suspenders). 
- **Concurrency**: unique index on `(family_id, generation)`; rotation is an
  atomic UPDATE…WHERE generation=current guarded by the DB.
- **Rollout**: feature-flag (`REFRESH_ROTATION_ENABLED`), dual-read so existing
  sessions keep working; no hard invalidation of current users.
- Ship only after tests for rotation, replay→family-lock, and concurrent-refresh
  race are green against a test DB.

### 4.2 Admin step-up MFA + immutable audit table (F-19-Rest)
- Add TOTP (pyotp) enrolment for admin accounts; require a fresh TOTP code for
  the most sensitive actions (user ban, role change). Store TOTP secret Fernet-
  encrypted (reuse `app.core.crypto`).
- Promote the current structured `audit` log to an insert-only
  `admin_audit(id, actor, action, target, before, after, correlation_id, ts)`
  table (append-only; no update/delete grant).

### 4.3 Others
- **F-09** (bundle): run `@next/bundle-analyzer`; lazy-load heavy libs
  (tsparticles, lightweight-charts) out of the `/login` route tree; confirm
  Railway edge Brotli. Target < 200 KB compressed for `/login`.
- **F-21** (consent/PII): verify no third-party (Stripe.js) loads before consent;
  the F-24 redaction processor already scrubs PII/secrets from logs.
- **CSP enforce on marketing routes**: requires converting `/landing`,
  `/datenschutz`, `/impressum` to dynamic rendering (loses SSG/CDN benefit) — kept
  Report-Only by design; revisit if their static status is not required.
