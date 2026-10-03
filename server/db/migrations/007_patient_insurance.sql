-- The patient's CURRENT insurance, shown and editable on the patient card.
-- appointments.insurance_plan / self_pay (migration 004) stay as what the patient chose for THAT visit; this is the standing answer.
-- insurance_plan = plan name (picked, or typed if not listed); self_pay = "I don't have insurance"; both empty = never asked.
-- No member / policy numbers are stored anywhere: they are the more sensitive identifiers and nothing here needs them yet.
ALTER TABLE patients
  ADD COLUMN insurance_plan text,
  ADD COLUMN self_pay boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT patients_insurance_exclusive CHECK (NOT (self_pay AND insurance_plan IS NOT NULL));

-- Existing patients: start from their most recent visit that has an answer.
UPDATE patients p SET insurance_plan = a.insurance_plan, self_pay = a.self_pay
  FROM (SELECT DISTINCT ON (patient_id) patient_id, insurance_plan, self_pay FROM appointments
         WHERE insurance_plan IS NOT NULL OR self_pay ORDER BY patient_id, starts_at DESC) a
 WHERE a.patient_id = p.id;
