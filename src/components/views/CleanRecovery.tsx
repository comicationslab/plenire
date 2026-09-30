import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { Appointment, Conversation, Patient, RecoveryOpening, WaitlistEntry } from '../../types/hipaa';

interface CleanRecoveryProps {
  openings: RecoveryOpening[];
  setOpenings: React.Dispatch<React.SetStateAction<RecoveryOpening[]>>;
  waitlist: WaitlistEntry[];
  setWaitlist: React.Dispatch<React.SetStateAction<WaitlistEntry[]>>;
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  onGoToMessages: () => void;
}

const FEES: Record<string, number> = {
  srp: 285, crown: 1150, prophy: 120, clean: 120, recall: 120, core: 420, exam: 95
};
const estValue = (s = '') => {
  const k = Object.keys(FEES).find((key) => s.toLowerCase().includes(key));
  return k ? FEES[k] : 180;
};
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export const CleanRecovery: React.FC<CleanRecoveryProps> = ({
  openings,
  setOpenings,
  waitlist,
  setWaitlist,
  patients,
  setPatients,
  appointments,
  setAppointments,
  conversations,
  setConversations,
  onGoToMessages,
}) => {
  const { maskName, logAudit } = useHIPAA();

  const [replies, setReplies] = useState<Record<string, string>>({});
  const [engineLogs, setEngineLogs] = useState([
    { t: '11:00 AM', m: 'No-show detected: Liam O\'Brien · 11:00 AM' },
    { t: '10:20 AM', m: 'Tyler Green accepted 10:20 AM crown seat · ≈ $1,150 recovered' },
    { t: '09:00 AM', m: 'Marcus Bell accepted 9:00 AM prophy · ≈ $120 recovered' },
  ]);

  const addLog = (m: string) => {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setEngineLogs((prev) => [{ t, m }, ...prev.slice(0, 10)]);
  };

  const deliverConvo = (name: string, from: 'practice' | 'patient', text: string, status?: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setConversations((prev) => {
      let existing = prev.find((c) => c.patient === name);
      if (!existing) {
        existing = {
          id: name.toLowerCase().replace(/\W+/g, '-'),
          patient: name,
          initials: name[0],
          phone: '(763) 555-0100',
          status: status || 'Offer sent',
          time,
          unread: from === 'patient',
          lastFrom: from,
          preview: text,
          messages: [{ from, time, text }],
        };
        return [existing, ...prev];
      }
      return prev.map((c) =>
        c.patient === name
          ? {
              ...c,
              time,
              unread: from === 'patient',
              lastFrom: from,
              preview: text,
              status: status || c.status,
              messages: [...c.messages, { from, time, text }],
            }
          : c
      );
    });
  };

  const handleSendOffers = (openingId: string) => {
    setOpenings((prev) =>
      prev.map((op) => {
        if (op.id !== openingId) return op;
        const candidates = waitlist.filter((w) => !w.stopped).slice(0, 3);
        if (!candidates.length) return op;

        const newOffers = candidates.map((c) => {
          const safeText = `Hi ${c.name.split(' ')[0]}, this is Lakeside Dental — an opening just came up today at ${op.time}. Reply YES to book or NO to pass. Reply STOP to opt out.`;
          deliverConvo(c.name, 'practice', safeText, 'Offer sent');
          logAudit('DISPATCH_OFFER', `Dispatched HIPAA-sanitized offer to ${c.name} for ${op.time}`);
          addLog(`Offer sent to ${c.name} via SMS for ${op.time} · ${op.doctor}`);

          return {
            name: c.name,
            score: 75,
            status: 'sent' as const,
            expiresAt: Date.now() + 15 * 60000,
            ch: 'SMS' as const,
          };
        });

        return { ...op, offers: [...op.offers, ...newOffers] };
      })
    );
  };

  const handleReply = (openingId: string, offerIndex: number) => {
    const opening = openings.find((o) => o.id === openingId);
    if (!opening) return;
    const offer = opening.offers[offerIndex];
    if (!offer) return;

    const input = (replies[`${openingId}-${offerIndex}`] || 'YES').trim();
    deliverConvo(offer.name, 'patient', input);

    if (/^(yes|y|sure|book|ok)\b/i.test(input)) {
      if (opening.filledBy) {
        deliverConvo(offer.name, 'practice', 'Sorry, that opening was just claimed!');
      } else {
        const val = estValue(opening.detail);
        setOpenings((prev) =>
          prev.map((op) => {
            if (op.id !== openingId) return op;
            return {
              ...op,
              filledBy: offer.name,
              value: val,
              offers: op.offers.map((o) =>
                o.name === offer.name ? { ...o, status: 'filled' as const } : { ...o, status: 'withdrawn' as const }
              ),
            };
          })
        );

        deliverConvo(
          offer.name,
          'practice',
          `You're booked for today at ${opening.time} at Lakeside Dental. See you then!`,
          'Confirmed'
        );

        setWaitlist((prev) => prev.filter((w) => w.name !== offer.name));
        addLog(`${offer.name} accepted ${opening.time} — booked · ≈ ${usd(val)} est. recovered`);
        logAudit('SLOT_FILLED', `Opening at ${opening.time} filled by ${offer.name}`);
      }
    } else if (/^(no|pass)\b/i.test(input)) {
      setOpenings((prev) =>
        prev.map((op) => {
          if (op.id !== openingId) return op;
          const updated = [...op.offers];
          updated[offerIndex] = { ...offer, status: 'declined' as const };
          return { ...op, offers: updated };
        })
      );
      deliverConvo(offer.name, 'practice', 'No problem — you remain on our waitlist.');
      addLog(`${offer.name} declined ${opening.time}`);
    } else if (/^(stop)\b/i.test(input)) {
      setWaitlist((prev) => prev.map((w) => (w.name === offer.name ? { ...w, stopped: true } : w)));
      setPatients((prev) => prev.map((p) => (p.name === offer.name ? { ...p, smsConsent: false } : p)));
      deliverConvo(offer.name, 'practice', 'You have unsubscribed from texts. Reply START to resume.', 'Opted out');
      addLog(`${offer.name} replied STOP — logged TCPA opt out`);
      logAudit('TCPA_STOP', `Patient ${offer.name} opted out via STOP`);
    }

    setReplies((prev) => ({ ...prev, [`${openingId}-${offerIndex}`]: '' }));
  };

  const recoveredList = openings.filter((o) => o.filledBy);

  return (
    <div className="space-y-7">
      {/* Head */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
        <div>
          <div className="text-[10px] tracking-widest uppercase text-[#a3533a] font-bold">Recovery</div>
          <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">
            Keep every chair working
          </h2>
          <p className="text-[13px] text-[#1e2a28]/60 mt-1.5 max-w-lg leading-relaxed">
            The engine ranks your waitlist by treatment fit, provider, and urgency. First YES wins.
          </p>
        </div>
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[10px] text-[#1e2a28]/55 font-semibold uppercase tracking-wider">
            Patients recovered today
          </div>
          <div className="text-[29px] font-medium text-[#1e2a28] mt-2 tracking-tight">
            {recoveredList.length + 3}
          </div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Patients who claimed an opening</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[10px] text-[#1e2a28]/55 font-semibold uppercase tracking-wider">
            Seats recovered · month
          </div>
          <div className="text-[29px] font-medium text-[#a3533a] mt-2 tracking-tight">
            34
          </div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Open appointments filled</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[10px] text-[#1e2a28]/55 font-semibold uppercase tracking-wider">
            Est. revenue recovered · month
          </div>
          <div className="text-[29px] font-medium text-[#a3533a] mt-2 tracking-tight">
            $9,600
          </div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Estimated from fee schedule</div>
        </div>
      </div>

      {/* Openings */}
      <section className="space-y-3">
        <div className="text-[10px] tracking-widest uppercase text-[#a3533a] font-bold">Openings</div>
        <h3 className="text-[20px] font-medium tracking-tight m-0">Cancellations, gaps &amp; no-shows</h3>

        <div className="space-y-3 pt-1">
          {openings.map((r) => {
            const isFilled = Boolean(r.filledBy);
            const live = r.offers.filter((o) => o.status === 'sent');

            return (
              <div key={r.id} className="border border-[#1e2a28]/15 bg-white/40">
                <div className="p-3.5 px-4 flex items-center justify-between border-b border-[#1e2a28]/10 relative pl-6">
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#a3533a]" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#1e2a28]/55">
                        {r.type}
                      </span>
                      <strong className="text-[13px] font-semibold text-[#1e2a28]">{r.detail}</strong>
                    </div>
                    <div className="text-[11px] text-[#1e2a28]/55 mt-0.5">{r.time} · {r.doctor}</div>
                  </div>
                  <div className="text-right">
                    <strong className="text-[12.5px] font-semibold block">{maskName(r.patient)}</strong>
                    <span className="text-[11px] text-[#1e2a28]/55">
                      {isFilled ? 'Filled' : live.length ? 'Offers out' : `Open · ≈ ${usd(estValue(r.detail))} at stake`}
                    </span>
                  </div>
                </div>

                <div className="p-4 pt-3 text-xs space-y-3">
                  {isFilled ? (
                    <div className="p-3 bg-[#a3533a]/10 border-l-2 border-[#a3533a] text-xs">
                      <strong>{maskName(r.filledBy!)}</strong> booked this slot · ≈ {usd(r.value || 0)} est. recovered
                    </div>
                  ) : (
                    <>
                      {r.offers.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-bold uppercase text-[#1e2a28]/55">Offers</div>
                          {r.offers.map((o, idx) => (
                            <div key={idx} className="p-2 border border-[#1e2a28]/15 bg-white/50 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{maskName(o.name)}</span>
                                <span className="text-[9px] uppercase font-bold text-[#1e2a28]/60">{o.status}</span>
                              </div>
                              {o.status === 'sent' && (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder={`Reply: YES, NO, STOP…`}
                                    value={replies[`${r.id}-${idx}`] || ''}
                                    onChange={(e) =>
                                      setReplies((p) => ({ ...p, [`${r.id}-${idx}`]: e.target.value }))
                                    }
                                    className="flex-1 p-1 bg-transparent border border-[#1e2a28]/20 text-xs"
                                  />
                                  <button
                                    onClick={() => handleReply(r.id, idx)}
                                    className="px-3 py-1 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                                  >
                                    Send reply
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {!live.length && (
                        <button
                          onClick={() => handleSendOffers(r.id)}
                          className="px-3 py-1.5 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90"
                        >
                          Send offers to top waitlist matches
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Engine log */}
      <section className="space-y-2">
        <div className="text-[10px] tracking-widest uppercase text-[#a3533a] font-bold">Activity</div>
        <h3 className="text-[20px] font-medium tracking-tight m-0">Engine log</h3>
        <div className="border border-[#1e2a28]/15 divide-y divide-[#1e2a28]/10 bg-white/40 text-xs">
          {engineLogs.map((l, i) => (
            <div key={i} className="p-2.5 px-4 flex gap-4 font-mono text-[11.5px]">
              <span className="text-[#1e2a28]/50 w-16">{l.t}</span>
              <span className="text-[#1e2a28] font-sans">{l.m}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
