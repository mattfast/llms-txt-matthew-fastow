from types import SimpleNamespace

import httpx

from app.services import email_client


def test_email_error_explains_resend_test_sender(monkeypatch):
    monkeypatch.setattr(email_client.settings, "resend_api_key", "configured")
    monkeypatch.setattr(email_client.settings, "email_from", "Test <onboarding@resend.dev>")
    monkeypatch.setattr(
        email_client.httpx,
        "post",
        lambda *args, **kwargs: SimpleNamespace(
            status_code=403,
            json=lambda: {"message": "You can only send testing emails to your own address"},
            text="provider response",
        ),
    )

    sent, error = email_client.send_email_with_error("invitee@example.com", "Invite", "<p>Invite</p>")

    assert not sent
    assert error is not None
    assert "verified account recipient" in error
    assert "invitee@example.com" not in error
    assert "only send testing emails" in error


def test_email_error_reports_missing_resend_key(monkeypatch):
    monkeypatch.setattr(email_client.settings, "resend_api_key", "")

    sent, error = email_client.send_email_with_error("invitee@example.com", "Invite", "<p>Invite</p>")

    assert not sent
    assert error == "RESEND_API_KEY is not configured for the backend."


def test_email_error_handles_resend_network_failure(monkeypatch):
    monkeypatch.setattr(email_client.settings, "resend_api_key", "configured")
    monkeypatch.setattr(
        email_client.httpx,
        "post",
        lambda *args, **kwargs: (_ for _ in ()).throw(httpx.ConnectError("offline")),
    )

    sent, error = email_client.send_email_with_error("invitee@example.com", "Invite", "<p>Invite</p>")

    assert not sent
    assert error == "Could not reach Resend to deliver the email."
