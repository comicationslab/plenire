import React from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { RecoveryOpening } from '../../types/hipaa';
import { estValue, recoverySummary } from '../../lib/metrics';
import { usd } from '../../lib/format';
import { BarChart, MetricCard, PageHead, Panel } from '../ui/Metric';

interface Props {
  openings: RecoveryOpening[];
  onNavigate: (view: string) => void;
}

/** Owner dashboard: the money view. Shows Estimated revenue recovered. */
export const DashboardOwner: React.FC<Props> = ({ openings, onNavigate }) => {
  const { maskName, maskTreatment } = useHIPAA();
  const s = recoverySummary(openings);

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Owner" title="What Plenire is earning you" blurb="Estimated revenue from chairs that would have sat empty." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Est. revenue recovered · month" value={usd(s.monthRevenue)} sub="Estimated from your fee schedule" accent />
        <MetricCard label="Still at stake today" value={usd(s.atStakeToday)} sub={`${s.todayUnfilled} unfilled opening${s.todayUnfilled === 1 ? '' : 's'}`} />
        <MetricCard label="Seats recovered · month" value={s.monthFilled} sub="Open appointments filled" />
        <MetricCard label="Recovery rate · month" value={`${s.monthRate}%`} sub={`${s.monthFilled} of ${s.monthOpenings} openings`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Estimated revenue recovered by week" note="Sample history · today is live">
          <BarChart
            ariaLabel="Estimated revenue recovered by week"
            bars={s.periods.map((p) => ({ label: p.label, value: p.revenue, display: usd(p.revenue), detail: `${p.filled} seats filled` }))}
          />
        </Panel>

        <Panel title="Today's openings" note="Fee value">
          <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10">
            {openings.map((o) => (
              <li key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{o.time} · {maskTreatment(o.detail)}</div>
                  <div className="text-[12px] text-[#1e2a28]/70 truncate">
                    {o.type} · {o.doctor} · {o.filledBy ? `Filled by ${maskName(o.filledBy)}` : 'Open'}
                  </div>
                </div>
                <div className={`text-[13px] font-semibold tabular-nums shrink-0 ${o.filledBy ? 'text-[#a3533a]' : ''}`}>
                  {usd(o.filledBy ? (o.value ?? estValue(o.detail)) : estValue(o.detail))}
                </div>
              </li>
            ))}
          </ul>
          <button onClick={() => onNavigate('recovery')} className="mt-3 text-xs font-semibold underline text-[#a3533a]">
            Go to Recovery
          </button>
        </Panel>
      </div>

      <p className="text-[12px] text-[#1e2a28]/70 m-0">
        Revenue is an estimate based on sample fees. Figures from before today are sample data until Plenire is connected to your schedule.
      </p>
    </div>
  );
};
