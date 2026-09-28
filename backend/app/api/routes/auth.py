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
from app.services.audit import record_audit_event
from app.services.email_client import send_welcome_email

router = APIRouter(prefix="/auth", tags=["auth"])

SHARED_COMPANY_NAME = "Profound"
SHARED_COMPANY_SLUG = "profound"


class ProfileOut(BaseModel):
    id: str
    email: str
    company_id: str
    company_name: str
    role: str

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
        "role": user.profile.role,
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
        return ProfileOut(
            id=user.profile.id,
            email=user.profile.email,
            company_id=user.profile.company_id,
            company_name=user.profile.company.name,
            role=user.profile.role,
        )
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
    company = db.query(Company).filter(Company.id == company.id).with_for_update().one()

    profile = db.query(Profile).filter(Profile.id == user.id).one_or_none()
    is_new_profile = profile is None
    if not profile:
        first_member = db.query(Profile.id).filter(Profile.company_id == company.id).first() is None
        profile = Profile(
            id=user.id,
            company_id=company.id,
            email=user.email,
            role="admin" if first_member else "member",
        )
        db.add(profile)
        try:
            db.flush()
            record_audit_event(
                db,
                company_id=company.id,
                actor_id=user.id,
                action="member.joined",
                resource_type="profile",
                resource_id=user.id,
                details={"email": user.email, "role": profile.role},
            )
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
        id=profile.id,
        email=profile.email,
        company_id=company.id,
        company_name=company.name,
        role=profile.role,
    )
