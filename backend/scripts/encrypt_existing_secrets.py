"""
One-off data migration: encrypt existing clear-text rows in ``app_secrets`` (C2).
=================================================================================

Background
----------
Before the at-rest encryption change, ``AppSecret.value`` was stored in clear
text. After deploying the encryption change, *new* writes are encrypted
automatically, but rows written previously remain clear text until they are
next overwritten. This script encrypts them in place.

It is idempotent: rows already carrying the ``enc:v1:`` prefix are skipped.

Usage
-----
1. Set APP_ENCRYPTION_KEY in the environment (same key the app uses).
2. Point DATABASE_URL at the target database.

   * Local SQLite:   no DATABASE_URL needed (uses the default SQLite file).
   * Railway PROD:   run from your local machine against the PUBLIC proxy URL,
                     e.g.
                       DATABASE_URL="postgresql://user:pass@<proxy-host>:<port>/railway" \\
                       APP_ENCRYPTION_KEY="<key>" \\
                       python -m scripts.encrypt_existing_secrets
                     (Railway does NOT auto-run migrations — this is deliberate.)

3. Run a dry run first to see what would change:
       python -m scripts.encrypt_existing_secrets --dry-run

Exit codes: 0 = success, 1 = misconfiguration (e.g. missing key).
"""
from __future__ import annotations

import asyncio
import os
import sys


def _fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


async def _run(dry_run: bool) -> None:
    # Imported lazily so the helpful error messages above fire first.
    from sqlalchemy import select

    from app.core.crypto import encryption_key_configured, is_encrypted, encrypt
    from app.db.database import _AsyncSessionFactory
    from app.db.models import AppSecret

    if not encryption_key_configured():
        _fail(
            "APP_ENCRYPTION_KEY is not set or invalid. Generate one with:\n"
            "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"\n"
            "then export it as APP_ENCRYPTION_KEY and re-run."
        )

    db_target = os.getenv("DATABASE_URL") or "<local SQLite default>"
    print(f"Target database: {db_target}")
    print(f"Mode: {'DRY RUN (no writes)' if dry_run else 'APPLY'}")

    total = 0
    to_encrypt = 0
    async with _AsyncSessionFactory() as session:
        rows = (await session.execute(select(AppSecret))).scalars().all()
        total = len(rows)
        for row in rows:
            if is_encrypted(row.value):
                continue
            to_encrypt += 1
            print(f"  - {row.key}: clear-text -> will encrypt")
            if not dry_run:
                row.value = encrypt(row.value)
        if not dry_run and to_encrypt:
            await session.commit()

    print(
        f"\nDone. {total} secret(s) total, {to_encrypt} encrypted"
        f"{' (dry run — nothing written)' if dry_run else ''}."
    )
    if dry_run and to_encrypt:
        print("Re-run without --dry-run to apply.")


def main() -> None:
    # Make `app` importable when run as `python -m scripts.encrypt_existing_secrets`
    # from the backend/ directory.
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    dry_run = "--dry-run" in sys.argv
    asyncio.run(_run(dry_run))


if __name__ == "__main__":
    main()
