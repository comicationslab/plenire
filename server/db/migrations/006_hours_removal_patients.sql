-- 1) Removing a clinic. "removed" hides it from the console and blocks every sign-in, but the data is kept (patient records and the
--    tamper-evident audit log must not vanish by accident) and the clinic can be restored.
ALTER TABLE practices DROP CONSTRAINT IF EXISTS practices_status_check;
ALTER TABLE practices ADD CONSTRAINT practices_status_check CHECK (status IN ('active','suspended','removed'));

-- 2) Working hours per provider/chair. One window per weekday (0 = Sunday ... 6 = Saturday), minutes from midnight in the
--    practice's time zone. A provider with NO rows uses the default (Monday-Saturday 9:00-17:00); once any row exists, a weekday
--    without a row is a day off.
CREATE TABLE provider_hours (
  practice_id uuid NOT NULL REFERENCES practices(id),
  provider_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1425),
  end_min smallint NOT NULL CHECK (end_min BETWEEN 15 AND 1440),
  PRIMARY KEY (provider_id, weekday),
  CHECK (end_min > start_min),
  FOREIGN KEY (practice_id, provider_id) REFERENCES providers (practice_id, id)
);
ALTER TABLE provider_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_hours FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_hours USING (practice_id = app_practice()) WITH CHECK (practice_id = app_practice());
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_hours TO plenire_app;

-- 3) Editing a patient card. Phone/email/notes already exist; track who changed it last (ids only, never values).
ALTER TABLE patients
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN updated_by uuid;
