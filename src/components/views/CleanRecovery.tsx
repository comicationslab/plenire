import React, { useState } from 'react';
import { ApiError } from '../../api/client';
import { fmtTime } from '../../api/format';
import { useOpenings, useRecoveryRate, useRevenue, useSendOffers, useSimulateReply } from '../../api/hooks';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { usdCents } from '../../lib/format';
import { MetricCard } from '../ui/Metric';
import { QueryBoundary } from '../ui/QueryBoundary';

const KIND_LABEL = { 'no-show': 'No-show', cancellation: 'Cancellation', gap: 'Gap' } as const;
const OUTCOME_TEXT: Record<string, string> = {
  booked: 'booked the slot', opted_out: 'opted out (STOP)', opted_in: 'opted back in', help: 'asked for help',
  declined: 'passed on the offer', offer_unavailable: 'replied too late: the slot is gone', needs_staff: 'replied; needs a person to answer',
};

export const CleanRecovery: React.FC = () => {
  const { maskName, maskTreatment } = useHIPAA();
  const { practice, canSeeRevenue } = usePractice();
  const tz = practice.timezone;

  const openings = useOpenings();
  const rate = useRecoveryRate();
  const revenue = useRevenue(canSeeRevenue);
  const sendOffers = useSendOffers();
  const reply = useSimulateReply();

  const [replies, setReplies] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Record<string, string>>({}); // message per opening
  const say = (openingId: string, msg: string) => setNotice((p) => ({ ...p, [openingId]: msg }));
  const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

  const list = openings.data ?? [];
  const recoveredToday = list.filter((o) => o.filledByName).length;
  const timeOf = (iso: string) => fmtTime(iso, tz);

  const handleSendOffers = (openingId: string) =>
    sendOffers.mutate(openingId, {
      onSuccess: (r) => say(openingId, r.offered ? `Offers sent to ${r.offered} patient${r.offered > 1 ? 's' : ''}.` : 'No eligible patients on the waitlist right now.'),
      onError: (e) => say(openingId, errText(e)),
    });

  const handleReply = (openingId: string, offerId: string, patientId: string, patientName: string) => {
    const body = (replies[offerId] ?? '').trim();
    if (!body) return;
    reply.mutate({ patientId, body }, {
      onSuccess: (r) => { say(openingId, `${maskName(patientName)} ${OUTCOME_TEXT[r.outcome] ?? r.outcome}.`); setReplies((p) => ({ ...p, [offerId]: '' })); },
      onError: (e) => say(openingId, errText(e)),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] tracking-widest uppercase text-[#a3533a] font-bold">Recovery</div>
        <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">Keep every chair working</h2>
        <p className="text-[13px] text-[#1e2a28]/70 mt-1.5 max-w-lg leading-relaxed">
          The engine ranks your waitlist by treatment fit, provider, and urgency. First YES wins.
        </p>
      </div>

      <QueryBoundary queries={[openings, rate, ...(canSeeRevenue ? [revenue] : [])]}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard label="Patients recovered today" value={recoveredToday} sub="Patients who claimed an opening" />
          <MetricCard label="Seats recovered · 28 days" value={rate.data?.period.filled ?? 0} sub="Open appointments filled" accent />
          {canSeeRevenue ? (
            <MetricCard label="Est. revenue recovered · 28 days" value={usdCents(revenue.data?.period.revenueCents ?? 0)} sub="From your own fee schedule" accent />
          ) : (
            <MetricCard label="Recovery rate · 28 days" value={`${rate.data?.period.ratePercent ?? 0}%`} sub={`${rate.data?.period.filled ?? 0} of ${rate.data?.period.openings ?? 0} openings filled`} accent />
          )}
        </div>

        <section className="space-y-3">
          <div className="text-[11px] tracking-widest uppercase text-[#a3533a] font-bold">Openings</div>
          <h3 className="text-[20px] font-medium tracking-tight m-0">Cancellations, gaps &amp; no-shows</h3>

          {list.length === 0 && <p className="text-[13px] text-[#1e2a28]/70">No openings today. Mark a no-show on the Today screen and it appears here.</p>}

          <div className="space-y-3 pt-1">
            {list.map((o) => {
              const isFilled = o.status === 'filled';
              const live = o.offers.filter((x) => x.status === 'sent');
              return (
                <div key={o.id} className="border border-[#1e2a28]/15 bg-white/40">
                  <div className="p-3.5 px-4 flex items-center justify-between border-b border-[#1e2a28]/10 relative pl-6">
                    <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#a3533a]" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1e2a28]/70">{KIND_LABEL[o.kind]}</span>
                        <strong className="text-[13px] font-semibold text-[#1e2a28]">{maskTreatment(o.treatment)}</strong>
                      </div>
                      <div className="text-[11px] text-[#1e2a28]/70 mt-0.5">{timeOf(o.startsAt)} · {o.providerName}</div>
                    </div>
                    <div className="text-right">
                      {o.patientName && <strong className="text-[12.5px] font-semibold block">{maskName(o.patientName)}</strong>}
                      <span className="text-[11px] text-[#1e2a28]/70">
                        {isFilled ? 'Filled' : live.length ? 'Offers out' : canSeeRevenue && o.estValueCents != null ? `Open · ≈ ${usdCents(o.estValueCents)} at stake` : 'Open'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 pt-3 text-xs space-y-3">
                    {isFilled ? (
                      <div className="p-3 bg-[#a3533a]/10 border-l-2 border-[#a3533a] text-xs">
                        <strong>{maskName(o.filledByName ?? 'A patient')}</strong> booked this slot{canSeeRevenue && o.valueCents ? ` · ≈ ${usdCents(o.valueCents)} est. recovered` : ''}
                      </div>
                    ) : (
                      <>
                        {o.offers.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-[11px] font-bold uppercase text-[#1e2a28]/70">Offers</div>
                            {o.offers.map((f) => (
                              <div key={f.id} className="p-2 border border-[#1e2a28]/15 bg-white/50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{maskName(f.patientName)}</span>
                                  <span className="text-[11px] uppercase font-bold text-[#1e2a28]/70">
                                    {f.status}{f.status === 'sent' ? ` · expires ${timeOf(f.expiresAt)}` : ''}
                                  </span>
                                </div>
                                {import.meta.env.DEV && f.status === 'sent' && (
                                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleReply(o.id, f.id, f.patientId, f.patientName); }}>
                                    <input
                                      type="text" placeholder="Test reply: YES, NO, STOP…" aria-label={`Test reply from ${maskName(f.patientName)}`}
                                      value={replies[f.id] ?? ''} onChange={(e) => setReplies((p) => ({ ...p, [f.id]: e.target.value }))}
                                      className="flex-1 p-1 bg-transparent border border-[#1e2a28]/20 text-xs"
                                    />
                                    <button type="submit" disabled={reply.isPending} className="px-3 py-1 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Send reply</button>
                                  </form>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!live.length && (
                          <button
                            onClick={() => handleSendOffers(o.id)} disabled={sendOffers.isPending}
                            className="px-3 py-1.5 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 disabled:opacity-60"
                          >
                            Send offers to top waitlist matches
                          </button>
                        )}
                      </>
                    )}
                    {notice[o.id] && <div role="status" className="text-[12px] font-semibold text-[#1e2a28]">{notice[o.id]}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[11px] tracking-widest uppercase text-[#a3533a] font-bold">Activity</div>
          <h3 className="text-[20px] font-medium tracking-tight m-0">Today so far</h3>
          <div className="border border-[#1e2a28]/15 divide-y divide-[#1e2a28]/10 bg-white/40 text-xs">
            {list.length === 0 && <div className="p-2.5 px-4 text-[12px] text-[#1e2a28]/70">Nothing yet.</div>}
            {list.map((o) => (
              <div key={o.id} className="p-2.5 px-4 flex gap-4 text-[12px]">
                <span className="text-[#1e2a28]/70 w-20 tabular-nums">{timeOf(o.startsAt)}</span>
                <span>
                  {KIND_LABEL[o.kind]}{o.patientName ? `: ${maskName(o.patientName)}` : ''}
                  {o.filledByName ? ` → ${maskName(o.filledByName)} booked the slot${canSeeRevenue && o.valueCents ? ` · ≈ ${usdCents(o.valueCents)} recovered` : ''}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      </QueryBoundary>
    </div>
  );
};
