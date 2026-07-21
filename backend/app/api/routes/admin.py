"""
Admin API — User Management
============================
Endpoints for listing users and updating their tier / active status.
All endpoints require role=admin (demo user "admin" qualifies).
"""
import asyncio
import logging
import smtplib
from datetime import datetime, UTC, date as _date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func, case

from app.api.auth import get_current_user, UserInfo, _is_unsubscribed, _unsubscribe_url
from app.core.config import settings
from app.core.rate_limits import limiter
from app.db.database import get_session
from app.db.models import User, SignalRecord, WaitlistEntry, SignalPerformance

logger = logging.getLogger(__name__)

# In-memory de-dup marker sets. All are pure "have I already sent X?" markers
# (date-keyed or once-per-user), so FIFO-bounded sets prevent unbounded growth
# in the long-lived scheduler process without changing send semantics.
from app.core.cache import BoundedDedupSet
# "username:YYYY-MM-DD" → upgrade email sent today
_upgrade_email_sent: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)
# "email:YYYY-MM-DD" → waitlist invite sent today
_waitlist_invited: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)
# "username:YYYY-MM-DD" → daily signal notification sent today
_daily_signal_notified: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)
# "username" → activation follow-up sent (once per user, no date key)
_activation_followup_sent: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)

router = APIRouter(prefix="/admin", tags=["Admin"])

VALID_TIERS = {"free", "basic", "pro", "institutional"}


def _require_admin(current_user: UserInfo = Depends(get_current_user)) -> UserInfo:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Zugriff verweigert — Admin-Rolle erforderlich",
        )
    return current_user


class UserRecord(BaseModel):
    username: str
    email: str
    tier: str
    role: str
    is_active: bool
    created_at: str
    signals_today: int = 0
    last_signal_at: Optional[str] = None
    referred_by: Optional[str] = None
    referral_count: int = 0
    email_unsubscribed: bool = False


class UserUpdateRequest(BaseModel):
    tier: Optional[str] = None
    is_active: Optional[bool] = None


class UserUpdateResponse(BaseModel):
    username: str
    tier: str
    is_active: bool
    message: str


class SendUpgradeEmailResponse(BaseModel):
    sent: bool
    message: str


class BulkUpgradeEmailResponse(BaseModel):
    sent: int
    skipped: int
    failed: int
    message: str


class GrowthDataPoint(BaseModel):
    date: str        # ISO "YYYY-MM-DD"
    signups: int
    signals: int


class GrowthResponse(BaseModel):
    days: list[GrowthDataPoint]
    total_signups_7d: int
    total_signals_7d: int


UPGRADE_TARGETS = {"free": "basic", "basic": "pro"}
UPGRADE_LIMITS = {"basic": 10, "pro": 50}
PLAN_PRICES = {"basic": 29, "pro": 99}


@router.get("/users", response_model=list[UserRecord])
async def list_users(_: UserInfo = Depends(_require_admin)) -> list[UserRecord]:
    """List all registered users with their current tier and today's signal count."""
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    async with get_session() as session:
        result = await session.execute(
            select(User).order_by(User.created_at.desc())
        )
        users = result.scalars().all()

        # Count signals per user today
        signals_result = await session.execute(
            select(SignalRecord.user_id, func.count(SignalRecord.id))
            .where(SignalRecord.generated_at >= today_start)
            .group_by(SignalRecord.user_id)
        )
        signals_map: dict[str, int] = {uid: cnt for uid, cnt in signals_result.all() if uid}

        # Last signal date per user (all time)
        last_signal_result = await session.execute(
            select(SignalRecord.user_id, func.max(SignalRecord.generated_at))
            .where(SignalRecord.user_id.isnot(None))
            .group_by(SignalRecord.user_id)
        )
        last_signal_map: dict[str, datetime] = {uid: ts for uid, ts in last_signal_result.all() if uid}

        # Referral counts per referrer
        referral_result = await session.execute(
            select(User.referred_by, func.count(User.id))
            .where(User.referred_by.isnot(None))
            .group_by(User.referred_by)
        )
        referral_map: dict[str, int] = {ref: cnt for ref, cnt in referral_result.all() if ref}

    return [
        UserRecord(
            username=u.username,
            email=u.email,
            tier=u.tier,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at.isoformat(),
            signals_today=signals_map.get(u.username, 0),
            last_signal_at=last_signal_map[u.username].isoformat() if u.username in last_signal_map else None,
            referred_by=getattr(u, "referred_by", None),
            referral_count=referral_map.get(u.username, 0),
            email_unsubscribed=getattr(u, "email_unsubscribed", False),
        )
        for u in users
    ]


@router.patch("/users/{username}", response_model=UserUpdateResponse)
async def update_user(
    username: str,
    body: UserUpdateRequest,
    admin: UserInfo = Depends(_require_admin),
) -> UserUpdateResponse:
    """Update tier and/or active status for a user."""
    if body.tier is not None and body.tier not in VALID_TIERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Ungültiger Plan. Erlaubt: {', '.join(VALID_TIERS)}",
        )
    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.username == username)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Benutzer '{username}' nicht gefunden",
            )
        before = {"tier": user.tier, "is_active": user.is_active}
        if body.tier is not None:
            user.tier = body.tier
        if body.is_active is not None:
            user.is_active = body.is_active
        after = {"tier": user.tier, "is_active": user.is_active}
        await session.commit()
        await session.refresh(user)

    # F-19: immutable-ish audit trail for privileged user mutations (actor,
    # target, before/after). Structured log so it lands in the central log sink.
    logging.getLogger("audit").info(
        "admin_user_update",
        extra={
            "actor": admin.username,
            "target": username,
            "before": before,
            "after": after,
        },
    )

    return UserUpdateResponse(
        username=user.username,
        tier=user.tier,
        is_active=user.is_active,
        message=f"Benutzer '{username}' aktualisiert",
    )


@router.get("/stats/growth", response_model=GrowthResponse)
async def get_growth_stats(_: UserInfo = Depends(_require_admin)) -> GrowthResponse:
    """Return daily signup + signal counts for the last 7 days."""
    today = _date.today()
    days_range = [today - timedelta(days=i) for i in range(6, -1, -1)]  # oldest → newest

    async with get_session() as session:
        # Signups per day
        signup_result = await session.execute(
            select(
                func.date(User.created_at).label("day"),
                func.count(User.id).label("cnt"),
            )
            .where(User.created_at >= datetime(today.year, today.month, today.day, tzinfo=UTC) - timedelta(days=6))
            .group_by(func.date(User.created_at))
        )
        signup_map: dict[str, int] = {str(row.day): row.cnt for row in signup_result.all()}

        # Signals per day
        signal_result = await session.execute(
            select(
                func.date(SignalRecord.generated_at).label("day"),
                func.count(SignalRecord.id).label("cnt"),
            )
            .where(SignalRecord.generated_at >= datetime(today.year, today.month, today.day, tzinfo=UTC) - timedelta(days=6))
            .group_by(func.date(SignalRecord.generated_at))
        )
        signal_map: dict[str, int] = {str(row.day): row.cnt for row in signal_result.all()}

    data = [
        GrowthDataPoint(
            date=str(d),
            signups=signup_map.get(str(d), 0),
            signals=signal_map.get(str(d), 0),
        )
        for d in days_range
    ]
    return GrowthResponse(
        days=data,
        total_signups_7d=sum(p.signups for p in data),
        total_signals_7d=sum(p.signals for p in data),
    )


