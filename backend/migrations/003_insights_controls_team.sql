ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS max_pages INTEGER NOT NULL DEFAULT 500,
    ADD COLUMN IF NOT EXISTS allow_subdomains BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS include_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS exclude_patterns JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE crawl_jobs
    ADD COLUMN IF NOT EXISTS coverage JSONB;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'member';

WITH first_profiles AS (
    SELECT DISTINCT ON (company_id) id
    FROM profiles
    ORDER BY company_id, created_at, id
)
UPDATE profiles
SET role = 'admin'
WHERE id IN (SELECT id FROM first_profiles);

ALTER TABLE profiles
    ADD CONSTRAINT ck_profiles_role CHECK (role IN ('admin', 'member'));

CREATE TABLE IF NOT EXISTS topic_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    mention_count INTEGER NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_topic_snapshots_company_id ON topic_snapshots(company_id);
CREATE INDEX IF NOT EXISTS ix_topic_snapshots_site_id ON topic_snapshots(site_id);
CREATE INDEX IF NOT EXISTS ix_topic_snapshots_name ON topic_snapshots(name);
CREATE INDEX IF NOT EXISTS ix_topic_snapshots_captured_at ON topic_snapshots(captured_at);

INSERT INTO topic_snapshots (company_id, site_id, name, mention_count, captured_at)
SELECT company_id, site_id, name, mention_count, updated_at
FROM topics;

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_events_company_id ON audit_events(company_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS ix_audit_events_created_at ON audit_events(created_at);

ALTER TABLE topic_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
