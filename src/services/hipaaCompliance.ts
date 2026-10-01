export { PHI_RESTRICTED_KEYWORDS, detectEPHI, genericMessage } from '../../shared/phi';

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
