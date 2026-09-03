"""
/api/hkcm API contract — import, idempotency, per-user isolation, reads.

Uses its own isolated app + throwaway SQLite DB (same bootstrap pattern as
test_analysis_live.py).

Run:
    cd dashboard/backend
    pytest tests/test_hkcm_routes.py -v
"""
from email.message import EmailMessage
from pathlib import Path

import pytest

from tests.helpers import trader_headers as _trader_headers_raw

FIXTURE = Path(__file__).parent / "fixtures" / "hkcm_daily.txt"


@pytest.fixture(scope="module")
def db_prefix() -> str:
    return "test_hkcm_"


@pytest.fixture
def client(app_module):
    app_module.cookies.clear()
    yield app_module
    app_module.cookies.clear()


def _fresh_user(client) -> dict:
    headers, _ = _trader_headers_raw(client, "hkcm_")
    return headers


def _newsletter_html() -> str:
    """Wrap the plain-text fixture in one <div> per line — the flattener turns
    that back into exactly the same line stream the parser tests use."""
    lines = FIXTURE.read_text(encoding="utf-8").splitlines()
    body = "\n".join(f"<div>{line}</div>" for line in lines if line.strip())
    return f"<html><body>{body}</body></html>"


def _eml_bytes(subject: str = "Tägliches Aktien-Update") -> bytes:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = "HKCM <marketupdates@hkcmanagement.de>"
    msg["To"] = "abonnent@example.com"
    msg["Date"] = "Thu, 02 Apr 2026 13:42:00 +0200"
    msg.set_content("Teaser.")
    msg.add_alternative(_newsletter_html(), subtype="html")
    return msg.as_bytes()


def _upload(client, headers, data: bytes, filename: str = "update.eml"):
    return client.post(
        "/api/hkcm/import",
        headers=headers,
        files={"file": (filename, data, "message/rfc822")},
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestAuth:
    def test_reads_require_auth(self, client):
        assert client.get("/api/hkcm/latest").status_code == 401
        assert client.get("/api/hkcm/issues").status_code == 401
        assert client.get("/api/hkcm/ticker/HD").status_code == 401

    def test_import_requires_auth(self, client):
        resp = _upload(client, {}, _eml_bytes())
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


class TestImport:
    def test_import_parses_and_stores(self, client):
        headers = _fresh_user(client)
        resp = _upload(client, headers, _eml_bytes())
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] is True
        assert body["analyses"] == 2
        assert body["tickers"] == ["HD", "SBUX"]

    def test_reimport_is_a_noop(self, client):
        headers = _fresh_user(client)
        first = _upload(client, headers, _eml_bytes()).json()

        # Same content, different Message-ID and subject wrapper — Outlook
        # rewrites those on move/forward, so only the body hash may decide.
        second = _upload(client, headers, _eml_bytes(subject="FW: Tägliches Aktien-Update")).json()

        assert second["imported"] is False
        assert second["issue_id"] == first["issue_id"]

        listing = client.get("/api/hkcm/issues", headers=headers).json()
        assert listing["total"] == 1

    def test_html_upload_is_accepted(self, client):
        headers = _fresh_user(client)
        resp = client.post(
            "/api/hkcm/import",
            headers=headers,
            files={"file": ("mail.html", _newsletter_html().encode("utf-8"), "text/html")},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["tickers"] == ["HD", "SBUX"]

    def test_non_hkcm_mail_is_rejected(self, client):
        headers = _fresh_user(client)
        msg = EmailMessage()
        msg["Subject"] = "Rechnung"
        msg.set_content("Kein Newsletter.")
        resp = _upload(client, headers, msg.as_bytes())
        assert resp.status_code == 422
        assert "HKCM" in resp.json()["detail"]

    def test_empty_upload_is_rejected(self, client):
        headers = _fresh_user(client)
        resp = _upload(client, headers, b"")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


class TestReads:
    def test_latest_returns_the_full_issue(self, client):
        headers = _fresh_user(client)
        _upload(client, headers, _eml_bytes())

        resp = client.get("/api/hkcm/latest", headers=headers)
        assert resp.status_code == 200, resp.text
        issue = resp.json()
        assert issue["category"] == "US-Titans"
        assert issue["upcoming"].startswith("Boeing")
        assert [a["ticker"] for a in issue["analyses"]] == ["HD", "SBUX"]

        hd = issue["analyses"][0]
        assert hd["entry"] == pytest.approx(313.69)
        assert hd["stop"] == pytest.approx(284.13)
        assert hd["resistances"] == [pytest.approx(397.62), pytest.approx(439.37)]
        assert any(z["color"] == "gruen" for z in hd["target_zones"])

    def test_latest_is_404_before_any_import(self, client):
        headers = _fresh_user(client)
        assert client.get("/api/hkcm/latest", headers=headers).status_code == 404

    def test_ticker_lookup(self, client):
        headers = _fresh_user(client)
        _upload(client, headers, _eml_bytes())

        resp = client.get("/api/hkcm/ticker/sbux", headers=headers)
        assert resp.status_code == 200, resp.text
        sbux = resp.json()
        assert sbux["ticker"] == "SBUX"
        assert sbux["stop"] is None
        assert sbux["stop_note"] == "Kein Stopp"
        assert sbux["alternative_probability"] == 34

        assert client.get("/api/hkcm/ticker/TSLA", headers=headers).status_code == 404

    def test_covered_tickers(self, client):
        headers = _fresh_user(client)
        _upload(client, headers, _eml_bytes())
        resp = client.get("/api/hkcm/tickers", headers=headers)
        assert resp.status_code == 200
        assert sorted(resp.json()) == ["HD", "SBUX"]


# ---------------------------------------------------------------------------
# Multi-tenancy
# ---------------------------------------------------------------------------


class TestIsolation:
    def test_one_users_import_is_invisible_to_another(self, client):
        alice = _fresh_user(client)
        _upload(client, alice, _eml_bytes())

        bob = _fresh_user(client)
        assert client.get("/api/hkcm/latest", headers=bob).status_code == 404
        assert client.get("/api/hkcm/ticker/HD", headers=bob).status_code == 404
        assert client.get("/api/hkcm/tickers", headers=bob).json() == []
        assert client.get("/api/hkcm/issues", headers=bob).json()["total"] == 0

    def test_issue_of_another_user_cannot_be_fetched_by_id(self, client):
        alice = _fresh_user(client)
        issue_id = _upload(client, alice, _eml_bytes()).json()["issue_id"]

        bob = _fresh_user(client)
        assert client.get(f"/api/hkcm/issues/{issue_id}", headers=bob).status_code == 404
