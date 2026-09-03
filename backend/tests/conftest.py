"""
pytest conftest — global warning filters applied before any app import.
"""
import os
import tempfile
import warnings

import pytest
from fastapi.testclient import TestClient

# passlib 1.7.4 + bcrypt ≥ 4.0: passlib tries to read bcrypt.__about__.__version__
# which doesn't exist, catches the AttributeError, then re-emits it as a UserWarning.
# Filter must be registered before any passlib import occurs.
warnings.filterwarnings("ignore", message=r".*error reading bcrypt version.*")
warnings.filterwarnings("ignore", message=r".*\(trapped\).*bcrypt.*")


@pytest.fixture(autouse=True)
def _reset_client_cookies(request):
    """
    Clear the shared session-scoped TestClient's cookie jar before and after
    every test that uses the 'client' fixture.  This prevents httpOnly
    auth/CSRF cookies set during one test from leaking into subsequent tests
    that expect 401 for unauthenticated requests.
    Tests that need cookie-based auth (TestCookieCSRFAuth) set their own
    cookies explicitly inside the test body after this pre-clear.
    """
    try:
        c = request.getfixturevalue("client")
        c.cookies.clear()
    except pytest.FixtureLookupError:
        pass
    yield
    try:
        c = request.getfixturevalue("client")
        c.cookies.clear()
    except pytest.FixtureLookupError:
        pass


# ---------------------------------------------------------------------------
# Shared `app_module` fixture for test modules that need their own throwaway
# app + SQLite DB (as opposed to test_routes.py's session-scoped `client`).
#
# A test module opts in by depending on `app_module` (directly, or via its
# own local `client` fixture — see test_analysis_live.py /
# test_audit_fixes_2026_07.py / test_hkcm_routes.py / test_multi_tenancy.py);
# override `db_prefix` in that module to control the tempfile-DB filename
# prefix. Deliberately NOT also providing a bare `client` fixture here: the
# autouse `_reset_client_cookies` fixture above resolves "client" via
# `getfixturevalue` for EVERY test in the suite, so a conftest-level `client`
# would make it eagerly spin up this app+DB for every test that doesn't
# already define its own `client` — each test module that wants one keeps a
# tiny local `client` fixture depending on `app_module`.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db_prefix() -> str:
    """Tempfile-DB filename prefix for the `app_module` fixture below. Override per test module."""
    return "test_app_"


@pytest.fixture(scope="module")
def app_module(db_prefix):
    """Isolated FastAPI app + throwaway SQLite DB + rate limiting disabled, as a module-scoped TestClient."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix=db_prefix)
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)

    from app.main import app
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.state.limiter.enabled = True

    try:
        os.remove(db_path)
    except OSError:
        pass
