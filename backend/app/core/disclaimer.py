"""Regulatory disclaimers (P2 audit finding).

Neural Trading OS surfaces signals, backtests and portfolio analytics. None of
this constitutes investment advice (Anlageberatung) under German/EU law. This
module centralises the legally required notices so they can be rendered in API
responses, the UI and outbound communications consistently.

IMPORTANT: The wording below is a standards-based boilerplate. It MUST be
reviewed and signed off by qualified counsel (legal-privacy-counsel) and a
financial-compliance officer before public go-live. Treat it as a placeholder
that is correct in substance but not yet a substitute for legal review.
"""

from __future__ import annotations

from datetime import datetime, UTC

# ---------------------------------------------------------------------------
# Creator / provider identity (MAR Art. 20 + Delegierte VO (EU) 2016/958 Art. 2;
# Impressum § 5 DDG). These are PLACEHOLDERS — the CEO must replace every
# TODO-FIRMENDATEN value with the real registered company data before go-live.
# ---------------------------------------------------------------------------
COMPANY_NAME: str = "TODO-FIRMENDATEN: Firmenname GmbH"
COMPANY_LEGAL_FORM: str = "TODO-FIRMENDATEN: Rechtsform"
COMPANY_ADDRESS: str = "TODO-FIRMENDATEN: Straße Hausnr., PLZ Ort, Deutschland"
COMPANY_REPRESENTED_BY: str = "TODO-FIRMENDATEN: Geschäftsführer/Vertretungsberechtigte:r"
COMPANY_REGISTER: str = "TODO-FIRMENDATEN: Amtsgericht / HRB-Nummer"
COMPANY_VAT_ID: str = "TODO-FIRMENDATEN: USt-IdNr. (§ 27a UStG)"
COMPANY_EMAIL: str = "TODO-FIRMENDATEN: kontakt@example.com"
COMPANY_PHONE: str = "TODO-FIRMENDATEN: +49 ..."
COMPANY_CONTENT_RESPONSIBLE: str = "TODO-FIRMENDATEN: inhaltlich Verantwortliche:r (§ 18 Abs. 2 MStV)"

# Short methodology description (MAR — Grundlage der Empfehlung).
METHODOLOGY_SHORT_DE: str = (
    "Die Empfehlung wird automatisiert durch ein KI-gestütztes Multi-Agenten-System "
    "erzeugt, das öffentlich verfügbare Marktdaten, Fundamentaldaten, Nachrichten- und "
    "Stimmungssignale sowie technische Indikatoren auswertet. Die Aussage ist "
    "nicht-individuell und für einen unbestimmten Personenkreis bestimmt."
)

# Interessenkonflikt-Hinweis (MAR Art. 20 Abs. 1).
CONFLICT_OF_INTEREST_DE: str = (
    "Zum Zeitpunkt der Erstellung bestehen keine offenzulegenden eigenen Positionen "
    "oder Interessenkonflikte des Erstellers in Bezug auf das genannte Finanzinstrument. "
    "TODO-FIRMENDATEN: Sofern Eigenpositionen oder Vergütungen durch Dritte bestehen, "
    "sind diese hier offenzulegen."
)

# Prominente Kapitalverlust-Warnung.
CAPITAL_LOSS_WARNING_DE: str = (
    "⚠️ Risikohinweis: Der Handel mit Finanzinstrumenten ist mit dem Risiko des "
    "vollständigen Verlusts des eingesetzten Kapitals verbunden. Vergangene oder im "
    "Backtest erzielte Wertentwicklungen sind kein verlässlicher Indikator für die "
    "Zukunft."
)

# Explizite Negativabgrenzung (keine individuelle Anlageberatung).
NON_ADVICE_CLAUSE_DE: str = (
    "Dies ist eine allgemeine, nicht-individuelle Anlageempfehlung und keine auf Ihre "
    "persönliche Situation zugeschnittene Anlageberatung."
)

# KI-Kennzeichnung (KI-Verordnung (EU) 2024/1689 — AI Act Art. 50).
AI_GENERATED_NOTICE_DE: str = (
    "Dieser Inhalt wurde mithilfe künstlicher Intelligenz (KI) automatisiert erzeugt "
    "(Kennzeichnung gem. Art. 50 KI-VO)."
)

# Short notice — suitable for an HTTP response header / footer.
DISCLAIMER_SHORT_DE: str = (
    "Keine Anlageberatung. Alle Inhalte dienen nur zu Informations- und "
    "Bildungszwecken. Handel mit Finanzinstrumenten ist mit erheblichen "
    "Verlustrisiken verbunden."
)

DISCLAIMER_SHORT_EN: str = (
    "Not investment advice. All content is provided for information and "
    "educational purposes only. Trading financial instruments carries a high "
    "risk of loss."
)

