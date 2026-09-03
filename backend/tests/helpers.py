"""
Shared test helpers for modules that bootstrap their own isolated app + DB
(see the `app_module`/`client`/`db_prefix` fixtures in tests/conftest.py).

These were duplicated near-verbatim across test_analysis_live.py,
test_audit_fixes_2026_07.py, test_hkcm_routes.py and test_multi_tenancy.py
(under names like `_auth`, `_admin_auth`, `_trader_auth`, `_fresh_user`).
Import with an alias where a call site needs to keep its original local
name, e.g.:

    from tests.helpers import admin_headers as _admin_auth
"""
import uuid


def admin_headers(client) -> dict:
    """Log in as the built-in demo admin account, return Bearer auth headers."""
    resp = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "neural123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def trader_headers(client, prefix: str) -> tuple[dict, str]:
    """
    Register + log in a fresh throwaway trader account (username
    ``f"{prefix}{uuid4 hex}"``), return ``(auth_headers, username)``.
    """
    uname = f"{prefix}{uuid.uuid4().hex[:10]}"
    reg = client.post("/api/auth/register", json={
        "username": uname,
        "email": f"{uname}@example.com",
        "password": "Password1!",
        "gdpr_consent": True,
    })
    assert reg.status_code in (200, 201), reg.text
    tok = client.post(
        "/api/auth/token",
        data={"username": uname, "password": "Password1!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert tok.status_code == 200, tok.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}, uname