@router.post("/users/{username}/send-upgrade-email", response_model=SendUpgradeEmailResponse)
@limiter.limit("20/hour")
async def send_upgrade_email(
    request: Request,
    username: str,
    _: UserInfo = Depends(_require_admin),
) -> SendUpgradeEmailResponse:
    """Send a personalized upgrade-nudge email to a free/basic user (once per day)."""
    key = f"{username}:{_date.today().isoformat()}"
    if key in _upgrade_email_sent:
        return SendUpgradeEmailResponse(sent=False, message="Bereits heute gesendet")

    async with get_session() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Benutzer '{username}' nicht gefunden")
    if not user.email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Keine E-Mail-Adresse hinterlegt")
    if user.tier not in UPGRADE_TARGETS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nutzer ist bereits auf Pro oder höher")
    if _is_unsubscribed(username):
        return SendUpgradeEmailResponse(sent=False, message="Nutzer hat E-Mail-Benachrichtigungen abbestellt")

    upgrade_plan = UPGRADE_TARGETS[user.tier]
    upgrade_limit = UPGRADE_LIMITS[upgrade_plan]
    upgrade_price = PLAN_PRICES[upgrade_plan]
    unsub_url = _unsubscribe_url(username)

    if not settings.SMTP_HOST:
        logger.info("[DEV] Upgrade email would be sent to %s (%s) tier=%s→%s", username, user.email, user.tier, upgrade_plan)
        _upgrade_email_sent.add(key)
        return SendUpgradeEmailResponse(sent=True, message=f"[DEV] E-Mail simuliert (kein SMTP konfiguriert)")

    sender = settings.SMTP_FROM or settings.SMTP_USER
    subject = "Dein Trading-Setup kann mehr — Neural Trading OS"
    html = f"""<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">
<div style="max-width:480px;margin:0 auto">
  <h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} 👋</h2>
  <p>Du nutzt Neural Trading OS aktiv und hast bereits Signale generiert — das freut uns sehr.</p>
  <p>Mit dem <strong style="color:#A78BFA">{upgrade_plan.capitalize()}-Plan</strong> holst du noch mehr heraus:</p>
  <div style="margin:20px 0;padding:16px;background:rgba(123,47,255,0.08);border:1px solid rgba(123,47,255,0.25);border-radius:12px">
    <ul style="margin:0;padding-left:20px;color:#94a3b8;line-height:1.8">
      <li><strong style="color:#e2e8f0">{upgrade_limit} Signale pro Tag</strong> statt {3 if user.tier == "free" else 10}</li>
      <li>Vollständige KI-Analyse mit Elliott-Wave und Multi-Agent-Konsens</li>
      <li>Erweiterte Backtesting-Kapazitäten</li>
      <li>Prioritäts-Support</li>
    </ul>
  </div>
  <p style="color:#64748b">Nur <strong style="color:#e2e8f0">€{upgrade_price}/Monat</strong> — oder spare 17% mit dem Jahresplan.</p>
  <a href="{settings.FRONTEND_URL}/billing?plan={upgrade_plan}"
     style="display:inline-block;padding:14px 28px;background:rgba(123,47,255,0.2);border:1px solid rgba(123,47,255,0.5);border-radius:8px;color:#A78BFA;text-decoration:none;font-weight:700;font-size:15px">
    Jetzt auf {upgrade_plan.capitalize()} upgraden →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#475569">
    Neural Trading OS · <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>
    · <a href="{unsub_url}" style="color:#475569">E-Mails abbestellen</a>
  </p>
</div></body></html>"""
    text = (
        f"Hallo {user.username},\n\n"
        f"du nutzt Neural Trading OS aktiv. Mit dem {upgrade_plan.capitalize()}-Plan "
        f"hast du {upgrade_limit} Signale/Tag für nur €{upgrade_price}/Monat.\n\n"
        f"Upgrade: {settings.FRONTEND_URL}/billing?plan={upgrade_plan}\n\n"
        f"E-Mails abbestellen: {unsub_url}"
    )

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = user.email
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [user.email], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
        _upgrade_email_sent.add(key)
        return SendUpgradeEmailResponse(sent=True, message=f"E-Mail an {user.email} gesendet")
    except Exception as exc:
        logger.warning("upgrade_email_failed for %s: %s", username, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="E-Mail konnte nicht gesendet werden")


@router.post("/users/{username}/send-reengagement-email", response_model=SendUpgradeEmailResponse)
@limiter.limit("20/hour")
async def send_reengagement_email(
    request: Request,
    username: str,
    _: UserInfo = Depends(_require_admin),
) -> SendUpgradeEmailResponse:
    """Send a personalized re-engagement email to an inactive user (once per day)."""
    today_str = _date.today().isoformat()
    key = f"{username}:{today_str}"
    if key in _reengagement_sent:
        return SendUpgradeEmailResponse(sent=False, message="Bereits heute gesendet")

    async with get_session() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Benutzer '{username}' nicht gefunden")
    if not user.email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Keine E-Mail-Adresse hinterlegt")
    if _is_unsubscribed(username):
        return SendUpgradeEmailResponse(sent=False, message="Nutzer hat E-Mail-Benachrichtigungen abbestellt")

    unsub_url = _unsubscribe_url(username)

    if not settings.SMTP_HOST:
        logger.info("[DEV] Reengagement email would be sent to %s (%s)", username, user.email)
        _reengagement_sent.add(key)
        return SendUpgradeEmailResponse(sent=True, message="[DEV] E-Mail simuliert (kein SMTP konfiguriert)")

    sender = settings.SMTP_FROM or settings.SMTP_USER
    subject = "Deine KI-Signale warten — Neural Trading OS"
    html = (
        f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
        f'<div style="max-width:480px;margin:0 auto">'
        f'<h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} 👋</h2>'
        f'<p>Wir haben dich eine Weile nicht mehr gesehen. Dein kostenloser Free-Plan wartet auf dich:</p>'
        f'<div style="margin:16px 0;padding:16px;background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.2);border-radius:12px">'
        f'<ul style="margin:0;padding-left:20px;color:#94a3b8;line-height:1.8">'
        f'<li><strong style="color:#e2e8f0">3 KI-Signale täglich</strong> — kostenlos und dauerhaft</li>'
        f'<li>Claude Sonnet 4.6 Multi-Agenten-Konsens</li>'
        f'<li>Elliott-Wave-Analyse & Risiko-Dashboard</li>'
        f'</ul></div>'
        f'<a href="{settings.FRONTEND_URL}/signals" '
        f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
        f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
        f'Jetzt Signal generieren →</a>'
        f'<p style="margin-top:16px;color:#64748b;font-size:13px">'
        f'Entdecke auch den <a href="{settings.FRONTEND_URL}/performance" style="color:#A78BFA">KI-Performance-Track-Record</a>.</p>'
        f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
        f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
        f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
        f'</div></body></html>'
    )
    text = (
        f"Hallo {user.username},\n\n"
        f"Wir haben dich eine Weile nicht mehr gesehen. Dein Free-Plan wartet: 3 KI-Signale täglich, Elliott-Wave-Analyse.\n\n"
        f"Jetzt starten: {settings.FRONTEND_URL}/signals\n\n"
        f"E-Mails abbestellen: {unsub_url}"
    )

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = user.email
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [user.email], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
        _reengagement_sent.add(key)
        return SendUpgradeEmailResponse(sent=True, message=f"Re-Engagement-E-Mail an {user.email} gesendet")
    except Exception as exc:
        logger.warning("reengagement_email_failed for %s: %s", username, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="E-Mail konnte nicht gesendet werden")


