"""Legal / regulatory endpoints (P2 audit finding).

Exposes the machine-readable regulatory disclaimer so the frontend, mobile app
and third-party integrators can render the legally required "keine
Anlageberatung" notice and risk warning consistently.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.disclaimer import disclaimer_payload

router = APIRouter(tags=["legal"])


@router.get("/legal/disclaimer")
async def get_disclaimer() -> dict:
    """Return the regulatory disclaimer (DE/EN, short + full).

    Public, unauthenticated: the disclaimer must be reachable before login /
    onboarding so it can be shown up-front.
    """
    return disclaimer_payload()
