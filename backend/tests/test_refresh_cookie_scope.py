"""
Refresh cookie is scoped to the auth router (audit 2026-07-26, SECURITY.md §5).

The long-lived refresh token used to be minted with ``Path=/``, so the browser
attached it to every request against the origin — chart polls, the WS handshake,
static assets. It is only ever read by ``POST /api/auth/refresh``, so it is now
scoped to ``/api/auth``.

Migration matters here: a browser holding the legacy ``Path=/`` cookie would send
two cookies of the same name, and ``request.cookies.get()`` picks one
unpredictably. If it picked the superseded value, rotation would read it as a
replayed token and revoke the whole family — logging out a legitimate user. Every
path that mints a scoped cookie therefore expires the legacy one in the same
response, and logout clears both.
"""
import os
import tempfile

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

_PW = "Sc0pedC00kie!9"


@pytest.fixture(scope="module")
def client():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_ck_scope_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    mock_nautilus = MagicMock()
    mock_nautilus.initialize = AsyncMock(return_value=None)
    mock_nautilus.get_positions = AsyncMock(return_value=[])
    with patch("app.services.nautilus.client.get_execution_client", return_value=mock_nautilus):
        from app.main import app
        app.state.limiter.enabled = False
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
        app.state.limiter.enabled = True
    try:
        os.remove(db_path)
    except OSError:
        pass


def _refresh_set_cookies(response) -> list[str]:
    """Every Set-Cookie header in ``response`` that targets the refresh cookie."""
    from app.core.config import settings
    name = settings.REFRESH_COOKIE_NAME
    return [
        h for h in response.headers.get_list("set-cookie")
        if h.split("=", 1)[0].strip() == name
    ]


def _paths(headers: list[str]) -> set[str]:
    out = set()
    for h in headers:
        for attr in h.split(";")[1:]:
            k, _, v = attr.strip().partition("=")
            if k.lower() == "path":
                out.add(v)
    return out


def _is_deletion(header: str) -> bool:
    """A Set-Cookie that expires the cookie: empty value + Max-Age=0."""
    name_value = header.split(";", 1)[0]
    _, _, value = name_value.partition("=")
    if value.strip('"'):
        return False
    return any(
        attr.strip().lower() in ("max-age=0", "max-age=-1")
        for attr in header.split(";")[1:]
    )


class TestRefreshCookieScope:
    def _register_login(self, client, user):
        client.cookies.clear()
        client.post("/api/auth/register", json={
            "username": user, "email": f"{user}@example.com",
            "password": _PW, "gdpr_consent": True,
        })
        r = client.post("/api/auth/token", data={"username": user, "password": _PW})
        assert r.status_code == 200, r.text
        return r

    def test_login_scopes_refresh_cookie_to_auth_router(self, client, monkeypatch):
        from app.api.auth import REFRESH_COOKIE_PATH
        from app.core.config import settings
        monkeypatch.setattr(settings, "REFRESH_ROTATION_ENABLED", True)

        r = self._register_login(client, "ck_scope_login")
        headers = _refresh_set_cookies(r)
        assert headers, "login should set a refresh cookie when rotation is on"

        minted = [h for h in headers if not _is_deletion(h)]
        assert len(minted) == 1, f"expected exactly one minted cookie: {headers}"
        # The actual assertion: scoped, and NOT the old origin-wide path.
        assert _paths(minted) == {REFRESH_COOKIE_PATH}
        assert "/" not in _paths(minted), "regression: refresh cookie back on Path=/"

    def test_login_expires_legacy_origin_wide_cookie(self, client, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "REFRESH_ROTATION_ENABLED", True)

        r = self._register_login(client, "ck_scope_legacy")
        deletions = [h for h in _refresh_set_cookies(r) if _is_deletion(h)]
        assert "/" in _paths(deletions), (
            "a browser holding the pre-scoping Path=/ cookie would keep sending "
            "it alongside the new one; the mint must expire it"
        )

    def test_rotation_keeps_the_cookie_scoped(self, client, monkeypatch):
        from app.api.auth import REFRESH_COOKIE_PATH
        from app.core.config import settings
        monkeypatch.setattr(settings, "REFRESH_ROTATION_ENABLED", True)

        self._register_login(client, "ck_scope_rotate")
        csrf = client.cookies.get("csrf_token") or ""
        r = client.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200, r.text

        minted = [h for h in _refresh_set_cookies(r) if not _is_deletion(h)]
        assert minted, "rotation should re-mint the refresh cookie"
        assert _paths(minted) == {REFRESH_COOKIE_PATH}

    def test_logout_clears_both_paths(self, client, monkeypatch):
        from app.api.auth import REFRESH_COOKIE_PATH
        from app.core.config import settings
        monkeypatch.setattr(settings, "REFRESH_ROTATION_ENABLED", True)

        self._register_login(client, "ck_scope_logout")
        csrf = client.cookies.get("csrf_token") or ""
        r = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200, r.text

        deletions = [h for h in _refresh_set_cookies(r) if _is_deletion(h)]
        assert _paths(deletions) == {REFRESH_COOKIE_PATH, "/"}, (
            "logout must delete the scoped cookie AND any legacy origin-wide one; "
            "a Set-Cookie only removes an exact (name, path) match"
        )

    def test_cookie_still_reaches_the_refresh_endpoint(self, client, monkeypatch):
        """Scoping must not break the flow it protects: the browser still sends
        the cookie to /api/auth/refresh, so rotation issues a *different* token
        instead of falling back to 'no cookie → start a new family'."""
        from app.core.config import settings
        monkeypatch.setattr(settings, "REFRESH_ROTATION_ENABLED", True)

        self._register_login(client, "ck_scope_flow")
        first = client.cookies.get("refresh_token")
        assert first, "login should have stored a refresh cookie in the jar"
        csrf = client.cookies.get("csrf_token") or ""

        r = client.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200, r.text
        second = client.cookies.get("refresh_token")
        assert second and second != first, "cookie did not rotate — was it sent?"
