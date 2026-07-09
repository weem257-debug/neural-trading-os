"""
JWT Authentication Layer — Neural Trading OS
=============================================

Endpoints:
  POST /api/auth/token  — exchange username/password for JWT
  GET  /api/auth/me     — return user info from token

Optional auth dependency:
  get_current_user_optional — for execution endpoints that serve
  demo data without auth but restrict real trading with auth.

Demo credentials (override via env):
  username: admin
  password: neural123

Dependencies:
  pip install "python-jose[cryptography]" "passlib[bcrypt]"
"""
import warnings

# passlib 1.7.4 + bcrypt ≥ 4.0: passlib catches an AttributeError during
# bcrypt version sniffing and re-emits it as a UserWarning. Register the
# filter BEFORE importing CryptContext so the backend-load is already silent.
warnings.filterwarnings("ignore", message=".*error reading bcrypt version.*")
warnings.filterwarnings("ignore", message=".*bcrypt.*")

from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncio
import hashlib
import hmac
import logging
import re
import secrets
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import json
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select, update

from app.core.config import settings, demo_login_enabled, is_hardened_environment, jwt_key_is_secure
from app.core.rate_limits import limiter
from app.db.database import get_session
from app.db.models import User, SignalRecord, PriceAlertRecord, BankConnection, Portfolio, P2PSnapshot, TradeLearning

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/auth", tags=["Auth"])

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# OAuth2 scheme (token URL must match the endpoint path including prefix)
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/token",
    auto_error=False,  # auto_error=False so optional auth works
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenData(BaseModel):
    username: Optional[str] = None


class UserInfo(BaseModel):
    username: str
    role: str = "trader"
    tier: str = "demo"
    email: Optional[str] = None
    created_at: Optional[str] = None
    email_unsubscribed: bool = False


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    referred_by: Optional[str] = None
    gdpr_consent: bool

    @field_validator("gdpr_consent")
    @classmethod
    def gdpr_consent_required(cls, v: bool) -> bool:
        # DSGVO Art. 6(1)(a): registration requires explicit, affirmative consent.
        # Reject both a missing field (Pydantic raises) and an explicit False.
        if v is not True:
            raise ValueError("Einwilligung in die Datenverarbeitung ist erforderlich")
        return v

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 30:
            raise ValueError("Benutzername muss 3–30 Zeichen lang sein")
        if not re.match(r"^[a-zA-Z0-9_\-]+$", v):
            raise ValueError("Benutzername darf nur Buchstaben, Ziffern, _ und - enthalten")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Ungültige E-Mail-Adresse")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Passwort muss mindestens 8 Zeichen lang sein")
        return v


class RegisterResponse(BaseModel):
    username: str
    email: str
    tier: str
    message: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Neues Passwort muss mindestens 8 Zeichen lang sein")
        return v


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Passwort muss mindestens 8 Zeichen lang sein")
        return v


_logger = logging.getLogger("auth")

# Password-reset tokens are persisted in the DB (PasswordResetToken) — single-use,
# TTL-enforced, redeploy- and multi-replica-safe. Only the SHA-256 hash is stored.
# SECURITY (P0 #5): the previous in-memory dict did not survive redeploys and broke
# with >1 replica; it has been replaced by DB-backed storage.

def _hash_reset_token(token: str) -> str:
    """SHA-256 hex digest of a reset token — only the hash is ever persisted."""
    return hashlib.sha256(token.encode()).hexdigest()

# In-memory unsubscribe set (username → True).  Persists for the lifetime
# of the process; mirrors the email_unsubscribed DB column (rehydrated on
# startup). Intentionally an unbounded set: it is naturally bounded by the
# user count and correctness (never silently re-subscribe someone) outranks
# the marginal memory cost here.
_unsubscribed: set[str] = set()
# Pure dedup marker ("referrer:referee") — safe to bound with FIFO eviction.
from app.core.cache import BoundedDedupSet
_referral_notified: BoundedDedupSet = BoundedDedupSet(maxsize=50_000)


def _make_unsubscribe_token(username: str) -> str:
    """HMAC-SHA256 token — no DB column needed.

    Fail-closed (P1-3): in hardened environments we never sign with the weak
    ``"fallback"`` default. A missing/weak JWT_SECRET_KEY there is a hard error
    rather than a silently-forgeable token. This mirrors the startup guard in
    app/main.py and is defense-in-depth at the mint site.
    """
    if not jwt_key_is_secure():
        if is_hardened_environment():
            raise RuntimeError(
                "JWT_SECRET_KEY is missing or weak; refusing to mint unsubscribe "
                "tokens in a hardened environment. Set a strong key (>=32 random chars)."
            )
        # Non-hardened (dev/test) only: tolerate a deterministic dev key.
    key = (settings.JWT_SECRET_KEY or "fallback").encode()
    return hmac.new(key, f"unsub:{username}".encode(), hashlib.sha256).hexdigest()


def _verify_unsubscribe_token(username: str, token: str) -> bool:
    expected = _make_unsubscribe_token(username)
    return hmac.compare_digest(expected, token)


def _unsubscribe_url(username: str) -> str:
    token = _make_unsubscribe_token(username)
    return f"{settings.BACKEND_URL}/api/auth/unsubscribe?username={username}&token={token}"


def _is_unsubscribed(username: str) -> bool:
    return username in _unsubscribed

# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------

async def _send_reset_email(to: str, token: str, username: str) -> None:
    if not settings.SMTP_HOST:
        _logger.info("[DEV] Password reset token for %s: %s", username, token)
        return

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    sender = settings.SMTP_FROM or settings.SMTP_USER

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Passwort zurücksetzen — Neural Trading OS"
        msg["From"] = sender
        msg["To"] = to

        text = (
            f"Hallo {username},\n\n"
            f"Du hast eine Passwort-Zurücksetzung angefordert.\n\n"
            f"Link: {reset_url}\n\n"
            f"Der Link ist 1 Stunde gültig.\n\n"
            f"Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.\n\n"
            f"Neural Trading OS"
        )
        html = (
            f"<html><body>"
            f"<p>Hallo <strong>{username}</strong>,</p>"
            f"<p>Du hast eine Passwort-Zurücksetzung angefordert.</p>"
            f"<p><a href='{reset_url}' style='background:#00D4FF;color:#000;padding:10px 20px;"
            f"border-radius:6px;text-decoration:none;font-weight:bold;'>Passwort zurücksetzen</a></p>"
            f"<p style='color:#666;font-size:12px;'>Der Link ist 1 Stunde gültig.</p>"
            f"<p>Neural Trading OS</p></body></html>"
        )
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    await asyncio.to_thread(_send_sync)


