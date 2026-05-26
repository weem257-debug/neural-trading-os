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

from app.api.auth import get_current_user, UserInfo
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
    _user: UserInfo = Depends(get_current_user),
) -> dict[str, str]:
    """Return configured/not_set status for each managed credential key."""
    return await get_all_statuses()


@router.post("/credentials")
async def save_credential(
    body: CredentialBody,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Upsert a single credential in the DB."""
    if body.key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Key '{body.key}' is not allowed")
    if not body.value.strip():
        raise HTTPException(status_code=400, detail="Value must not be empty")
    await set_credential(body.key, body.value.strip())
    logger.info("credential_saved", extra={"key": body.key})
    return {"ok": True, "key": body.key}


@router.delete("/credentials/{key}")
async def remove_credential(
    key: str,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Remove a credential from the DB (env var fallback still applies)."""
    if key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Key '{key}' is not allowed")
    found = await delete_credential(key)
    logger.info("credential_deleted", extra={"key": key, "found": found})
    return {"ok": True, "key": key, "found": found}
