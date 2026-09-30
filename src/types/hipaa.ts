export type StaffRole = 'front_desk' | 'hygienist' | 'dentist' | 'compliance_officer';

export interface StaffUser {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  title: string;
  practice: string;
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'SESSION_TIMEOUT'
  | 'SESSION_UNLOCK'
  | 'READ_EPHI'
  | 'CREATE_WALKIN'
  | 'UPDATE_APPOINTMENT'
  | 'SEND_OUTREACH'
  | 'RECOVERY_FILLED'
  | 'EXPORT_AUDIT'
  | 'BREAK_GLASS_ACCESS'
  | 'TCPA_CONSENT_RECORDED'
  | 'OPT_OUT_RECORDED'
  | 'EPHI_SCRUBBER_TRIGGERED';

export interface AuditLogEvent {
  id: string;
  timestamp: string;
  user: string;
  userRole: StaffRole;
  action: AuditAction;
  resourceId?: string;
  patientName?: string;
  details: string;
  hash: string;
  ipAddress: string;
  complianceFlag?: boolean;
}

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
