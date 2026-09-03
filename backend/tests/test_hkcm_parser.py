"""
HKCM newsletter parser tests.

The fixture is a real "Tägliches Aktien-Update" reduced to two instruments
(the salutation is anonymised): one with a full Long setup and one Spot entry
with no stop — the two shapes the newsletter actually uses.
"""

from datetime import UTC, datetime
from email.message import EmailMessage
from pathlib import Path

import pytest

from app.services.hkcm.parser import (
    HkcmParseError,
    html_to_lines,
    parse_email,
    parse_html,
    parse_lines,
)

FIXTURE = Path(__file__).parent / "fixtures" / "hkcm_daily.txt"


@pytest.fixture
def issue():
    return parse_lines(FIXTURE.read_text(encoding="utf-8").splitlines(), subject="Tägliches Aktien-Update")


# --------------------------------------------------------------------------
# Issue level
# --------------------------------------------------------------------------


def test_finds_every_instrument(issue):
    assert [a.ticker for a in issue.analyses] == ["HD", "SBUX"]
    assert [a.name for a in issue.analyses] == ["Home Depot", "Starbucks"]
    assert [a.position for a in issue.analyses] == [0, 1]


def test_isin_and_category(issue):
    assert issue.analyses[0].isin == "US4370761029"
    assert issue.analyses[1].isin == "US8552441094"
    assert issue.category == "US-Titans"


def test_news_and_upcoming_are_issue_level(issue):
    assert "Kryptomarkt" in issue.news
    assert issue.upcoming == "Boeing, UnitedHealth, Goldman Sachs und BlackRock."


def test_content_hash_is_stable_and_ignores_the_footer(issue):
    again = parse_lines(FIXTURE.read_text(encoding="utf-8").splitlines())
    assert issue.content_hash == again.content_hash

    with_extra_footer = FIXTURE.read_text(encoding="utf-8") + "\nNoch ein Impressum-Absatz\n"
    changed = parse_lines(with_extra_footer.splitlines())
    assert changed.content_hash == issue.content_hash


# --------------------------------------------------------------------------
# Trade parameters
# --------------------------------------------------------------------------


def test_long_setup_parameters(issue):
    hd = issue.analyses[0]
    assert hd.entry == pytest.approx(313.69)
    assert hd.entry_kind == "Long"
    assert hd.entry_potential is False
    assert hd.stop == pytest.approx(284.13)
    assert hd.stop_note == ""
    assert hd.partial_exit == pytest.approx(329.36)
    assert hd.risk_note == "1% des gesamten Trading-Kapitals"
    assert hd.headline == "Bodenbildung?"


def test_spot_entry_without_stop_keeps_the_note(issue):
    sbux = issue.analyses[1]
    assert sbux.entry == pytest.approx(48.25)
    assert sbux.entry_kind == "Spot"
    assert sbux.stop is None
    assert sbux.stop_note == "Kein Stopp"
    assert sbux.partial_exit is None
    assert sbux.headline == "Mehr Platz für die Zwischenkorrektur"


def test_potential_parameters_are_flagged():
    lines = [
        "Apple",
        "AAPL // ISIN: US0378331005",
        "(Potenzielle) Handelsparameter",
        "(Long-)Einstieg: $184.64",
        "Unser Stopp: $161.38",
        "Hin- und hergerissen",
        "Was ist passiert?",
        "Text.",
    ]
    aapl = parse_lines(lines).analyses[0]
    assert aapl.entry_potential is True
    assert aapl.headline == "Hin- und hergerissen"


# --------------------------------------------------------------------------
# Levels and zones
# --------------------------------------------------------------------------


def test_support_and_resistance_lists(issue):
    hd, sbux = issue.analyses
    assert hd.supports == [pytest.approx(264.51)]
    assert hd.resistances == [pytest.approx(397.62), pytest.approx(439.37)]
    assert sbux.supports == [pytest.approx(75.50), pytest.approx(68.39)]
    assert sbux.resistances == [pytest.approx(105.72), pytest.approx(117.46)]


def test_prices_inside_prose_are_not_mistaken_for_levels(issue):
    """The outlook mentions $439.37 and $89.90 in running text; only the lines
    under an explicit "als Widerstände relevant:" heading count."""
    hd = issue.analyses[0]
    assert 89.90 not in hd.supports
    assert 210.23 not in hd.resistances


