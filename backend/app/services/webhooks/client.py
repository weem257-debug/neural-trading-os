"""
Outbound Webhook Manager
------------------------
Manages a list of registered outbound webhooks and delivers events to them
with HMAC-SHA256 signing, retry logic, and exponential backoff.

Supported event types:
  signal.generated  — new trading signal produced
  alert.fired       — price alert triggered
  order.filled      — order execution filled
  risk.alert        — risk threshold breached

Usage:
    from app.services.webhooks.client import get_webhook_manager

    mgr = get_webhook_manager()
    await mgr.register(url="https://example.com/hook", events=["signal.generated"])
    await mgr.dispatch("signal.generated", {"ticker": "AAPL", ...})
"""
import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import uuid
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# The cloud instance-metadata address — a classic SSRF target.
_METADATA_IPS = frozenset({"169.254.169.254", "fd00:ec2::254"})


class WebhookURLError(ValueError):
    """Raised when a webhook URL fails SSRF / format validation."""


def _ip_is_blocked(ip: ipaddress._BaseAddress) -> bool:
    """True for any address class that must never be reachable from a webhook."""
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or str(ip) in _METADATA_IPS
    )


def validate_webhook_url(url: str, *, allow_local: bool = False) -> None:
    """
    SSRF guard for outbound webhook targets (H2).

    Rejects:
      * non-HTTP(S) schemes; only https is allowed (http only when allow_local).
      * URLs whose host resolves to private / loopback / link-local / reserved /
        multicast / metadata addresses.

    ``allow_local`` is enabled only in non-hardened (dev/test) environments so
    local development against http://localhost keeps working. Raises
    WebhookURLError on any violation.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("https", "http"):
        raise WebhookURLError("Webhook-URL muss mit https:// beginnen.")
    if parsed.scheme == "http" and not allow_local:
        raise WebhookURLError("Webhook-URL muss HTTPS verwenden (http ist nicht erlaubt).")

    host = parsed.hostname
    if not host:
        raise WebhookURLError("Webhook-URL enthält keinen gültigen Host.")

    # Resolve every address the host maps to and block if ANY is internal.
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise WebhookURLError(f"Webhook-Host konnte nicht aufgelöst werden: {host}") from exc

    resolved_ips = {info[4][0] for info in infos}
    for raw_ip in resolved_ips:
        try:
            ip = ipaddress.ip_address(raw_ip.split("%")[0])  # strip scope id
        except ValueError:
            continue
        if _ip_is_blocked(ip):
            # Dev convenience: localhost/private targets allowed off-prod — but
            # NEVER the cloud-metadata address or other link-local/reserved
            # ranges, which are pure SSRF targets with no legitimate dev use.
            dev_allowed = (
                allow_local
                and (ip.is_loopback or ip.is_private)
                and str(ip) not in _METADATA_IPS
                and not ip.is_link_local
            )
            if dev_allowed:
                continue
            raise WebhookURLError(
                f"Webhook-Ziel ist nicht erlaubt (interne/reservierte Adresse: {ip})."
            )

# Valid event types
WEBHOOK_EVENTS = frozenset([
    "signal.generated",
    "alert.fired",
    "order.filled",
    "risk.alert",
])

_MAX_WEBHOOKS = 20
_REQUEST_TIMEOUT = 5.0          # seconds per attempt
_MAX_RETRIES = 3
_RETRY_BACKOFF = [1.0, 2.0, 4.0]  # exponential delays in seconds


@dataclass
class WebhookRegistration:
    """A single registered outbound webhook."""
    id: str
    url: str
    events: list[str]
    secret: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_delivery_at: Optional[datetime] = None
    last_delivery_status: Optional[int] = None
    delivery_failures: int = 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "events": self.events,
            "created_at": self.created_at.isoformat(),
            "last_delivery_at": self.last_delivery_at.isoformat() if self.last_delivery_at else None,
            "last_delivery_status": self.last_delivery_status,
            "delivery_failures": self.delivery_failures,
        }


class WebhookManager:
    """
    In-memory webhook registry (max 20 entries).

    Thread-safe for asyncio (single event loop). Not process-safe — for
    multi-worker deployments, replace _webhooks with a Redis-backed store.
    """

    def __init__(self) -> None:
        self._webhooks: dict[str, WebhookRegistration] = {}

    # ------------------------------------------------------------------
    # Registry operations
    # ------------------------------------------------------------------

    def register(
        self,
        url: str,
        events: list[str],
        secret: str = "",
    ) -> WebhookRegistration:
        """Register a new outbound webhook. Returns the registration."""
        if len(self._webhooks) >= _MAX_WEBHOOKS:
            raise ValueError(f"Maximale Anzahl von {_MAX_WEBHOOKS} Webhooks erreicht. Bitte zuerst einen löschen.")

        unknown = set(events) - WEBHOOK_EVENTS
        if unknown:
            raise ValueError(f"Unbekannte Event-Typen: {unknown}. Erlaubt: {sorted(WEBHOOK_EVENTS)}")

        # H2 — SSRF guard. Allow http/localhost targets only off-production.
        try:
            from app.core.config import is_hardened_environment
            allow_local = not is_hardened_environment()
        except Exception:
            allow_local = False
        validate_webhook_url(url, allow_local=allow_local)

        wh = WebhookRegistration(
            id=str(uuid.uuid4()),
            url=url,
            events=events,
            secret=secret or _default_secret(),
        )
        self._webhooks[wh.id] = wh
        logger.info("webhook_registered id=%s url=%s events=%s", wh.id, url, events)
        return wh

    def get_all(self) -> list[WebhookRegistration]:
        return list(self._webhooks.values())

    def get(self, webhook_id: str) -> Optional[WebhookRegistration]:
        return self._webhooks.get(webhook_id)

    def delete(self, webhook_id: str) -> bool:
        if webhook_id in self._webhooks:
            del self._webhooks[webhook_id]
            logger.info("webhook_deleted id=%s", webhook_id)
            return True
        return False

    # ------------------------------------------------------------------
    # Delivery
    # ------------------------------------------------------------------

    async def dispatch(self, event: str, payload: dict) -> None:
        """
        Send `event` to all webhooks subscribed to it.
        Delivery happens concurrently; failures are logged, not raised.
        """
        subscribers = [w for w in self._webhooks.values() if event in w.events]
        if not subscribers:
            return

        envelope = {
            "event": event,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": payload,
        }
        await asyncio.gather(
            *[self._deliver(wh, envelope) for wh in subscribers],
            return_exceptions=True,
        )

    async def send_test(self, webhook_id: str) -> dict:
        """Send a test event to a specific webhook. Returns delivery result."""
        wh = self._webhooks.get(webhook_id)
        if not wh:
            raise KeyError(f"Webhook {webhook_id} not found")

        envelope = {
            "event": "test",
            "timestamp": datetime.now(UTC).isoformat(),
            "data": {"message": "Test delivery from Neural Trading OS"},
        }
        status = await self._deliver(wh, envelope)
        return {"webhook_id": webhook_id, "status_code": status, "success": status in range(200, 300)}

    async def _deliver(self, wh: WebhookRegistration, envelope: dict) -> int:
        """
        POST envelope to webhook URL with HMAC signing and retries.
        Returns the final HTTP status code (or 0 on connection error).
        """
        body = json.dumps(envelope, default=str).encode()
        signature = _sign(body, wh.secret)
        headers = {
            "Content-Type": "application/json",
            "X-Trading-Signature": f"sha256={signature}",
            "X-Trading-Event": envelope.get("event", ""),
            "User-Agent": "NeuralTradingOS-Webhook/1.0",
        }

        last_status = 0
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            for attempt, delay in enumerate(
                [0.0] + _RETRY_BACKOFF[: _MAX_RETRIES - 1], start=1
            ):
                if delay > 0:
                    await asyncio.sleep(delay)
                try:
                    response = await client.post(wh.url, content=body, headers=headers)
                    last_status = response.status_code
                    wh.last_delivery_at = datetime.now(UTC)
                    wh.last_delivery_status = last_status

                    if 200 <= last_status < 300:
                        wh.delivery_failures = 0
                        logger.info(
                            "webhook_delivered id=%s event=%s status=%s attempt=%s",
                            wh.id, envelope.get("event"), last_status, attempt,
                        )
                        return last_status

                    logger.warning(
                        "webhook_delivery_non_2xx id=%s status=%s attempt=%s",
                        wh.id, last_status, attempt,
                    )
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    logger.warning(
                        "webhook_delivery_error id=%s reason=%s attempt=%s",
                        wh.id, str(exc), attempt,
                    )

        # All retries exhausted
        wh.delivery_failures += 1
        logger.error(
            "webhook_delivery_failed id=%s event=%s final_status=%s",
            wh.id, envelope.get("event"), last_status,
        )
        return last_status


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sign(body: bytes, secret: str) -> str:
    """Return HMAC-SHA256 hex digest of body using secret."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _default_secret() -> str:
    """Fall back to Settings.JWT_SECRET_KEY if no per-webhook secret given."""
    try:
        from app.core.config import settings
        return settings.JWT_SECRET_KEY
    except Exception:
        return "neural-trading-os-default-webhook-secret"


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_manager: Optional[WebhookManager] = None


def get_webhook_manager() -> WebhookManager:
    global _manager
    if _manager is None:
        _manager = WebhookManager()
    return _manager
