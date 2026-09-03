"""Centralized outbound SMTP email helper.

This consolidates the SMTP boilerplate that used to be duplicated across
``app/api/auth.py``, ``app/api/routes/{admin,billing,signals,waitlist}.py``
and ``app/main.py``: an ``SMTP_HOST``-configured guard, sender resolution,
a ``multipart/alternative`` message (plain text + optional HTML), optional
``List-Unsubscribe`` / ``List-Unsubscribe-Post`` headers, STARTTLS, optional
login and ``sendmail`` — wrapped in a best-effort try/except that logs at
WARNING and never raises.

Callers that were building the message and sending it inline should call
:func:`send_mail` (async, runs the blocking SMTP call in a thread) or
:func:`send_mail_sync` (for use from inside an already-offloaded thread,
e.g. a function passed to ``asyncio.to_thread`` elsewhere).

A handful of call sites deviate slightly from the common pattern (e.g.
``app/services/price_alerts/manager.py`` always calls ``starttls()``,
defaults the port to 587 and only logs in when both user *and* password are
set). The optional keyword-only parameters below cover those deviations so
a single helper can serve every call site.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

log = logging.getLogger(__name__)


def send_mail_sync(
    to: str,
    subject: str,
    text: str,
    html: Optional[str] = None,
    unsub_url: Optional[str] = None,
    *,
    sender: Optional[str] = None,
    sender_fallback: Optional[str] = None,
    smtp_port: Optional[int] = None,
    always_starttls: bool = False,
    require_password_for_login: bool = False,
    list_unsubscribe_post: bool = True,
    raise_on_error: bool = False,
    failure_log_level: int = logging.WARNING,
) -> bool:
    """Build and send one email synchronously. Returns True on success.

    ``failure_log_level`` controls how loudly a send failure is logged;
    best-effort notifications that were always quiet (e.g. the admin
    "new registration" ping) pass ``logging.DEBUG`` so a dead SMTP host
    does not start paging anyone.

    By default never raises: a missing ``SMTP_HOST`` or any send failure is
    logged and reported back as ``False`` so callers can treat email
    delivery as best-effort fire-and-forget. Pass ``raise_on_error=True``
    (e.g. an admin "send test email" endpoint that reports the concrete
    SMTP error back to the caller) to have send failures logged and then
    re-raised instead of swallowed; the missing-``SMTP_HOST`` guard still
    just returns ``False``.
    """
    if not settings.SMTP_HOST:
        log.info("mail_send_skipped_no_smtp to=%s subject=%s", to, subject)
        return False

    from_addr = sender or settings.SMTP_FROM or settings.SMTP_USER or sender_fallback

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    if unsub_url:
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        if list_unsubscribe_post:
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    msg.attach(MIMEText(text, "plain"))
    if html:
        msg.attach(MIMEText(html, "html"))

    port = smtp_port if smtp_port is not None else settings.SMTP_PORT
    try:
        with smtplib.SMTP(settings.SMTP_HOST, port) as srv:
            if always_starttls or settings.SMTP_HOST != "localhost":
                srv.starttls()
            if require_password_for_login:
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            elif settings.SMTP_USER:
                srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            srv.sendmail(from_addr, [to], msg.as_string())
        return True
    except Exception as exc:
        log.log(failure_log_level, "mail_send_failed to=%s subject=%s error=%s", to, subject, exc)
        if raise_on_error:
            raise
        return False


async def send_mail(
    to: str,
    subject: str,
    text: str,
    html: Optional[str] = None,
    unsub_url: Optional[str] = None,
    *,
    sender: Optional[str] = None,
    sender_fallback: Optional[str] = None,
    smtp_port: Optional[int] = None,
    always_starttls: bool = False,
    require_password_for_login: bool = False,
    list_unsubscribe_post: bool = True,
    raise_on_error: bool = False,
    failure_log_level: int = logging.WARNING,
) -> bool:
    """Async wrapper around :func:`send_mail_sync` via ``asyncio.to_thread``."""
    return await asyncio.to_thread(
        send_mail_sync,
        to,
        subject,
        text,
        html,
        unsub_url,
        sender=sender,
        sender_fallback=sender_fallback,
        smtp_port=smtp_port,
        always_starttls=always_starttls,
        require_password_for_login=require_password_for_login,
        list_unsubscribe_post=list_unsubscribe_post,
        raise_on_error=raise_on_error,
        failure_log_level=failure_log_level,
    )
