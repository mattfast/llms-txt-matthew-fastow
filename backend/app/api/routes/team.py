import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, get_jwt_current_user, require_jwt_admin
from app.models.analytics import AuditEvent, TeamInvitation
from app.models.company import Company, Profile
from app.services.audit import record_audit_event
from app.services.email_client import send_team_invitation_email
from app.services.invitations import create_confirmed_auth_user

router = APIRouter(prefix="/team", tags=["team"])
INVITATION_LIFETIME = timedelta(hours=24)


def _hash_invitation_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class MemberRoleUpdate(BaseModel):
    role: Literal["admin", "member"]


class TeamInvitationCreate(BaseModel):
    email: str
    role: Literal["admin", "member"]


class TeamInvitationAccept(BaseModel):
    token: str


class TeamInvitationRegister(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


def _active_invitation(db: Session, token: str) -> TeamInvitation:
    invitation = (
        db.query(TeamInvitation)
        .filter(TeamInvitation.token_hash == _hash_invitation_token(token))
        .with_for_update()
        .one_or_none()
    )
    if not invitation or invitation.revoked_at:
        raise HTTPException(status_code=404, detail="Invitation not found or no longer active")
    if invitation.accepted_at:
        raise HTTPException(status_code=409, detail="Invitation has already been accepted")
    if invitation.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")
    return invitation


@router.get("/members")
def list_members(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_jwt_admin),
):
    return [
        {
            "id": profile.id,
            "email": profile.email,
            "display_name": profile.display_name,
            "role": profile.role,
            "created_at": profile.created_at,
        }
        for profile in db.query(Profile)
        .filter(Profile.company_id == user.profile.company_id)
        .order_by(Profile.created_at, Profile.email)
        .all()
    ]


@router.patch("/members/{profile_id}")
def update_member_role(
    profile_id: str,
    body: MemberRoleUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_jwt_admin),
):
    db.query(Company).filter(Company.id == user.profile.company_id).with_for_update().one()
    member = (
        db.query(Profile)
        .filter(Profile.id == profile_id, Profile.company_id == user.profile.company_id)
        .with_for_update()
        .one_or_none()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == body.role:
        return {"id": member.id, "role": member.role}
    if member.role == "admin" and body.role != "admin":
        admin_count = (
            db.query(func.count(Profile.id))
            .filter(Profile.company_id == user.profile.company_id, Profile.role == "admin")
            .scalar()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="The company must retain at least one admin")

    old_role = member.role
    member.role = body.role
    record_audit_event(
        db,
        company_id=user.profile.company_id,
        actor_id=user.id,
        action="member.role_changed",
        resource_type="profile",
        resource_id=member.id,
        details={"email": member.email, "before": old_role, "after": member.role},
    )
    db.commit()
    return {"id": member.id, "role": member.role}


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
def create_invitation(
    body: TeamInvitationCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_jwt_admin),
):
    email = body.email.strip().lower()
    if len(email) > 320 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")

    company = (
        db.query(Company)
        .filter(Company.id == user.profile.company_id)
        .with_for_update()
        .one()
    )
    existing_member = (
        db.query(Profile)
        .filter(Profile.company_id == company.id, func.lower(Profile.email) == email)
        .one_or_none()
    )
    if existing_member:
        raise HTTPException(status_code=409, detail="This person is already a workspace member")

    now = datetime.now(timezone.utc)
    pending = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.company_id == company.id,
            func.lower(TeamInvitation.email) == email,
            TeamInvitation.accepted_at.is_(None),
            TeamInvitation.revoked_at.is_(None),
            TeamInvitation.expires_at > now,
        )
        .with_for_update()
        .all()
    )
    for prior in pending:
        prior.revoked_at = now

    token = secrets.token_urlsafe(32)
    invitation = TeamInvitation(
        company_id=company.id,
        invited_by=user.id,
        email=email,
        role=body.role,
        token_hash=_hash_invitation_token(token),
        expires_at=now + INVITATION_LIFETIME,
    )
    db.add(invitation)
    db.commit()

    email_sent, email_error = send_team_invitation_email(
        email, company.name, user.email or "A workspace admin", body.role, token
    )
    if not email_sent:
        invitation.revoked_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Invitation email could not be sent. {email_error or 'Check the email provider configuration.'}",
        )

    record_audit_event(
        db,
        company_id=company.id,
        actor_id=user.id,
        action="team.invitation_sent",
        resource_type="team_invitation",
        resource_id=invitation.id,
        details={"email": email, "role": body.role, "expires_at": invitation.expires_at.isoformat()},
    )
    db.commit()
    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "expires_at": invitation.expires_at,
    }


