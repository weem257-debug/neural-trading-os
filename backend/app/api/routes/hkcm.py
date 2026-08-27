"""
/api/hkcm — HKCM newsletter analyses.

  POST /api/hkcm/import            upload one mail (.eml or .html) → parsed + stored
  GET  /api/hkcm/latest            newest issue with all of its analyses
  GET  /api/hkcm/issues            archive list (paginated)
  GET  /api/hkcm/issues/{id}       one issue with all of its analyses
  GET  /api/hkcm/ticker/{ticker}   newest analysis for one instrument
  GET  /api/hkcm/tickers           every covered ticker (for UI badges)

Everything is scoped to the authenticated user's `owner_username`, like the
rest of the app — one account's imported newsletters are never visible to
another.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.api.auth import get_current_user, UserInfo
from app.db.models import HkcmAnalysis as HkcmAnalysisRow, HkcmIssue as HkcmIssueRow
from app.models.schemas import (
    ErrorResponse,
    HkcmAnalysisResponse,
    HkcmImportResponse,
    HkcmIssueListResponse,
    HkcmIssueResponse,
    HkcmIssueSummary,
    HkcmTargetZone,
)
from app.services.hkcm import store
from app.services.hkcm.parser import HkcmParseError, parse_email, parse_html

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hkcm", tags=["HKCM"])

# A newsletter mail is ~300 KB of HTML. 5 MB leaves generous headroom for
# inlined images while still bounding what a single request can allocate.
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024

_MAX_PAGE_SIZE = 100


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _analysis_out(row: HkcmAnalysisRow, category: str = "") -> HkcmAnalysisResponse:
    return HkcmAnalysisResponse(
        id=row.id,
        ticker=row.ticker,
        isin=row.isin,
        name=row.name,
        headline=row.headline,
        entry=row.entry,
        entry_kind=row.entry_kind,
        entry_potential=row.entry_potential,
        stop=row.stop,
        stop_note=row.stop_note,
        partial_exit=row.partial_exit,
        risk_note=row.risk_note,
        what_happened=row.what_happened,
        primary_scenario=row.primary_scenario,
        alternative_scenario=row.alternative_scenario,
        alternative_probability=row.alternative_probability,
        outlook=row.outlook,
        opportunities=row.opportunities,
        supports=row.supports,
        resistances=row.resistances,
        target_zones=[HkcmTargetZone(**z) for z in row.target_zones if isinstance(z, dict)],
        chart_urls=[u for u in row.chart_urls if isinstance(u, str)],
        position=row.position,
        sent_at=_iso(row.sent_at),
        issue_id=row.issue_id,
        category=category,
    )


async def _issue_out(row: HkcmIssueRow, owner_username: str) -> HkcmIssueResponse:
    analyses = await store.analyses_for_issue(row.id, owner_username)
    return HkcmIssueResponse(
        id=row.id,
        subject=row.subject,
        category=row.category,
        sent_at=_iso(row.sent_at),
        news=row.news,
        upcoming=row.upcoming,
        analyses=[_analysis_out(a, category=row.category) for a in analyses],
    )


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


@router.post(
    "/import",
    response_model=HkcmImportResponse,
    summary="Import one HKCM newsletter mail (.eml or .html)",
    responses={413: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
async def import_mail(
    file: UploadFile = File(..., description=".eml export or the saved mail HTML"),
    current_user: UserInfo = Depends(get_current_user),
) -> HkcmImportResponse:
    """
    Parses the uploaded mail and stores its analyses.

    Re-importing a mail that is already stored is a no-op: the response then
    carries `imported=false` together with the existing issue id, so a bulk
    upload of an entire folder can be repeated safely.
    """
    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß ({len(raw)} Bytes, erlaubt sind {_MAX_UPLOAD_BYTES}).",
        )
    if not raw:
        raise HTTPException(status_code=422, detail="Leere Datei.")

    name = (file.filename or "").lower()
    try:
        if name.endswith((".html", ".htm")):
            issue = parse_html(raw.decode("utf-8", errors="replace"))
        else:
            issue = parse_email(raw)
    except HkcmParseError as exc:
        raise HTTPException(status_code=422, detail=f"Keine HKCM-Analyse erkannt: {exc}") from exc
    except (UnicodeDecodeError, ValueError) as exc:
        logger.warning("hkcm: unparsable upload %r: %s", file.filename, exc)
        raise HTTPException(status_code=422, detail="Datei konnte nicht gelesen werden.") from exc

    row, created = await store.save_issue(issue, current_user.username)
    return HkcmImportResponse(
        imported=created,
        issue_id=row.id,
        analyses=len(issue.analyses) if created else 0,
        tickers=[a.ticker for a in issue.analyses],
    )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


@router.get(
    "/latest",
    response_model=HkcmIssueResponse,
    summary="Newest imported HKCM issue with all analyses",
    responses={404: {"model": ErrorResponse}},
)
async def get_latest(
    current_user: UserInfo = Depends(get_current_user),
) -> HkcmIssueResponse:
    row = await store.latest_issue(current_user.username)
    if row is None:
        raise HTTPException(status_code=404, detail="Noch keine HKCM-Ausgabe importiert.")
    return await _issue_out(row, current_user.username)


@router.get(
    "/issues",
    response_model=HkcmIssueListResponse,
    summary="Archive of imported HKCM issues",
)
async def list_issues(
    limit: int = Query(20, ge=1, le=_MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    current_user: UserInfo = Depends(get_current_user),
) -> HkcmIssueListResponse:
    rows, total = await store.list_issues(current_user.username, limit, offset)
    summaries: list[HkcmIssueSummary] = []
    for row in rows:
        analyses = await store.analyses_for_issue(row.id, current_user.username)
        summaries.append(
            HkcmIssueSummary(
                id=row.id,
                subject=row.subject,
                category=row.category,
                sent_at=_iso(row.sent_at),
                tickers=[a.ticker for a in analyses],
            )
        )
    return HkcmIssueListResponse(issues=summaries, total=total)


@router.get(
    "/issues/{issue_id}",
    response_model=HkcmIssueResponse,
    summary="One HKCM issue with all analyses",
    responses={404: {"model": ErrorResponse}},
)
async def get_issue(
    issue_id: int,
    current_user: UserInfo = Depends(get_current_user),
) -> HkcmIssueResponse:
    row = await store.get_issue(issue_id, current_user.username)
    if row is None:
        raise HTTPException(status_code=404, detail="Ausgabe nicht gefunden.")
    return await _issue_out(row, current_user.username)


@router.get(
    "/tickers",
    response_model=list[str],
    summary="Every instrument HKCM has covered, newest coverage first",
)
async def get_tickers(
    current_user: UserInfo = Depends(get_current_user),
) -> list[str]:
    return await store.covered_tickers(current_user.username)


@router.get(
    "/ticker/{ticker}",
    response_model=HkcmAnalysisResponse,
    summary="Newest HKCM analysis for one instrument",
    responses={404: {"model": ErrorResponse}},
)
async def get_for_ticker(
    ticker: str,
    current_user: UserInfo = Depends(get_current_user),
) -> HkcmAnalysisResponse:
    row = await store.latest_for_ticker(ticker, current_user.username)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Keine HKCM-Analyse für {ticker.upper()}.")
    issue = await store.get_issue(row.issue_id, current_user.username)
    return _analysis_out(row, category=issue.category if issue else "")
