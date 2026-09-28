"""Supabase Auth Admin API operations for invited accounts."""
from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _admin_headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _confirm_existing_invited_user(email: str) -> tuple[bool, str | None]:
    """Use the invitation's verified email link to recover legacy unconfirmed accounts."""
    try:
        page = 1
        per_page = 1000
        invited_user = None
        while page <= 100:
            response = httpx.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users",
                headers=_admin_headers(),
                params={"page": page, "per_page": per_page},
                timeout=10,
            )
            response.raise_for_status()
            users = response.json().get("users", [])
            invited_user = next(
                (
                    user
                    for user in users
                    if str(user.get("email", "")).casefold() == email.casefold()
                ),
                None,
            )
            if invited_user:
                break
            if len(users) < per_page:
                break
            page += 1
    except (httpx.HTTPError, ValueError, AttributeError):
        logger.exception("Supabase Auth Admin API request failed while checking invited account")
        return False, "Could not verify the existing account. Please try again."

    if not invited_user:
        return False, "An account with this email already exists. Log in to accept the invitation."

    if invited_user.get("email_confirmed_at") or invited_user.get("confirmed_at"):
        return False, "An account with this email already exists. Log in to accept the invitation."

    try:
        response = httpx.put(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{invited_user['id']}",
            headers=_admin_headers(),
            json={"email_confirm": True},
            timeout=10,
        )
        response.raise_for_status()
    except (httpx.HTTPError, KeyError):
        logger.exception("Supabase Auth Admin API request failed while confirming invited account")
        return False, "Could not verify the existing account. Please try again."

    return (
        False,
        "An account with this email already exists. Your invitation verified the email; log in with your existing password to accept.",
    )


def create_confirmed_auth_user(email: str, password: str) -> tuple[bool, str | None]:
    if not settings.supabase_service_role_key:
        logger.error("SUPABASE_SERVICE_ROLE_KEY is not configured; cannot create invited account")
        return False, "Invited account setup is unavailable. Contact a workspace admin."

    try:
        response = httpx.post(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
            json={"email": email, "password": password, "email_confirm": True},
            timeout=10,
        )
    except httpx.HTTPError:
        logger.exception("Supabase Auth Admin API request failed while creating invited account")
        return False, "Could not reach the authentication service. Please try again."

    if response.is_success:
        return True, None

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    provider_message = str(payload.get("msg") or payload.get("message") or "").lower()
    provider_code = str(payload.get("code") or "").lower()
    if response.status_code == 422 and (
        "already" in provider_message or "already" in provider_code
    ):
        return _confirm_existing_invited_user(email)

    logger.warning(
        "Supabase Auth Admin API rejected invited account creation (status %s, code %s)",
        response.status_code,
        provider_code or "unspecified",
    )
    if response.status_code == 422:
        return False, "The password was rejected. Choose a stronger password and try again."
    return False, "Invited account setup failed. Please try again or contact a workspace admin."
