"""Powers the rotating funny/motivational quotes above the homepage search box."""
from __future__ import annotations

from fastapi import APIRouter

from app.services.llm_client import generate_quote

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.get("/random")
def random_quote():
    return {"quote": generate_quote()}