@router.post("/bulk-upgrade-email", response_model=BulkUpgradeEmailResponse)
@limiter.limit("3/hour")
async def bulk_send_upgrade_emails(request: Request, _: UserInfo = Depends(_require_admin)) -> BulkUpgradeEmailResponse:
    """Send upgrade-nudge emails to all active free/basic users who haven't been contacted today."""
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_str = _date.today().isoformat()

    async with get_session() as session:
        # All upgrade-target users with email
        users_result = await session.execute(
            select(User).where(
                User.tier.in_(UPGRADE_TARGETS.keys()),
                User.is_active == True,
                User.email.isnot(None),
            )
        )
        candidates = users_result.scalars().all()

        # Filter to those who generated a signal today (active = high intent)
        signals_result = await session.execute(
            select(SignalRecord.user_id, func.count(SignalRecord.id))
            .where(SignalRecord.generated_at >= today_start)
            .group_by(SignalRecord.user_id)
        )
        active_today: set[str] = {uid for uid, _ in signals_result.all() if uid}

    # Only contact users active today, not yet emailed today, and not unsubscribed
    targets = [
        u for u in candidates
        if u.username in active_today
        and f"{u.username}:{today_str}" not in _upgrade_email_sent
        and not _is_unsubscribed(u.username)
    ]

    sent = skipped = failed = 0
    for user in targets:
        key = f"{user.username}:{today_str}"
        upgrade_plan = UPGRADE_TARGETS[user.tier]
        upgrade_limit = UPGRADE_LIMITS[upgrade_plan]
        upgrade_price = PLAN_PRICES[upgrade_plan]
        unsub_url = _unsubscribe_url(user.username)

        if not settings.SMTP_HOST:
            logger.info("[DEV] Bulk upgrade email would be sent to %s (%s)", user.username, user.email)
            _upgrade_email_sent.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Dein Trading-Setup kann mehr — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} 👋</h2>'
            f'<p>Du nutzt Neural Trading OS aktiv und hast heute bereits Signale generiert — das freut uns sehr.</p>'
            f'<p>Mit dem <strong style="color:#A78BFA">{upgrade_plan.capitalize()}-Plan</strong> holst du noch mehr heraus: '
            f'<strong>{upgrade_limit} Signale/Tag</strong> für nur <strong>€{upgrade_price}/Monat</strong>.</p>'
            f'<a href="{settings.FRONTEND_URL}/billing?plan={upgrade_plan}" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(123,47,255,0.2);border:1px solid rgba(123,47,255,0.5);'
            f'border-radius:8px;color:#A78BFA;text-decoration:none;font-weight:700;font-size:15px">'
            f'Jetzt auf {upgrade_plan.capitalize()} upgraden →</a>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username},\n\n"
            f"du hast heute Signale generiert. Mit dem {upgrade_plan.capitalize()}-Plan hast du "
            f"{upgrade_limit} Signale/Tag für €{upgrade_price}/Monat.\n\n"
            f"Upgrade: {settings.FRONTEND_URL}/billing?plan={upgrade_plan}\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send(u=user, h=html, t=text, s=sender, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send)
            _upgrade_email_sent.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("bulk_upgrade_email_failed for %s: %s", user.username, exc)
            failed += 1

    skipped = len(candidates) - len(targets)
    return BulkUpgradeEmailResponse(
        sent=sent,
        skipped=skipped,
        failed=failed,
        message=f"{sent} E-Mail(s) gesendet, {skipped} übersprungen (bereits heute oder inaktiv), {failed} Fehler",
    )


class BulkReengagementResponse(BaseModel):
    sent: int
    skipped: int
    failed: int
    message: str


# In-memory de-dup: "username:YYYY-MM-DD" → reengagement email sent today
_reengagement_sent: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)


@router.post("/bulk-reengagement-email", response_model=BulkReengagementResponse)
@limiter.limit("3/hour")
async def bulk_reengagement_emails(request: Request, _: UserInfo = Depends(_require_admin)) -> BulkReengagementResponse:
    """Re-engagement emails to free users who registered >1 day ago but haven't generated any signal in 7 days."""
    today_str = _date.today().isoformat()
    cutoff_registered = datetime.now(UTC) - timedelta(days=1)
    cutoff_active = datetime.now(UTC) - timedelta(days=7)

    async with get_session() as session:
        # Free/basic users with email, active, registered >1 day ago
        users_result = await session.execute(
            select(User).where(
                User.tier.in_(["free", "basic"]),
                User.is_active == True,
                User.email.isnot(None),
                User.created_at < cutoff_registered,
            )
        )
        candidates = users_result.scalars().all()

        # Users who generated a signal in the last 7 days
        active_result = await session.execute(
            select(SignalRecord.user_id)
            .where(SignalRecord.generated_at >= cutoff_active)
            .where(SignalRecord.user_id.isnot(None))
            .distinct()
        )
        recently_active: set[str] = {row[0] for row in active_result.all()}

    # Target: registered but inactive recently, not unsubscribed, not emailed today
    targets = [
        u for u in candidates
        if u.username not in recently_active
        and f"{u.username}:{today_str}" not in _reengagement_sent
        and not _is_unsubscribed(u.username)
    ]

    sent = skipped = failed = 0
    for user in targets:
        key = f"{user.username}:{today_str}"
        unsub_url = _unsubscribe_url(user.username)

        if not settings.SMTP_HOST:
            logger.info("[DEV] Reengagement email would be sent to %s (%s)", user.username, user.email)
            _reengagement_sent.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Deine KI-Signale warten — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} 👋</h2>'
            f'<p>Du hast Neural Trading OS registriert — aber wir haben dich schon eine Weile nicht mehr gesehen.</p>'
            f'<p>Dein kostenloser Free-Plan wartet auf dich: <strong>3 KI-Signale täglich</strong>, '
            f'Elliott-Wave-Analyse und Multi-Agent-Konsens. Keine Kreditkarte nötig.</p>'
            f'<a href="{settings.FRONTEND_URL}/signals" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
            f'Jetzt Signal generieren →</a>'
            f'<p style="margin-top:16px;color:#64748b;font-size:13px">'
            f'Oder entdecke den <a href="{settings.FRONTEND_URL}/signals/marketplace" style="color:#A78BFA">Signal-Marktplatz</a> '
            f'und die <a href="{settings.FRONTEND_URL}/performance" style="color:#A78BFA">KI-Performance-Seite</a>.</p>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username},\n\n"
            f"Dein kostenloser Free-Plan wartet: 3 KI-Signale täglich, Elliott-Wave-Analyse.\n\n"
            f"Jetzt starten: {settings.FRONTEND_URL}/signals\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send(u=user, h=html, t=text, s=sender, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send)
            _reengagement_sent.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("reengagement_email_failed for %s: %s", user.username, exc)
            failed += 1

    skipped = len(candidates) - len(targets)
    return BulkReengagementResponse(
        sent=sent,
        skipped=skipped,
        failed=failed,
        message=f"{sent} E-Mail(s) gesendet, {skipped} übersprungen (aktiv/abgemeldet/bereits heute), {failed} Fehler",
    )


class WaitlistInviteResponse(BaseModel):
    sent: int
    skipped: int
    failed: int
    message: str


