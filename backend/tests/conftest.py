"""
pytest conftest — global warning filters applied before any app import.
"""
import warnings
import pytest

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