async def _send_welcome_email(to: str, username: str) -> None:
    if not settings.SMTP_HOST:
        _logger.info("[DEV] Welcome email would be sent to %s (%s)", username, to)
        return
    if _is_unsubscribed(username):
        return

    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
    unsub_url = _unsubscribe_url(username)
    sender = settings.SMTP_FROM or settings.SMTP_USER

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Willkommen bei Neural Trading OS 🚀"
        msg["From"] = sender
        msg["To"] = to
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

        text = (
            f"Hallo {username},\n\n"
            f"dein Konto wurde erfolgreich erstellt. Willkommen bei Neural Trading OS!\n\n"
            f"Dein Free Plan enthält:\n"
            f"  • 3 KI-Signale pro Tag\n"
            f"  • Paper Trading (risikofreies Üben)\n"
            f"  • Elliott-Wellen-Analyse\n"
            f"  • Echtzeit-Risiko-Dashboard\n\n"
            f"Jetzt loslegen: {dashboard_url}\n\n"
            f"Für mehr Signale und Live-Trading: {settings.FRONTEND_URL}/pricing\n\n"
            f"Viel Erfolg beim Trading!\n"
            f"Neural Trading OS\n\n"
            f"---\nE-Mails abbestellen: {unsub_url}"
        )
        html = (
            f"<html><body style='font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px;'>"
            f"<div style='max-width:560px;margin:0 auto;'>"
            f"<h1 style='color:#00D4FF;font-size:24px;margin-bottom:8px;'>Neural Trading OS</h1>"
            f"<p>Hallo <strong>{username}</strong>,</p>"
            f"<p>dein Konto wurde erfolgreich erstellt. Willkommen bei Neural Trading OS!</p>"
            f"<h3 style='color:#00D4FF;'>Dein Free Plan enthält:</h3>"
            f"<ul style='color:#94a3b8;'>"
            f"<li>3 KI-Signale pro Tag (Claude Sonnet 4.6)</li>"
            f"<li>Paper Trading — risikofreies Üben</li>"
            f"<li>Elliott-Wellen-Analyse</li>"
            f"<li>Echtzeit-Risiko-Dashboard</li>"
            f"</ul>"
            f"<p style='margin-top:24px;'>"
            f"<a href='{dashboard_url}' style='background:#00D4FF;color:#000;padding:12px 24px;"
            f"border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;'>"
            f"Jetzt zum Dashboard →</a></p>"
            f"<p style='color:#64748b;font-size:12px;margin-top:24px;'>"
            f"Für mehr Signale und Live-Trading: "
            f"<a href='{settings.FRONTEND_URL}/pricing' style='color:#00D4FF;'>Pläne ansehen</a>"
            f"</p>"
            f"<p style='color:#475569;font-size:11px;margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;'>"
            f"Neural Trading OS · "
            f"<a href='{settings.FRONTEND_URL}/datenschutz' style='color:#475569;'>Datenschutz</a> · "
            f"<a href='{unsub_url}' style='color:#475569;'>Abmelden</a>"
            f"</p>"
            f"</div></body></html>"
        )
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        _logger.warning("welcome_email_failed for %s: %s", username, exc)


