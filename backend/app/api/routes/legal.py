"""Legal / regulatory endpoints (P2 audit finding).

Exposes the machine-readable regulatory disclaimer so the frontend, mobile app
and third-party integrators can render the legally required "keine
Anlageberatung" notice and risk warning consistently.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.disclaimer import disclaimer_payload, imprint_payload, mar_disclosure

router = APIRouter(tags=["legal"])


@router.get("/legal/disclaimer")
async def get_disclaimer() -> dict:
    """Return the regulatory disclaimer (DE/EN, short + full).

    Public, unauthenticated: the disclaimer must be reachable before login /
    onboarding so it can be shown up-front.
    """
    return disclaimer_payload()


@router.get("/legal/mar-disclosure")
async def get_mar_disclosure() -> dict:
    """Return the structured MAR / AI-Act disclosure (Art. 20 MAR, Art. 50 AI-Act).

    Same payload embedded as ``regulatory_notice`` in every signal/report, exposed
    standalone so the frontend can render a static regulatory page.
    """
    return mar_disclosure()


@router.get("/legal/imprint")
async def get_imprint() -> dict:
    """Return the Impressum data (§ 5 DDG, § 18 MStV).

    Public, unauthenticated. Values are TODO-FIRMENDATEN placeholders until the
    operator fills in the real registered company data.
    """
    return imprint_payload()
