"""
HKCM newsletter parser
----------------------
Turns a "Tägliches Aktien-Update" mail from Hopf-Klinkmüller Capital Management
(marketupdates@hkcmanagement.de) into structured per-ticker analyses.

The newsletter is a Brevo/Sendinblue HTML mail with a rigid layout, which is
what makes it parseable at all:

    US-Titans                        <- category
    Home Depot                       <- instrument name
    HD // ISIN: US4370761029         <- BLOCK ANCHOR
    Handelsparameter
    (Long-)Einstieg: $313.69
    Unser Stopp: $284.13
    (Teil-)Ausstieg (halbe Position): $329.36
    Risiko pro Trade: 1% des gesamten Trading-Kapitals
    Bodenbildung?                    <- headline
    Was ist passiert?                <- section
    ...
    Primärszenario / Alternativszenario / Übergeordneter Ausblick /
    Handelsmöglichkeiten
    Aktuell ist die folgende Marke als Unterstützung relevant:
    $264.51
    Aktuell sind die folgenden Marken als Widerstände relevant:
    $397.62
    $439.37
    Home Depot 2h                    <- chart caption (image follows)
    Home Depot 1 Week

Everything keys off the `TICKER // ISIN: ...` anchor line: a block runs from one
anchor to the next. Sections inside a block are found by their exact German
headings; anything not recognised is ignored rather than guessed at, so a
layout change degrades to missing fields instead of wrong numbers.

The parser works on a normalised LINE stream, so it can be fed either the mail
HTML (via `parse_email`, which also carries the image URLs) or plain text (via
`parse_lines`) — the latter is what the tests use.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, UTC
from email import message_from_bytes, policy
from email.message import EmailMessage
from typing import Iterable, Optional

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

SENDER_ADDRESS = "marketupdates@hkcmanagement.de"

# `TICKER // ISIN: XX0000000000` — the anchor every block hangs off.
_ANCHOR_RE = re.compile(r"^([A-Z0-9][A-Z0-9.\-]{0,9})\s*//\s*ISIN:\s*([A-Z]{2}[A-Z0-9]{9}\d)$")

# "(Long-)Einstieg: $313.69", "(Spot-)Einstieg: $48.25", "(Short-)Einstieg: ..."
_ENTRY_RE = re.compile(r"^\((?P<kind>[^)]+?)-\)Einstieg:\s*(?P<value>.+)$")
_STOP_RE = re.compile(r"^Unser Stopp:\s*(?P<value>.+)$")
_PARTIAL_RE = re.compile(r"^\(Teil-\)Ausstieg[^:]*:\s*(?P<value>.+)$")
_RISK_RE = re.compile(r"^Risiko pro Trade:\s*(?P<value>.+)$")

# "$313.69" / "$1,234.56" — the newsletter always prefixes prices with $.
_PRICE_RE = re.compile(r"\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)")
_PRICE_ONLY_RE = re.compile(r"^\$\s*[0-9][0-9,]*(?:\.[0-9]+)?$")

# "grüne Zielzone (Koordinaten: $313.69 – $287.01)" — the dash is an EN DASH.
# `blauer Langfrist-Einstiegsbereich` uses the same coordinate syntax.
_ZONE_RE = re.compile(
    r"(?P<color>grün|rot|blau)\w*\s+(?P<label>Zielzone|Langfrist-Einstiegsbereich)"
    r"[^(]*\(Koordinaten:\s*(?P<low>\$[\d.,]+)\s*[–—-]\s*(?P<high>\$[\d.,]+)\)",
    re.IGNORECASE,
)

_PROBABILITY_RE = re.compile(r"Wahrscheinlichkeit:\s*(\d{1,3})\s*%")

_SUPPORT_HEADING_RE = re.compile(r"^Aktuell (?:ist|sind) die folgende[nr]? Marken? als Unterstützung(?:en)? relevant:$")
_RESISTANCE_HEADING_RE = re.compile(r"^Aktuell (?:ist|sind) die folgende[nr]? Marken? als Widerständ?e?n? relevant:$")
_UPCOMING_RE = re.compile(r"^Am \w+ veröffentlichen wir Analysen zu folgenden Titeln:$")
_NEWS_HEADING = "NEWS: Was ist los in der Finanzwelt?"
_CATEGORY_HEADING = "Ihre aktuellen Analysen"

# Narrative sections, keyed by their exact heading line.
_SECTION_HEADINGS = {
    "Was ist passiert?": "what_happened",
    "Primärszenario": "primary_scenario",
    "Alternativszenario": "alternative_scenario",
    "Übergeordneter Ausblick": "outlook",
    "Handelsmöglichkeiten": "opportunities",
}

# Lines that mark the end of the analysis body — everything after is boilerplate.
_FOOTER_MARKERS = (
    "Hopf-Klinkmüller Capital Management GmbH & Co. KG",
    "Hinweis Haftungsausschluss",
    "Ganz bequem auch über die App",
)

_PARAMETER_HEADINGS = ("Handelsparameter", "(Potenzielle) Handelsparameter")

# Block-level tags that force a line break when flattening HTML.
_BLOCK_TAGS = frozenset(
    {"p", "div", "br", "tr", "td", "th", "table", "li", "ul", "ol",
     "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "center"}
)


# --------------------------------------------------------------------------
# Result types
# --------------------------------------------------------------------------


@dataclass
class TargetZone:
    color: str          # "gruen" | "rot" | "blau"
    label: str          # "Zielzone" | "Langfrist-Einstiegsbereich"
    low: Optional[float]
    high: Optional[float]

    def as_dict(self) -> dict:
        return {"color": self.color, "label": self.label, "low": self.low, "high": self.high}


@dataclass
class HkcmAnalysis:
    """One instrument's analysis out of a single newsletter issue."""

    ticker: str
    isin: str
    name: str = ""
    headline: str = ""
    entry: Optional[float] = None
    entry_kind: str = ""              # "Long" | "Spot" | "Short"
    entry_potential: bool = False     # "(Potenzielle) Handelsparameter"
    stop: Optional[float] = None
    stop_note: str = ""               # e.g. "Kein Stopp"
    partial_exit: Optional[float] = None
    risk_note: str = ""
    what_happened: str = ""
    primary_scenario: str = ""
    alternative_scenario: str = ""
    alternative_probability: Optional[int] = None
    outlook: str = ""
    opportunities: str = ""
    supports: list[float] = field(default_factory=list)
    resistances: list[float] = field(default_factory=list)
    target_zones: list[TargetZone] = field(default_factory=list)
    chart_urls: list[str] = field(default_factory=list)
    position: int = 0

    def as_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "isin": self.isin,
            "name": self.name,
            "headline": self.headline,
            "entry": self.entry,
            "entry_kind": self.entry_kind,
            "entry_potential": self.entry_potential,
            "stop": self.stop,
            "stop_note": self.stop_note,
            "partial_exit": self.partial_exit,
            "risk_note": self.risk_note,
            "what_happened": self.what_happened,
            "primary_scenario": self.primary_scenario,
            "alternative_scenario": self.alternative_scenario,
            "alternative_probability": self.alternative_probability,
            "outlook": self.outlook,
            "opportunities": self.opportunities,
            "supports": self.supports,
            "resistances": self.resistances,
            "target_zones": [z.as_dict() for z in self.target_zones],
            "chart_urls": self.chart_urls,
            "position": self.position,
        }


