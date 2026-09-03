"""Shared FastAPI dependency helpers used across the API routers."""
from fastapi import Depends, HTTPException, status

from app.api.auth import UserInfo, get_current_user


def require_admin(detail_suffix: str = ""):
    """Build a FastAPI dependency that requires ``role == "admin"``.

    Several routers gate an entire resource behind an admin-only check that
    was previously copy-pasted with only the 403 detail message differing
    (e.g. broker/P2P routes append a hint about which account data is being
    protected). ``detail_suffix`` is appended verbatim to the standard
    German 403 message so those call-site-specific hints keep working,
    e.g. ``require_admin(" (Broker-/Kontodaten)")``.
    """
    def _require_admin(current_user: UserInfo = Depends(get_current_user)) -> UserInfo:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Zugriff verweigert — Admin-Rolle erforderlich{detail_suffix}",
            )
        return current_user

    return _require_admin
