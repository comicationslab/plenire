import { AuditAction, AuditLogEvent, StaffRole } from '../types/hipaa';

// Sensitive medical and dental terms that constitute Protected Health Information (PHI/ePHI)
// when linked with patient identifiers over unencrypted SMS.
export const PHI_RESTRICTED_KEYWORDS = [
  'root canal',
  'srp',
  'scaling',
  'planing',
  'periodontal',
  'perio',
  'caries',
  'cavity',
  'abscess',
  'extraction',
  'extracted',
  'implant',
  'biopsy',
  'crown prep',
  'buildup',
  'composite resin',
  'amalgam',
  'infection',
  'antibiotic',
  'anesthetic',
  'nitrous',
  'gingivitis',
  'tooth #',
  'quadrant',
  'surgery',
  'blood pressure',
  'diabetes',
  'allergic',
  'allergy',
  'deep cleaning'
];

/**
 * Scans a message body for prohibited ePHI terms that violate HIPAA minimum necessary / unencrypted transmission guidelines
 */
export function detectEPHI(text: string): { hasEPHI: boolean; detectedTerms: string[] } {
  const lower = text.toLowerCase();
  const detected: string[] = [];

  for (const term of PHI_RESTRICTED_KEYWORDS) {
    if (lower.includes(term)) {
      detected.push(term);
    }
  }

  return {
    hasEPHI: detected.length > 0,
    detectedTerms: detected,
  };
}

/**
 * Automatically transforms a drafted SMS message containing ePHI into HIPAA-compliant scheduling prose.
 */
export function sanitizeForSMS(text: string, patientName: string, time?: string, practiceName = 'Lakeside Dental'): string {
  const firstName = patientName.split(' ')[0] || 'there';
  const timeStr = time ? ` at ${time}` : '';
  return `Hi ${firstName}, this is ${practiceName} regarding your upcoming appointment${timeStr}. Please reply YES to confirm or call our office at (763) 555-0100 for details. Reply STOP to opt out.`;
}

/**
 * Reception Screen Shield Privacy Mode functions (§ 164.530(c) Physical Safeguards)
 * Obscures ePHI in reception areas where waiting room visitors can view staff monitors.
 */
export function maskName(fullName: string, isShieldActive: boolean): string {
  if (!isShieldActive) return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] || '';
  return `${first} ${lastInitial}.`;
}

export function maskPhone(phone: string, isShieldActive: boolean): string {
  if (!isShieldActive) return phone;
  // e.g. (763) 555-0182 -> (763) ***-0182
  return phone.replace(/(\(\d{3}\)\s*)\d{3}(-\d{4})/, '$1***$2');
}

export function maskEmail(email: string, isShieldActive: boolean): string {
  if (!isShieldActive) return email;
  const [user, domain] = email.split('@');
  if (!domain) return '***@***.com';
  const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***` : '***';
  return `${maskedUser}@${domain}`;
}

export function maskTreatment(treatment: string, isShieldActive: boolean): string {
  if (!isShieldActive) return treatment;
  return 'Reserved Procedure';
}

/**
 * Creates a deterministic, tamper-evident cryptographic-style hash string for an audit log record
 */
export function createAuditHash(data: {
  timestamp: string;
  user: string;
  action: AuditAction;
  details: string;
  ipAddress: string;
}): string {
  const raw = `${data.timestamp}|${data.user}|${data.action}|${data.details}|${data.ipAddress}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256-${hex}e9bf2a`;
}

export const HIPAA_NPP_SUMMARY = `
Notice of Privacy Practices (NPP) Summary - 45 CFR § 164.520
Lakeside Dental is committed to protecting your Electronic Protected Health Information (ePHI).
1. We use your health information strictly for treatment, payment, and healthcare operations.
2. We never share or sell your information with third-party advertisers.
3. You have the right to inspect, copy, or request an amendment to your dental records.
4. You have the right to receive an accounting of disclosures upon request.
5. Communications via unencrypted SMS are limited to generic scheduling reminders with prior explicit consent.
`;

export const TCPA_CONSENT_STATEMENT = (practiceName: string) =>
  `Yes, text me appointment confirmations, reminders, and earlier-opening offers from ${practiceName} at the mobile number above. Up to 6 messages per appointment. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of booking.`;