@router.post("/invite-waitlist", response_model=WaitlistInviteResponse)
@limiter.limit("2/hour")
async def invite_waitlist(request: Request, _: UserInfo = Depends(_require_admin)) -> WaitlistInviteResponse:
    """Send registration invitations to all waitlisted emails that are not yet registered."""
    today_str = _date.today().isoformat()

    async with get_session() as session:
        waitlist_result = await session.execute(
            select(WaitlistEntry).order_by(WaitlistEntry.joined_at.asc())
        )
        entries = waitlist_result.scalars().all()

        # Collect all registered user emails
        users_result = await session.execute(select(User.email).where(User.email.isnot(None)))
        registered_emails: set[str] = {row[0].lower() for row in users_result.all() if row[0]}

    sent = skipped = failed = 0
    for entry in entries:
        key = f"{entry.email}:{today_str}"
        if entry.email.lower() in registered_emails:
            skipped += 1
            continue
        if key in _waitlist_invited:
            skipped += 1
            continue

        register_url = f"{settings.FRONTEND_URL}/register"

        if not settings.SMTP_HOST:
            logger.info("[DEV] Waitlist invite would be sent to %s", entry.email)
            _waitlist_invited.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Dein Zugang zu Neural Trading OS ist bereit 🚀"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Es kann losgehen! 🚀</h2>'
            f'<p>Du stehst auf unserer Warteliste — und dein Zugang zu <strong>Neural Trading OS</strong> ist jetzt freigeschaltet.</p>'
            f'<p>Dein kostenloser Free Plan enthält:</p>'
            f'<div style="margin:16px 0;padding:16px;background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.2);border-radius:12px">'
            f'<ul style="margin:0;padding-left:20px;color:#94a3b8;line-height:1.8">'
            f'<li><strong style="color:#e2e8f0">3 KI-Handelssignale täglich</strong> — kostenlos und dauerhaft</li>'
            f'<li>Claude Sonnet 4.6 Multi-Agenten-Konsens</li>'
            f'<li>Paper Trading, Portfolio-Tracking, Elliott-Wave-Analyse</li>'
            f'<li>Keine Kreditkarte erforderlich</li>'
            f'</ul></div>'
            f'<a href="{register_url}" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.2);border:1px solid rgba(0,212,255,0.5);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
            f'Jetzt kostenlos registrieren →</a>'
            f'<p style="margin-top:16px;color:#64748b;font-size:13px">'
            f'Upgrade auf Basic (€29/Monat) oder Pro (€99/Monat) für mehr Signale jederzeit möglich.</p>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">'
            f'Du erhältst diese E-Mail, weil du dich auf der Neural Trading OS Warteliste eingetragen hast. '
            f'Neural Trading OS · <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Es kann losgehen!\n\n"
            f"Dein Zugang zu Neural Trading OS ist jetzt freigeschaltet.\n\n"
            f"Kostenlos registrieren: {register_url}\n\n"
            f"Free Plan: 3 KI-Signale täglich, Paper Trading, Elliott-Wave-Analyse.\n\n"
            f"Du erhältst diese E-Mail, weil du dich auf der Warteliste eingetragen hast."
        )

        def _send(e=entry, h=html, t=text, s=sender) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = s
            msg["To"] = e.email
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [e.email], msg.as_string())

        try:
            await asyncio.to_thread(_send)
            _waitlist_invited.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("waitlist_invite_failed for %s: %s", entry.email, exc)
            failed += 1

    return WaitlistInviteResponse(
        sent=sent,
        skipped=skipped,
        failed=failed,
        message=f"{sent} Einladung(en) gesendet, {skipped} übersprungen (bereits registriert oder heute gesendet), {failed} Fehler",
    )


class WeeklyDigestResponse(BaseModel):
    sent: int
    skipped: int
    failed: int
    message: str


# In-memory de-dup: "username:YYYY-WW" → weekly digest sent this calendar week
_weekly_digest_sent: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)


@router.post("/send-weekly-digest", response_model=WeeklyDigestResponse)
@limiter.limit("2/hour")
async def send_weekly_digest(request: Request, _: UserInfo = Depends(_require_admin)) -> WeeklyDigestResponse:
    """Send personalized weekly performance digest to all active users with email."""
    from datetime import date as _date_class
    week_key = _date_class.today().strftime("%Y-W%V")  # ISO week
    cutoff = datetime.now(UTC) - timedelta(days=7)

    async with get_session() as session:
        users_result = await session.execute(
            select(User).where(
                User.is_active == True,
                User.email.isnot(None),
            )
        )
        all_users = users_result.scalars().all()

        # Last 7 days signals per user: count + avg confidence
        signals_result = await session.execute(
            select(
                SignalRecord.user_id,
                func.count(SignalRecord.id).label("cnt"),
                func.avg(SignalRecord.confidence).label("avg_conf"),
            )
            .where(
                SignalRecord.generated_at >= cutoff,
                SignalRecord.user_id.isnot(None),
            )
            .group_by(SignalRecord.user_id)
        )
        stats_map: dict[str, tuple[int, float]] = {
            uid: (int(cnt), float(avg_conf or 0))
            for uid, cnt, avg_conf in signals_result.all()
            if uid
        }

        # All-time performance per user (join SignalPerformance ↔ SignalRecord)
        perf_result = await session.execute(
            select(
                SignalRecord.user_id,
                func.count(SignalPerformance.id).label("total"),
                func.avg(SignalPerformance.return_pct).label("avg_return"),
                func.sum(
                    case((SignalPerformance.return_pct > 0, 1), else_=0)
                ).label("wins"),
            )
            .select_from(SignalPerformance)
            .join(SignalRecord, SignalPerformance.signal_id == SignalRecord.id)
            .where(SignalRecord.user_id.isnot(None))
            .group_by(SignalRecord.user_id)
        )
        perf_map: dict[str, dict] = {}
        for uid, total, avg_ret, wins in perf_result.all():
            if uid and total:
                t = int(total)
                perf_map[uid] = {
                    "total": t,
                    "win_rate": int(wins or 0) / t,
                    "avg_return": float(avg_ret or 0),
                }

    sent = skipped = failed = 0
    for user in all_users:
        key = f"{user.username}:{week_key}"
        if key in _weekly_digest_sent:
            skipped += 1
            continue
        if _is_unsubscribed(user.username):
            skipped += 1
            continue

        sig_count, avg_conf = stats_map.get(user.username, (0, 0.0))
        perf_data = perf_map.get(user.username)
        unsub_url = _unsubscribe_url(user.username)
        upgrade_hint = ""
        if user.tier in UPGRADE_TARGETS:
            up = UPGRADE_TARGETS[user.tier]
            upgrade_hint = (
                f'<p style="margin-top:16px;color:#64748b;font-size:13px">Auf <strong style="color:#A78BFA">'
                f'{up.capitalize()}</strong> upgraden für mehr Signale pro Tag. '
                f'<a href="{settings.FRONTEND_URL}/billing?plan={up}" style="color:#A78BFA">Jetzt upgraden →</a></p>'
            )

        # Build optional performance section for users with evaluated signals
        perf_rows_html = ""
        perf_text_lines = ""
        if perf_data and perf_data["total"] > 0:
            win_pct = round(perf_data["win_rate"] * 100, 1)
            avg_ret = round(perf_data["avg_return"] * 100, 2)
            avg_sign = "+" if avg_ret >= 0 else ""
            win_color = "#00FF88" if win_pct >= 50 else "#F59E0B"
            ret_color = "#00D4FF" if avg_ret >= 0 else "#ef4444"
            perf_rows_html = (
                f'<tr><td colspan="2" style="padding:8px 0 4px 0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Deine KI-Performance</td></tr>'
                f'<tr><td style="color:#94a3b8;padding:4px 0">Trefferquote</td>'
                f'<td style="text-align:right;font-weight:700;color:{win_color}">{win_pct}%</td></tr>'
                f'<tr><td style="color:#94a3b8;padding:4px 0">Ø Rendite</td>'
                f'<td style="text-align:right;font-weight:700;color:{ret_color}">{avg_sign}{avg_ret}%</td></tr>'
                f'<tr><td style="color:#94a3b8;padding:4px 0">Ausgewertete Signale</td>'
                f'<td style="text-align:right;font-weight:700;color:#e2e8f0">{perf_data["total"]}</td></tr>'
            )
            perf_text_lines = (
                f"\nDeine KI-Performance (gesamt):\n"
                f"Trefferquote: {win_pct}%\n"
                f"Ø Rendite: {avg_sign}{avg_ret}%\n"
                f"Ausgewertet: {perf_data['total']} Signale\n"
            )

        if not settings.SMTP_HOST:
            logger.info("[DEV] Weekly digest would be sent to %s (%s) sigs=%d", user.username, user.email, sig_count)
            _weekly_digest_sent.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Dein Wochenrückblick — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Dein Wochenrückblick 📊</h2>'
            f'<p>Hallo {user.username} — hier ist deine Zusammenfassung der letzten 7 Tage:</p>'
            f'<div style="margin:20px 0;padding:20px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.15);border-radius:12px">'
            f'<table style="width:100%;border-collapse:collapse">'
            f'<tr><td style="color:#94a3b8;padding:6px 0">Signale generiert</td>'
            f'<td style="text-align:right;font-weight:700;color:#e2e8f0">{sig_count}</td></tr>'
            f'<tr><td style="color:#94a3b8;padding:6px 0">Ø Konfidenz</td>'
            f'<td style="text-align:right;font-weight:700;color:#{"00D4FF" if avg_conf >= 70 else "F59E0B" if avg_conf >= 50 else "64748b"}">'
            f'{"—" if sig_count == 0 else f"{avg_conf:.0f}%"}</td></tr>'
            f'<tr><td style="color:#94a3b8;padding:6px 0">Plan</td>'
            f'<td style="text-align:right;font-weight:700;color:#A78BFA">{user.tier.capitalize()}</td></tr>'
            f'{perf_rows_html}'
            f'</table></div>'
            f'{"<p style=\'color:#64748b;font-size:13px\'>In der letzten Woche noch keine Signale — jetzt starten!</p>" if sig_count == 0 else ""}'
            f'<a href="{settings.FRONTEND_URL}/signals" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
            f'{"Jetzt Signal generieren →" if sig_count == 0 else "Zur Signal-Übersicht →"}</a>'
            f'{upgrade_hint}'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/performance" style="color:#475569">KI-Performance</a>'
            f' · <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username}, dein Wochenrückblick:\n\n"
            f"Signale letzte 7 Tage: {sig_count}\n"
            f"Ø Konfidenz: {'—' if sig_count == 0 else f'{avg_conf:.0f}%'}\n"
            f"Plan: {user.tier.capitalize()}\n"
            f"{perf_text_lines}"
            f"\nZur Signal-Übersicht: {settings.FRONTEND_URL}/signals\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send(u=user, h=html, t=text, s=sender, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send)
            _weekly_digest_sent.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("weekly_digest_failed for %s: %s", user.username, exc)
            failed += 1

    return WeeklyDigestResponse(
        sent=sent,
        skipped=skipped,
        failed=failed,
        message=f"{sent} Wochendigest(s) gesendet, {skipped} übersprungen (abgemeldet/bereits diese Woche), {failed} Fehler",
    )


