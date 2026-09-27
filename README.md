# llms.txt Generator — by Profound

An "incredibly impressive" internal tool that turns any company website into a clean,
LLM-ready [`llms.txt`](https://llmstxt.org/) file — automatically crawled, summarized,
versioned, and kept in sync as the source site changes. Built as a take-home assignment
for [Profound](https://www.tryprofound.com/).

## What it does

1. **Paste a URL** on the homepage (a Google-dashboard-style single box, with a rotating
   feed of funny/motivational quotes and fast-cycling placeholder examples).
2. **Sign up or log in.** New users create an account with email + password and must
   verify their email before the account is usable; the URL you pasted is remembered and
   the corresponding site is created automatically the moment you land back in the
   dashboard.
3. **Watch it crawl.** A background worker crawls the site (respecting `robots.txt`,
   capped in depth/page count), extracts and summarizes the content with an LLM, and
   assembles a well-organized `llms.txt` — mirroring the file's real-world spec, with
   sections like `Docs`, `Pricing`, `Blog`, etc. inferred from the site structure.
2. **Track changes over time.** Every crawl builds a **Merkle tree** over the site's
   pages (see [Why a Merkle tree?](#why-a-merkle-tree) below). Since a Merkle root is
   just a hash of hashes, comparing the new root to the last stored root tells us in O(1)
   whether *anything* changed — and if something did, walking the tree tells us exactly
   *which pages* changed without re-summarizing the rest. Full version history with diffs
   is kept per site.
4. **See company-wide analytics:**
   - **Leaderboard** — who on your team has generated the most `llms.txt` files.
   - **Topic insights** — frequently-mentioned terms across everything your company has
     crawled.
   - **Ask your sites** — natural-language / semantic search (pgvector embeddings) across
     every generated `llms.txt`, so you can ask things like "which of our sites mention
     pricing?"
   - **Cost tracker** — running total (and breakdown by day/purpose) of LLM token spend
     for crawling, summarizing, and embedding.

## Feature highlights beyond the base spec

- **Merkle-tree change detection** with a real, interactive visualization on the site
  detail page (see below) — not just a backend implementation detail.
- **Self-healing onboarding**: if email verification happens in a different
  browser/device than signup (the common case), the dashboard silently completes account
  setup on next load instead of leaving the user stuck.
- **Idempotent onboarding endpoint** — safe against double-submits/race conditions
  instead of 500ing on a duplicate company slug.
- **Graceful LLM degradation** — every feature that depends on `OPENAI_API_KEY` (quotes,
  summaries, embeddings, search) has a sensible fallback/empty state rather than crashing
  when the key isn't configured, so the rest of the product is fully explorable without
  incurring API costs.
- **Supabase JWT verification supports both signing schemes** — legacy HS256 shared
  secret *and* the newer asymmetric ES256/JWKS scheme Supabase now issues by default.
- Sleek, Profound-branded dark UI with animated hover/drag interactions (drag-and-drop
  URL support on the homepage box) built with Tailwind + Framer Motion.

## Architecture

```
┌──────────────┐        ┌───────────────────┐       ┌─────────────────┐
│   Next.js    │ HTTPS  │      FastAPI       │       │   Postgres      │
│  (Vercel)    │───────▶│     (Render)       │──────▶│  + pgvector     │
│              │        │                    │       │  (Supabase)     │
└──────┬───────┘        └─────────┬──────────┘       └─────────────────┘
       │                          │
       │ Supabase Auth (JWT)      │ enqueue jobs
       ▼                          ▼
┌──────────────┐        ┌───────────────────┐
│   Supabase   │        │   Redis (RQ queue) │
│     Auth     │        └─────────┬──────────┘
└──────────────┘                  │
                                   ▼
                        ┌───────────────────┐        ┌────────────┐
                        │   RQ Worker(s)     │───────▶│  OpenAI    │
                        │ crawl → Merkle diff│        │ (summaries,│
                        │ → summarize → gen  │        │ embeddings)│
                        └───────────────────┘        └────────────┘
```

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + Framer Motion,
  deployed on Vercel. Talks to Supabase directly for auth, and to the FastAPI backend for
  everything else.
- **Backend**: FastAPI (Python), deployed on Render as a web service. Verifies Supabase
  JWTs on every request, owns all business logic and the Postgres schema.
- **Database**: Postgres with the `pgvector` extension — recommended to run this as your
  Supabase project's own Postgres instance so Auth and app data live together, though any
  Postgres 14+ works.
- **Queue**: Redis + [RQ](https://python-rq.org/) for background crawl/recheck jobs, plus
  a Render Cron Job that enqueues rechecks for all sites on a schedule.
- **LLM**: OpenAI `gpt-4o-mini` for summarization/quotes and `text-embedding-3-small` for
  semantic search.

This stack was chosen specifically to be **fast to deploy and cheap to run**: Vercel and
Render both deploy straight from a GitHub push with zero infrastructure to manage, and
Supabase provides auth + Postgres + pgvector in one free-tier-friendly project.

### Why a Merkle tree?

The naive way to detect whether a site changed is to re-crawl it, re-summarize every
page with an LLM, and diff the output — expensive in both time and token spend, and it
happens on every recheck even when nothing changed (which is most of the time).

Instead, each crawl builds a Merkle tree: every page gets a leaf hash of its normalized
content, pages are grouped into sections (mirroring the `llms.txt` output structure), and
section hashes fold up into a single root hash.

- **Unchanged site** → the new root hash equals the last stored root hash → the whole
  recheck short-circuits in milliseconds with zero LLM calls.
- **Changed site** → walk down from the root; only the sub-trees (sections/pages) whose
  hash actually changed need to be re-summarized. Untouched sections are reused as-is
  from the previous version.

This is the same core idea Merkle trees are used for everywhere else (Git, blockchains,
IPFS, DynamoDB anti-entropy): **cheaply detect *that* something changed, and cheaply
localize *what* changed**, without re-checking everything. It maps very naturally onto a
hierarchical document like `llms.txt` and pays for itself the moment a site is rechecked
more than once — which, given the whole point of this product is ongoing monitoring, is
every site. The site detail page in the dashboard renders this tree so the effect is
visible, not just implemented under the hood.

## Repository layout

```
frontend/   Next.js app (App Router, TypeScript, Tailwind, Framer Motion)
backend/    FastAPI app (crawler, Merkle tree, pipeline, API routes)
docs/       Additional docs (screenshots, etc.)
docker-compose.yml   Local Postgres (pgvector) + Redis for development
render.yaml          Render Blueprint: API service, worker, cron, Redis
```

## Local development

### Prerequisites

- Node.js 20+, Python 3.11+
- Docker (for local Postgres/Redis) — or point at your own instances
- A Supabase project (free tier is fine) for Auth
- (Optional) an OpenAI API key — everything works without one, in degraded/fallback mode

### 1. Start local Postgres + Redis

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium   # for JS-rendered page crawling
cp .env.example .env          # then fill in SUPABASE_* and (optionally) OPENAI_API_KEY
python -c "from app.core.db import Base, engine; Base.metadata.create_all(bind=engine)"
uvicorn app.main:app --reload --port 8000
```

In a second terminal, run the background worker that processes crawl jobs:

```bash
cd backend && source .venv/bin/activate
rq worker crawls --url redis://localhost:6379/0
```

> **macOS note**: RQ's default forking worker can crash on macOS with an Objective-C
> fork-safety error from native frameworks pulled in transitively (httpx/certifi). If you
> hit this locally, run `rq worker crawls --url redis://localhost:6379/0 --worker-class
> rq.worker.SimpleWorker` instead (in-process, no forking). Not an issue on Render's Linux
> hosts.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_* and API base URL
npm run dev
```

Visit `http://localhost:3000`.

## Deployment

- **Frontend → Vercel**: import the repo, set the project **Root Directory** to
  `frontend`, and configure the `NEXT_PUBLIC_*` env vars from
  `frontend/.env.local.example` (pointing `NEXT_PUBLIC_API_BASE_URL` at your deployed
  Render backend URL).
- **Backend → Render**: push this repo, then create a new Blueprint from `render.yaml` at
  the repo root. It provisions the API web service, an RQ worker, a recheck cron job, and
  a managed Redis instance. Set the `sync: false` env vars (`DATABASE_URL`, Supabase
  keys, `OPENAI_API_KEY`) in the Render dashboard after the blueprint is created — point
  `DATABASE_URL` at your Supabase project's Postgres connection string (with the
  `pgvector` extension enabled via the Supabase dashboard's Database → Extensions page).

## Environment variables

See `backend/.env.example` and `frontend/.env.local.example` for the full, documented
list.

## Tests / validation performed

- Frontend: `tsc --noEmit`, `next build`, and `eslint` all pass clean.
- Manually exercised the full flow end-to-end against a real Supabase project and local
  Postgres/Redis: signup → email verification → onboarding → login → add site → crawl →
  Merkle tree visualization → recheck short-circuit → leaderboard/topics/search/cost
  tracker analytics.
