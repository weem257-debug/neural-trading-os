"""
JWT Authentication Layer — Neural Trading OS
=============================================

Endpoints:
  POST /api/auth/token  — exchange username/password for JWT
  GET  /api/auth/me     — return user info from token

Optional auth dependency:
  get_current_user_optional — for execution endpoints that serve
  demo data without auth but restrict real trading with auth.

Demo credentials (override via env):
  username: admin
  password: neural123

Dependencies:
  pip install "python-jose[cryptography]" "passlib[bcrypt]"
"""
import warnings

# passlib 1.7.4 + bcrypt ≥ 4.0: passlib catches an AttributeError during
# bcrypt version sniffing and re-emits it as a UserWarning. Register the
# filter BEFORE importing CryptContext so the backend-load is already silent.
warnings.filterwarnings("ignore", message=".*error reading bcrypt version.*")
warnings.filterwarnings("ignore", message=".*bcrypt.*")

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import settings
from app.core.rate_limits import limiter

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/auth", tags=["Auth"])

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# OAuth2 scheme (token URL must match the endpoint path including prefix)
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/token",
    auto_error=False,  # auto_error=False so optional auth works
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenData(BaseModel):
    username: Optional[str] = None


class UserInfo(BaseModel):
    username: str
    role: str = "trader"
    tier: str = "demo"


# ---------------------------------------------------------------------------
# In-memory user store (demo — replace with DB in production)
# ---------------------------------------------------------------------------

_DEMO_USER_DB: dict | None = None


def _get_demo_user_db() -> dict:
    """Returns a minimal user store. Password is hashed exactly once at first call."""
    global _DEMO_USER_DB
    if _DEMO_USER_DB is None:
        hashed_pw = pwd_context.hash(settings.DEMO_PASSWORD)
        _DEMO_USER_DB = {
            settings.DEMO_USERNAME: {
                "username": settings.DEMO_USERNAME,
                "hashed_password": hashed_pw,
                "role": "admin",
                "tier": "pro",
            }
        }
    return _DEMO_USER_DB


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _authenticate_user(username: str, password: str) -> Optional[dict]:
    """Returns user dict if credentials are valid, else None."""
    db = _get_demo_user_db()
    user = db.get(username)
    if not user:
        return None
    if not _verify_password(password, user["hashed_password"]):
        return None
    return user


def _create_access_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _verify_token(token: str) -> bool:
    """Validate a JWT token string. Returns True if valid, False otherwise."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub") is not None
    except JWTError:
        return False


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserInfo:
    """
    Strict auth dependency. Raises 401 if token is missing or invalid.
    Use for endpoints that must be protected.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exception
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    db = _get_demo_user_db()
    user = db.get(username)
    if user is None:
        raise credentials_exception

    return UserInfo(
        username=user["username"],
        role=user["role"],
        tier=user["tier"],
    )


async def get_current_user_optional(
    token: str = Depends(oauth2_scheme),
) -> Optional[UserInfo]:
    """
    Optional auth dependency — onboarding-friendly.

    Returns UserInfo if a valid token is provided.
    Returns None (not an error) if no token is provided.
    Raises 401 only if a token is provided but invalid.
    """
    if token is None:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db = _get_demo_user_db()
    user = db.get(username)
    if user is None:
        return None

    return UserInfo(
        username=user["username"],
        role=user["role"],
        tier=user["tier"],
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/token",
    response_model=Token,
    summary="Get JWT access token",
    description=(
        "Exchange username and password for a JWT. "
        "Demo credentials: `admin` / `neural123`."
    ),
)
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Token:
    user = _authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    expire_delta = timedelta(hours=settings.JWT_ACCESS_TOKEN_EXPIRE_HOURS)
    access_token = _create_access_token(
        data={"sub": user["username"]},
        expires_delta=expire_delta,
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=int(expire_delta.total_seconds()),
    )


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Get current user info",
    description="Returns user information extracted from the JWT. Requires valid Bearer token.",
)
async def get_me(
    current_user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    return current_user
