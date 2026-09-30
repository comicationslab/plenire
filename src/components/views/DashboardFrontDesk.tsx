import React from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { Appointment, Conversation, RecoveryOpening } from '../../types/hipaa';
import { recoverySummary } from '../../lib/metrics';
import { BarChart, MetricCard, PageHead, Panel } from '../ui/Metric';

interface Props {
  openings: RecoveryOpening[];
  conversations: Conversation[];
  appointments: Appointment[];
  onNavigate: (view: string) => void;
}

/** Front desk dashboard: what needs doing right now, and how well we are filling the schedule. Shows Recovery rate (no dollar figures). */
export const DashboardFrontDesk: React.FC<Props> = ({ openings, conversations, appointments, onNavigate }) => {
  const { maskName, maskTreatment } = useHIPAA();
  const s = recoverySummary(openings);

  const unfilled = openings.filter((o) => !o.filledBy);
  const waitingOnReply = openings.reduce((n, o) => n + o.offers.filter((x) => x.status === 'sent').length, 0);
  const unread = conversations.filter((c) => c.unread);
  const noShows = appointments.filter((a) => a.status === 'noshow').length;

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Front desk" title="Your day at a glance" blurb="Fill every empty chair. Here is what needs you right now." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Recovery rate · month"
          value={`${s.monthRate}%`}
          sub={`${s.monthFilled} of ${s.monthOpenings} openings filled`}
          accent
        />
        <MetricCard label="Openings to fill" value={s.todayUnfilled} sub={noShows ? `${noShows} no-show${noShows > 1 ? 's' : ''} today` : 'Cancellations & gaps'} />
        <MetricCard label="Offers awaiting reply" value={waitingOnReply} sub="Patients we texted" />
        <MetricCard label="Unread messages" value={unread.length} sub="Patient replies" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Needs attention" note="Start here">
          {unfilled.length === 0 && unread.length === 0 ? (
            <p className="text-[13px] text-[#1e2a28]/70 m-0">All caught up. Every opening is filled and every message is answered.</p>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10">
              {unfilled.map((o) => (
                <li key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{o.time} · {maskTreatment(o.detail)}</div>
                    <div className="text-[12px] text-[#1e2a28]/70 truncate">{o.type} · {o.doctor} · {maskName(o.patient)}</div>
                  </div>
                  <button onClick={() => onNavigate('recovery')} className="shrink-0 px-3 py-1.5 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold">
                    Fill it
                  </button>
                </li>
              ))}
              {unread.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{maskName(c.patient)} replied</div>
                    <div className="text-[12px] text-[#1e2a28]/70 truncate">{c.preview}</div>
                  </div>
                  <button onClick={() => onNavigate('messages')} className="shrink-0 px-3 py-1.5 border border-[#1e2a28]/30 text-xs font-semibold">
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recovery rate by week" note="Sample history · today is live">
          <BarChart
            ariaLabel="Recovery rate by week"
            bars={s.periods.map((p) => ({
              label: p.label,
              value: p.rate,
              display: `${p.rate}%`,
              detail: `${p.filled} of ${p.openings} openings filled`,
            }))}
          />
          <p className="text-[12px] text-[#1e2a28]/70 mt-3 mb-0">
            Recovery rate = openings filled ÷ openings that came up (no-shows, cancellations, gaps).
          </p>
        </Panel>
      </div>
    </div>
  );
};
