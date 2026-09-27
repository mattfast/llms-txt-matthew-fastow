"""Verifies Supabase-issued JWTs sent by the frontend and resolves the current user/profile."""
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models.company import Profile

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)

# Newer Supabase projects sign access tokens asymmetrically (ES256/RS256) using keys
# published at this JWKS endpoint, rather than the legacy shared HS256 secret. We cache
# the key set briefly to avoid a network round trip on every request.
_JWKS_CACHE: dict[str, object] = {"keys": None, "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 3600


def _get_jwks() -> list[dict]:
    now = time.time()
    if _JWKS_CACHE["keys"] is not None and now - _JWKS_CACHE["fetched_at"] < _JWKS_TTL_SECONDS:
        return _JWKS_CACHE["keys"]  # type: ignore[return-value]

    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    response = httpx.get(url, timeout=5.0)
    response.raise_for_status()
    keys = response.json().get("keys", [])
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["fetched_at"] = now
    return keys


@dataclass
class CurrentUser:
    id: str
    email: str | None
    profile: Profile | None


def _decode_supabase_jwt(token: str) -> dict:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    alg = unverified_header.get("alg", "HS256")

    try:
        if alg == "HS256":
            # Legacy shared-secret projects.
            return jwt.decode(
                token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
            )

        # Asymmetric signing (ES256/RS256): look up the matching public key by kid.
        kid = unverified_header.get("kid")
        matching_key = next((k for k in _get_jwks() if k.get("kid") == kid), None)
        if matching_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key"
            )
        return jwt.decode(token, matching_key, algorithms=[alg], audience="authenticated")
    except HTTPException:
        raise
    except (JWTError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = _decode_supabase_jwt(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    profile = db.query(Profile).filter(Profile.id == user_id).one_or_none()
    return CurrentUser(id=user_id, email=payload.get("email"), profile=profile)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser | None:
    if credentials is None:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None
