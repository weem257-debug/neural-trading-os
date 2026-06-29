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
