-- Plenire core schema.
-- SAFETY MODEL
--  1. Every tenant table has a practice_id and Row-Level Security (RLS): a request can only ever see
--     the one practice it is scoped to (app.practice_id). If the scope is missing, it sees NOTHING.
--  2. The app connects as plenire_app (no owner/superuser powers). RLS is FORCED on tenant tables.
--  3. Cross-table links include practice_id (composite foreign keys), so a row can never point at
--     another practice's patient/provider/opening even through a bug.
--  4. audit_log is append-only and hash-chained, so tampering is detectable.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plenire_app') THEN CREATE ROLE plenire_app NOLOGIN; END IF;
END $$;

CREATE FUNCTION app_practice() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.practice_id', true), '')::uuid $$;

-- ───────── practices & staff (RLS on, not forced: owner role needs them for login lookup / sweepers) ─────────
CREATE TABLE practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  address text,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  default_fee_cents int NOT NULL DEFAULT 18000,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','front_desk','dentist','hygienist')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────── tenant data ─────────
CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  name text NOT NULL,
  initials text NOT NULL,
  chair text,
  UNIQUE (practice_id, id)
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  name text NOT NULL,
  phone text,
  email text,
  sms_consent boolean NOT NULL DEFAULT false,
  sms_consent_at timestamptz,
  sms_opt_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, id)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  patient_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  treatment text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','arrived','completed','noshow','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, id),
  FOREIGN KEY (practice_id, patient_id) REFERENCES patients (practice_id, id),
  FOREIGN KEY (practice_id, provider_id) REFERENCES providers (practice_id, id)
);

CREATE TABLE openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  appointment_id uuid UNIQUE,               -- one opening per missed/cancelled appointment
  provider_id uuid NOT NULL,
  original_patient_id uuid,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cancellation','no-show','gap')),
  treatment text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','offered','filled','closed')),
  filled_by_patient_id uuid,
  filled_at timestamptz,
  value_cents int,                          -- fee value captured at the moment it was filled
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, id),
  FOREIGN KEY (practice_id, appointment_id) REFERENCES appointments (practice_id, id),
  FOREIGN KEY (practice_id, provider_id) REFERENCES providers (practice_id, id),
  FOREIGN KEY (practice_id, original_patient_id) REFERENCES patients (practice_id, id),
  FOREIGN KEY (practice_id, filled_by_patient_id) REFERENCES patients (practice_id, id)
);

CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  patient_id uuid NOT NULL,
  treatments text[] NOT NULL DEFAULT '{}',
  preferred_provider_id uuid,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('high','normal','low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, patient_id),
  FOREIGN KEY (practice_id, patient_id) REFERENCES patients (practice_id, id),
  FOREIGN KEY (practice_id, preferred_provider_id) REFERENCES providers (practice_id, id)
);

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  opening_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','declined','filled','withdrawn','expired')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,          -- enforced by the database, not by a browser timer
  responded_at timestamptz,
  UNIQUE (opening_id, patient_id),
  FOREIGN KEY (practice_id, opening_id) REFERENCES openings (practice_id, id),
  FOREIGN KEY (practice_id, patient_id) REFERENCES patients (practice_id, id)
);

-- Outbox: messages are written in the same transaction as the business change, then sent by a dispatcher.
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  patient_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('out','in')),
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','sent','failed','received')),
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  FOREIGN KEY (practice_id, patient_id) REFERENCES patients (practice_id, id)
);

CREATE TABLE fee_schedule (
  practice_id uuid NOT NULL REFERENCES practices(id),
  keyword text NOT NULL,
  fee_cents int NOT NULL CHECK (fee_cents >= 0),
  PRIMARY KEY (practice_id, keyword)
);

-- Estimated fee for a treatment: longest matching keyword in this practice's own fee schedule, else its default.
CREATE FUNCTION estimate_fee_cents(p uuid, treatment text) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT f.fee_cents FROM fee_schedule f
      WHERE f.practice_id = p AND lower(treatment) LIKE '%' || lower(f.keyword) || '%'
      ORDER BY length(f.keyword) DESC LIMIT 1),
    (SELECT default_fee_cents FROM practices WHERE id = p))
