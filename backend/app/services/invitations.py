"""Supabase Auth Admin API operations for invited accounts."""
from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


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
        return False, "An account with this email already exists. Log in to accept the invitation."

    logger.warning(
        "Supabase Auth Admin API rejected invited account creation (status %s, code %s)",
        response.status_code,
        provider_code or "unspecified",
    )
    if response.status_code == 422:
        return False, "The password was rejected. Choose a stronger password and try again."
    return False, "Invited account setup failed. Please try again or contact a workspace admin."
