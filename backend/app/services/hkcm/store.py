"""
Persistence for parsed HKCM newsletters.

Keeps the DB shape out of the route layer and, more importantly, owns the
IDEMPOTENCY rule: the same mail may be imported repeatedly — the mailbox poller
re-reads a folder, the user uploads an .eml that was already fetched, a mail is
delivered twice — and must never produce a second issue or duplicate analyses.
De-duplication keys on (owner_username, content_hash), not the Message-ID,
because Outlook rewrites the Message-ID when a mail is moved or forwarded.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy import select

from app.db.database import get_session
from app.db.models import HkcmAnalysis as HkcmAnalysisRow, HkcmIssue as HkcmIssueRow
from app.services.hkcm.parser import HkcmIssue

logger = logging.getLogger(__name__)


async def save_issue(issue: HkcmIssue, owner_username: str) -> tuple[HkcmIssueRow, bool]:
    """
    Store a parsed issue for `owner_username`.

    Returns `(row, created)`. When an issue with the same content hash already
    exists for that user, the existing row is returned untouched and `created`
    is False — callers surface that as "already imported" rather than an error.
    """
    async with get_session() as session:
        existing = await session.execute(
            select(HkcmIssueRow).where(
                HkcmIssueRow.owner_username == owner_username,
                HkcmIssueRow.content_hash == issue.content_hash,
            )
        )
        found = existing.scalars().first()
        if found is not None:
            return found, False

        row = HkcmIssueRow(
            owner_username=owner_username,
            message_id=issue.message_id or None,
            content_hash=issue.content_hash,
            subject=issue.subject[:255],
            category=issue.category[:100],
            sent_at=issue.sent_at,
            news=issue.news,
            upcoming=issue.upcoming[:500],
        )
        session.add(row)
        # Needed before the analyses can reference issue_id.
        await session.flush()

        for analysis in issue.analyses:
            session.add(
                HkcmAnalysisRow(
                    issue_id=row.id,
                    owner_username=owner_username,
                    ticker=analysis.ticker[:20],
                    isin=analysis.isin[:12],
                    name=analysis.name[:120],
                    headline=analysis.headline[:255],
                    entry=analysis.entry,
                    entry_kind=analysis.entry_kind[:20],
                    entry_potential=analysis.entry_potential,
                    stop=analysis.stop,
                    stop_note=analysis.stop_note[:120],
                    partial_exit=analysis.partial_exit,
                    risk_note=analysis.risk_note[:255],
                    what_happened=analysis.what_happened,
                    primary_scenario=analysis.primary_scenario,
                    alternative_scenario=analysis.alternative_scenario,
                    alternative_probability=analysis.alternative_probability,
                    outlook=analysis.outlook,
                    opportunities=analysis.opportunities,
                    supports_json=json.dumps(analysis.supports),
                    resistances_json=json.dumps(analysis.resistances),
                    target_zones_json=json.dumps([z.as_dict() for z in analysis.target_zones]),
                    chart_urls_json=json.dumps(analysis.chart_urls),
                    position=analysis.position,
                    sent_at=issue.sent_at,
                )
            )

        await session.commit()
        await session.refresh(row)
        logger.info(
            "hkcm: stored issue id=%s subject=%r analyses=%d",
            row.id, row.subject, len(issue.analyses),
        )
        return row, True


async def latest_issue(owner_username: str) -> Optional[HkcmIssueRow]:
    """Newest issue by send date, falling back to insertion order when a mail
    carried no parseable Date header."""
    async with get_session() as session:
        result = await session.execute(
            select(HkcmIssueRow)
            .where(HkcmIssueRow.owner_username == owner_username)
            .order_by(HkcmIssueRow.sent_at.desc().nullslast(), HkcmIssueRow.id.desc())
            .limit(1)
        )
        return result.scalars().first()


async def get_issue(issue_id: int, owner_username: str) -> Optional[HkcmIssueRow]:
    async with get_session() as session:
        result = await session.execute(
            select(HkcmIssueRow).where(
                HkcmIssueRow.id == issue_id,
                HkcmIssueRow.owner_username == owner_username,
            )
        )
        return result.scalars().first()


async def list_issues(owner_username: str, limit: int, offset: int) -> tuple[list[HkcmIssueRow], int]:
    async with get_session() as session:
        total = len(
            (
                await session.execute(
                    select(HkcmIssueRow.id).where(HkcmIssueRow.owner_username == owner_username)
                )
            ).scalars().all()
        )
        result = await session.execute(
            select(HkcmIssueRow)
            .where(HkcmIssueRow.owner_username == owner_username)
            .order_by(HkcmIssueRow.sent_at.desc().nullslast(), HkcmIssueRow.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total


async def analyses_for_issue(issue_id: int, owner_username: str) -> list[HkcmAnalysisRow]:
    async with get_session() as session:
        result = await session.execute(
            select(HkcmAnalysisRow)
            .where(
                HkcmAnalysisRow.issue_id == issue_id,
                HkcmAnalysisRow.owner_username == owner_username,
            )
            .order_by(HkcmAnalysisRow.position.asc(), HkcmAnalysisRow.id.asc())
        )
        return list(result.scalars().all())


async def latest_for_ticker(ticker: str, owner_username: str) -> Optional[HkcmAnalysisRow]:
    """The most recent analysis HKCM published for one instrument."""
    async with get_session() as session:
        result = await session.execute(
            select(HkcmAnalysisRow)
            .where(
                HkcmAnalysisRow.owner_username == owner_username,
                HkcmAnalysisRow.ticker == ticker.upper(),
            )
            .order_by(HkcmAnalysisRow.sent_at.desc().nullslast(), HkcmAnalysisRow.id.desc())
            .limit(1)
        )
        return result.scalars().first()


async def covered_tickers(owner_username: str) -> list[str]:
    """Every ticker HKCM has ever covered for this user, newest coverage first.

    Drives the frontend badge that marks which watchlist symbols have an HKCM
    analysis available, so the UI does not have to probe one endpoint per
    symbol.
    """
    async with get_session() as session:
        result = await session.execute(
            select(HkcmAnalysisRow.ticker, HkcmAnalysisRow.sent_at, HkcmAnalysisRow.id)
            .where(HkcmAnalysisRow.owner_username == owner_username)
            .order_by(HkcmAnalysisRow.sent_at.desc().nullslast(), HkcmAnalysisRow.id.desc())
        )
        seen: list[str] = []
        for ticker, _sent_at, _row_id in result.all():
            if ticker not in seen:
                seen.append(ticker)
        return seen