@dataclass
class HkcmIssue:
    """A whole newsletter mail."""

    subject: str = ""
    category: str = ""                # "US-Titans", "Sonderbericht", ...
    sent_at: Optional[datetime] = None
    message_id: str = ""
    news: str = ""
    upcoming: str = ""                # "Boeing, UnitedHealth, Goldman Sachs und BlackRock."
    content_hash: str = ""
    analyses: list[HkcmAnalysis] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "subject": self.subject,
            "category": self.category,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "message_id": self.message_id,
            "news": self.news,
            "upcoming": self.upcoming,
            "content_hash": self.content_hash,
            "analyses": [a.as_dict() for a in self.analyses],
        }


class HkcmParseError(ValueError):
    """Raised when a mail carries no recognisable HKCM analysis block."""


# --------------------------------------------------------------------------
# Value helpers
# --------------------------------------------------------------------------


def _price(text: str) -> Optional[float]:
    """First `$1,234.56`-style price in `text`, or None."""
    m = _PRICE_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _prices(text: str) -> list[float]:
    out: list[float] = []
    for raw in _PRICE_RE.findall(text):
        try:
            out.append(float(raw.replace(",", "")))
        except ValueError:
            continue
    return out


_COLOR_MAP = {"grün": "gruen", "rot": "rot", "blau": "blau"}


