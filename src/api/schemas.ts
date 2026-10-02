import { z } from 'zod';

/**
 * What the API promises to send. Every response is checked against these in the browser, and the same
 * schemas are used by a server test, so the screens and the backend can never silently drift apart.
 */
export const roleSchema = z.enum(['owner', 'front_desk', 'dentist', 'hygienist']);
export type Role = z.infer<typeof roleSchema>;

export const meSchema = z.object({
  staffId: z.string(),
  name: z.string(),
  role: roleSchema,
  practice: z.object({ id: z.string(), name: z.string(), phone: z.string(), address: z.string().nullable(), timezone: z.string() }),
});

export const anyRoleSchema = z.enum(['owner', 'front_desk', 'dentist', 'hygienist', 'platform_admin']);
export type AnyRole = z.infer<typeof anyRoleSchema>;
export const sessionSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string(), role: anyRoleSchema, practiceId: z.string().nullable(), practiceName: z.string().nullable() }),
});
export type Session = z.infer<typeof sessionSchema>;

export const staffListSchema = z.array(z.object({
  id: z.string(), name: z.string(), email: z.string(), role: roleSchema, status: z.enum(['invited', 'active', 'disabled']), acceptedAt: z.string().nullable(),
}));
export const inviteResultSchema = z.object({ staffId: z.string().optional(), email: z.string().optional(), emailSent: z.boolean(), inviteLink: z.string().optional() });
export const inviteInfoSchema = z.object({ kind: z.enum(['staff_invite', 'password_reset', 'platform_invite']), email: z.string(), name: z.string(), practiceName: z.string().nullable() });
export const forgotSchema = z.object({ ok: z.boolean(), devLink: z.string().optional() });
export const providerIdSchema = z.object({ providerId: z.string() });

export const adminPracticesSchema = z.array(z.object({
  id: z.string(), name: z.string(), phone: z.string(), timezone: z.string(), status: z.enum(['active', 'suspended']), plan: z.string(), staffLimit: z.number(),
  createdAt: z.string(), activeStaff: z.number(), pendingInvites: z.number(), ownerEmail: z.string().nullable(), lastActiveAt: z.string().nullable(),
}));
export const createPracticeResultSchema = z.object({ practiceId: z.string().optional(), ownerEmail: z.string().optional(), email: z.string().optional(), emailSent: z.boolean(), inviteLink: z.string().optional() });
export const adminsSchema = z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), status: z.enum(['invited', 'active', 'disabled']), createdAt: z.string() }));

export const providerSchema = z.object({ id: z.string(), name: z.string(), initials: z.string(), chair: z.string().nullable(), title: z.string().nullable() });
export const providersSchema = z.array(providerSchema);

export const appointmentStatus = z.enum(['scheduled', 'arrived', 'completed', 'noshow', 'cancelled']);
export const appointmentSchema = z.object({
  id: z.string(), startsAt: z.string(), durationMin: z.number(), treatment: z.string(), status: appointmentStatus,
  followUp: z.string().nullable(), thanked: z.boolean(), walkIn: z.boolean(),
  patientId: z.string(), patientName: z.string(), providerId: z.string(), providerName: z.string(), chair: z.string().nullable(),
});
export const appointmentsSchema = z.array(appointmentSchema);

export const offerSchema = z.object({
  id: z.string(), openingId: z.string(), patientId: z.string(), patientName: z.string(), expiresAt: z.string(),
  status: z.enum(['sent', 'declined', 'filled', 'withdrawn', 'expired']),
});
export const openingSchema = z.object({
  id: z.string(), kind: z.enum(['cancellation', 'no-show', 'gap']), status: z.enum(['open', 'offered', 'filled', 'closed']),
  treatment: z.string(), startsAt: z.string(), durationMin: z.number(), providerName: z.string(),
  patientName: z.string().nullable(), filledByName: z.string().nullable(),
  // present ONLY for owners; the server removes them for everyone else
  valueCents: z.number().nullable().optional(), estValueCents: z.number().optional(),
  offers: z.array(offerSchema),
});
export const openingsSchema = z.array(openingSchema);

export const patientSchema = z.object({
  id: z.string(), name: z.string(), phone: z.string().nullable(), email: z.string().nullable(),
  smsConsent: z.boolean(), smsConsentAt: z.string().nullable(), optedOutAt: z.string().nullable(),
  newPatient: z.boolean(), walkIn: z.boolean(), notes: z.string().nullable(),
  lastVisit: z.string().nullable(), recentVisit: z.string().nullable(), status: z.enum(['Active', 'Waitlist', 'Recovered']),
});
export const patientsSchema = z.array(patientSchema);
export const patientSummarySchema = z.object({ total: z.number(), consented: z.number(), recovered: z.number() });

export const waitlistSchema = z.array(z.object({
  id: z.string(), patientName: z.string(), treatments: z.array(z.string()), urgency: z.enum(['high', 'normal', 'low']),
  addedAt: z.string(), smsConsent: z.boolean(), preferredProvider: z.string().nullable(),
}));

export const conversationsSchema = z.array(z.object({
  patientId: z.string(), name: z.string(), phone: z.string().nullable(), optedOut: z.boolean(),
  preview: z.string(), lastDirection: z.enum(['out', 'in']), at: z.string(), unread: z.number(),
}));
export const messagesSchema = z.array(z.object({
  id: z.string(), direction: z.enum(['out', 'in']), body: z.string(), status: z.enum(['queued', 'sent', 'failed', 'received']), at: z.string(),
}));

const weekRate = z.object({ weekStart: z.string(), openings: z.number(), filled: z.number(), ratePercent: z.number() });
export const recoveryRateSchema = z.object({
  period: z.object({ days: z.number(), openings: z.number(), filled: z.number(), ratePercent: z.number() }),
  weeks: z.array(weekRate),
});
export const revenueSchema = z.object({
  period: z.object({ days: z.number(), revenueCents: z.number(), seatsRecovered: z.number() }),
  atStakeCents: z.number(),
  weeks: z.array(z.object({ weekStart: z.string(), revenueCents: z.number(), seatsRecovered: z.number() })),
});

export const auditSchema = z.array(z.object({ seq: z.coerce.number(), at: z.string(), actorRole: z.string(), action: z.string(), details: z.record(z.string(), z.unknown()) }));
export const auditVerifySchema = z.object({ intact: z.boolean(), firstBrokenSeq: z.number().nullable() });

export const sendOffersSchema = z.object({ openingId: z.string(), offered: z.number() });
export const replySchema = z.object({ outcome: z.string() });
export const statusChangeSchema = z.object({ appointmentId: z.string(), status: appointmentStatus, openingId: z.string().nullable() });
export const bookingResultSchema = z.object({ appointmentId: z.string(), patientId: z.string(), providerName: z.string(), reference: z.string() });
export const okSchema = z.object({ ok: z.boolean() });
export const idSchema = z.object({ patientId: z.string().optional(), appointmentId: z.string().optional() });

export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
