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
    /** Weekly working windows (weekday 0 = Sunday, minutes from midnight). Empty/undefined = not loaded. */
    hours?: { weekday: number; startMin: number; endMin: number }[];
  }[];
  visitTypes: {
    id: string;
    name: string;
    duration: number;
    providers: string[];
    description?: string;
  }[];
}