# Full notice — for a dedicated legal endpoint, onboarding screen, T&Cs.
DISCLAIMER_FULL_DE: str = (
    "Rechtlicher Hinweis und Risikoaufklärung\n\n"
    "1. Keine Anlageberatung / keine Anlagevermittlung\n"
    "Die von Neural Trading OS bereitgestellten Signale, Backtests, Analysen "
    "und Portfolio-Auswertungen stellen weder eine Anlageberatung noch eine "
    "Anlagevermittlung im Sinne des Wertpapierhandelsgesetzes (WpHG) bzw. der "
    "Richtlinie 2014/65/EU (MiFID II) dar. Es erfolgt keine auf die "
    "persönlichen Verhältnisse des Nutzers zugeschnittene Empfehlung. Alle "
    "Inhalte dienen ausschließlich Informations- und Bildungszwecken.\n\n"
    "2. Risikohinweis\n"
    "Der Handel mit Finanzinstrumenten (insbesondere Aktien, Derivaten und "
    "Kryptowerten) ist mit erheblichen Risiken verbunden und kann zum "
    "vollständigen Verlust des eingesetzten Kapitals führen. Historische bzw. "
    "im Backtest erzielte Wertentwicklungen sind kein verlässlicher Indikator "
    "für zukünftige Ergebnisse. Treffen Sie keine Anlageentscheidung allein auf "
    "Basis der hier dargestellten Informationen.\n\n"
    "3. Eigenverantwortung\n"
    "Jede Anlageentscheidung erfolgt eigenverantwortlich. Ziehen Sie vor einer "
    "Anlageentscheidung einen unabhängigen, qualifizierten Berater hinzu, der "
    "Ihre persönlichen Verhältnisse und Anlageziele berücksichtigt.\n\n"
    "4. Keine Gewähr\n"
    "Für die Richtigkeit, Vollständigkeit und Aktualität der bereitgestellten "
    "Daten und Analysen wird keine Gewähr übernommen."
)

DISCLAIMER_FULL_EN: str = (
    "Legal Notice and Risk Warning\n\n"
    "1. Not investment advice / not investment broking\n"
    "The signals, backtests, analyses and portfolio evaluations provided by "
    "Neural Trading OS do not constitute investment advice or investment "
    "broking within the meaning of the German Securities Trading Act (WpHG) or "
    "Directive 2014/65/EU (MiFID II). No recommendation tailored to the user's "
    "personal circumstances is given. All content is provided solely for "
    "information and educational purposes.\n\n"
    "2. Risk warning\n"
    "Trading financial instruments (in particular equities, derivatives and "
    "crypto assets) involves significant risk and may lead to the total loss of "
    "the capital invested. Past or backtested performance is not a reliable "
    "indicator of future results. Do not make any investment decision based "
    "solely on the information presented here.\n\n"
    "3. Own responsibility\n"
    "Every investment decision is made at the user's own responsibility. Before "
    "making an investment decision, consult an independent, qualified adviser "
    "who takes your personal circumstances and investment objectives into "
    "account.\n\n"
    "4. No warranty\n"
    "No warranty is given for the accuracy, completeness or timeliness of the "
    "data and analyses provided."
)


def disclaimer_payload() -> dict[str, str]:
    """Structured disclaimer for API/JSON consumers."""
    return {
        "short_de": DISCLAIMER_SHORT_DE,
        "short_en": DISCLAIMER_SHORT_EN,
        "full_de": DISCLAIMER_FULL_DE,
        "full_en": DISCLAIMER_FULL_EN,
        "not_investment_advice": True,
    }


def mar_disclosure(*, ai_generated: bool = True, timestamp: datetime | None = None) -> dict:
    """Structured MAR / AI-Act disclosure attached to every recommendation/signal.

    Implements the mandatory disclosures of Art. 20 MAR in conjunction with
    Delegated Regulation (EU) 2016/958 (creator identity, methodology, conflict
    of interest, timestamp), the AI-Act Art. 50 "AI-generated" label, and the
    prominent capital-loss warning plus the explicit non-advice clause.

    Designed to be embedded as a structured field (``regulatory_notice``) in API
    payloads so the frontend can render it consistently next to each signal.
    """
    ts = (timestamp or datetime.now(UTC))
    return {
        "creator_identity": COMPANY_NAME,
        "methodology": METHODOLOGY_SHORT_DE,
        "conflict_of_interest": CONFLICT_OF_INTEREST_DE,
        "disclosure_timestamp": ts.isoformat(),
        "ai_generated": ai_generated,
        "ai_act_notice": AI_GENERATED_NOTICE_DE if ai_generated else None,
        "capital_loss_warning": CAPITAL_LOSS_WARNING_DE,
        "non_advice_clause": NON_ADVICE_CLAUSE_DE,
        "not_investment_advice": True,
    }


def imprint_payload() -> dict:
    """Impressum data (§ 5 DDG, § 18 MStV) — machine-readable for the frontend.

    All values are TODO-FIRMENDATEN placeholders the CEO must fill in with the
    real registered company data before public go-live.
    """
    return {
        "company_name": COMPANY_NAME,
        "legal_form": COMPANY_LEGAL_FORM,
        "address": COMPANY_ADDRESS,
        "represented_by": COMPANY_REPRESENTED_BY,
        "register": COMPANY_REGISTER,
        "vat_id": COMPANY_VAT_ID,
        "email": COMPANY_EMAIL,
        "phone": COMPANY_PHONE,
        "content_responsible": COMPANY_CONTENT_RESPONSIBLE,
        "placeholder_notice": (
            "Diese Angaben sind Platzhalter (TODO-FIRMENDATEN) und müssen vor dem "
            "öffentlichen Go-Live durch die echten Unternehmensdaten ersetzt werden."
        ),
    }