$$;

-- ───────── audit log: append-only + hash chain ─────────
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES practices(id),
  seq bigint NOT NULL,
  at timestamptz NOT NULL,
  actor_id uuid,
  actor_role text NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',      -- ids and counts only; never patient names or message text
  prev_hash text NOT NULL,
  hash text NOT NULL,
  UNIQUE (practice_id, seq)
);

CREATE FUNCTION audit_hash(prev text, p uuid, s bigint, t timestamptz, actor uuid, role text, act text, det jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(
    prev || '|' || p || '|' || s || '|' ||
    to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
    COALESCE(actor::text, '') || '|' || role || '|' || act || '|' || det::text, 'UTF8')), 'hex')
$$;

CREATE FUNCTION audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_row audit_log%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.practice_id::text, 0));  -- one writer per practice at a time
  SELECT * INTO last_row FROM audit_log WHERE practice_id = NEW.practice_id ORDER BY seq DESC LIMIT 1;
  NEW.seq := COALESCE(last_row.seq, 0) + 1;
  NEW.at := clock_timestamp();
  NEW.prev_hash := COALESCE(last_row.hash, repeat('0', 64));
  NEW.hash := audit_hash(NEW.prev_hash, NEW.practice_id, NEW.seq, NEW.at, NEW.actor_id, NEW.actor_role, NEW.action, NEW.details);
  RETURN NEW;
END $$;
CREATE TRIGGER audit_chain_ins BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_chain();

CREATE FUNCTION audit_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
CREATE TRIGGER audit_block_upd BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_no_mutation();
CREATE TRIGGER audit_block_trunc BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_no_mutation();

-- Re-computes the chain; returns the first broken sequence number (NULL = intact).
CREATE FUNCTION audit_verify(p uuid) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE r audit_log%ROWTYPE; expected_prev text := repeat('0', 64); expected_seq bigint := 1;
BEGIN
  FOR r IN SELECT * FROM audit_log WHERE practice_id = p ORDER BY seq LOOP
    IF r.seq <> expected_seq OR r.prev_hash <> expected_prev
       OR r.hash <> audit_hash(r.prev_hash, r.practice_id, r.seq, r.at, r.actor_id, r.actor_role, r.action, r.details)
    THEN RETURN r.seq; END IF;
    expected_prev := r.hash; expected_seq := r.seq + 1;
  END LOOP;
  RETURN NULL;
END $$;

-- ───────── indexes ─────────
CREATE INDEX ON appointments (practice_id, starts_at);
CREATE INDEX ON openings (practice_id, status, starts_at);
CREATE INDEX ON offers (practice_id, status, expires_at);
CREATE INDEX ON offers (opening_id);
CREATE INDEX ON messages (practice_id, status);
CREATE INDEX ON messages (practice_id, patient_id, created_at);

-- ───────── row-level security ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['providers','patients','appointments','openings','waitlist_entries','offers','messages','fee_schedule','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (practice_id = app_practice()) WITH CHECK (practice_id = app_practice())', t);
  END LOOP;
END $$;
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON practices USING (id = app_practice());
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staff USING (practice_id = app_practice()) WITH CHECK (practice_id = app_practice());

-- ───────── privileges for the app role (least privilege) ─────────
GRANT USAGE ON SCHEMA public TO plenire_app;
GRANT SELECT ON practices, staff TO plenire_app;
GRANT SELECT, INSERT, UPDATE ON providers, patients, appointments, openings, offers, messages, fee_schedule TO plenire_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_entries TO plenire_app;
GRANT SELECT, INSERT ON audit_log TO plenire_app;          -- no UPDATE / DELETE / TRUNCATE
GRANT USAGE ON SEQUENCE audit_log_id_seq TO plenire_app;
GRANT EXECUTE ON FUNCTION app_practice(), estimate_fee_cents(uuid, text), audit_verify(uuid) TO plenire_app;
