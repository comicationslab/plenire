/**
 * Insurance plans offered on the booking page. A starter list of common US dental carriers;
 * like VISIT_TYPES, it moves into the database (per practice, so each clinic lists only what it accepts) in a later phase.
 */
export const INSURANCE_PLANS: string[] = [
  'Aetna Dental',
  'Ameritas',
  'Anthem Blue Cross Blue Shield Dental',
  'Cigna Dental',
  'Delta Dental PPO',
  'Delta Dental Premier',
  'Guardian Dental',
  'Humana Dental',
  'MetLife Dental',
  'Principal Dental',
  'Sun Life Dental',
  'UnitedHealthcare Dental',
];

/** Case-insensitive match on any part of the plan name. Empty search returns the whole list. */
export const searchInsurancePlans = (query: string): string[] => {
  const q = query.trim().toLowerCase();
  return q ? INSURANCE_PLANS.filter((p) => p.toLowerCase().includes(q)) : INSURANCE_PLANS;
};