def _zones(text: str) -> list[TargetZone]:
    """
    Every distinct target zone mentioned anywhere in a block.

    The same zone is repeated across sections ("grüne Zielzone (Koordinaten:
    $313.69 – $287.01)" shows up in three paragraphs), so identical
    colour+bounds triples are collapsed — the first mention wins.
    """
    seen: set[tuple] = set()
    zones: list[TargetZone] = []
    for m in _ZONE_RE.finditer(text):
        color = _COLOR_MAP.get(m.group("color").lower(), m.group("color").lower())
        low = _price(m.group("low"))
        high = _price(m.group("high"))
        # HKCM writes zones high-to-low; store them ordered so callers can draw
        # a band without re-checking which bound is which.
        if low is not None and high is not None and low > high:
            low, high = high, low
        key = (color, m.group("label"), low, high)
        if key in seen:
            continue
        seen.add(key)
        zones.append(TargetZone(color=color, label=m.group("label"), low=low, high=high))
    return zones


# --------------------------------------------------------------------------
# HTML → lines
# --------------------------------------------------------------------------


def html_to_lines(html: str) -> tuple[list[str], dict[int, list[str]]]:
    """
    Flatten mail HTML into text lines plus the image URLs that follow each line.

    Returns `(lines, images_by_line)` where `images_by_line[i]` holds the src of
    every <img> that appeared after line `i` and before line `i+1`. That
    positional mapping is what lets a chart image be attributed to the ticker
    block it sits in; the newsletter gives images no usable alt text.
    """
    from lxml import html as lxml_html  # local import: only needed for HTML input

    doc = lxml_html.fromstring(html)

    parts: list[tuple[str, str]] = []

    def walk(el) -> None:
        tag = el.tag if isinstance(el.tag, str) else ""
        if tag in ("script", "style", "head"):
            # Still honour the tail — the element itself contributes no text.
            if el.tail:
                parts.append(("t", el.tail))
            return
        if tag == "img":
            src = (el.get("src") or "").strip()
            if src and not src.startswith("data:"):
                parts.append(("img", src))
        if tag in _BLOCK_TAGS:
            parts.append(("nl", ""))
        if el.text:
            parts.append(("t", el.text))
        for child in el:
            walk(child)
        if tag in _BLOCK_TAGS:
            parts.append(("nl", ""))
        if el.tail:
            parts.append(("t", el.tail))

    walk(doc)

    lines: list[str] = []
    images: dict[int, list[str]] = {}
    buf: list[str] = []

    def flush() -> None:
        text = re.sub(r"\s+", " ", "".join(buf)).strip()
        buf.clear()
        if text:
            lines.append(text)

    for kind, value in parts:
        if kind == "t":
            buf.append(value)
        elif kind == "nl":
            flush()
        else:  # img
            flush()
            images.setdefault(len(lines) - 1, []).append(value)
    flush()

    return lines, images


# --------------------------------------------------------------------------
# Line stream → issue
# --------------------------------------------------------------------------


def _clean_lines(raw: Iterable[str]) -> list[str]:
    out: list[str] = []
    for line in raw:
        text = re.sub(r"\s+", " ", line).strip()
        if text:
            out.append(text)
    return out


def _cut_footer(lines: list[str]) -> list[str]:
    for idx, line in enumerate(lines):
        if any(line.startswith(marker) for marker in _FOOTER_MARKERS):
            return lines[:idx]
    return lines