class TriggerMorningBriefingsResponse(BaseModel):
    triggered: bool
    message: str


@router.post("/trigger-morning-briefings", response_model=TriggerMorningBriefingsResponse)
@limiter.limit("2/hour")
async def trigger_morning_briefings(request: Request, _: UserInfo = Depends(_require_admin)) -> TriggerMorningBriefingsResponse:
    """Manually trigger Telegram morning briefings for all registered chats."""
    try:
        from app.api.routes.telegram import send_morning_briefings
        await send_morning_briefings()
        return TriggerMorningBriefingsResponse(triggered=True, message="Morgen-Briefings erfolgreich ausgelöst")
    except Exception as exc:
        logger.warning("trigger_morning_briefings_failed reason=%s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Fehler: {exc}")


_ADMIN_SIGNAL_WATCHLIST = [
    "AAPL", "NVDA", "MSFT", "TSLA", "META", "AMD",
    "GOOGL", "AMZN", "BTC-USD", "ETH-USD", "SPY", "QQQ",
]


class TriggerJobResponse(BaseModel):
    sent: int
    skipped: int
    failed: int
    message: str


@router.post("/trigger-activation-followup", response_model=TriggerJobResponse)
@limiter.limit("2/hour")
async def trigger_activation_followup(request: Request, _: UserInfo = Depends(_require_admin)) -> TriggerJobResponse:
    """Manually trigger activation follow-up emails (users registered 24-48h ago, no first signal yet)."""
    try:
        sent, skipped, failed = await run_activation_followup_job()
        return TriggerJobResponse(
            sent=sent, skipped=skipped, failed=failed,
            message=f"{sent} Aktivierungs-Follow-up(s) gesendet, {skipped} übersprungen, {failed} Fehler",
        )
    except Exception as exc:
        logger.warning("trigger_activation_followup_failed reason=%s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Fehler: {exc}")


@router.post("/trigger-daily-signal-email", response_model=TriggerJobResponse)
@limiter.limit("2/hour")
async def trigger_daily_signal_email(request: Request, _: UserInfo = Depends(_require_admin)) -> TriggerJobResponse:
    """Manually trigger daily signal notification emails to all active subscribed users."""
    try:
        sent, skipped, failed = await run_daily_signal_email_notification_job(_ADMIN_SIGNAL_WATCHLIST)
        return TriggerJobResponse(
            sent=sent, skipped=skipped, failed=failed,
            message=f"{sent} Signal-Benachrichtigung(en) gesendet, {skipped} übersprungen, {failed} Fehler",
        )
    except Exception as exc:
        logger.warning("trigger_daily_signal_email_failed reason=%s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Fehler: {exc}")


class SmtpTestResponse(BaseModel):
    sent: bool
    message: str
    smtp_host: str
    smtp_configured: bool


