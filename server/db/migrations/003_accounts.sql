-- Accounts, sign-in, invitations and the platform (SaaS operator) side.
-- Three database roles, each with the least access it needs:
--   plenire_app      serves a signed-in practice user. Locked to ONE practice by row-level security.
--   plenire_auth     handles sign-in / invitations / password reset (must look people up before we know their practice).
--   plenire_platform the operator console. Can create practices and users. Has NO access to patient data at all.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plenire_auth') THEN CREATE ROLE plenire_auth NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plenire_platform') THEN CREATE ROLE plenire_platform NOLOGIN; END IF;
END $$;

ALTER TABLE practices
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  ADD COLUMN plan text NOT NULL DEFAULT 'trial',
  ADD COLUMN staff_limit int NOT NULL DEFAULT 25 CHECK (staff_limit >= 1);

-- staff: one explicit status (invited → active ↔ disabled); "active" stays available as a generated column.
ALTER TABLE staff ADD COLUMN status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled'));
UPDATE staff SET status = CASE WHEN active THEN 'active' ELSE 'disabled' END;
ALTER TABLE staff ADD COLUMN accepted_at timestamptz;      -- set when the person first chose a password
UPDATE staff SET accepted_at = created_at WHERE status = 'active';
ALTER TABLE staff DROP COLUMN active;
ALTER TABLE staff ADD COLUMN active boolean GENERATED ALWAYS AS (status = 'active') STORED;
CREATE UNIQUE INDEX staff_email_lower ON staff (lower(email));

CREATE TABLE platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_admins_email_lower ON platform_admins (lower(email));

-- Passwords live ONLY here, and only plenire_auth can touch this table (hash format: scrypt$N$r$p$salt$hash).
CREATE TABLE credentials (
  principal_id uuid PRIMARY KEY,
  principal_type text NOT NULL CHECK (principal_type IN ('staff','platform')),
  password_hash text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

-- Refresh-token sessions. Only a hash of the token is stored. A family = one sign-in and all its rotations.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('staff','platform')),
  practice_id uuid REFERENCES practices(id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid
);
CREATE INDEX ON sessions (principal_id) WHERE revoked_at IS NULL;
CREATE INDEX ON sessions (family_id);
CREATE INDEX ON sessions (practice_id) WHERE revoked_at IS NULL;

-- One-time links: invitations, password resets, platform-admin invitations (token stored hashed, single use, expires).
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('staff_invite','password_reset','platform_invite')),
  principal_id uuid NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('staff','platform')),
  practice_id uuid REFERENCES practices(id),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON invitations (principal_id) WHERE used_at IS NULL;

-- Operator actions (create/suspend a practice, invite an admin). Ids only; append-only.
CREATE TABLE platform_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'
);
CREATE TRIGGER platform_audit_block_upd BEFORE UPDATE OR DELETE ON platform_audit FOR EACH ROW EXECUTE FUNCTION audit_no_mutation();
CREATE TRIGGER platform_audit_block_trunc BEFORE TRUNCATE ON platform_audit FOR EACH STATEMENT EXECUTE FUNCTION audit_no_mutation();

ALTER TABLE providers ADD COLUMN active boolean NOT NULL DEFAULT true;

-- Indexes for many practices with many patients (practice_id always leads, so each practice reads only its own slice).
CREATE INDEX ON patients (practice_id, name);
CREATE INDEX ON appointments (patient_id);
CREATE INDEX ON offers (patient_id, status);
CREATE INDEX ON messages (patient_id, created_at);
CREATE INDEX ON waitlist_entries (practice_id, created_at);
CREATE INDEX ON openings (filled_by_patient_id) WHERE filled_by_patient_id IS NOT NULL;

-- ───────── row-level security for the new tables ─────────
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;  ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_only ON credentials TO plenire_auth USING (true) WITH CHECK (true);   -- nobody else has a policy → sees nothing

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;     ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions TO plenire_app USING (practice_id = app_practice()) WITH CHECK (practice_id = app_practice());
CREATE POLICY auth_all ON sessions TO plenire_auth USING (true) WITH CHECK (true);
CREATE POLICY platform_all ON sessions TO plenire_platform USING (true) WITH CHECK (true);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;  ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations TO plenire_app USING (practice_id = app_practice()) WITH CHECK (practice_id = app_practice());
CREATE POLICY auth_all ON invitations TO plenire_auth USING (true) WITH CHECK (true);
CREATE POLICY platform_all ON invitations TO plenire_platform USING (true) WITH CHECK (true);

-- practices & staff: the original tenant policy applies to everyone, so add explicit policies for the two operator roles.
CREATE POLICY auth_all ON practices TO plenire_auth USING (true);
CREATE POLICY platform_all ON practices TO plenire_platform USING (true) WITH CHECK (true);
CREATE POLICY auth_all ON staff TO plenire_auth USING (true) WITH CHECK (true);
CREATE POLICY platform_all ON staff TO plenire_platform USING (true) WITH CHECK (true);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all ON platform_admins TO plenire_auth USING (true) WITH CHECK (true);
CREATE POLICY platform_all ON platform_admins TO plenire_platform USING (true) WITH CHECK (true);

-- ───────── privileges ─────────
-- app: manage its own team and providers, never passwords
GRANT INSERT, UPDATE ON staff, providers TO plenire_app;
GRANT SELECT, INSERT, UPDATE ON invitations TO plenire_app;
GRANT SELECT, UPDATE ON sessions TO plenire_app;

-- auth: sign-in, invitations, resets
GRANT USAGE ON SCHEMA public TO plenire_auth, plenire_platform;
GRANT SELECT ON practices TO plenire_auth;
GRANT SELECT, UPDATE ON staff, platform_admins TO plenire_auth;
GRANT SELECT, INSERT, UPDATE ON credentials, sessions, invitations TO plenire_auth;
GRANT INSERT ON platform_audit TO plenire_auth;
GRANT USAGE ON SEQUENCE platform_audit_id_seq TO plenire_auth, plenire_platform;
GRANT EXECUTE ON FUNCTION app_practice() TO plenire_auth, plenire_platform;

-- platform: operator console. Deliberately NO grants on patients, appointments, messages, openings, offers, audit_log or credentials.
GRANT SELECT, INSERT, UPDATE ON practices, staff, platform_admins, invitations TO plenire_platform;
GRANT SELECT, UPDATE ON sessions TO plenire_platform;
GRANT SELECT, INSERT ON platform_audit TO plenire_platform;
