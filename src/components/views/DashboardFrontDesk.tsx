import React from 'react';
import { useNavigate } from 'react-router';
import { useAppointments, useConversations, useOpenings, useRecoveryRate } from '../../api/hooks';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { weekLabel } from '../../lib/format';
import { BarChart, MetricCard, PageHead, Panel } from '../ui/Metric';
import { QueryBoundary } from '../ui/QueryBoundary';

/** Front desk dashboard: what needs doing right now, and how well we are filling the schedule. Shows Recovery rate (no dollar figures). */
export const DashboardFrontDesk: React.FC = () => {
  const { maskName, maskTreatment } = useHIPAA();
  const { practice } = usePractice();
  const nav = useNavigate();
  const rate = useRecoveryRate();
  const openings = useOpenings();
  const convs = useConversations();
  const appts = useAppointments();

  const r = rate.data;
  const unfilled = (openings.data ?? []).filter((o) => o.status === 'open' || o.status === 'offered');
  const waitingOnReply = (openings.data ?? []).reduce((n, o) => n + o.offers.filter((x) => x.status === 'sent').length, 0);
  const unread = (convs.data ?? []).filter((c) => c.unread > 0);
  const noShows = (appts.data ?? []).filter((a) => a.status === 'noshow').length;
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: practice.timezone });

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Front desk" title="Your day at a glance" blurb="Fill every empty chair. Here is what needs you right now." />
      <QueryBoundary queries={[rate, openings, convs, appts]}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Recovery rate · 28 days" value={`${r?.period.ratePercent ?? 0}%`} sub={`${r?.period.filled ?? 0} of ${r?.period.openings ?? 0} openings filled`} accent />
          <MetricCard label="Openings to fill" value={unfilled.length} sub={noShows ? `${noShows} no-show${noShows > 1 ? 's' : ''} today` : 'Cancellations & gaps'} />
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
                      <div className="text-[13px] font-semibold truncate">{time(o.startsAt)} · {maskTreatment(o.treatment)}</div>
                      <div className="text-[12px] text-[#1e2a28]/70 truncate">{o.kind} · {o.providerName}{o.patientName ? ` · ${maskName(o.patientName)}` : ''}</div>
                    </div>
                    <button onClick={() => nav('/recovery')} className="shrink-0 px-3 py-1.5 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold">Fill it</button>
                  </li>
                ))}
                {unread.map((c) => (
                  <li key={c.patientId} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{maskName(c.name)} replied</div>
                      <div className="text-[12px] text-[#1e2a28]/70 truncate">{c.preview}</div>
                    </div>
                    <button onClick={() => nav('/messages')} className="shrink-0 px-3 py-1.5 border border-[#1e2a28]/30 text-xs font-semibold">Open</button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recovery rate by week" note="Last 28 days">
            <BarChart
              ariaLabel="Recovery rate by week"
              bars={(r?.weeks ?? []).map((w) => ({ label: weekLabel(w.weekStart), value: w.ratePercent, display: `${w.ratePercent}%`, detail: `${w.filled} of ${w.openings} openings filled` }))}
            />
            <p className="text-[12px] text-[#1e2a28]/70 mt-3 mb-0">Recovery rate = openings filled ÷ openings that came up (no-shows, cancellations, gaps).</p>
          </Panel>
        </div>
      </QueryBoundary>
    </div>
  );
};