def parse_lines(
    lines: Iterable[str],
    *,
    images: Optional[dict[int, list[str]]] = None,
    subject: str = "",
    sent_at: Optional[datetime] = None,
    message_id: str = "",
) -> HkcmIssue:
    """Parse a normalised line stream into an issue. Raises HkcmParseError if
    the mail carries no `TICKER // ISIN:` anchor at all."""
    images = images or {}
    all_lines = _clean_lines(lines)
    body = _cut_footer(all_lines)

    anchors = [i for i, line in enumerate(body) if _ANCHOR_RE.match(line)]
    if not anchors:
        raise HkcmParseError("no 'TICKER // ISIN:' anchor found — not an HKCM analysis mail")

    issue = HkcmIssue(
        subject=subject,
        sent_at=sent_at,
        message_id=message_id,
        content_hash=hashlib.sha256("\n".join(body).encode("utf-8")).hexdigest(),
    )

    issue.category = _extract_category(body[: anchors[0]])

    for order, start in enumerate(anchors):
        end = anchors[order + 1] if order + 1 < len(anchors) else len(body)
        # The instrument name sits on the line directly above the anchor.
        name = body[start - 1] if start > 0 else ""
        analysis = _parse_block(
            body[start:end],
            name=name,
            position=order,
            images=images,
            offset=start,
        )
        issue.analyses.append(analysis)

        # News and the "next issue" teaser are issue-level, but the newsletter
        # prints them inside the first block that carries them.
        block_text = "\n".join(body[start:end])
        if not issue.news:
            issue.news = _extract_news(body[start:end])
        if not issue.upcoming:
            issue.upcoming = _extract_upcoming(body[start:end])
        del block_text

    return issue



def _extract_category(head: list[str]) -> str:
    """
    The product line an issue belongs to ("US-Titans", "Sonderbericht", ...).

    HKCM prints it directly under the "Ihre aktuellen Analysen" heading, and
    renders it twice (once as a link, once as a heading) — which is also the
    fallback signal when the heading itself is missing or reworded: the first
    line repeated back-to-back in the header is the category.
    """
    for idx, line in enumerate(head):
        if line == _CATEGORY_HEADING and idx + 1 < len(head):
            return head[idx + 1]
    for first, second in zip(head, head[1:]):
        if first == second:
            return first
    return ""


def _extract_news(block: list[str]) -> str:
    try:
        idx = block.index(_NEWS_HEADING)
    except ValueError:
        return ""
    out: list[str] = []
    for line in block[idx + 1 :]:
        if _SUPPORT_HEADING_RE.match(line) or _RESISTANCE_HEADING_RE.match(line) or _UPCOMING_RE.match(line):
            break
        if line in _SECTION_HEADINGS or _ANCHOR_RE.match(line):
            break
        out.append(line)
    return "\n".join(out).strip()


def _extract_upcoming(block: list[str]) -> str:
    for idx, line in enumerate(block):
        if _UPCOMING_RE.match(line) and idx + 1 < len(block):
            return block[idx + 1].strip()
    return ""


