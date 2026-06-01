"""
/api/waitlist — Email Waitlist
"""
import asyncio
import hashlib
import hmac
import logging
import re
import smtplib
from datetime import datetime, UTC
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, delete
from sqlalchemy.exc import IntegrityError

from app.api.auth import UserInfo, get_current_user
from app.core.config import settings
from app.core.rate_limits import limiter
from app.db.database import get_session
from app.db.models import WaitlistEntry

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HMAC-signed unsubscribe token for waitlist emails (no auth required)
# ---------------------------------------------------------------------------

def _make_waitlist_unsub_token(email: str) -> str:
    secret = (settings.SECRET_KEY or "waitlist-unsub-fallback-key").encode()
    return hmac.new(secret, email.lower().encode(), hashlib.sha256).hexdigest()[:32]


def _verify_waitlist_unsub_token(email: str, token: str) -> bool:
    return hmac.compare_digest(_make_waitlist_unsub_token(email), token)


def _waitlist_unsub_url(email: str) -> str:
    token = _make_waitlist_unsub_token(email)
    return f"{settings.BACKEND_URL}/api/waitlist/unsubscribe?email={email}&token={token}"

router = APIRouter(prefix="/waitlist", tags=["Waitlist"])


async def _send_waitlist_welcome_email(to: str, position: int) -> None:
    """Non-blocking: send a waitlist confirmation + 'register now' CTA email."""
    if not settings.SMTP_HOST:
        _logger.info("[DEV] Waitlist welcome email would go to %s (position #%d)", to, position)
        return

    register_url = f"{settings.FRONTEND_URL}/register"
    unsubscribe_url = _waitlist_unsub_url(to)
    sender = settings.SMTP_FROM or settings.SMTP_USER

    html = f"""<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:'Segoe UI',Arial,sans-serif;color:#E2E8F0">
<div style="max-width:520px;margin:40px auto;padding:0 16px">
  <div style="background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(123,47,255,0.08));border:1px solid rgba(0,212,255,0.2);border-radius:20px;padding:36px">
    <p style="font-size:24px;font-weight:900;color:#00D4FF;margin:0 0 4px">Neural Trading OS</p>
    <p style="font-size:12px;color:#475569;margin:0 0 28px;letter-spacing:2px">KI-TRADING DASHBOARD</p>

    <h1 style="font-size:20px;font-weight:800;color:#fff;margin:0 0 12px">
      Du bist auf der Warteliste — Nummer #{position}!
    </h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px">
      Danke für dein Interesse an Neural Trading OS. Wir lassen dich wissen, sobald du Zugang erhältst.
    </p>

    <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:12px;padding:16px;margin-bottom:24px">
      <p style="font-size:13px;font-weight:700;color:#00FF88;margin:0 0 8px">🎉 Gute Neuigkeit</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;line-height:1.6">
        Du kannst dich <strong style="color:#E2E8F0">jetzt sofort kostenlos registrieren</strong> und direkt loslegen —
        kein Warten nötig. Der Free Plan ist dauerhaft kostenlos.
      </p>
    </div>

    <p style="font-size:12px;color:#64748b;margin:0 0 8px font-weight:600">Was du im Free Plan bekommst:</p>
    <ul style="margin:0 0 24px;padding-left:18px;color:#94a3b8;font-size:13px;line-height:1.9">
      <li>3 KI-Signale täglich (AAPL, NVDA, BTC-USD und mehr)</li>
      <li>Elliott-Wave-Analyse + Multi-Agenten-Konsens</li>
      <li>Paper Trading ohne Risiko</li>
      <li>Telegram-Bot-Benachrichtigungen</li>
      <li>Signal-Marktplatz einsehen</li>
    </ul>

    <a href="{register_url}" style="display:block;text-align:center;background:linear-gradient(135deg,#00D4FF,#7B2FFF);color:#000;font-weight:900;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:0.5px">
      Jetzt kostenlos registrieren →
    </a>

    <p style="text-align:center;margin:20px 0 0;font-size:11px;color:#334155">
      Neural Trading OS ·
      <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>
    </p>
  </div>
</div>
</body></html>"""

    text = (
        f"Willkommen auf der Warteliste (Position #{position})!\n\n"
        f"Gute Neuigkeit: Du kannst dich jetzt sofort kostenlos registrieren.\n\n"
        f"Registrieren: {register_url}\n\n"
        f"Free-Plan-Features: 3 KI-Signale/Tag, Paper Trading, Telegram-Alerts.\n\n"
        f"Neural Trading OS\n"
    )

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Du bist auf der Liste — und kannst dich jetzt direkt registrieren"
        msg["From"] = sender
        msg["To"] = to
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        _logger.warning("waitlist_welcome_email_failed to=%s reason=%s", to, exc)

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


class WaitlistJoinRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    plan_interest: Optional[Literal["basic", "pro", "institutional"]] = None
    source: str = Field(default="landing-page", max_length=50)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Ungültige E-Mail-Adresse")
        return v


