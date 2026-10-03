import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import * as S from './schemas';

/** Every screen reads and writes through these hooks. Data comes from the server; nothing is kept in browser state. */
const SECOND = 1000;

/** Query definitions are exported so tests (and future prefetching) use exactly what the screens use. */
export const meQuery = queryOptions({ queryKey: ['me'], queryFn: () => api('GET', '/api/me', S.meSchema), staleTime: 5 * 60 * SECOND });
export const providersQuery = queryOptions({ queryKey: ['providers'], queryFn: () => api('GET', '/api/providers', S.providersSchema), staleTime: 5 * 60 * SECOND });
export const appointmentsQuery = queryOptions({ queryKey: ['appointments'], queryFn: () => api('GET', '/api/appointments', S.appointmentsSchema), refetchInterval: 30 * SECOND });
export const openingsQuery = queryOptions({ queryKey: ['openings'], queryFn: () => api('GET', '/api/openings', S.openingsSchema), refetchInterval: 10 * SECOND });
export const patientsQuery = queryOptions({ queryKey: ['patients'], queryFn: () => api('GET', '/api/patients', S.patientsSchema) });
export const patientSummaryQuery = queryOptions({ queryKey: ['patients', 'summary'], queryFn: () => api('GET', '/api/patients/summary', S.patientSummarySchema) });
export const waitlistQuery = queryOptions({ queryKey: ['waitlist'], queryFn: () => api('GET', '/api/waitlist', S.waitlistSchema) });
export const conversationsQuery = queryOptions({ queryKey: ['conversations'], queryFn: () => api('GET', '/api/conversations', S.conversationsSchema), refetchInterval: 15 * SECOND });
export const messagesQuery = (patientId: string) =>
  queryOptions({ queryKey: ['messages', patientId], queryFn: () => api('GET', `/api/messages?patientId=${patientId}`, S.messagesSchema), refetchInterval: 15 * SECOND });
export const recoveryRateQuery = queryOptions({ queryKey: ['metrics', 'recovery'], queryFn: () => api('GET', '/api/metrics/recovery', S.recoveryRateSchema), refetchInterval: 30 * SECOND });
export const revenueQuery = queryOptions({ queryKey: ['metrics', 'revenue'], queryFn: () => api('GET', '/api/metrics/revenue', S.revenueSchema), refetchInterval: 30 * SECOND });
export const auditQuery = queryOptions({ queryKey: ['audit'], queryFn: () => api('GET', '/api/audit', S.auditSchema) });
export const auditVerifyQuery = queryOptions({ queryKey: ['audit', 'verify'], queryFn: () => api('GET', '/api/audit/verify', S.auditVerifySchema) });

export const staffQuery = queryOptions({ queryKey: ['staff'], queryFn: () => api('GET', '/api/staff', S.staffListSchema) });
export const adminPracticesQuery = queryOptions({ queryKey: ['admin', 'practices'], queryFn: () => api('GET', '/api/platform/practices', S.adminPracticesSchema), refetchInterval: 60 * SECOND });
export const adminAdminsQuery = queryOptions({ queryKey: ['admin', 'admins'], queryFn: () => api('GET', '/api/platform/admins', S.adminsSchema) });

export const useMe = () => useQuery(meQuery);
export const useProviders = () => useQuery(providersQuery);
export const useAppointments = () => useQuery(appointmentsQuery);
export const useOpenings = () => useQuery(openingsQuery);
export const usePatients = () => useQuery(patientsQuery);
export const usePatientSummary = () => useQuery(patientSummaryQuery);
export const useWaitlist = () => useQuery(waitlistQuery);
export const useConversations = () => useQuery(conversationsQuery);
export const useMessages = (patientId: string | undefined) => useQuery({ ...messagesQuery(patientId ?? ''), enabled: Boolean(patientId) });
export const useRecoveryRate = () => useQuery(recoveryRateQuery);
/** Owner only. For other roles the server answers 403, so we never even ask. */
export const useRevenue = (enabled: boolean) => useQuery({ ...revenueQuery, enabled });
export const useAudit = (enabled: boolean) => useQuery({ ...auditQuery, enabled });
export const useAuditVerify = (enabled: boolean) => useQuery({ ...auditVerifyQuery, enabled });

export const useStaff = (enabled: boolean) => useQuery({ ...staffQuery, enabled });
export const useAdminPractices = () => useQuery(adminPracticesQuery);
export const useAdminAdmins = () => useQuery(adminAdminsQuery);

/** After any change, refresh everything: the data set is small and correctness beats cleverness here. */
function useWrite<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export const useSetAppointmentStatus = () =>
  useWrite((v: { id: string; status: 'scheduled' | 'arrived' | 'completed' | 'noshow' }) =>
    api('PATCH', `/api/appointments/${v.id}/status`, S.statusChangeSchema, { status: v.status }));