@router.get("/invitations")
def list_invitations(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_jwt_admin),
):
    now = datetime.now(timezone.utc)
    rows = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.company_id == user.profile.company_id,
            TeamInvitation.accepted_at.is_(None),
            TeamInvitation.revoked_at.is_(None),
            TeamInvitation.expires_at > now,
        )
        .order_by(TeamInvitation.created_at.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "email": row.email,
            "role": row.role,
            "expires_at": row.expires_at,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invitation(
    invitation_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_jwt_admin),
):
    invitation = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.id == invitation_id,
            TeamInvitation.company_id == user.profile.company_id,
            TeamInvitation.accepted_at.is_(None),
            TeamInvitation.revoked_at.is_(None),
        )
        .with_for_update()
        .one_or_none()
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    invitation.revoked_at = datetime.now(timezone.utc)
    record_audit_event(
        db,
        company_id=user.profile.company_id,
        actor_id=user.id,
        action="team.invitation_revoked",
        resource_type="team_invitation",
        resource_id=invitation.id,
        details={"email": invitation.email},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invitations/preview")
def preview_invitation(
    token: str = Query(min_length=32, max_length=128),
    db: Session = Depends(get_db),
):
    invitation = _active_invitation(db, token)
    company = db.query(Company).filter(Company.id == invitation.company_id).one()
    return {
        "email": invitation.email,
        "role": invitation.role,
        "expires_at": invitation.expires_at,
        "company_name": company.name,
    }


@router.post("/invitations/register", status_code=status.HTTP_201_CREATED)
def register_invited_user(
    body: TeamInvitationRegister,
    db: Session = Depends(get_db),
):
    invitation = _active_invitation(db, body.token)
    created, error = create_confirmed_auth_user(invitation.email, body.password)
    if not created:
        if error and "already exists" in error:
            raise HTTPException(status_code=409, detail=error)
        raise HTTPException(status_code=502, detail=error or "Invited account setup failed")
    return {"email": invitation.email}


@router.post("/invitations/accept")
def accept_invitation(
    body: TeamInvitationAccept,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_jwt_current_user),
):
    if not user.email:
        raise HTTPException(status_code=400, detail="Authenticated account has no email")
    invitation = (
        db.query(TeamInvitation)
        .filter(TeamInvitation.token_hash == _hash_invitation_token(body.token))
        .with_for_update()
        .one_or_none()
    )
    if not invitation or invitation.revoked_at:
        raise HTTPException(status_code=404, detail="Invitation not found or no longer active")
    if invitation.accepted_at:
        existing_profile = (
            db.query(Profile)
            .filter(Profile.id == user.id, Profile.company_id == invitation.company_id)
            .one_or_none()
        )
        if existing_profile and existing_profile.email.casefold() == user.email.casefold():
            company = db.query(Company).filter(Company.id == invitation.company_id).one()
            return {
                "company_id": company.id,
                "company_name": company.name,
                "role": existing_profile.role,
            }
        raise HTTPException(status_code=409, detail="Invitation has already been accepted")
    if invitation.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")
    if invitation.email.casefold() != user.email.casefold():
        raise HTTPException(status_code=403, detail="Sign in with the email address this invitation was sent to")

    company = (
        db.query(Company)
        .filter(Company.id == invitation.company_id)
        .with_for_update()
        .one()
    )
    profile = db.query(Profile).filter(Profile.id == user.id).with_for_update().one_or_none()
    if profile and profile.company_id != invitation.company_id:
        raise HTTPException(status_code=409, detail="This account already belongs to another workspace")

    if profile:
        old_role = profile.role
        profile.role = invitation.role
        action = "member.role_changed" if old_role != profile.role else "team.invitation_accepted"
        details = {"email": profile.email, "before": old_role, "after": profile.role}
    else:
        profile = Profile(
            id=user.id,
            company_id=company.id,
            email=user.email,
            role=invitation.role,
        )
        db.add(profile)
        action = "member.joined"
        details = {"email": user.email, "role": invitation.role, "invited": True}

    invitation.accepted_at = datetime.now(timezone.utc)
    record_audit_event(
        db,
        company_id=company.id,
        actor_id=user.id,
        action=action,
        resource_type="profile",
        resource_id=user.id,
        details=details,
    )
    db.commit()
    return {"company_id": company.id, "company_name": company.name, "role": profile.role}


@router.get("/audit-events")
def list_audit_events(
    limit: int = 100,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_jwt_admin),
):
    limit = max(1, min(limit, 250))
    rows = (
        db.query(AuditEvent, Profile.email)
        .outerjoin(Profile, AuditEvent.actor_id == Profile.id)
        .filter(AuditEvent.company_id == user.profile.company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": event.id,
            "actor_email": email,
            "action": event.action,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "details": event.details,
            "created_at": event.created_at,
        }
        for event, email in rows
    ]
