import React from 'react';
import { useNavigate } from 'react-router';
import { useOpenings, useRecoveryRate, useRevenue } from '../../api/hooks';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { usdCents, weekLabel } from '../../lib/format';
import { BarChart, MetricCard, PageHead, Panel } from '../ui/Metric';
import { QueryBoundary } from '../ui/QueryBoundary';

/** Owner dashboard: the money view. Shows Estimated revenue recovered. */
export const DashboardOwner: React.FC = () => {
  const { maskName, maskTreatment } = useHIPAA();
  const { practice } = usePractice();
  const nav = useNavigate();
  const revenue = useRevenue(true);
  const rate = useRecoveryRate();
  const openings = useOpenings();
  const list = openings.data ?? [];
  const unfilled = list.filter((o) => o.status === 'open' || o.status === 'offered').length;
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: practice.timezone });

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Owner" title="What Plenire is earning you" blurb="Estimated revenue from chairs that would have sat empty." />
      <QueryBoundary queries={[revenue, rate, openings]}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Est. revenue recovered · 28 days" value={usdCents(revenue.data?.period.revenueCents ?? 0)} sub="From your own fee schedule" accent />
          <MetricCard label="Still at stake today" value={usdCents(revenue.data?.atStakeCents ?? 0)} sub={`${unfilled} unfilled opening${unfilled === 1 ? '' : 's'}`} />
          <MetricCard label="Seats recovered · 28 days" value={revenue.data?.period.seatsRecovered ?? 0} sub="Open appointments filled" />
          <MetricCard label="Recovery rate · 28 days" value={`${rate.data?.period.ratePercent ?? 0}%`} sub={`${rate.data?.period.filled ?? 0} of ${rate.data?.period.openings ?? 0} openings`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Estimated revenue recovered by week" note="Last 28 days">
            <BarChart
              ariaLabel="Estimated revenue recovered by week"
              bars={(revenue.data?.weeks ?? []).map((w) => ({ label: weekLabel(w.weekStart), value: w.revenueCents, display: usdCents(w.revenueCents), detail: `${w.seatsRecovered} seats filled` }))}
            />
          </Panel>

          <Panel title="Today's openings" note="Fee value">
            {list.length === 0 ? (
              <p className="text-[13px] text-[#1e2a28]/70 m-0">No openings today.</p>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10">
                {list.map((o) => (
                  <li key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{time(o.startsAt)} · {maskTreatment(o.treatment)}</div>
                      <div className="text-[12px] text-[#1e2a28]/70 truncate">{o.kind} · {o.providerName} · {o.filledByName ? `Filled by ${maskName(o.filledByName)}` : 'Open'}</div>
                    </div>
                    <div className={`text-[13px] font-semibold tabular-nums shrink-0 ${o.filledByName ? 'text-[#a3533a]' : ''}`}>
                      {usdCents((o.filledByName ? o.valueCents : o.estValueCents) ?? o.estValueCents ?? 0)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => nav('/recovery')} className="mt-3 text-xs font-semibold underline text-[#a3533a]">Go to Recovery</button>
          </Panel>
        </div>
        <p className="text-[12px] text-[#1e2a28]/70 m-0">Revenue is an estimate based on the fee schedule saved for your practice.</p>
      </QueryBoundary>
    </div>
  );
};
