-- Fields the screens need that phase C1 did not have yet.
ALTER TABLE patients
  ADD COLUMN new_patient boolean NOT NULL DEFAULT false,
  ADD COLUMN walk_in boolean NOT NULL DEFAULT false,
  ADD COLUMN notes text;                       -- front-desk notes only; never clinical notes

ALTER TABLE appointments
  ADD COLUMN follow_up text,
  ADD COLUMN thanked boolean NOT NULL DEFAULT false,   -- thank-you / review request sent after a completed visit
  ADD COLUMN walk_in boolean NOT NULL DEFAULT false;

ALTER TABLE messages ADD COLUMN read_at timestamptz;   -- inbound messages staff have not opened yet
ALTER TABLE providers ADD COLUMN title text;
