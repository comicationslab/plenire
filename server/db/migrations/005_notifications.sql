-- Automatic patient texts: booking confirmation, appointment reminders, and the thank-you + review request.
--
-- appointment_notifications is the "already sent" ledger. The UNIQUE (appointment_id, kind) key is what stops a patient getting
-- two reminders or two thank-yous when staff toggle a status back and forth or two workers run at once.
CREATE TABLE appointment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id),
  appointment_id uuid NOT NULL,
  kind text NOT NULL,                       -- 'confirmation' | 'thanks' | 'reminder_24h' | 'reminder_2h' ...
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, kind),
  FOREIGN KEY (practice_id, appointment_id) REFERENCES appointments (practice_id, id)
);
ALTER TABLE appointment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointment_notifications USING (practice_id = app_practice()) WITH CHECK (practice_id = app_practice());
GRANT SELECT, INSERT ON appointment_notifications TO plenire_app;

-- Per-practice settings. google_review_url is the link in the thank-you text (Google Business Profile "get more reviews" link).
-- reminder_hours = how many hours before the visit a reminder goes out; an empty list turns reminders off.
ALTER TABLE practices
  ADD COLUMN google_review_url text,
  ADD COLUMN reminder_hours int[] NOT NULL DEFAULT '{24,2}';
GRANT UPDATE (google_review_url, reminder_hours) ON practices TO plenire_app;

-- Lets the reminder job find due appointments without scanning history.
CREATE INDEX ON appointments (practice_id, status, starts_at);
