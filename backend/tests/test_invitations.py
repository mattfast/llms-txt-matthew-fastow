from types import SimpleNamespace

from app.services import invitations


def test_create_invited_auth_user_marks_email_confirmed(monkeypatch):
    monkeypatch.setattr(invitations.settings, "supabase_url", "https://project.example")
    monkeypatch.setattr(invitations.settings, "supabase_service_role_key", "service-key")
    request = {}

    def post(url, **kwargs):
        request.update(url=url, **kwargs)
        return SimpleNamespace(is_success=True)

    monkeypatch.setattr(invitations.httpx, "post", post)

    created, error = invitations.create_confirmed_auth_user("invitee@example.com", "long-password")

    assert created
    assert error is None
    assert request["url"] == "https://project.example/auth/v1/admin/users"
    assert request["json"] == {
        "email": "invitee@example.com",
        "password": "long-password",
        "email_confirm": True,
    }


def test_create_invited_auth_user_reports_existing_account(monkeypatch):
    monkeypatch.setattr(invitations.settings, "supabase_service_role_key", "service-key")
    monkeypatch.setattr(
        invitations.httpx,
        "post",
        lambda *args, **kwargs: SimpleNamespace(
            is_success=False,
            status_code=422,
            json=lambda: {"msg": "User already registered"},
        ),
    )
    monkeypatch.setattr(
        invitations.httpx,
        "get",
        lambda *args, **kwargs: SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "users": [
                    {
                        "id": "existing-user-id",
                        "email": "invitee@example.com",
                        "email_confirmed_at": "2026-01-01T00:00:00Z",
                    }
                ]
            },
        ),
    )

    created, error = invitations.create_confirmed_auth_user("invitee@example.com", "long-password")

    assert not created
    assert error == "An account with this email already exists. Log in to accept the invitation."


def test_existing_unconfirmed_invited_user_is_confirmed(monkeypatch):
    monkeypatch.setattr(invitations.settings, "supabase_url", "https://project.example")
    monkeypatch.setattr(invitations.settings, "supabase_service_role_key", "service-key")
    calls = {}
    monkeypatch.setattr(
        invitations.httpx,
        "post",
        lambda *args, **kwargs: SimpleNamespace(
            is_success=False,
            status_code=422,
            json=lambda: {"msg": "User already registered"},
        ),
    )
    monkeypatch.setattr(
        invitations.httpx,
        "get",
        lambda url, **kwargs: SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "users": [
                    {
                        "id": "existing-user-id",
                        "email": "Invitee@Example.com",
                        "email_confirmed_at": None,
                    }
                ]
            },
        ),
    )

    def put(url, **kwargs):
        calls.update(url=url, **kwargs)
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(invitations.httpx, "put", put)

    created, error = invitations.create_confirmed_auth_user("invitee@example.com", "long-password")

    assert not created
    assert "Your invitation verified the email" in error
    assert calls["url"] == "https://project.example/auth/v1/admin/users/existing-user-id"
    assert calls["json"] == {"email_confirm": True}


def test_create_invited_auth_user_requires_service_role_key(monkeypatch):
    monkeypatch.setattr(invitations.settings, "supabase_service_role_key", "")

    created, error = invitations.create_confirmed_auth_user("invitee@example.com", "long-password")

    assert not created
    assert error == "Invited account setup is unavailable. Contact a workspace admin."
