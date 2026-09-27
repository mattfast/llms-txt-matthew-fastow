"""Entrypoint for the Render Cron Job that periodically enqueues recheck crawls for every
monitored site. Run as: `python -m app.workers.cron_recheck`."""
from app.workers.tasks import enqueue_rechecks

if __name__ == "__main__":
    enqueue_rechecks()
