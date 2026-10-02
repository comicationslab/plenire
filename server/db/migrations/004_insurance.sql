-- Insurance chosen on the booking page. Stored per appointment because a patient's coverage can change between visits.
-- insurance_plan is the plan name the patient picked (or typed if theirs was not listed); self_pay = "I don't have insurance".
-- Both empty means the question was not asked (older bookings, walk-ins). No member IDs are collected here.
ALTER TABLE appointments
  ADD COLUMN insurance_plan text,
  ADD COLUMN self_pay boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT appointments_insurance_exclusive CHECK (NOT (self_pay AND insurance_plan IS NOT NULL));
