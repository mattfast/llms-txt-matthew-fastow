from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, get_jwt_current_user
from app.models.api_key import ApiKey
from app.services.api_keys import generate_api_key, hash_api_key

router = APIRouter(prefix="/api-keys", tags=["API keys"])


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def strip_name(cls, name: str) -> str:
        name = name.strip()
        if not name:
            raise ValueError("Name cannot be blank")
        return name


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreatedOut(ApiKeyOut):
    api_key: str


@router.get("", response_model=list[ApiKeyOut])
def list_api_keys(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_jwt_current_user),
):
    if not user.profile:
        return []
    return (
        db.query(ApiKey)
        .filter(ApiKey.company_id == user.profile.company_id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )


@router.post("", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
def create_api_key(
    body: ApiKeyCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_jwt_current_user),
):
    if not user.profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has no company profile")

    raw_key = generate_api_key()
    api_key = ApiKey(
        company_id=user.profile.company_id,
        created_by=user.id,
        name=body.name,
        key_prefix=raw_key[:12],
        key_hash=hash_api_key(raw_key),
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return ApiKeyCreatedOut(**ApiKeyOut.model_validate(api_key).model_dump(), api_key=raw_key)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    key_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_jwt_current_user),
):
    if not user.profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.company_id == user.profile.company_id)
        .one_or_none()
    )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    if api_key.revoked_at is None:
        api_key.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
