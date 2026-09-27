CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    created_by UUID NOT NULL REFERENCES profiles(id),
    name VARCHAR(80) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_api_keys_company_id ON api_keys(company_id);
CREATE INDEX IF NOT EXISTS ix_api_keys_created_by ON api_keys(created_by);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