async def _notify_admin_new_registration(new_username: str, new_email: Optional[str], referred_by: Optional[str] = None) -> None:
    """Fire-and-forget: notify admin email when a new user registers."""
    admin_email = settings.ADMIN_NOTIFICATION_EMAIL
    if not admin_email:
        ref_note = f" (via Referral von {referred_by})" if referred_by else ""
        _logger.info("[DEV] New registration: %s (%s)%s — set ADMIN_NOTIFICATION_EMAIL to receive alerts", new_username, new_email or "no email", ref_note)
        return
    if not settings.SMTP_HOST:
        _logger.info("[DEV] Admin notification would go to %s for new user %s", admin_email, new_username)
        return

    sender = settings.SMTP_FROM or settings.SMTP_USER
    admin_url = f"{settings.FRONTEND_URL}/admin"
    registered_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ref_row_text = f"\nEmpfohlen von: {referred_by}" if referred_by else ""
    ref_row_html = (
        f"<tr><td style='color:#94a3b8;padding:4px 0'>Empfohlen von</td>"
        f"<td style='color:#FFAA00;font-weight:bold'>{referred_by}</td></tr>"
    ) if referred_by else ""

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        subject = f"Neue Registrierung: {new_username} — Neural Trading OS"
        if referred_by:
            subject = f"🔗 Referral-Registrierung: {new_username} (via {referred_by}) — Neural Trading OS"
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = admin_email
        text = (
            f"Neue Registrierung auf Neural Trading OS\n\n"
            f"Benutzername: {new_username}\n"
            f"E-Mail: {new_email or '—'}\n"
            f"Plan: Free\n"
            f"Registriert: {registered_at}"
            f"{ref_row_text}\n\n"
            f"Admin-Panel: {admin_url}"
        )
        html = (
            f"<div style='font-family:Arial,sans-serif;max-width:480px;background:#0f1117;color:#e2e8f0;padding:24px;border-radius:12px'>"
            f"<h2 style='color:#00D4FF;margin:0 0 16px'>&#128100; Neue Registrierung</h2>"
            f"<table style='width:100%;border-collapse:collapse'>"
            f"<tr><td style='color:#94a3b8;padding:4px 0'>Benutzername</td><td style='font-weight:bold'>{new_username}</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 0'>E-Mail</td><td>{new_email or '—'}</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 0'>Plan</td><td>Free</td></tr>"
            f"<tr><td style='color:#94a3b8;padding:4px 0'>Registriert</td><td>{registered_at}</td></tr>"
            f"{ref_row_html}"
            f"</table>"
            f"<a href='{admin_url}' style='display:inline-block;margin-top:16px;background:#7B2FFF;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold'>Admin-Panel öffnen</a>"
            f"</div>"
        )
        msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            srv.sendmail(sender, [admin_email], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        _logger.debug("admin_registration_notify_failed: %s", exc)


async def _send_referral_notification_email(referrer_username: str, new_user_username: str) -> None:
    """Notify the referrer when someone registers via their referral link."""
    dedup_key = f"{referrer_username}:{new_user_username}"
    if dedup_key in _referral_notified:
        return
    _referral_notified.add(dedup_key)

    if _is_unsubscribed(referrer_username):
        return

    # Look up referrer email from DB
    referrer_email: Optional[str] = None
    try:
        async with get_session() as session:
            result = await session.execute(select(User).where(User.username == referrer_username))
            referrer_user = result.scalar_one_or_none()
            if referrer_user:
                referrer_email = referrer_user.email
    except Exception as exc:
        _logger.warning("referral_notify_db_lookup_failed for %s: %s", referrer_username, exc)
        return

    if not referrer_email:
        return

    if not settings.SMTP_HOST:
        _logger.info("[DEV] Referral notification would be sent to %s (%s) — new user: %s", referrer_username, referrer_email, new_user_username)
        return

    unsub_url = _unsubscribe_url(referrer_username)
    signals_url = f"{settings.FRONTEND_URL}/signals"
    sender = settings.SMTP_FROM or settings.SMTP_USER

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Jemand hat sich über deinen Link registriert!"
        msg["From"] = sender
        msg["To"] = referrer_email
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

        text = (
            f"Hey {referrer_username},\n\n"
            f"dein Referral-Link hat funktioniert! {new_user_username} hat sich gerade bei Neural Trading OS registriert.\n\n"
            f"Teile deinen Link weiter und hilf anderen Tradern, KI-gestützte Signale zu entdecken.\n\n"
            f"Jetzt Signale generieren: {signals_url}\n\n"
            f"Viel Erfolg!\n"
            f"Neural Trading OS\n\n"
            f"---\nE-Mails abbestellen: {unsub_url}"
        )
        html = (
            f"<html><body style='font-family:sans-serif;background:#080b14;color:#e2e8f0;padding:32px;'>"
            f"<div style='max-width:560px;margin:0 auto;'>"
            f"<h1 style='color:#00D4FF;font-size:24px;margin-bottom:8px;'>Neural Trading OS</h1>"
            f"<h2 style='color:#FFAA00;font-size:20px;'>&#127881; Dein Referral hat geklappt!</h2>"
            f"<p>Hey <strong>{referrer_username}</strong>,</p>"
            f"<p><strong style='color:#FFAA00;'>{new_user_username}</strong> hat sich gerade über deinen Referral-Link bei Neural Trading OS registriert.</p>"
            f"<p style='color:#94a3b8;'>Teile deinen Link weiter und hilf anderen Tradern, KI-gestützte Signale zu entdecken.</p>"
            f"<p style='margin-top:24px;'>"
            f"<a href='{signals_url}' style='background:#00D4FF;color:#000;padding:12px 24px;"
            f"border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;'>"
            f"Signale generieren →</a></p>"
            f"<p style='color:#475569;font-size:11px;margin-top:24px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;'>"
            f"Neural Trading OS · "
            f"<a href='{settings.FRONTEND_URL}/datenschutz' style='color:#475569;'>Datenschutz</a> · "
            f"<a href='{unsub_url}' style='color:#475569;'>Abmelden</a>"
            f"</p>"
            f"</div></body></html>"
        )
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(sender, [referrer_email], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        _logger.warning("referral_notification_failed for %s: %s", referrer_username, exc)


async def _send_password_changed_email(to: str, username: str) -> None:
    """Security alert: notify user when their password has been changed."""
    if not settings.SMTP_HOST:
        _logger.info("[DEV] Password-change security alert would be sent to %s (%s)", username, to)
        return

    sender = settings.SMTP_FROM or settings.SMTP_USER
    changed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    support_url = f"{settings.FRONTEND_URL}/forgot-password"

    def _send_sync() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Dein Passwort wurde geändert — Neural Trading OS"
        msg["From"] = sender
        msg["To"] = to
        text = (
            f"Hallo {username},\n\n"
            f"dein Passwort wurde am {changed_at} erfolgreich geändert.\n\n"
            f"Falls du diese Änderung NICHT vorgenommen hast, setze dein Passwort sofort zurück:\n"
            f"{support_url}\n\n"
            f"Neural Trading OS"
        )
        html = (
            f"<div style='font-family:Arial,sans-serif;max-width:480px;background:#0f1117;color:#e2e8f0;padding:24px;border-radius:12px'>"
            f"<h2 style='color:#00D4FF;margin:0 0 16px'>&#128274; Passwort geändert</h2>"
            f"<p>Hallo <strong>{username}</strong>,</p>"
            f"<p>dein Passwort wurde am <strong>{changed_at}</strong> erfolgreich geändert.</p>"
            f"<div style='background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:12px;margin:16px 0'>"
            f"<p style='margin:0;color:#fca5a5'>&#9888;&#65039; Falls du diese Änderung <strong>nicht</strong> vorgenommen hast, "
            f"setze dein Passwort sofort zurück.</p>"
            f"</div>"
            f"<a href='{support_url}' style='display:inline-block;background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold'>"
            f"Passwort zurücksetzen</a>"
            f"<p style='font-size:11px;color:#64748b;margin-top:24px'>Neural Trading OS · Sicherheitsbenachrichtigung</p>"
            f"</div>"
        )
        msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as srv:
            if settings.SMTP_HOST != "localhost":
                srv.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            srv.sendmail(sender, [to], msg.as_string())

    try:
        await asyncio.to_thread(_send_sync)
    except Exception as exc:
        _logger.debug("password_changed_email_failed: %s", exc)


# ---------------------------------------------------------------------------
# In-memory user store (demo — replace with DB in production)
# ---------------------------------------------------------------------------

_DEMO_USER_DB: dict | None = None


def _get_demo_user_db() -> dict:
    """
    Returns a minimal user store for the built-in demo/admin account.

    In hardened environments (production/staging) the demo account is
    disabled unless DEMO_PASSWORD was explicitly overridden with a
    non-default value — in that case an empty store is returned so the
    fallback authentication path matches no one. Password is hashed
    exactly once at first call.
    """
    global _DEMO_USER_DB
    if not demo_login_enabled():
        return {}
    if _DEMO_USER_DB is None:
        hashed_pw = pwd_context.hash(settings.DEMO_PASSWORD)
        _DEMO_USER_DB = {
            settings.DEMO_USERNAME: {
                "username": settings.DEMO_USERNAME,
                "hashed_password": hashed_pw,
                "role": "admin",
                "tier": "pro",
            }
        }
    return _DEMO_USER_DB


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _authenticate_user(username: str, password: str) -> Optional[dict]:
    """Returns user dict if credentials are valid, else None. Demo user is fallback."""
    db = _get_demo_user_db()
    user = db.get(username)
    if not user:
        return None
    if not _verify_password(password, user["hashed_password"]):
        return None
    return user


async def _authenticate_user_db(username: str, password: str) -> Optional[dict]:
    """Check DB-registered users first, then fall back to demo user."""
    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(func.lower(User.username) == username.lower(), User.is_active.is_(True))
            )
            db_user = result.scalar_one_or_none()
            if db_user and _verify_password(password, db_user.hashed_password):
                return {
                    "username": db_user.username,
                    "hashed_password": db_user.hashed_password,
                    "role": db_user.role,
                    "tier": db_user.tier,
                }
    except Exception as exc:
        # DB unreachable / schema issue — log so an outage is visible, then
        # fall back to the (off-prod) demo account instead of hard-failing login.
        _logger.warning("auth_db_lookup_failed username=%s reason=%s", username, exc)
    return _authenticate_user(username, password)


def _create_access_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _verify_token(token: str) -> bool:
    """Validate a JWT token string. Returns True if valid, False otherwise."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub") is not None
    except JWTError:
        return False


# ---------------------------------------------------------------------------
# Cookie & CSRF helpers (P1-3: httpOnly-Cookie migration)
# ---------------------------------------------------------------------------

def _extract_token_from_request(
    request: Request,
    bearer_token: Optional[str],
) -> tuple[Optional[str], bool]:
    """
    Dual-mode token extraction.

    Priority: explicit Bearer header > ambient httpOnly cookie.
    Rationale: API clients always send Bearer; browsers never do (cookie only).
    Giving Bearer precedence means a request with an Authorization header is
    never accidentally treated as cookie-auth and subjected to CSRF checks,
    even if the client's cookie jar also happens to hold a session cookie.

    Returns (token_str | None, via_cookie: bool).
    """
    if bearer_token:
        return bearer_token, False
    cookie_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if cookie_token:
        return cookie_token, True
    return None, False


def _check_csrf(request: Request) -> None:
    """
    CSRF Double-Submit Cookie validation.
    Only called when authentication was via cookie on a state-changing method.
    Raises HTTP 403 if the X-CSRF-Token header is absent or doesn't match
    the csrf_token cookie value.
    """
    csrf_header = request.headers.get("X-CSRF-Token", "")
    csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME, "")
    if not csrf_header or not csrf_cookie:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF-Token fehlt — X-CSRF-Token-Header erforderlich",
        )
    if not hmac.compare_digest(csrf_header, csrf_cookie):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ungültiger CSRF-Token",
        )


def _cookie_policy() -> tuple[bool, str]:
    """
    (secure, samesite) for the auth/CSRF cookies.

    Default SameSite=Lax: the browser reaches the API same-origin through the
    Next rewrite proxy, so cross-site cookie delivery is no longer needed.
    COOKIE_SAMESITE=none remains available for cross-site clients (Capacitor
    WebView); browsers reject None without Secure, so Secure is forced then.
    """
    secure = is_hardened_environment() or settings.COOKIE_SECURE
    samesite_val = (settings.COOKIE_SAMESITE or "lax").lower()
    if samesite_val == "none":
        secure = True
    return secure, samesite_val


def _set_auth_cookies(response: Response, token: str, expires_delta: timedelta) -> None:
    """
    Set the httpOnly JWT auth cookie and the JS-readable CSRF cookie.
    secure=True is enforced in hardened/production environments.
    """
    secure, samesite_val = _cookie_policy()
    max_age = int(expires_delta.total_seconds())
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        path="/",
        httponly=True,
        secure=secure,
        samesite=samesite_val,
    )
    # CSRF token: non-httpOnly so JS can read it for the X-CSRF-Token header
    csrf_token = secrets.token_hex(32)
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=max_age,
        path="/",
        httponly=False,
        secure=secure,
        samesite=samesite_val,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire auth and CSRF cookies (used by the logout endpoint)."""
    secure, samesite_val = _cookie_policy()
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value="",
        max_age=0,
        path="/",
        httponly=True,
        secure=secure,
        samesite=samesite_val,
    )
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value="",
        max_age=0,
        path="/",
        httponly=False,
        secure=secure,
        samesite=samesite_val,
    )


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> UserInfo:
    """
    Dual-mode strict auth dependency.
    Priority: httpOnly cookie → Bearer Authorization header.
    When cookie-based, CSRF Double-Submit is enforced for state-changing methods
    (POST / PUT / PATCH / DELETE).  Bearer-authenticated requests are exempt from
    CSRF because they cannot be ambient-triggered by a malicious site.
    Raises 401 if no valid token is found.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Anmeldedaten konnten nicht validiert werden",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token, via_cookie = _extract_token_from_request(request, bearer_token)
    if token is None:
        raise credentials_exception

    # CSRF Double-Submit validation for cookie-authenticated state-changing requests
    if via_cookie and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        _check_csrf(request)

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Check DB first, then fall back to demo user
    user = None
    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(User.username == username, User.is_active.is_(True))
            )
            db_user = result.scalar_one_or_none()
            if db_user:
                user = {
                    "username": db_user.username,
                    "role": db_user.role,
                    "tier": db_user.tier,
                    "email": db_user.email,
                    "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
                    "email_unsubscribed": bool(db_user.email_unsubscribed),
                }
    except Exception as exc:
        _logger.warning("get_current_user_db_lookup_failed username=%s reason=%s", username, exc)

    if user is None:
        db = _get_demo_user_db()
        user = db.get(username)

    if user is None:
        raise credentials_exception

    return UserInfo(
        username=user["username"],
        role=user["role"],
        tier=user["tier"],
        email=user.get("email"),
        created_at=user.get("created_at"),
        email_unsubscribed=user.get("email_unsubscribed", False),
    )


async def get_current_user_optional(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[UserInfo]:
    """
    Dual-mode optional auth dependency — onboarding-friendly.

    Returns UserInfo if a valid token is found (cookie or Bearer).
    Returns None (not an error) if no credentials are present.
    Raises 401 only if a token is provided but invalid.
    When cookie-based, CSRF Double-Submit is enforced for state-changing methods.
    """
    token, via_cookie = _extract_token_from_request(request, bearer_token)
    if token is None:
        return None

    # CSRF check applies to cookie-authenticated state-changing requests only
    if via_cookie and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        _check_csrf(request)

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiges Token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check DB first, then fall back to demo user
    user = None
    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(User.username == username, User.is_active.is_(True))
            )
            db_user = result.scalar_one_or_none()
            if db_user:
                user = {
                    "username": db_user.username,
                    "role": db_user.role,
                    "tier": db_user.tier,
                    "email": db_user.email,
                    "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
                }
    except Exception:
        pass

    if user is None:
        db = _get_demo_user_db()
        user = db.get(username)

    if user is None:
        return None

    return UserInfo(
        username=user["username"],
        role=user["role"],
        tier=user["tier"],
        email=user.get("email"),
        created_at=user.get("created_at"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/token",
    response_model=Token,
    summary="Get JWT access token",
    description=(
        "Exchange username and password for a JWT. "
        "A built-in demo account (`admin`) is available in non-production "
        "environments only; it is disabled automatically in production."
    ),
)
@limiter.limit("5/minute;30/hour")
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Token:
    user = await _authenticate_user_db(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Benutzername oder Passwort ungültig",
            headers={"WWW-Authenticate": "Bearer"},
        )
    expire_delta = timedelta(hours=settings.JWT_ACCESS_TOKEN_EXPIRE_HOURS)
    access_token = _create_access_token(
        data={"sub": user["username"], "role": user.get("role", "trader"), "tier": user.get("tier", "free")},
        expires_delta=expire_delta,
    )
    # Set httpOnly auth cookie + JS-readable CSRF cookie (Double-Submit pattern)
    _set_auth_cookies(response, access_token, expire_delta)
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=int(expire_delta.total_seconds()),
    )


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Get current user info",
    description="Returns user information extracted from the JWT. Supports cookie or Bearer token.",
)
async def get_me(
    current_user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    return current_user


# Short-lived: only needs to survive the WebSocket handshake.
WS_TOKEN_TTL_SECONDS = 120


@router.get(
    "/ws-token",
    summary="Kurzlebiger WebSocket-Handshake-Token",
    description=(
        "Stellt ein kurzlebiges JWT für den WebSocket-Handshake aus. Browser können "
        "den httpOnly-Cookie nicht an einen cross-origin WebSocket anhängen, daher "
        "holt der Client dieses Ticket same-origin und übergibt es via "
        "Sec-WebSocket-Protocol-Header."
    ),
)
async def get_ws_token(
    current_user: UserInfo = Depends(get_current_user),
) -> dict:
    token = _create_access_token(
        {"sub": current_user.username, "scope": "ws"},
        expires_delta=timedelta(seconds=WS_TOKEN_TTL_SECONDS),
    )
    return {"token": token, "expires_in": WS_TOKEN_TTL_SECONDS}


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Logout — Cookie löschen",
    description="Löscht den httpOnly Auth-Cookie und den CSRF-Cookie. Kein Token erforderlich.",
)
async def logout(response: Response) -> dict:
    """Expire auth + CSRF cookies to terminate the browser session."""
    _clear_auth_cookies(response)
    return {"message": "Erfolgreich abgemeldet"}


@router.post(
    "/refresh",
    response_model=Token,
    summary="Token erneuern",
    description="Gibt ein neues JWT mit frischer Ablaufzeit aus. Erneuert auch den httpOnly-Cookie.",
)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    response: Response,
    current_user: UserInfo = Depends(get_current_user),
) -> Token:
    expire_delta = timedelta(hours=settings.JWT_ACCESS_TOKEN_EXPIRE_HOURS)
    access_token = _create_access_token(
        data={"sub": current_user.username, "role": current_user.role or "trader", "tier": current_user.tier or "free"},
        expires_delta=expire_delta,
    )
    # Refresh cookies alongside the JSON token response
    _set_auth_cookies(response, access_token, expire_delta)
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=int(expire_delta.total_seconds()),
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Neuen Benutzer registrieren",
    description="Erstellt ein neues Benutzerkonto. Neue Nutzer erhalten automatisch den kostenlosen Tarif.",
)
@limiter.limit("3/minute;20/hour")
async def register(
    request: Request,
    body: RegisterRequest,
) -> RegisterResponse:
    async with get_session() as session:
        # Check username taken
        existing_user = await session.execute(
            select(User).where(func.lower(User.username) == body.username.lower())
        )
        if existing_user.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Benutzername bereits vergeben",
            )

        # Check email taken
        existing_email = await session.execute(
            select(User).where(User.email == body.email)
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-Mail-Adresse bereits registriert",
            )

        # Block reserved and demo usernames
        if (body.username.lower() in _RESERVED_USERNAMES
                or body.username.lower() == settings.DEMO_USERNAME.lower()):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Benutzername bereits vergeben",
            )

        # Decode referral code before creating user (btoa-encoded referrer username)
        referrer: Optional[str] = None
        if body.referred_by:
            try:
                import base64 as _b64
                referrer = _b64.b64decode(body.referred_by + "==").decode("utf-8").strip() or None
            except Exception:
                referrer = None

        new_user = User(
            username=body.username,
            email=body.email,
            hashed_password=pwd_context.hash(body.password),
            role="trader",
            tier="free",
            is_active=True,
            referred_by=referrer,
        )
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)

    if referrer:
        _logger.info("referral_registration", extra={"new_user": new_user.username, "referred_by": referrer})

    # Fire-and-forget: welcome email + admin notification do not block the response
    if new_user.email:
        asyncio.create_task(_send_welcome_email(new_user.email, new_user.username))
    asyncio.create_task(_notify_admin_new_registration(new_user.username, new_user.email, referrer))
    if referrer:
        asyncio.create_task(_send_referral_notification_email(referrer, new_user.username))

    return RegisterResponse(
        username=new_user.username,
        email=new_user.email,
        tier=new_user.tier,
        message="Konto erstellt. Du kannst dich jetzt anmelden.",
    )


@router.post(
    "/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Passwort zurücksetzen anfordern",
)
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest) -> dict:
    email = body.email.strip().lower()

    user = None
    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(User.email == email, User.is_active.is_(True))
            )
            user = result.scalar_one_or_none()
    except Exception:
        pass

    if user:
        token = secrets.token_urlsafe(32)
        try:
            from app.db.models import PasswordResetToken
            async with get_session() as session:
                session.add(PasswordResetToken(
                    token_hash=_hash_reset_token(token),
                    username=user.username,
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                ))
                await session.commit()
        except Exception as exc:
            _logger.warning("Reset-Token konnte nicht gespeichert werden: %s", exc)
        else:
            try:
                await _send_reset_email(user.email, token, user.username)
            except Exception as exc:
                _logger.warning("Reset-E-Mail konnte nicht gesendet werden: %s", exc)

    # Always 202 — don't reveal whether the email exists
    return {"message": "Falls ein Konto mit dieser E-Mail existiert, haben wir eine Zurücksetz-E-Mail gesendet."}


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Passwort mit Token zurücksetzen",
)
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest) -> dict:
    from app.db.models import PasswordResetToken

    token_hash = _hash_reset_token(body.token)

    try:
        async with get_session() as session:
            result = await session.execute(
                select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
            )
            token_row = result.scalar_one_or_none()

            # Invalid or already-consumed token (single-use enforcement).
            if token_row is None or token_row.used_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ungültiger oder abgelaufener Reset-Link",
                )

            # TTL enforcement.
            expires_at = token_row.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Der Reset-Link ist abgelaufen. Bitte fordere einen neuen an.",
                )

            user_result = await session.execute(
                select(User).where(User.username == token_row.username)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Benutzer nicht gefunden",
                )

            # Atomically: set new password AND mark token used (single-use).
            user.hashed_password = pwd_context.hash(body.password)
            token_row.used_at = datetime.now(timezone.utc)
            await session.commit()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Datenbankfehler beim Passwort-Reset",
        )

    return {"message": "Passwort erfolgreich geändert. Du kannst dich jetzt anmelden."}


@router.delete(
    "/account",
    status_code=status.HTTP_200_OK,
    summary="Konto löschen (DSGVO Art. 17)",
    description="Soft-Delete: Konto wird deaktiviert und personenbezogene Daten anonymisiert.",
)
@limiter.limit("2/minute")
async def delete_account(
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> dict:
    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(User.username == current_user.username, User.is_active.is_(True))
            )
            user = result.scalar_one_or_none()
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Datenbankfehler")

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Konto nicht gefunden — Demo-Konten können nicht gelöscht werden",
        )

    # Soft-delete: deactivate + anonymize PII
    try:
        async with get_session() as session:
            result = await session.execute(select(User).where(User.username == current_user.username))
            user = result.scalar_one_or_none()
            if user:
                user.is_active = False
                user.email = f"deleted_{user.id}@geloescht.invalid"
                user.hashed_password = ""
            await session.commit()
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Datenbankfehler beim Löschen")

    return {"message": "Konto wurde deaktiviert und personenbezogene Daten anonymisiert."}


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    summary="Passwort für eingeloggten Nutzer ändern",
)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: UserInfo = Depends(get_current_user),
) -> dict:
    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(User.username == current_user.username, User.is_active.is_(True))
            )
            user = result.scalar_one_or_none()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Datenbankfehler",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden — Passwort-Änderung nur für DB-Nutzer möglich",
        )

    if not _verify_password(body.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aktuelles Passwort ist falsch",
        )

    try:
        async with get_session() as session:
            result = await session.execute(
                select(User).where(User.username == current_user.username)
            )
            user = result.scalar_one_or_none()
            user.hashed_password = pwd_context.hash(body.new_password)
            await session.commit()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Datenbankfehler beim Speichern",
        )

    # Security notification: inform user about the password change
    if user and user.email and not _is_unsubscribed(current_user.username):
        asyncio.create_task(_send_password_changed_email(user.email, current_user.username))

    return {"message": "Passwort erfolgreich geändert."}


_RESERVED_USERNAMES: frozenset[str] = frozenset({
    "admin", "administrator", "system", "root", "moderator",
    "support", "help", "api", "bot", "neural", "trading",
    "operator", "superuser", "staff", "service",
})


class UsernameCheckResponse(BaseModel):
    available: bool


@router.get("/check-username", response_model=UsernameCheckResponse)
@limiter.limit("30/minute")
async def check_username_availability(request: Request, username: str) -> UsernameCheckResponse:
    """Check whether a username is available for registration."""
    if not username or len(username) < 3 or len(username) > 30:
        return UsernameCheckResponse(available=False)
    if not re.match(r"^[a-zA-Z0-9_\-]+$", username.strip()):
        return UsernameCheckResponse(available=False)
    lower = username.strip().lower()
    if lower in _RESERVED_USERNAMES or lower == settings.DEMO_USERNAME.lower():
        return UsernameCheckResponse(available=False)
    async with get_session() as session:
        result = await session.execute(select(User).where(func.lower(User.username) == username.strip().lower()))
        user = result.scalar_one_or_none()
    return UsernameCheckResponse(available=user is None)


# ---------------------------------------------------------------------------
# GET /api/auth/export-data  — DSGVO Art. 20 Datenportabilität
# ---------------------------------------------------------------------------

@router.get(
    "/export-data",
    summary="Alle persönlichen Daten exportieren (DSGVO Art. 20)",
    responses={401: {}, 404: {}},
)
@limiter.limit("5/hour")
async def export_user_data(
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> Response:
    """
    Returns a JSON file with all personal data stored for this account:
    - Account information (no password hash)
    - Signal history (last 500)
    - Price alerts

    Rate-limited to 5 requests/hour to prevent abuse.
    """
    async with get_session() as session:
        user_result = await session.execute(
            select(User).where(User.username == current_user.username)
        )
        user = user_result.scalar_one_or_none()
        # No DB row (e.g. the built-in demo admin authenticates via static
        # credentials, not a User row): still honour the export from the
        # authenticated identity rather than 404, so DSGVO Art. 20 works for
        # every token-valid account. Owned-data queries below simply return [].

        signals_result = await session.execute(
            select(SignalRecord)
            .where(SignalRecord.user_id == current_user.username)
            .order_by(SignalRecord.generated_at.desc())
            .limit(500)
        )
        signals = signals_result.scalars().all()

        alerts_result = await session.execute(
            select(PriceAlertRecord)
            .where(PriceAlertRecord.username == current_user.username)
            .order_by(PriceAlertRecord.created_at.desc())
            .limit(500)
        )
        alerts = alerts_result.scalars().all()

        # Additional data categories — require owner_username migrations (graceful fallback)
        bank_connections: list = []
        portfolios: list = []
        p2p_snapshots: list = []
        trade_learnings: list = []
        try:
            bc_result = await session.execute(
                select(BankConnection)
                .where(BankConnection.owner_username == current_user.username)
                .order_by(BankConnection.created_at)
            )
            bank_connections = bc_result.scalars().all()

            pf_result = await session.execute(
                select(Portfolio)
                .where(Portfolio.owner_username == current_user.username)
                .order_by(Portfolio.created_at)
            )
            portfolios = pf_result.scalars().all()

            p2p_result = await session.execute(
                select(P2PSnapshot)
                .where(P2PSnapshot.owner_username == current_user.username)
                .order_by(P2PSnapshot.fetched_at.desc())
                .limit(200)
            )
            p2p_snapshots = p2p_result.scalars().all()

            tl_result = await session.execute(
                select(TradeLearning)
                .where(TradeLearning.owner_username == current_user.username)
                .order_by(TradeLearning.last_updated.desc())
                .limit(200)
            )
            trade_learnings = tl_result.scalars().all()
        except Exception:
            pass  # owner_username columns not yet migrated — skip gracefully

    export = {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "schema_version": "1.1",
        "account": {
            "username": user.username if user else current_user.username,
            "email": user.email if user else current_user.email,
            "tier": user.tier if user else current_user.tier,
            "role": user.role if user else current_user.role,
            "is_active": user.is_active if user else True,
            "referred_by": getattr(user, "referred_by", None) if user else None,
            "created_at": (
                user.created_at.isoformat() if user and user.created_at
                else current_user.created_at
            ),
        },
        "signals": [
            {
                "ticker": s.ticker,
                "direction": s.direction,
                "confidence": s.confidence,
                "price_target": s.price_target,
                "stop_loss": s.stop_loss,
                "reasoning": s.reasoning,
                "generated_at": s.generated_at.isoformat() if s.generated_at else None,
                "source": getattr(s, "source", None),
            }
            for s in signals
        ],
        "price_alerts": [
            {
                "ticker": a.ticker,
                "condition": a.condition,
                "threshold": a.threshold,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "fired_at": a.fired_at.isoformat() if a.fired_at else None,
                "fired_price": a.fired_price,
            }
            for a in alerts
        ],
        "bank_connections": [
            {
                "bank_name": c.bank_name,
                "blz": c.blz,
                "account_iban": c.account_iban,
                "last_synced": c.last_synced.isoformat() if c.last_synced else None,
                "currency": c.currency,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in bank_connections
        ],
        "portfolios": [
            {
                "name": p.name,
                "portfolio_type": p.portfolio_type,
                "category": p.category,
                "currency": p.currency,
                "is_default": p.is_default,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in portfolios
        ],
        "p2p_snapshots": [
            {
                "platform": s.platform,
                "total_invested": s.total_invested,
                "outstanding_principal": s.outstanding_principal,
                "total_interest": s.total_interest,
                "cash_balance": s.cash_balance,
                "currency": s.currency,
                "fetched_at": s.fetched_at.isoformat() if s.fetched_at else None,
            }
            for s in p2p_snapshots
        ],
        "trade_learnings": [
            {
                "ticker": tl.ticker,
                "direction": tl.direction,
                "learning_text": tl.learning_text,
                "win_rate": tl.win_rate,
                "sample_count": tl.sample_count,
                "avg_return_pct": tl.avg_return_pct,
                "last_updated": tl.last_updated.isoformat() if tl.last_updated else None,
            }
            for tl in trade_learnings
        ],
    }

    filename = f"neural-trading-os-export-{current_user.username}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    return Response(
        content=json.dumps(export, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# GET /api/auth/referral-stats  — Referral-Zähler für die Account-Seite
# ---------------------------------------------------------------------------

class ReferralStatsResponse(BaseModel):
    referral_count: int
    referral_url: str


@router.get("/referral-stats", response_model=ReferralStatsResponse)
@limiter.limit("30/minute")
async def get_referral_stats(
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> ReferralStatsResponse:
    """Return how many users have registered via this user's referral link."""
    import base64 as _b64
    from sqlalchemy import func as _func
    ref_code = _b64.b64encode(current_user.username.encode()).decode()
    referral_url = f"{settings.FRONTEND_URL}/invite/{ref_code}"
    async with get_session() as session:
        result = await session.execute(
            select(_func.count(User.id)).where(User.referred_by == current_user.username)
        )
        count = result.scalar() or 0
    return ReferralStatsResponse(referral_count=int(count), referral_url=referral_url)


