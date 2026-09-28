"""Application configuration, loaded from environment variables (.env in dev)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Core ---
    environment: str = "development"
    api_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:3000"

    # --- Database (Supabase Postgres) ---
    database_url: str = "postgresql://postgres:postgres@localhost:5432/llmstxt"

    # --- Supabase Auth (used to verify frontend-issued JWTs) ---
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""

    # --- Redis / job queue ---
    redis_url: str = "redis://localhost:6379/0"

    # --- OpenAI ---
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # --- Resend (transactional emails: welcome, first-crawl congrats) ---
    resend_api_key: str = ""
    email_from: str = "llms.txt by Profound <noreply@llms-txt-profound.com>"

    # --- Crawler ---
    max_pages_per_site: int = 100
    crawl_concurrency: int = 8
    crawl_timeout_seconds: int = 15
    crawl_js_render_limit: int = 50
    crawl_job_timeout_seconds: int = 1800
    user_agent: str = "ProfoundLlmsTxtBot/1.0 (+https://tryprofound.com)"

    # --- Pricing (USD per 1K tokens) used for the cost tracker ---
    price_per_1k_prompt_tokens: float = 0.00015
    price_per_1k_completion_tokens: float = 0.0006
    price_per_1k_embedding_tokens: float = 0.00002


@lru_cache
def get_settings() -> Settings:
    return Settings()
