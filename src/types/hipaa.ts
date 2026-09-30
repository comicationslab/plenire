export type StaffRole = 'front_desk' | 'owner' | 'hygienist' | 'dentist' | 'compliance_officer';

export interface StaffUser {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  title: string;
  practice: string;
}

export type AuditAction =
  | 'WORKSTATION_LOCK'
  | 'WORKSTATION_AUTO_LOCK'
  | 'WORKSTATION_UNLOCK'
  | 'UNLOCK_FAILED'
  | 'PIN_SET'
  | 'PIN_CHANGED'
  | 'IDLE_TIMEOUT_CHANGED'
  | 'ROLE_SWITCH'
  | 'PRIVACY_SHIELD'
  | 'EPHI_BLOCKED'
  | 'SMS_SENT'
  | 'DISPATCH_OFFER'
  | 'SLOT_FILLED'
  | 'TCPA_STOP'
  | 'NO_SHOW_RECORDED'
  | 'APPT_UPDATE'
  | 'APPT_UNDO'
  | 'FOLLOWUP_SET'
  | 'WALKIN_ADDED'
  | 'PATIENT_BOOKED';

export interface Patient {
  id: string;
  name: string;
  initials: string;
  phone: string;
  email: string;
  lastVisit: string;
  recentVisit: string;
  status: 'Active' | 'Waitlist' | 'Recovered' | 'Archived';
  newPatient?: boolean;
  smsConsent: boolean;
  smsConsentAt?: string;
  notes?: string;
  clinicalNotes?: string; // Restricted to clinical roles or break-glass
  walkIn?: boolean;
}

export interface Appointment {
  id: string;
  time: string;
  mins: number;
  dur: number;
  patient: string;
  initials: string;
  provider: string;
  op: string;
  treatment: string;
  status: 'scheduled' | 'arrived' | 'completed' | 'noshow';
  followUp?: string;
  thanked?: boolean;
  walkIn?: boolean;
  notes?: string;
}

export interface RecoveryOpening {
  id: string;
  type: 'No-show' | 'Cancellation' | 'Gap';
  kind: 'no-show' | 'cancellation' | 'gap';
  time: string;
  doctor: string;
  patient: string;
  detail: string;
  held?: boolean;
  filledBy?: string;
  value?: number;
  offers: RecoveryOffer[];
}

export interface RecoveryOffer {
  name: string;
  score: number;
  status: 'sent' | 'declined' | 'expired' | 'stopped' | 'filled' | 'withdrawn' | 'lost';
  expiresAt: number;
  ch: 'SMS' | 'email';
  flag?: boolean;
}

export interface WaitlistEntry {
  id: string;
  name: string;
  initials: string;
  reason: 'ASAP' | 'Wants sooner' | 'Overdue recall';
  wants: string;
  provider: string;
  when: string;
  stopped?: boolean;
  phone?: string;
}

export interface ChatMessage {
  from: 'practice' | 'patient';
  time: string;
  text: string;
  sanitized?: boolean;
  scrubbedWarning?: string;
}

export interface Conversation {
  id: string;
  patient: string;
  initials: string;
  phone: string;
  status: string;
  time: string;
  unread: boolean;
  lastFrom: 'practice' | 'patient';
  preview: string;
  messages: ChatMessage[];
}

export interface BAAItem {
  vendor: string;
  service: string;
  baaSignedDate: string;
  status: 'Active' | 'Review Due';
  encryptionLevel: string;
  dataClassification: string;
}

export interface PracticeInfo {
  id: string;
  name: string;
  initials: string;
  tagline: string;
  timezone: string;
  ehr?: string;
  address: string;
  phone: string;
  providers: {
    id: string;
    name: string;
    role: string;
    initials: string;
    op?: string;
    fast?: boolean;
  }[];
  visitTypes: {
    id: string;
    name: string;
    duration: number;
    providers: string[];
    description?: string;
  }[];
}
