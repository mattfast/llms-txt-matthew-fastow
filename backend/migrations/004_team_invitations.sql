CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    email VARCHAR(320) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('admin', 'member')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_team_invitations_company_id ON team_invitations(company_id);
CREATE INDEX IF NOT EXISTS ix_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS ix_team_invitations_expires_at ON team_invitations(expires_at);

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
