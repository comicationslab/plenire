/**
 * Health-wording check shared by the browser and the server, so the same rule applies everywhere.
 * A safety net, NOT a guarantee: keyword lists miss things. Real protection is minimum-necessary templates.
 */
export const PHI_RESTRICTED_KEYWORDS = [
  'root canal', 'srp', 'scaling', 'planing', 'periodontal', 'perio', 'caries', 'cavity',
  'abscess', 'extraction', 'extracted', 'implant', 'biopsy', 'crown prep', 'buildup',
  'composite resin', 'amalgam', 'infection', 'antibiotic', 'anesthetic', 'nitrous',
  'gingivitis', 'tooth #', 'quadrant', 'surgery', 'blood pressure', 'diabetes',
  'allergic', 'allergy', 'deep cleaning',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PHI_PATTERNS = PHI_RESTRICTED_KEYWORDS.map((term) => ({
  term,
  re: new RegExp(`(?<![a-z])${escapeRe(term)}${/\w$/.test(term) ? '(?:s|es)?(?![a-z])' : ''}`, 'i'),
}));

export function detectEPHI(text: string): { hasEPHI: boolean; detectedTerms: string[] } {
  const detectedTerms = PHI_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.term);
  return { hasEPHI: detectedTerms.length > 0, detectedTerms };
}

export function genericMessage(practice: { name: string; phone: string }, firstName: string, time?: string): string {
  const at = time ? ` at ${time}` : '';
  return `Hi ${firstName || 'there'}, this is ${practice.name} regarding your upcoming appointment${at}. Please reply YES to confirm or call ${practice.phone} for details. Reply STOP to opt out.`;
}
