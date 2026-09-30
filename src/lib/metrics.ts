import { RecoveryOpening } from '../types/hipaa';
import { pct } from './format';

/**
 * Estimated fee per treatment keyword. Sample fees for the demo; in production
 * this comes from each practice's own fee schedule (practice settings / PMS import).
 */
const FEES: Record<string, number> = {
  srp: 285, crown: 1150, prophy: 120, clean: 120, recall: 120, core: 420, exam: 95,
};
const DEFAULT_FEE = 180;

export const estValue = (treatment = ''): number => {
  const key = Object.keys(FEES).find((k) => treatment.toLowerCase().includes(k));
  return key ? FEES[key] : DEFAULT_FEE;
};

/** Sample history for earlier this month (demo only, until real data is connected). */
export const MONTH_HISTORY = [
  { label: 'Wk 1', openings: 13, filled: 8, revenue: 2100 },
  { label: 'Wk 2', openings: 14, filled: 9, revenue: 2350 },
  { label: 'Wk 3', openings: 13, filled: 9, revenue: 2600 },
  { label: 'Wk 4', openings: 12, filled: 8, revenue: 2550 },
];

export interface PeriodStat {
  label: string;
  openings: number;
  filled: number;
  revenue: number;
  rate: number;
}

export interface RecoverySummary {
  monthOpenings: number;
  monthFilled: number;
  /** Recovery rate = openings filled / openings that came up (no-shows, cancellations, gaps). */
  monthRate: number;
  monthRevenue: number;
  todayOpenings: number;
  todayFilled: number;
  todayUnfilled: number;
  /** Fee value of today's openings that are still empty. */
  atStakeToday: number;
  periods: PeriodStat[];
}

export function recoverySummary(openings: RecoveryOpening[]): RecoverySummary {
  const filledNow = openings.filter((o) => o.filledBy);
  const unfilledNow = openings.filter((o) => !o.filledBy);
  const revenueToday = filledNow.reduce((sum, o) => sum + (o.value ?? estValue(o.detail)), 0);

  const histOpenings = MONTH_HISTORY.reduce((s, w) => s + w.openings, 0);
  const histFilled = MONTH_HISTORY.reduce((s, w) => s + w.filled, 0);
  const histRevenue = MONTH_HISTORY.reduce((s, w) => s + w.revenue, 0);

  const monthOpenings = histOpenings + openings.length;
  const monthFilled = histFilled + filledNow.length;

  const periods: PeriodStat[] = [
    ...MONTH_HISTORY.map((w) => ({ ...w, rate: pct(w.filled, w.openings) })),
    {
      label: 'Today',
      openings: openings.length,
      filled: filledNow.length,
      revenue: revenueToday,
      rate: pct(filledNow.length, openings.length),
    },
  ];

  return {
    monthOpenings,
    monthFilled,
    monthRate: pct(monthFilled, monthOpenings),
    monthRevenue: histRevenue + revenueToday,
    todayOpenings: openings.length,
    todayFilled: filledNow.length,
    todayUnfilled: unfilledNow.length,
    atStakeToday: unfilledNow.reduce((sum, o) => sum + estValue(o.detail), 0),
    periods,
  };
}