# ---------------------------------------------------------------------------
# POST /api/auth/email-preferences  — In-App E-Mail-Präferenzen (Auth required)
# ---------------------------------------------------------------------------

class EmailPreferencesRequest(BaseModel):
    subscribed: bool


@router.post("/email-preferences", summary="E-Mail-Einstellungen in der App verwalten")
@limiter.limit("10/minute")
async def update_email_preferences(
    body: EmailPreferencesRequest,
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> dict:
    """Toggle marketing email subscription (in-app, no token needed — user is authenticated)."""
    username = current_user.username
    if body.subscribed:
        _unsubscribed.discard(username)
    else:
        _unsubscribed.add(username)
    try:
        from app.db.database import get_session
        from app.db.models import User as _User
        from sqlalchemy import update as _update
        async with get_session() as _session:
            await _session.execute(
                _update(_User).where(_User.username == username).values(email_unsubscribed=not body.subscribed)
            )
            await _session.commit()
    except Exception as _e:
        _logger.warning("email_preferences_db_update_failed username=%s reason=%s", username, _e)
    _logger.info("email_preferences_updated username=%s subscribed=%s", username, body.subscribed)
    return {"subscribed": body.subscribed}


# ---------------------------------------------------------------------------
# GET /api/auth/unsubscribe  — E-Mail-Abmeldung (CAN-SPAM / DSGVO)
# ---------------------------------------------------------------------------

@router.get(
    "/unsubscribe",
    summary="E-Mail-Benachrichtigungen abbestellen",
)
async def unsubscribe(username: str, token: str) -> Response:
    """
    One-click unsubscribe endpoint — no auth required.
    Token is HMAC-SHA256 of the username, keyed with JWT_SECRET_KEY.
    Adds the user to the in-memory _unsubscribed set.
    Returns an HTML confirmation page.
    """
    if not username or not token:
        raise HTTPException(status_code=400, detail="Ungültige Anfrage")

    if not _verify_unsubscribe_token(username, token):
        raise HTTPException(status_code=400, detail="Ungültiger oder abgelaufener Abmelde-Link")

    _unsubscribed.add(username)
    # Persist to DB so the unsubscribe survives server restarts (DSGVO Art. 21)
    try:
        from app.db.database import get_session
        from app.db.models import User as _User
        from sqlalchemy import select as _select, update as _update
        async with get_session() as _session:
            await _session.execute(
                _update(_User).where(_User.username == username).values(email_unsubscribed=True)
            )
            await _session.commit()
    except Exception as _e:
        _logger.warning("unsubscribe_db_persist_failed username=%s reason=%s", username, _e)
    _logger.info("user_unsubscribed username=%s", username)

    html = (
        "<!DOCTYPE html><html lang='de'><head><meta charset='utf-8'>"
        "<title>Abgemeldet — Neural Trading OS</title>"
        "<style>body{font-family:sans-serif;background:#080b14;color:#e2e8f0;display:flex;"
        "align-items:center;justify-content:center;min-height:100vh;margin:0;}"
        ".card{max-width:400px;text-align:center;padding:40px;background:rgba(255,255,255,0.04);"
        "border:1px solid rgba(0,212,255,0.2);border-radius:16px;}"
        "h1{color:#00D4FF;font-size:20px;margin-bottom:12px;}"
        "p{color:#94a3b8;font-size:14px;line-height:1.6;}"
        "a{color:#00D4FF;text-decoration:none;}"
        "</style></head><body>"
        f"<div class='card'>"
        f"<h1>✓ Abgemeldet</h1>"
        f"<p>Du erhältst von Neural Trading OS keine Marketing-E-Mails mehr.</p>"
        f"<p style='margin-top:16px;'><a href='{settings.FRONTEND_URL}/settings'>Einstellungen öffnen</a></p>"
        f"</div></body></html>"
    )
    return Response(content=html, media_type="text/html")


@router.get(
    "/users/count",
    summary="Anzahl registrierter Nutzer (öffentlich)",
)
@limiter.limit("30/minute")
async def get_users_count(request: Request) -> dict:
    """Public endpoint — returns total active registered user count for social proof on landing page."""
    try:
        from sqlalchemy import select, func
        from app.db.database import get_session
        from app.db.models import User

        async with get_session() as session:
            result = await session.execute(
                select(func.count(User.id)).where(
                    User.is_active == True,
                    User.username != settings.DEMO_USERNAME,
                )
            )
            total = result.scalar_one() or 0
        return {"count": total}
    except Exception:
        return {"count": 0}


# ---------------------------------------------------------------------------
# PUT /api/auth/profile  — E-Mail-Adresse ändern (Auth required)
# ---------------------------------------------------------------------------

class ProfileUpdateRequest(BaseModel):
    email: str


class ProfileUpdateResponse(BaseModel):
    email: str
    message: str


@router.put(
    "/profile",
    response_model=ProfileUpdateResponse,
    summary="Profil-Daten aktualisieren (E-Mail)",
)
@limiter.limit("5/minute")
async def update_profile(
    body: ProfileUpdateRequest,
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> ProfileUpdateResponse:
    import re as _re
    email = body.email.strip().lower()
    if not _re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=422, detail="Ungültige E-Mail-Adresse")
    async with get_session() as session:
        # Check if email is already taken by another user
        existing = await session.execute(
            select(User).where(func.lower(User.email) == email, User.username != current_user.username)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Diese E-Mail-Adresse ist bereits vergeben")
        await session.execute(
            update(User)
            .where(User.username == current_user.username)
            .values(email=email)
        )
        await session.commit()
    _logger.info("profile_updated username=%s new_email=%s", current_user.username, email)
    return ProfileUpdateResponse(email=email, message="Profil aktualisiert")
