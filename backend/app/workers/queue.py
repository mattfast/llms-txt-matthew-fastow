"""Redis/RQ queue setup, shared by the API (enqueue) and the worker process (dequeue)."""
from __future__ import annotations

from redis import Redis
from rq import Queue

from app.core.config import get_settings

settings = get_settings()
_redis: Redis | None = None
_queue: Queue | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url)
    return _redis


def get_queue() -> Queue:
    global _queue
    if _queue is None:
        _queue = Queue("crawls", connection=get_redis())
    return _queue