@router.post("/test-smtp", response_model=SmtpTestResponse)
@limiter.limit("5/hour")
async def test_smtp(
    request: Request,
    to: str,
    _: UserInfo = Depends(_require_admin),
) -> SmtpTestResponse:
    """
    Send a test email to verify SMTP configuration.
    If SMTP is not configured, returns smtp_configured=False without error.
    """
    if not settings.SMTP_HOST:
        return SmtpTestResponse(
            sent=False,
            message="SMTP nicht konfiguriert (SMTP_HOST fehlt in .env).",
            smtp_host="",
            smtp_configured=False,
        )

    sender = settings.SMTP_FROM or settings.SMTP_USER
    html = (
        '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
        '<div style="max-width:480px;margin:0 auto">'
        '<h2 style="color:#00D4FF">SMTP Test — Neural Trading OS</h2>'
        '<p>Diese E-Mail bestätigt, dass deine SMTP-Konfiguration korrekt ist.</p>'
        '<p style="color:#64748b;font-size:12px">Neural Trading OS · Admin SMTP-Test</p>'
        '</div></body></html>'
    )

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "SMTP Test — Neural Trading OS"
        msg["From"] = sender
        msg["To"] = to
        msg.attach(MIMEText("SMTP Test — Neural Trading OS: Konfiguration erfolgreich.", "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send)
        logger.info("admin_smtp_test_sent to=%s", to)
        return SmtpTestResponse(
            sent=True,
            message=f"Test-E-Mail an {to} gesendet.",
            smtp_host=settings.SMTP_HOST,
            smtp_configured=True,
        )
    except Exception as exc:
        logger.warning("admin_smtp_test_failed to=%s error=%s", to, exc)
        return SmtpTestResponse(
            sent=False,
            message=f"Fehler: {exc}",
            smtp_host=settings.SMTP_HOST,
            smtp_configured=True,
        )


async def run_bulk_upgrade_emails_job() -> tuple[int, int, int]:
    """Background job called by _auto_upgrade_nudge_loop at 17:00 UTC. Returns (sent, skipped, failed)."""
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_str = _date.today().isoformat()

    async with get_session() as session:
        users_result = await session.execute(
            select(User).where(
                User.tier.in_(UPGRADE_TARGETS.keys()),
                User.is_active == True,  # noqa: E712
                User.email.isnot(None),
            )
        )
        candidates = users_result.scalars().all()
        signals_result = await session.execute(
            select(SignalRecord.user_id)
            .where(SignalRecord.generated_at >= today_start)
            .distinct()
        )
        active_today: set[str] = {r[0] for r in signals_result.all() if r[0]}

    targets = [
        u for u in candidates
        if u.username in active_today
        and f"{u.username}:{today_str}" not in _upgrade_email_sent
        and not _is_unsubscribed(u.username)
    ]

    sent = failed = 0
    for user in targets:
        key = f"{user.username}:{today_str}"
        upgrade_plan = UPGRADE_TARGETS[user.tier]
        upgrade_limit = UPGRADE_LIMITS[upgrade_plan]
        upgrade_price = PLAN_PRICES[upgrade_plan]
        unsub_url = _unsubscribe_url(user.username)

        if not settings.SMTP_HOST:
            logger.info("[DEV] auto_upgrade_nudge would send to %s (%s)", user.username, user.email)
            _upgrade_email_sent.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Dein Trading-Setup kann mehr — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} \U0001f44b</h2>'
            f'<p>Du nutzt Neural Trading OS aktiv und hast heute bereits Signale generiert — das freut uns sehr.</p>'
            f'<p>Mit dem <strong style="color:#A78BFA">{upgrade_plan.capitalize()}-Plan</strong> holst du noch mehr heraus: '
            f'<strong>{upgrade_limit} Signale/Tag</strong> für nur <strong>€{upgrade_price}/Monat</strong>.</p>'
            f'<a href="{settings.FRONTEND_URL}/billing?plan={upgrade_plan}" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(123,47,255,0.2);border:1px solid rgba(123,47,255,0.5);'
            f'border-radius:8px;color:#A78BFA;text-decoration:none;font-weight:700;font-size:15px">'
            f'Jetzt auf {upgrade_plan.capitalize()} upgraden →</a>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username},\n\n"
            f"du hast heute Signale generiert. Mit dem {upgrade_plan.capitalize()}-Plan hast du "
            f"{upgrade_limit} Signale/Tag für €{upgrade_price}/Monat.\n\n"
            f"Upgrade: {settings.FRONTEND_URL}/billing?plan={upgrade_plan}\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send_upgrade(u=user, h=html, t=text, s=sender, subj=subject, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subj
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send_upgrade)
            _upgrade_email_sent.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("auto_upgrade_email_failed for %s: %s", user.username, exc)
            failed += 1

    return sent, len(candidates) - len(targets), failed


async def run_bulk_reengagement_emails_job() -> tuple[int, int, int]:
    """Background job called by _auto_reengagement_loop at 09:00 UTC. Returns (sent, skipped, failed)."""
    today_str = _date.today().isoformat()
    cutoff_registered = datetime.now(UTC) - timedelta(days=1)
    cutoff_active = datetime.now(UTC) - timedelta(days=7)

    async with get_session() as session:
        users_result = await session.execute(
            select(User).where(
                User.tier.in_(["free", "basic"]),
                User.is_active == True,  # noqa: E712
                User.email.isnot(None),
                User.created_at < cutoff_registered,
            )
        )
        candidates = users_result.scalars().all()
        active_result = await session.execute(
            select(SignalRecord.user_id)
            .where(SignalRecord.generated_at >= cutoff_active, SignalRecord.user_id.isnot(None))
            .distinct()
        )
        recently_active: set[str] = {row[0] for row in active_result.all()}

    targets = [
        u for u in candidates
        if u.username not in recently_active
        and f"{u.username}:{today_str}" not in _reengagement_sent
        and not _is_unsubscribed(u.username)
    ]

    sent = failed = 0
    for user in targets:
        key = f"{user.username}:{today_str}"
        unsub_url = _unsubscribe_url(user.username)

        if not settings.SMTP_HOST:
            logger.info("[DEV] auto_reengagement would send to %s (%s)", user.username, user.email)
            _reengagement_sent.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Deine KI-Signale warten — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} \U0001f44b</h2>'
            f'<p>Du hast Neural Trading OS registriert — aber wir haben dich schon eine Weile nicht mehr gesehen.</p>'
            f'<p>Dein kostenloser Free-Plan wartet auf dich: <strong>3 KI-Signale täglich</strong>, '
            f'Elliott-Wave-Analyse und Multi-Agent-Konsens. Keine Kreditkarte nötig.</p>'
            f'<a href="{settings.FRONTEND_URL}/signals" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
            f'Jetzt Signal generieren →</a>'
            f'<p style="margin-top:16px;color:#64748b;font-size:13px">'
            f'Oder entdecke den <a href="{settings.FRONTEND_URL}/signals/marketplace" style="color:#A78BFA">Signal-Marktplatz</a>.</p>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username},\n\n"
            f"Dein kostenloser Free-Plan wartet: 3 KI-Signale täglich, Elliott-Wave-Analyse.\n\n"
            f"Jetzt starten: {settings.FRONTEND_URL}/signals\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send_reengagement(u=user, h=html, t=text, s=sender, subj=subject, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subj
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send_reengagement)
            _reengagement_sent.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("auto_reengagement_email_failed for %s: %s", user.username, exc)
            failed += 1

    return sent, len(candidates) - len(targets), failed


