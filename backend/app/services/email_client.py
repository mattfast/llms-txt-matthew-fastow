"""Thin wrapper around Resend's HTTP API for transactional emails (welcome, first-crawl
congrats). Sending is always best-effort: failures are logged, never raised, so a flaky
email provider can never break onboarding or the crawl pipeline."""
from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_RESEND_ENDPOINT = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> bool:
    if not settings.resend_api_key:
        logger.info("RESEND_API_KEY not configured; skipping email %r to %s", subject, to)
        return False
    try:
        resp = httpx.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
        if resp.status_code >= 300:
            logger.warning("Resend send failed (%s): %s", resp.status_code, resp.text[:500])
        return resp.status_code < 300
    except httpx.HTTPError as exc:
        logger.warning("Resend send raised: %s", exc)
        return False


def _shell(preheader: str, body_html: str) -> str:
    """Shared dark, indigo-accented HTML shell matching the app's own branding."""
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000000;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">{preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="background:#0d0d0f;border:1px solid #2a2a2d;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <span style="color:#edf2f5;font-size:15px;font-weight:600;">📦 llms.txt <span style="color:#9a9ea3;font-weight:400;">by Profound</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;color:#edf2f5;font-size:14px;line-height:1.6;">
                {body_html}
              </td>
            </tr>
          </table>
          <p style="color:#5a5d61;font-size:12px;margin-top:16px;">Sent from the llms.txt generator &mdash; a Profound take-home project.</p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_welcome_email(to: str, company_name: str) -> bool:
    dashboard_url = f"{settings.frontend_base_url}/dashboard"
    body = f"""
    <h1 style="font-size:20px;margin:0 0 12px 0;color:#ffffff;">Welcome to llms.txt, {company_name}! 🎉</h1>
    <p style="margin:0 0 16px 0;">
      Your workspace is live. Here's a quick tour of everything you can do:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;border-top:1px solid #2a2a2d;">
        <strong style="color:#a5a9ff;">🌐 Add sites</strong><br/>
        <span style="color:#9a9ea3;">Paste any URL and we'll crawl it, then generate a clean, spec-compliant <code>llms.txt</code> automatically.</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #2a2a2d;">
        <strong style="color:#a5a9ff;">🌳 Merkle tree change detection</strong><br/>
        <span style="color:#9a9ea3;">Every recheck hashes the whole site into a tree, so we instantly know if anything changed &mdash; and re-summarize only what did.</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #2a2a2d;">
        <strong style="color:#a5a9ff;">🏆 Leaderboard</strong><br/>
        <span style="color:#9a9ea3;">See who on your team has generated the most llms.txt files.</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #2a2a2d;">
        <strong style="color:#a5a9ff;">📊 Topic insights</strong><br/>
        <span style="color:#9a9ea3;">Discover what's frequently mentioned across every site your company has crawled.</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #2a2a2d;">
        <strong style="color:#a5a9ff;">🔍 Ask your sites</strong><br/>
        <span style="color:#9a9ea3;">Semantically search across all your generated llms.txt files &mdash; ask real questions, get cited answers.</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #2a2a2d;">
        <strong style="color:#a5a9ff;">💸 Cost tracker</strong><br/>
        <span style="color:#9a9ea3;">Keep an eye on exactly how much your company is spending on LLM tokens.</span>
      </td></tr>
    </table>
    <div style="margin-top:24px;">
      <a href="{dashboard_url}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;
         font-weight:600;font-size:14px;padding:10px 20px;border-radius:9999px;">Go to your dashboard →</a>
    </div>
    """
    return send_email(to, f"Welcome to llms.txt, {company_name} 🎉", _shell("Your workspace is ready.", body))


def send_first_crawl_congrats_email(to: str, domain: str) -> bool:
    dashboard_url = f"{settings.frontend_base_url}/dashboard"
    body = f"""
    <h1 style="font-size:20px;margin:0 0 12px 0;color:#ffffff;">🎊 You did it! Your first llms.txt is ready.</h1>
    <p style="margin:0 0 16px 0;">
      <strong style="color:#a5a9ff;">{domain}</strong> has been crawled, hashed into a Merkle tree, and
      turned into a shiny new <code>llms.txt</code>. Somewhere, a language model is
      shedding a single, grateful byte of a tear.
    </p>
    <p style="margin:0 0 16px 0;color:#9a9ea3;">
      One site down. But why stop at one? Your competitors' sites are just sitting there,
      begging to be crawled too. Your future leaderboard ranking depends on it. 👀
    </p>
    <div style="margin-top:24px;">
      <a href="{dashboard_url}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;
         font-weight:600;font-size:14px;padding:10px 20px;border-radius:9999px;">Add another site →</a>
    </div>
    """
    return send_email(to, "🎊 Your first llms.txt is ready!", _shell("Your first site is crawled.", body))
