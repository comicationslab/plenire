import { PracticeInfo } from '../types/hipaa';

/**
 * Health-related terms that should not go out over SMS. This is a helpful safety net,
 * NOT a guarantee: keyword lists miss things. Real protection is the "minimum necessary"
 * message templates + staff training + a server-side check before sending.
 */
export const PHI_RESTRICTED_KEYWORDS = [
  'root canal', 'srp', 'scaling', 'planing', 'periodontal', 'perio', 'caries', 'cavity',
  'abscess', 'extraction', 'extracted', 'implant', 'biopsy', 'crown prep', 'buildup',
  'composite resin', 'amalgam', 'infection', 'antibiotic', 'anesthetic', 'nitrous',
  'gingivitis', 'tooth #', 'quadrant', 'surgery', 'blood pressure', 'diabetes',
  'allergic', 'allergy', 'deep cleaning',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word match (so "period" no longer trips "perio"), allowing simple plurals.
const PHI_PATTERNS = PHI_RESTRICTED_KEYWORDS.map((term) => ({
  term,
  re: new RegExp(`(?<![a-z])${escapeRe(term)}${/\w$/.test(term) ? '(?:s|es)?(?![a-z])' : ''}`, 'i'),
}));

export function detectEPHI(text: string): { hasEPHI: boolean; detectedTerms: string[] } {
  const detectedTerms = PHI_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.term);
  return { hasEPHI: detectedTerms.length > 0, detectedTerms };
}

/** Minimum-necessary reminder wording that staff can start from. */
export function genericMessage(practice: Pick<PracticeInfo, 'name' | 'phone'>, firstName: string, time?: string): string {
  const at = time ? ` at ${time}` : '';
  return `Hi ${firstName || 'there'}, this is ${practice.name} regarding your upcoming appointment${at}. Please reply YES to confirm or call ${practice.phone} for details. Reply STOP to opt out.`;
}

/** Screen Shield: hide identifying details when a monitor faces the waiting room. */
export function maskName(fullName: string, shield: boolean): string {
  if (!shield) return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0] ?? ''}.`;
}

export function maskPhone(phone: string, shield: boolean): string {
  if (!shield) return phone;
  return phone.replace(/(\(\d{3}\)\s*)\d{3}(-\d{4})/, '$1***$2');
}

export function maskEmail(email: string, shield: boolean): string {
  if (!shield) return email;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.length > 2 ? user.slice(0, 2) : ''}***@${domain}`;
}

export function maskTreatment(treatment: string, shield: boolean): string {
  return shield ? 'Reserved visit' : treatment;
}

export const TCPA_CONSENT_STATEMENT = (practiceName: string) =>
  `Yes, text me appointment confirmations, reminders, and earlier-opening offers from ${practiceName} at the mobile number above. Up to 6 messages per appointment. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of booking.`;
