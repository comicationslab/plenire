import type { Queryable } from '../db/adapter';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

interface Week { week_start: string; openings: number; filled: number; value_cents: number }

async function monthWeeks(q: Queryable, practiceId: string): Promise<Week[]> {
  return q.query<Week>(
    `SELECT to_char(date_trunc('week', o.starts_at AT TIME ZONE p.timezone), 'YYYY-MM-DD') AS week_start,
            count(*)::int AS openings,
            (count(*) FILTER (WHERE o.status = 'filled'))::int AS filled,
            COALESCE(sum(o.value_cents) FILTER (WHERE o.status = 'filled'), 0)::int AS value_cents
       FROM openings o JOIN practices p ON p.id = o.practice_id
      WHERE o.practice_id = $1
        AND (o.starts_at AT TIME ZONE p.timezone)::date >  (now() AT TIME ZONE p.timezone)::date - 28
        AND (o.starts_at AT TIME ZONE p.timezone)::date <= (now() AT TIME ZONE p.timezone)::date
      GROUP BY 1 ORDER BY 1`,
    [practiceId],
  );
}

/** Last 28 days. Recovery rate = openings filled / openings that came up. No dollar amounts: safe for the front desk. */
export async function recoveryRate(q: Queryable, practiceId: string) {
  const weeks = await monthWeeks(q, practiceId);
  const openings = weeks.reduce((s, w) => s + w.openings, 0);
  const filled = weeks.reduce((s, w) => s + w.filled, 0);
  return {
    period: { days: 28, openings, filled, ratePercent: pct(filled, openings) },
    weeks: weeks.map((w) => ({ weekStart: w.week_start, openings: w.openings, filled: w.filled, ratePercent: pct(w.filled, w.openings) })),
  };
}

/** Estimated revenue recovered, from this practice's own fee schedule. Owner-only (enforced in the API layer too). */
export async function revenueRecovered(q: Queryable, practiceId: string) {
  const weeks = await monthWeeks(q, practiceId);
  const [stake] = await q.query<{ cents: number }>(
    `SELECT COALESCE(sum(estimate_fee_cents($1, treatment)), 0)::int AS cents FROM openings WHERE practice_id = $1 AND status IN ('open','offered')`,
    [practiceId],
  );
  return {
    period: { days: 28, revenueCents: weeks.reduce((s, w) => s + w.value_cents, 0), seatsRecovered: weeks.reduce((s, w) => s + w.filled, 0) },
    atStakeCents: stake.cents,
    weeks: weeks.map((w) => ({ weekStart: w.week_start, revenueCents: w.value_cents, seatsRecovered: w.filled })),
  };
}
