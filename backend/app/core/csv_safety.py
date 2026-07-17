"""
CSV injection (formula injection) neutralisation.
=================================================

Spreadsheet apps (Excel, LibreOffice, Google Sheets) interpret a cell whose
text begins with ``= + - @`` — or a leading tab / carriage return — as a
formula. When user- or LLM-supplied text is exported to CSV and later opened,
a crafted value like ``=HYPERLINK(...)`` or ``=cmd|...`` can execute or
exfiltrate data. We defuse it by prefixing a single quote so the cell is
treated as literal text (the OWASP-recommended mitigation).

Use ``csv_safe()`` on any free-form string field written into an exported CSV.
Numeric/enum/ISO-timestamp fields do not need it.
"""
from __future__ import annotations

# Characters that trigger formula interpretation when they lead a cell.
_DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: object) -> object:
    """
    Return ``value`` unchanged unless it is a string starting with a
    formula-trigger character, in which case a single quote is prepended so
    spreadsheet apps treat it as literal text. Non-strings pass through.
    """
    if isinstance(value, str) and value and value[0] in _DANGEROUS_PREFIXES:
        return "'" + value
    return value