export const useSavePracticeSettings = () =>
  useWrite((v: { googleReviewUrl: string | null; reminderHours: number[] }) => api('PATCH', '/api/practice/settings', S.okSchema, v));
export const useSetFollowUp = () =>
  useWrite((v: { id: string; followUp: string | null }) => api('PATCH', `/api/appointments/${v.id}/follow-up`, S.okSchema, { followUp: v.followUp }));
export const useSendOffers = () =>
  useWrite((openingId: string) => api('POST', `/api/openings/${openingId}/offers`, S.sendOffersSchema, { limit: 3, ttlMinutes: 15 }));
export const useSimulateReply = () =>
  useWrite((v: { patientId: string; body: string }) => api('POST', `/api/patients/${v.patientId}/simulate-reply`, S.replySchema, { body: v.body }));
export const useSendMessage = () =>
  useWrite((v: { patientId: string; body: string }) => api('POST', `/api/patients/${v.patientId}/messages`, S.okSchema, { body: v.body }));
export const useMarkRead = () => useWrite((patientId: string) => api('POST', `/api/patients/${patientId}/messages/read`, S.okSchema, {}));

export interface WalkIn { name: string; phone: string | null; email: string | null; smsConsent: boolean; providerId: string; startsAt: string; durationMin: number; treatment: string }
export const useAddWalkIn = () =>
  useWrite(async (w: WalkIn) => {
    const { patientId } = await api('POST', '/api/patients', S.idSchema, { name: w.name, phone: w.phone, email: w.email, smsConsent: w.smsConsent, walkIn: true });
    const { appointmentId } = await api('POST', '/api/appointments', S.idSchema, { patientId, providerId: w.providerId, startsAt: w.startsAt, durationMin: w.durationMin, treatment: w.treatment, walkIn: true });
    await api('PATCH', `/api/appointments/${appointmentId}/status`, S.statusChangeSchema, { status: 'arrived' });
    return { patientId, appointmentId };
  });

export interface BookingInput {
  firstName: string; lastName: string; phone: string; email: string | null; newPatient: boolean; smsConsent: boolean; notes: string | null;
  date: string; time: string; durationMin: number; treatment: string; providerId: string | null;
  insurancePlan?: string | null; selfPay?: boolean;
}
export const useBook = () => useWrite((b: BookingInput) => api('POST', '/api/bookings', S.bookingResultSchema, b));

/** Fire-and-forget: workstation events (lock, unlock, shield) join the same tamper-evident log. */
export const reportWorkstationEvent = (action: string) => api('POST', '/api/audit/events', S.okSchema, { action }).catch(() => {});

// ───────── team, providers, account, and the operator console ─────────
export const useInviteStaff = () =>
  useWrite((v: { email: string; name: string; role: 'owner' | 'front_desk' | 'dentist' | 'hygienist' }) => api('POST', '/api/staff/invite', S.inviteResultSchema, v));
export const useResendInvite = () => useWrite((staffId: string) => api('POST', `/api/staff/${staffId}/resend`, S.inviteResultSchema, {}));
export const useUpdateStaff = () =>
  useWrite((v: { id: string; role?: 'owner' | 'front_desk' | 'dentist' | 'hygienist'; active?: boolean }) => api('PATCH', `/api/staff/${v.id}`, S.okSchema, { role: v.role, active: v.active }));
export const useAddProvider = () =>
  useWrite((v: { name: string; initials: string; chair: string | null; title: string | null }) => api('POST', '/api/providers', S.providerIdSchema, v));
export const useUpdateProvider = () =>
  useWrite((v: { id: string; active?: boolean; chair?: string | null; name?: string }) => api('PATCH', `/api/providers/${v.id}`, S.okSchema, { active: v.active, chair: v.chair, name: v.name }));
/** Practice staff and platform admins change their own password through different (equally strict) endpoints. */
export const useChangePassword = (platform: boolean) =>
  useMutation({ mutationFn: (v: { currentPassword: string; newPassword: string }) => api('POST', platform ? '/api/platform/account/password' : '/api/account/password', S.okSchema, v) });

export interface NewPracticeInput { name: string; phone: string; address: string | null; timezone: string; ownerName: string; ownerEmail: string; staffLimit?: number }
export const useCreatePractice = () => useWrite((v: NewPracticeInput) => api('POST', '/api/platform/practices', S.createPracticeResultSchema, v));
export const useUpdatePractice = () =>
  useWrite((v: { id: string; status?: 'active' | 'suspended'; staffLimit?: number }) => api('PATCH', `/api/platform/practices/${v.id}`, S.okSchema, { status: v.status, staffLimit: v.staffLimit }));
export const useOwnerInvite = () => useWrite((v: { id: string; email?: string; name?: string }) => api('POST', `/api/platform/practices/${v.id}/owner-invite`, S.createPracticeResultSchema, { email: v.email, name: v.name }));
export const useInviteAdmin = () => useWrite((v: { email: string; name: string }) => api('POST', '/api/platform/admins', S.createPracticeResultSchema, v));