async def run_weekly_digest_job() -> tuple[int, int, int]:
    """Background job called by _auto_weekly_digest_loop on Mondays at 08:00 UTC. Returns (sent, skipped, failed)."""
    from datetime import date as _date_class
    week_key = _date_class.today().strftime("%Y-W%V")
    cutoff = datetime.now(UTC) - timedelta(days=7)

    async with get_session() as session:
        users_result = await session.execute(
            select(User).where(User.is_active == True, User.email.isnot(None))  # noqa: E712
        )
        all_users = users_result.scalars().all()

        signals_result = await session.execute(
            select(
                SignalRecord.user_id,
                func.count(SignalRecord.id).label("cnt"),
                func.avg(SignalRecord.confidence).label("avg_conf"),
            )
            .where(SignalRecord.generated_at >= cutoff, SignalRecord.user_id.isnot(None))
            .group_by(SignalRecord.user_id)
        )
        stats_map: dict[str, tuple[int, float]] = {
            uid: (int(cnt), float(avg_conf or 0))
            for uid, cnt, avg_conf in signals_result.all()
            if uid
        }

        perf_result = await session.execute(
            select(
                SignalRecord.user_id,
                func.count(SignalPerformance.id).label("total"),
                func.avg(SignalPerformance.return_pct).label("avg_return"),
                func.sum(case((SignalPerformance.return_pct > 0, 1), else_=0)).label("wins"),
            )
            .select_from(SignalPerformance)
            .join(SignalRecord, SignalPerformance.signal_id == SignalRecord.id)
            .where(SignalRecord.user_id.isnot(None))
            .group_by(SignalRecord.user_id)
        )
        perf_map: dict[str, dict] = {}
        for uid, total, avg_ret, wins in perf_result.all():
            if uid and total:
                t = int(total)
                perf_map[uid] = {
                    "total": t,
                    "win_rate": int(wins or 0) / t,
                    "avg_return": float(avg_ret or 0),
                }

    sent = skipped = failed = 0
    for user in all_users:
        key = f"{user.username}:{week_key}"
        if key in _weekly_digest_sent or _is_unsubscribed(user.username):
            skipped += 1
            continue

        sig_count, avg_conf = stats_map.get(user.username, (0, 0.0))
        perf_data = perf_map.get(user.username)
        unsub_url = _unsubscribe_url(user.username)
        upgrade_hint = ""
        if user.tier in UPGRADE_TARGETS:
            up = UPGRADE_TARGETS[user.tier]
            upgrade_hint = (
                f'<p style="margin-top:16px;color:#64748b;font-size:13px">Auf <strong style="color:#A78BFA">'
                f'{up.capitalize()}</strong> upgraden für mehr Signale pro Tag. '
                f'<a href="{settings.FRONTEND_URL}/billing?plan={up}" style="color:#A78BFA">Jetzt upgraden →</a></p>'
            )

        perf_rows_html = ""
        perf_text_lines = ""
        if perf_data and perf_data["total"] > 0:
            win_pct = round(perf_data["win_rate"] * 100, 1)
            avg_ret = round(perf_data["avg_return"] * 100, 2)
            avg_sign = "+" if avg_ret >= 0 else ""
            win_color = "#00FF88" if win_pct >= 50 else "#F59E0B"
            ret_color = "#00D4FF" if avg_ret >= 0 else "#ef4444"
            perf_rows_html = (
                f'<tr><td colspan="2" style="padding:8px 0 4px 0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Deine KI-Performance</td></tr>'
                f'<tr><td style="color:#94a3b8;padding:4px 0">Trefferquote</td>'
                f'<td style="text-align:right;font-weight:700;color:{win_color}">{win_pct}%</td></tr>'
                f'<tr><td style="color:#94a3b8;padding:4px 0">Ø Rendite</td>'
                f'<td style="text-align:right;font-weight:700;color:{ret_color}">{avg_sign}{avg_ret}%</td></tr>'
                f'<tr><td style="color:#94a3b8;padding:4px 0">Ausgewertete Signale</td>'
                f'<td style="text-align:right;font-weight:700;color:#e2e8f0">{perf_data["total"]}</td></tr>'
            )
            perf_text_lines = (
                f"\nDeine KI-Performance (gesamt):\n"
                f"Trefferquote: {win_pct}%\n"
                f"Ø Rendite: {avg_sign}{avg_ret}%\n"
                f"Ausgewertet: {perf_data['total']} Signale\n"
            )

        if not settings.SMTP_HOST:
            logger.info("[DEV] auto_weekly_digest would send to %s (%s) sigs=%d", user.username, user.email, sig_count)
            _weekly_digest_sent.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Dein Wochenrückblick — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Dein Wochenrückblick \U0001f4ca</h2>'
            f'<p>Hallo {user.username} — hier ist deine Zusammenfassung der letzten 7 Tage:</p>'
            f'<div style="margin:20px 0;padding:20px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.15);border-radius:12px">'
            f'<table style="width:100%;border-collapse:collapse">'
            f'<tr><td style="color:#94a3b8;padding:6px 0">Signale generiert</td>'
            f'<td style="text-align:right;font-weight:700;color:#e2e8f0">{sig_count}</td></tr>'
            f'<tr><td style="color:#94a3b8;padding:6px 0">Ø Konfidenz</td>'
            f'<td style="text-align:right;font-weight:700;color:#{"00D4FF" if avg_conf >= 70 else "F59E0B" if avg_conf >= 50 else "64748b"}">'
            f'{"—" if sig_count == 0 else f"{avg_conf:.0f}%"}</td></tr>'
            f'<tr><td style="color:#94a3b8;padding:6px 0">Plan</td>'
            f'<td style="text-align:right;font-weight:700;color:#A78BFA">{user.tier.capitalize()}</td></tr>'
            f'{perf_rows_html}'
            f'</table></div>'
            f'{"<p style=\'color:#64748b;font-size:13px\'>In der letzten Woche noch keine Signale — jetzt starten!</p>" if sig_count == 0 else ""}'
            f'<a href="{settings.FRONTEND_URL}/signals" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
            f'{"Jetzt Signal generieren →" if sig_count == 0 else "Zur Signal-Übersicht →"}</a>'
            f'{upgrade_hint}'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/performance" style="color:#475569">KI-Performance</a>'
            f' · <a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username}, dein Wochenrückblick:\n\n"
            f"Signale letzte 7 Tage: {sig_count}\n"
            f"Ø Konfidenz: {'—' if sig_count == 0 else f'{avg_conf:.0f}%'}\n"
            f"Plan: {user.tier.capitalize()}\n"
            f"{perf_text_lines}"
            f"\nZur Signal-Übersicht: {settings.FRONTEND_URL}/signals\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send_digest(u=user, h=html, t=text, s=sender, subj=subject, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subj
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send_digest)
            _weekly_digest_sent.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("auto_weekly_digest_failed for %s: %s", user.username, exc)
            failed += 1

    return sent, skipped, failed


_DIR_LABEL: dict[str, str] = {
    "BUY": "KAUFEN",
    "STRONG_BUY": "STARK KAUFEN",
    "SELL": "VERKAUFEN",
    "STRONG_SELL": "STARK VERKAUFEN",
    "HOLD": "HALTEN",
}
_DIR_EMOJI: dict[str, str] = {
    "BUY": "📈",
    "STRONG_BUY": "🚀",
    "SELL": "📉",
    "STRONG_SELL": "⚠️",
    "HOLD": "⏸️",
}