class WaitlistJoinResponse(BaseModel):
    success: bool
    already_joined: bool
    position: int
    message: str


class WaitlistCountResponse(BaseModel):
    count: int


@router.post(
    "/",
    summary="Join the early-access waitlist",
    response_model=WaitlistJoinResponse,
    status_code=200,
)
@limiter.limit("5/minute")
async def join_waitlist(request: Request, body: WaitlistJoinRequest) -> WaitlistJoinResponse:
    async with get_session() as session:
        # Check existing
        existing = await session.execute(
            select(WaitlistEntry).where(WaitlistEntry.email == body.email)
        )
        row = existing.scalar_one_or_none()
        if row is not None:
            count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
            total = count_result.scalar_one()
            return WaitlistJoinResponse(
                success=True,
                already_joined=True,
                position=total,
                message="Du stehst bereits auf der Warteliste.",
            )

        entry = WaitlistEntry(
            email=body.email,
            plan_interest=body.plan_interest,
            source=body.source,
            joined_at=datetime.now(UTC),
        )
        session.add(entry)
        try:
            await session.commit()
            await session.refresh(entry)
        except IntegrityError:
            await session.rollback()
            count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
            total = count_result.scalar_one()
            return WaitlistJoinResponse(
                success=True,
                already_joined=True,
                position=total,
                message="Du stehst bereits auf der Warteliste.",
            )

        count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
        total = count_result.scalar_one()

    asyncio.create_task(_send_waitlist_welcome_email(body.email, total))

    return WaitlistJoinResponse(
        success=True,
        already_joined=False,
        position=total,
        message=f"Willkommen! Du bist Nummer #{total} auf der Warteliste.",
    )


@router.get(
    "/count",
    summary="Get total waitlist signup count (public)",
    response_model=WaitlistCountResponse,
    status_code=200,
)
async def get_waitlist_count() -> WaitlistCountResponse:
    async with get_session() as session:
        result = await session.execute(select(func.count()).select_from(WaitlistEntry))
        total = result.scalar_one()
    return WaitlistCountResponse(count=total)


class WaitlistAdminEntry(BaseModel):
    id: int
    email: str
    plan_interest: Optional[str]
    source: str
    joined_at: datetime


class WaitlistAdminResponse(BaseModel):
    count: int
    entries: list[WaitlistAdminEntry]


@router.get(
    "/admin",
    summary="List all waitlist entries (admin only, requires JWT)",
    response_model=WaitlistAdminResponse,
    status_code=200,
)
async def list_waitlist_admin(
    _user: UserInfo = Depends(get_current_user),
) -> WaitlistAdminResponse:
    if _user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Zugriff verweigert — Admin-Rolle erforderlich",
        )
    async with get_session() as session:
        result = await session.execute(
            select(WaitlistEntry).order_by(WaitlistEntry.joined_at.desc())
        )
        rows = result.scalars().all()
    entries = [
        WaitlistAdminEntry(
            id=r.id,
            email=r.email,
            plan_interest=r.plan_interest,
            source=r.source,
            joined_at=r.joined_at,
        )
        for r in rows
    ]
    return WaitlistAdminResponse(count=len(entries), entries=entries)


@router.get(
    "/unsubscribe",
    summary="One-click unsubscribe from waitlist (HMAC-signed link, no auth required)",
    status_code=200,
)
@limiter.limit("10/minute")
async def waitlist_unsubscribe(
    request: Request,
    email: str,
    token: str,
) -> Response:
    email = email.strip().lower()
    if not _verify_waitlist_unsub_token(email, token):
        html_error = """<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Ungültiger Link</title></head>
<body style="margin:0;padding:40px;background:#0A0A0F;font-family:'Segoe UI',Arial,sans-serif;color:#E2E8F0;text-align:center">
  <p style="color:#FF4444;font-size:18px;font-weight:700">Ungültiger oder abgelaufener Abmelde-Link.</p>
  <p style="color:#64748b;font-size:14px">Bitte melde dich mit einem gültigen Link ab.</p>
</body></html>"""
        return Response(content=html_error, media_type="text/html", status_code=400)

    async with get_session() as session:
        await session.execute(delete(WaitlistEntry).where(WaitlistEntry.email == email))
        await session.commit()

    html_ok = f"""<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Abgemeldet</title></head>
<body style="margin:0;padding:40px;background:#0A0A0F;font-family:'Segoe UI',Arial,sans-serif;color:#E2E8F0;text-align:center">
  <p style="color:#00FF88;font-size:18px;font-weight:700">Du wurdest erfolgreich von der Warteliste abgemeldet.</p>
  <p style="color:#64748b;font-size:14px">{email} wird keine weiteren E-Mails von Neural Trading OS erhalten.</p>
</body></html>"""
    return Response(content=html_ok, media_type="text/html", status_code=200)
