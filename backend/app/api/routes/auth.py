"""Handles post-signup onboarding: Supabase Auth creates the user/verifies email on the
frontend; this endpoint provisions the corresponding Company + Profile rows on first login."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, get_current_user
from app.models.company import Company, Profile
from app.services.email_client import send_welcome_email

router = APIRouter(prefix="/auth", tags=["auth"])

SHARED_COMPANY_NAME = "Profound"
SHARED_COMPANY_SLUG = "profound"


class ProfileOut(BaseModel):
    id: str
    email: str
    company_id: str
    company_name: str

    model_config = {"from_attributes": True}


@router.get("/me")
def get_me(user: CurrentUser = Depends(get_current_user)):
    if not user.profile:
        return {"id": user.id, "email": user.email, "onboarded": False}
    return {
        "id": user.id,
        "email": user.email,
        "onboarded": True,
        "company_id": user.profile.company_id,
        "company_name": user.profile.company.name,
    }


@router.post("/onboard", response_model=ProfileOut)
def onboard(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Provision every new user into the shared Profound workspace.

    Idempotent by design: the frontend may retry this call (e.g. a duplicate request racing
    the initial one), so a company-slug or profile-id conflict just means someone else's
    concurrent request won the race - we recover by re-reading what they created instead of
    surfacing a 500."""
    if user.profile:
        raise HTTPException(status_code=400, detail="Already onboarded")
    if not user.email:
        raise HTTPException(status_code=400, detail="Email required")

    company = db.query(Company).filter(Company.slug == SHARED_COMPANY_SLUG).one_or_none()
    if not company:
        company = Company(name=SHARED_COMPANY_NAME, slug=SHARED_COMPANY_SLUG)
        db.add(company)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            company = db.query(Company).filter(Company.slug == SHARED_COMPANY_SLUG).one()

    profile = db.query(Profile).filter(Profile.id == user.id).one_or_none()
    is_new_profile = profile is None
    if not profile:
        profile = Profile(id=user.id, company_id=company.id, email=user.email)
        db.add(profile)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            profile = db.query(Profile).filter(Profile.id == user.id).one()
            is_new_profile = False
    db.refresh(profile)

    if is_new_profile:
        # Only the request that actually won the race sends the welcome email - a
        # concurrent retry that recovered someone else's row should not send a duplicate.
        send_welcome_email(profile.email, company.name)
    return ProfileOut(
        id=profile.id, email=profile.email, company_id=company.id, company_name=company.name
    )
