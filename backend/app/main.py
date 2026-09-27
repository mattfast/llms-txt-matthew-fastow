from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analytics, api_keys, auth, quotes, sites
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="llms.txt Generator API",
    description="Crawls websites, generates llms.txt per the llmstxt.org spec, and keeps it "
    "updated via Merkle-tree-based change detection.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # Extra localhost ports included for local dev convenience (Next.js falls back to
    # another port if 3000 is already taken by something else on the machine).
    allow_origins=[
        settings.frontend_base_url,
        "http://localhost:3000",
        "http://localhost:3100",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sites.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(api_keys.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