def _parse_block(
    block: list[str],
    *,
    name: str,
    position: int,
    images: dict[int, list[str]],
    offset: int,
) -> HkcmAnalysis:
    anchor = _ANCHOR_RE.match(block[0])
    assert anchor is not None  # caller only passes anchored blocks
    analysis = HkcmAnalysis(
        ticker=anchor.group(1),
        isin=anchor.group(2),
        name=name,
        position=position,
    )

    section: Optional[str] = None
    buckets: dict[str, list[str]] = {key: [] for key in _SECTION_HEADINGS.values()}
    level_mode: Optional[str] = None   # "support" | "resistance" while reading prices
    seen_parameters = False
    in_news = False

    for idx, line in enumerate(block[1:], start=1):
        # --- structural switches -------------------------------------------
        if line in _PARAMETER_HEADINGS:
            analysis.entry_potential = line.startswith("(Potenzielle)")
            seen_parameters = True
            section = None
            level_mode = None
            in_news = False
            continue
        if line == _NEWS_HEADING:
            section = None
            level_mode = None
            in_news = True
            continue
        if line in _SECTION_HEADINGS:
            section = _SECTION_HEADINGS[line]
            level_mode = None
            in_news = False
            continue
        if _SUPPORT_HEADING_RE.match(line):
            section, level_mode, in_news = None, "support", False
            continue
        if _RESISTANCE_HEADING_RE.match(line):
            section, level_mode, in_news = None, "resistance", False
            continue
        if _UPCOMING_RE.match(line):
            section, level_mode, in_news = None, None, False
            continue

        # --- trade parameters ----------------------------------------------
        m = _ENTRY_RE.match(line)
        if m:
            analysis.entry_kind = m.group("kind").strip()
            analysis.entry = _price(m.group("value"))
            continue
        m = _STOP_RE.match(line)
        if m:
            value = m.group("value").strip()
            analysis.stop = _price(value)
            if analysis.stop is None:
                analysis.stop_note = value
            continue
        m = _PARTIAL_RE.match(line)
        if m:
            analysis.partial_exit = _price(m.group("value"))
            continue
        m = _RISK_RE.match(line)
        if m:
            analysis.risk_note = m.group("value").strip()
            continue

        # --- price levels ---------------------------------------------------
        if level_mode and _PRICE_ONLY_RE.match(line):
            value = _price(line)
            if value is not None:
                target = analysis.supports if level_mode == "support" else analysis.resistances
                if value not in target:
                    target.append(value)
            continue
        if level_mode:
            # A non-price line ends the level list.
            level_mode = None

        # --- narrative -------------------------------------------------------
        if section:
            buckets[section].append(line)
            continue
        if in_news:
            continue

        # The headline is the single line between the trade parameters and the
        # first narrative section.
        if seen_parameters and not analysis.headline and not analysis.what_happened:
            analysis.headline = line
            continue

        # Chart captions ("Home Depot 2h") and anything else is ignored on
        # purpose — see the module docstring.

    for key, chunk in buckets.items():
        setattr(analysis, key, "\n".join(chunk).strip())

    block_text = "\n".join(block)
    analysis.target_zones = _zones(block_text)

    # The probability that belongs to the alternative scenario is the one
    # printed inside that section; the outlook carries its own, unrelated one.
    alt = analysis.alternative_scenario
    prob = _PROBABILITY_RE.search(alt)
    if prob:
        analysis.alternative_probability = int(prob.group(1))

    for line_idx in range(offset, offset + len(block)):
        analysis.chart_urls.extend(images.get(line_idx, []))

    return analysis


# --------------------------------------------------------------------------
# Mail entry points
# --------------------------------------------------------------------------


def parse_html(
    html: str,
    *,
    subject: str = "",
    sent_at: Optional[datetime] = None,
    message_id: str = "",
) -> HkcmIssue:
    lines, images = html_to_lines(html)
    return parse_lines(lines, images=images, subject=subject, sent_at=sent_at, message_id=message_id)


def parse_email(raw: bytes) -> HkcmIssue:
    """
    Parse a complete RFC-822 message (an `.eml` export or an IMAP fetch).

    Prefers the text/html part — the plain-text alternative HKCM ships is a
    stripped teaser without the trade parameters.
    """
    msg = message_from_bytes(raw, policy=policy.default)
    assert isinstance(msg, EmailMessage)

    subject = str(msg.get("Subject") or "").strip()
    message_id = str(msg.get("Message-ID") or "").strip()

    sent_at: Optional[datetime] = None
    try:
        parsed_date = msg.get("Date")
        if parsed_date is not None and getattr(parsed_date, "datetime", None):
            sent_at = parsed_date.datetime
            if sent_at.tzinfo is None:
                sent_at = sent_at.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        sent_at = None

    body = msg.get_body(preferencelist=("html",))
    if body is not None:
        html = body.get_content()
        return parse_html(html, subject=subject, sent_at=sent_at, message_id=message_id)

    body = msg.get_body(preferencelist=("plain",))
    if body is None:
        raise HkcmParseError("mail has neither an HTML nor a plain-text body")
    return parse_lines(
        body.get_content().splitlines(),
        subject=subject,
        sent_at=sent_at,
        message_id=message_id,
    )