def test_target_zones_are_deduplicated_and_ordered_low_to_high(issue):
    hd = issue.analyses[0]
    zones = {(z.color, round(z.low, 2), round(z.high, 2)) for z in hd.target_zones}
    # $313.69 – $287.01 is printed four times in the block but stored once,
    # normalised to (low, high).
    assert ("gruen", 287.01, 313.69) in zones
    assert ("gruen", 89.90, 210.23) in zones
    assert len(hd.target_zones) == 2


def test_long_term_entry_zone_is_captured(issue):
    sbux = issue.analyses[1]
    blue = [z for z in sbux.target_zones if z.color == "blau"]
    assert len(blue) == 1
    assert blue[0].label == "Langfrist-Einstiegsbereich"
    assert blue[0].low == pytest.approx(27.03)
    assert blue[0].high == pytest.approx(48.25)


# --------------------------------------------------------------------------
# Narrative sections
# --------------------------------------------------------------------------


def test_sections_are_separated(issue):
    hd = issue.analyses[0]
    assert hd.what_happened.startswith("Das Wertpapier von Home Depot")
    assert hd.primary_scenario.startswith("ANPASSUNGEN: Primär erwarten wir")
    assert hd.alternative_scenario == "ANPASSUNGEN: Derzeit führen wir kein Alternativszenario."
    assert "Wochenchart" in hd.outlook
    assert hd.opportunities.startswith("Die grüne Zielzone")
    # The news block must not leak into the last narrative section.
    assert "Kryptomarkt" not in hd.opportunities


def test_alternative_probability_comes_from_its_own_section(issue):
    hd, sbux = issue.analyses
    # HD prints "Wahrscheinlichkeit: 36%" in the OUTLOOK, not in the (empty)
    # alternative scenario — so no probability may be attributed.
    assert hd.alternative_probability is None
    # SBUX prints 34% in the alternative section and 40% in the outlook.
    assert sbux.alternative_probability == 34


# --------------------------------------------------------------------------
# HTML input
# --------------------------------------------------------------------------

_HTML = """
<html><body>
  <table><tr><td>US-Titans</td></tr></table>
  <p>Home Depot</p>
  <p>HD // ISIN: US4370761029</p>
  <div>Handelsparameter</div>
  <div>(Long-)Einstieg: $313.69</div>
  <div>Unser Stopp: $284.13</div>
  <div>Bodenbildung?</div>
  <div>Was ist passiert?</div>
  <div>Kurs&nbsp;konsolidiert
       weiter.</div>
  <img src="https://r.sib.hkcmanagement.de/im/1/aaa">
  <img src="https://r.sib.hkcmanagement.de/im/1/bbb">
  <script>var ignored = "Primärszenario";</script>
</body></html>
"""


def test_html_flattening_collapses_whitespace_and_skips_scripts():
    lines, images = html_to_lines(_HTML)
    assert "Kurs konsolidiert weiter." in lines
    assert not any("var ignored" in line for line in lines)
    assert sum(len(v) for v in images.values()) == 2


def test_html_parse_attributes_chart_images_to_the_block():
    hd = parse_html(_HTML).analyses[0]
    assert hd.ticker == "HD"
    assert hd.entry == pytest.approx(313.69)
    assert hd.chart_urls == [
        "https://r.sib.hkcmanagement.de/im/1/aaa",
        "https://r.sib.hkcmanagement.de/im/1/bbb",
    ]


def test_parse_email_prefers_html_and_reads_the_headers():
    msg = EmailMessage()
    msg["Subject"] = "Tägliches Aktien-Update"
    msg["From"] = "HKCM <marketupdates@hkcmanagement.de>"
    msg["Message-ID"] = "<abc-123@hkcmanagement.de>"
    msg["Date"] = "Thu, 02 Apr 2026 13:42:00 +0200"
    msg.set_content("Nur ein Teaser ohne Handelsparameter.")
    msg.add_alternative(_HTML, subtype="html")

    parsed = parse_email(msg.as_bytes())
    assert parsed.subject == "Tägliches Aktien-Update"
    assert parsed.message_id == "<abc-123@hkcmanagement.de>"
    assert parsed.sent_at is not None
    assert parsed.sent_at.astimezone(UTC) == datetime(2026, 4, 2, 11, 42, tzinfo=UTC)
    # The plain-text alternative has no trade parameters — proving HTML won.
    assert parsed.analyses[0].entry == pytest.approx(313.69)


# --------------------------------------------------------------------------
# Rejection
# --------------------------------------------------------------------------


def test_unrelated_mail_is_rejected():
    with pytest.raises(HkcmParseError):
        parse_lines(["Hallo", "das ist keine HKCM-Mail", "$123.45"])
