"""
/api/settings — In-app credential management.

Endpoints:
  GET    /api/settings/credentials          — status dict (configured/not_set per key)
  POST   /api/settings/credentials          — upsert one credential
  DELETE /api/settings/credentials/{key}    — remove one credential
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.auth import UserInfo
from app.api.routes.admin import _require_admin
from app.services.credentials import (
    get_all_statuses,
    set_credential,
    delete_credential,
    _ALLOWED_KEYS,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])


class CredentialBody(BaseModel):
    key: str
    value: str


@router.get("/credentials")
async def list_credentials(
    _user: UserInfo = Depends(_require_admin),
) -> dict[str, str]:
    """Return configured/not_set status for each managed credential key.

    Admin-only (P1 audit finding): the configured/not-set status of the
    system-wide secret store (Stripe, Anthropic, bot token, brokers) must not be
    enumerable by every logged-in user — this mirrors the POST/DELETE guards.
    """
    return await get_all_statuses()


@router.post("/credentials")
async def save_credential(
    body: CredentialBody,
    _user: UserInfo = Depends(_require_admin),
) -> dict:
    """Upsert a single credential in the DB. Admin-only (system-wide secret store)."""
    if body.key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Schlüssel '{body.key}' ist nicht erlaubt")
    if not body.value.strip():
        raise HTTPException(status_code=400, detail="Wert darf nicht leer sein")
    await set_credential(body.key, body.value.strip())
    logger.info("credential_saved", extra={"key": body.key})
    return {"ok": True, "key": body.key}


@router.delete("/credentials/{key}")
async def remove_credential(
    key: str,
    _user: UserInfo = Depends(_require_admin),
) -> dict:
    """Remove a credential from the DB (env var fallback still applies). Admin-only."""
    if key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Schlüssel '{key}' ist nicht erlaubt")
    found = await delete_credential(key)
    logger.info("credential_deleted", extra={"key": key, "found": found})
    return {"ok": True, "key": key, "found": found}
