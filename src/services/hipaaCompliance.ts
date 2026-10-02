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

/**
 * Booking-page consent. There is no checkbox: pressing "Book appointment" is the consent, so this text must sit right above that button.
 * The page renders "By clicking “Book appointment,” I agree to the Terms and Privacy Policy." (with links) and then this.
 */
export const BOOKING_CONSENT_STATEMENT = (practiceName: string) =>
  `I consent to receive automated appointment confirmations, reminders, and earlier-opening offers by text message from ${practiceName} at the mobile number I provided. Consent is not a condition of purchase. Message and data rates may apply. Message frequency varies. Reply HELP for help or STOP to end all messages.`;