async def run_daily_signal_email_notification_job(tickers: list[str]) -> tuple[int, int, int]:
    """
    Called by _daily_signal_loop after successful signal generation.
    Sends 'Neue KI-Signale verfügbar' push email to all active subscribed users.
    Returns (sent, skipped, failed).
    """
    from datetime import date as _date_class
    today_str = _date_class.today().isoformat()
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    # Fetch today's freshly generated signals for the watchlist tickers
    async with get_session() as session:
        users_result = await session.execute(
            select(User).where(User.is_active == True, User.email.isnot(None))  # noqa: E712
        )
        all_users = users_result.scalars().all()

        signals_result = await session.execute(
            select(SignalRecord.ticker, SignalRecord.direction, SignalRecord.confidence, SignalRecord.id)
            .where(
                SignalRecord.generated_at >= today_start,
                SignalRecord.ticker.in_(tickers),
                SignalRecord.user_id.is_(None),  # platform signals only (no user_id)
            )
            .order_by(SignalRecord.confidence.desc())
            .limit(6)
        )
        todays_signals = signals_result.all()

    if not todays_signals:
        logger.info("daily_signal_notification_skipped no_platform_signals_found")
        return 0, len(all_users), 0

    # Build signal rows for email
    sig_rows_html = ""
    sig_rows_text = ""
    for ticker, direction, confidence, sig_id in todays_signals:
        emoji = _DIR_EMOJI.get(direction, "📊")
        label = _DIR_LABEL.get(direction, direction)
        conf_str = f"{round(confidence * 100)}%" if confidence is not None else "—"
        conf_color = "#00FF88" if confidence and confidence >= 0.75 else "#F59E0B" if confidence and confidence >= 0.5 else "#64748b"
        sig_rows_html += (
            f'<tr>'
            f'<td style="padding:8px 12px;color:#e2e8f0;font-weight:700">{emoji} {ticker}</td>'
            f'<td style="padding:8px 12px;color:#A78BFA">{label}</td>'
            f'<td style="padding:8px 12px;text-align:right;font-weight:700;color:{conf_color}">{conf_str}</td>'
            f'<td style="padding:8px 12px;text-align:right">'
            f'<a href="{settings.FRONTEND_URL}/signals/view/{sig_id}" style="color:#00D4FF;font-size:12px">Details →</a>'
            f'</td>'
            f'</tr>'
        )
        sig_rows_text += f"  {emoji} {ticker}: {label} ({conf_str})\n"

    sent = failed = 0
    skipped = 0
    for user in all_users:
        key = f"{user.username}:{today_str}"
        if key in _daily_signal_notified or _is_unsubscribed(user.username):
            skipped += 1
            continue

        unsub_url = _unsubscribe_url(user.username)

        if not settings.SMTP_HOST:
            logger.info("[DEV] daily_signal_notification would send to %s", user.username)
            _daily_signal_notified.add(key)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = f"Neue KI-Signale: {', '.join(t for t, *_ in todays_signals[:3])} — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:520px;margin:0 auto">'
            f'<p style="color:#00D4FF;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">Tagesbericht</p>'
            f'<h2 style="color:#e2e8f0;margin-bottom:4px">Neue KI-Signale verfügbar \U0001f4e1</h2>'
            f'<p style="color:#64748b;margin-top:0">Hallo {user.username} — {len(todays_signals)} Signale wurden heute analysiert:</p>'
            f'<div style="margin:16px 0;border:1px solid rgba(0,212,255,0.15);border-radius:10px;overflow:hidden">'
            f'<table style="width:100%;border-collapse:collapse;background:rgba(0,212,255,0.03)">'
            f'{sig_rows_html}'
            f'</table></div>'
            f'<a href="{settings.FRONTEND_URL}/signals" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px;margin-right:12px">'
            f'Eigenes Signal generieren →</a>'
            f'<a href="{settings.FRONTEND_URL}/signals/marketplace" '
            f'style="display:inline-block;padding:14px 20px;background:transparent;border:1px solid rgba(148,163,184,0.2);'
            f'border-radius:8px;color:#94a3b8;text-decoration:none;font-size:14px">'
            f'Marktplatz</a>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Neue KI-Signale für {user.username}:\n\n"
            f"{sig_rows_text}\n"
            f"Eigenes Signal generieren: {settings.FRONTEND_URL}/signals\n"
            f"Marktplatz: {settings.FRONTEND_URL}/signals/marketplace\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send_notif(u=user, h=html, t=text, s=sender, subj=subject, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subj
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send_notif)
            _daily_signal_notified.add(key)
            sent += 1
        except Exception as exc:
            logger.warning("daily_signal_notification_failed for %s: %s", user.username, exc)
            failed += 1

    return sent, skipped, failed


async def run_activation_followup_job() -> tuple[int, int, int]:
    """
    Daily at 10:00 UTC: send activation follow-up to users who registered 24-48h ago
    but have NOT generated any signal yet. One-time per user (no date key in dedup).
    Returns (sent, skipped, failed).
    """
    now = datetime.now(UTC)
    window_start = now - timedelta(hours=48)
    window_end = now - timedelta(hours=24)

    async with get_session() as session:
        # Users registered in the 24-48h window, still active, with email
        users_result = await session.execute(
            select(User).where(
                User.is_active == True,  # noqa: E712
                User.email.isnot(None),
                User.created_at >= window_start,
                User.created_at < window_end,
            )
        )
        candidates = users_result.scalars().all()

        # Users who have generated at least one signal
        if candidates:
            usernames = [u.username for u in candidates]
            activated_result = await session.execute(
                select(SignalRecord.user_id)
                .where(SignalRecord.user_id.in_(usernames))
                .distinct()
            )
            activated: set[str] = {row[0] for row in activated_result.all() if row[0]}
        else:
            activated = set()

    targets = [
        u for u in candidates
        if u.username not in activated
        and u.username not in _activation_followup_sent
        and not _is_unsubscribed(u.username)
    ]

    sent = failed = 0
    skipped = len(candidates) - len(targets)
    for user in targets:
        unsub_url = _unsubscribe_url(user.username)

        if not settings.SMTP_HOST:
            logger.info("[DEV] activation_followup would send to %s (%s)", user.username, user.email)
            _activation_followup_sent.add(user.username)
            sent += 1
            continue

        sender = settings.SMTP_FROM or settings.SMTP_USER
        subject = "Dein erstes KI-Signal wartet — Neural Trading OS"
        html = (
            f'<!DOCTYPE html><html><body style="font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px">'
            f'<div style="max-width:480px;margin:0 auto">'
            f'<h2 style="color:#00D4FF;margin-bottom:8px">Hallo {user.username} \U0001f44b</h2>'
            f'<p>Du hast dich gestern bei Neural Trading OS registriert — aber dein erster KI-Scan fehlt noch.</p>'
            f'<p style="margin:0">Dein Free Plan wartet: <strong>3 KI-Handelssignale täglich</strong>, '
            f'Elliott-Wave-Analyse, Multi-Agenten-Konsens. Dauert unter 30 Sekunden.</p>'
            f'<div style="margin:20px 0;padding:16px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:10px">'
            f'<p style="margin:0;font-size:13px;color:#94a3b8">So geht\'s:</p>'
            f'<ol style="margin:8px 0 0 0;padding-left:20px;color:#e2e8f0;font-size:13px;line-height:1.8">'
            f'<li>Ticker eingeben (z.B. AAPL, NVDA, BTC)</li>'
            f'<li>Signal generieren klicken</li>'
            f'<li>KI-Analyse lesen</li>'
            f'</ol>'
            f'</div>'
            f'<a href="{settings.FRONTEND_URL}/signals" '
            f'style="display:inline-block;padding:14px 28px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);'
            f'border-radius:8px;color:#00D4FF;text-decoration:none;font-weight:700;font-size:15px">'
            f'Jetzt erstes Signal generieren →</a>'
            f'<p style="margin-top:24px;font-size:12px;color:#475569">Neural Trading OS · '
            f'<a href="{settings.FRONTEND_URL}/datenschutz" style="color:#475569">Datenschutz</a>'
            f' · <a href="{unsub_url}" style="color:#475569">Abmelden</a></p>'
            f'</div></body></html>'
        )
        text = (
            f"Hallo {user.username},\n\n"
            f"dein erstes KI-Signal fehlt noch. So geht's:\n"
            f"1. Ticker eingeben (AAPL, NVDA, BTC...)\n"
            f"2. Signal generieren klicken\n"
            f"3. KI-Analyse lesen\n\n"
            f"Jetzt starten: {settings.FRONTEND_URL}/signals\n\n"
            f"E-Mails abbestellen: {unsub_url}"
        )

        def _send_activation(u=user, h=html, t=text, s=sender, subj=subject, un=unsub_url) -> None:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subj
            msg["From"] = s
            msg["To"] = u.email
            msg["List-Unsubscribe"] = f"<{un}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            msg.attach(MIMEText(t, "plain"))
            msg.attach(MIMEText(h, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
                if settings.SMTP_HOST != "localhost":
                    srv.starttls()
                if settings.SMTP_USER:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                srv.sendmail(s, [u.email], msg.as_string())

        try:
            await asyncio.to_thread(_send_activation)
            _activation_followup_sent.add(user.username)
            sent += 1
        except Exception as exc:
            logger.warning("activation_followup_failed for %s: %s", user.username, exc)
            failed += 1

    return sent, skipped, failed
