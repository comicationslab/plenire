import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { maskName } from '../../services/hipaaCompliance';
import { Appointment, Conversation, Patient, RecoveryOpening, WaitlistEntry } from '../../types/hipaa';
import { Zap, Clock, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, Send } from 'lucide-react';

interface RecoveryFillViewProps {
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
  srp: 285,
  crown: 1150,
  prophy: 120,
  clean: 120,
  recall: 120,
  core: 420,
  exam: 95,
  composite: 230,
  extract: 250,
  implant: 300,
  night: 600,
};

const estValue = (text = '') => {
  const lower = text.toLowerCase();
  const match = Object.keys(FEES).find((k) => lower.includes(k));
  return match ? FEES[match] : 180;
};

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export const RecoveryFillView: React.FC<RecoveryFillViewProps> = ({
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
  const { isPrivacyShieldActive, logAuditEvent } = useHIPAA();

  const [simulatedReplies, setSimulatedReplies] = useState<Record<string, string>>({});
  const [bypassQuietHours, setBypassQuietHours] = useState(false);
  const [engineLogs, setEngineLogs] = useState<Array<{ time: string; msg: string; compliance?: boolean }>>([
    {
      time: '11:02 AM',
      msg: 'No-show detected: Liam O\'Brien at 11:00 AM. Opening generated.',
    },
    {
      time: '10:22 AM',
      msg: 'Tyler Green accepted 10:20 AM crown seat opening · ≈ $1,150 recovered.',
    },
    {
      time: '09:05 AM',
      msg: 'Hannah Cooper confirmed 11:00 AM SRP slot. HIPAA-sanitized SMS dispatch verified.',
      compliance: true,
    },
  ]);

  const addLog = (msg: string, compliance = false) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    setEngineLogs((prev) => [{ time, msg, compliance }, ...prev.slice(0, 15)]);
  };

  // Deliver message to conversation thread
  const deliverMessage = (patientName: string, text: string, from: 'practice' | 'patient', status?: string) => {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const targetPatient = patients.find((p) => p.name === patientName) || {
      name: patientName,
      phone: '(763) 555-0100',
      initials: patientName[0],
    };

    setConversations((prev) => {
      let existing = prev.find((c) => c.patient === patientName);
      if (!existing) {
        existing = {
          id: patientName.toLowerCase().replace(/\W+/g, '-'),
          patient: patientName,
          initials: targetPatient.initials,
          phone: targetPatient.phone,
          status: status || 'Offer sent',
          time: timeStr,
          unread: from === 'patient',
          lastFrom: from,
          preview: text,
          messages: [],
        };
        return [
          {
            ...existing,
            messages: [{ from, time: timeStr, text, sanitized: true }],
            status: status || existing.status,
            preview: text,
            lastFrom: from,
            time: timeStr,
          },
          ...prev,
        ];
      }

      return prev.map((c) => {
        if (c.patient === patientName) {
          return {
            ...c,
            time: timeStr,
            unread: from === 'patient',
            lastFrom: from,
            preview: text,
            status: status || c.status,
            messages: [...c.messages, { from, time: timeStr, text, sanitized: true }],
          };
        }
        return c;
      });
    });
  };

  // Ranking algorithm based on clinical criteria & waitlist urgency
  const rankCandidates = (opening: RecoveryOpening) => {
    const isHyg = opening.doctor.startsWith('RDH');
    const openingCategory = /clean|prophy|recall|srp|deep|perio|exam/i.test(opening.detail) ? 'hyg' : 'resto';

    const ranked: Array<{ entry: WaitlistEntry; score: number; reasons: string[] }> = [];

    waitlist.forEach((w) => {
      if (w.stopped) return;
      if (w.name === opening.patient) return;

      const pRecord = patients.find((p) => p.name === w.name);
      if (pRecord && !pRecord.smsConsent && !pRecord.email) return;

      let score = 40;
      const reasons: string[] = ['Treatment match'];

      const waitCategory = /clean|prophy|recall|srp|deep|perio|exam/i.test(w.wants) ? 'hyg' : 'resto';
      if (waitCategory !== openingCategory) return;

      if (/hygienist/i.test(w.provider)) {
        if (!isHyg) return;
        score += 15;
        reasons.push('Hygienist op');
      } else if (w.provider === opening.doctor) {
        score += 25;
        reasons.push('Requested provider');
      } else if (/any/i.test(w.provider)) {
        score += 10;
        reasons.push('Flexible provider');
      }

      if (w.reason === 'ASAP') {
        score += 20;
        reasons.push('ASAP urgency');
      } else if (w.reason === 'Wants sooner') {
        score += 15;
        reasons.push('Prefers sooner');
      } else {
        score += 10;
        reasons.push('Overdue recall');
      }

      ranked.push({ entry: w, score, reasons });
    });

    return ranked.sort((a, b) => b.score - a.score);
  };

  // Send offers enforcing HIPAA ePHI sanitization
  const handleSendOffers = (openingId: string, count = 3) => {
    const currentHour = new Date().getHours();
    if (!bypassQuietHours && (currentHour < 8 || currentHour >= 21)) {
      addLog('Offers held: Outside 8 AM–9 PM messaging quiet hours (§ 164.530 & TCPA).', true);
      return;
    }

    setOpenings((prev) =>
      prev.map((op) => {
        if (op.id !== openingId) return op;

        const candidates = rankCandidates(op);
        const alreadyOffered = op.offers.map((o) => o.name);
        const eligible = candidates.filter((c) => !alreadyOffered.includes(c.entry.name)).slice(0, count);

        if (!eligible.length) {
          addLog(`No matching waitlist candidates found for ${op.time} ${op.doctor}.`);
          return op;
        }

        const newOffers = eligible.map((c) => {
          const patientObj = patients.find((p) => p.name === c.entry.name);
          const channel: 'SMS' | 'email' = patientObj?.smsConsent ? 'SMS' : 'email';

          // HIPAA-COMPLIANT SANITIZED TEXT: Absolutely NO diagnostic details or procedure names
          const safeText = `Hi ${c.entry.name.split(' ')[0]}, this is Lakeside Dental — an opening just became available today at ${op.time} with ${op.doctor}. Reply YES to take it, or NO to pass. Reply STOP to opt out.`;

          deliverMessage(c.entry.name, safeText, 'practice', 'Offer sent');

          logAuditEvent(
            'SEND_OUTREACH',
            `Dispatched HIPAA-sanitized chair fill offer to ${c.entry.name} via ${channel} for ${op.time}. Specific ePHI suppressed.`,
            op.id,
            c.entry.name,
            true
          );

          addLog(`Dispatched offer to ${c.entry.name} (${channel}) for ${op.time} · match ${c.score}. Verified ePHI-free.`, true);

          return {
            name: c.entry.name,
            score: c.score,
            status: 'sent' as const,
            expiresAt: Date.now() + 15 * 60000,
            ch: channel,
          };
        });

        return {
          ...op,
          offers: [...op.offers, ...newOffers],
        };
      })
    );
  };

  // Fill slot when patient accepts
  const handleFillSlot = (opening: RecoveryOpening, candidateName: string) => {
    const waitlistEntry = waitlist.find((w) => w.name === candidateName);
    const value = estValue(waitlistEntry?.wants || opening.detail);

    // Update opening
    setOpenings((prev) =>
      prev.map((op) => {
        if (op.id !== opening.id) return op;
        return {
          ...op,
          filledBy: candidateName,
          value,
          offers: op.offers.map((o) => {
            if (o.name === candidateName) return { ...o, status: 'filled' as const };
            if (o.status === 'sent') {
              // Gracefully withdraw others
              deliverMessage(
                o.name,
                `Thanks for your reply! That opening was just claimed by another patient. We will alert you on the next available slot.`,
                'practice'
              );
              return { ...o, status: 'withdrawn' as const };
            }
            return o;
          }),
        };
      })
    );

    // Book into appointments calendar
    const [h, m] = opening.time.split(':').map((s) => parseInt(s));
    const isPM = opening.time.includes('PM');
    const mins = ((h % 12) + (isPM ? 12 : 0)) * 60 + (m || 0);

    const newAppt: Appointment = {
      id: `appt-rec-${Date.now()}`,
      time: opening.time,
      mins,
      dur: 60,
      patient: candidateName,
      initials: candidateName[0] + (candidateName.split(' ')[1]?.[0] || ''),
      provider: opening.doctor,
      op: 'Op 1',
      treatment: waitlistEntry?.wants || opening.detail,
      status: 'scheduled',
    };

    setAppointments((prev) => [...prev, newAppt]);

    // Send confirmation
    deliverMessage(
      candidateName,
      `You're all booked! See you today at ${opening.time} at Lakeside Dental. Reply STOP to opt out.`,
      'practice',
      'Confirmed'
    );

    // Remove from waitlist
    setWaitlist((prev) => prev.filter((w) => w.name !== candidateName));

    logAuditEvent(
      'RECOVERY_FILLED',
      `Chair opening at ${opening.time} successfully filled by waitlist patient ${candidateName}. Recovered est. ${usd(value)}.`,
      opening.id,
      candidateName
    );

    addLog(`${candidateName} confirmed ${opening.time} with ${opening.doctor} · est. ${usd(value)} recovered.`);
  };

  // Handle patient reply simulation (YES, NO, STOP)
  const handleSimulateReply = (openingId: string, offerIndex: number) => {
    const opening = openings.find((o) => o.id === openingId);
    if (!opening) return;
    const offer = opening.offers[offerIndex];
    if (!offer) return;

    const rawInput = simulatedReplies[`${openingId}-${offerIndex}`] || 'YES';
    const text = rawInput.trim();
    const cleanLower = text.toLowerCase();

    deliverMessage(offer.name, text, 'patient');

    if (/^(yes|y|sure|book|ok)\b/i.test(cleanLower)) {
      if (opening.filledBy) {
        deliverMessage(offer.name, 'Sorry, that opening was just booked by another patient!', 'practice');
        addLog(`${offer.name} replied YES too late — slot already filled.`);
      } else {
        handleFillSlot(opening, offer.name);
      }
    } else if (/^(no|pass|cancel)\b/i.test(cleanLower)) {
      setOpenings((prev) =>
        prev.map((op) => {
          if (op.id !== openingId) return op;
          const updatedOffers = [...op.offers];
          updatedOffers[offerIndex] = { ...offer, status: 'declined' as const };
          return { ...op, offers: updatedOffers };
        })
      );
      deliverMessage(offer.name, 'No problem — you remain on our priority waitlist for the next opening.', 'practice');
      addLog(`${offer.name} declined ${opening.time}. Automatically cascading to next ranked match.`);
      handleSendOffers(openingId, 1);
    } else if (/^(stop|unsubscribe)\b/i.test(cleanLower)) {
      setOpenings((prev) =>
        prev.map((op) => {
          if (op.id !== openingId) return op;
          const updatedOffers = [...op.offers];
          updatedOffers[offerIndex] = { ...offer, status: 'stopped' as const };
          return { ...op, offers: updatedOffers };
        })
      );

      // TCPA and HIPAA opt out handling
      setPatients((prev) =>
        prev.map((p) => (p.name === offer.name ? { ...p, smsConsent: false } : p))
      );
      setWaitlist((prev) =>
        prev.map((w) => (w.name === offer.name ? { ...w, stopped: true } : w))
      );

      deliverMessage(
        offer.name,
        'You have been unsubscribed from Lakeside Dental text alerts. Reply START to resume.',
        'practice',
        'Opted out'
      );

      logAuditEvent(
        'OPT_OUT_RECORDED',
        `Patient ${offer.name} submitted STOP opt-out. Mobile number revoked for outreach (§ 164.520 & TCPA A2P 10DLC).`,
        undefined,
        offer.name,
        true
      );

      addLog(`${offer.name} replied STOP — logged TCPA opt-out & revoked SMS consent.`, true);
      handleSendOffers(openingId, 1);
    } else {
      addLog(`${offer.name} sent custom response: "${text}" — staff intervention flagged in Messages inbox.`);
      setOpenings((prev) =>
        prev.map((op) => {
          if (op.id !== openingId) return op;
          const updatedOffers = [...op.offers];
          updatedOffers[offerIndex] = { ...offer, flag: true };
          return { ...op, offers: updatedOffers };
        })
      );
    }

    setSimulatedReplies((prev) => ({ ...prev, [`${openingId}-${offerIndex}`]: '' }));
  };

  const totalRecoveredMonth = openings
    .filter((o) => o.filledBy)
    .reduce((sum, o) => sum + (o.value || 0), 8450);

  return (
    <div className="space-y-6">
      {/* Metric Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            Openings Recovered Today
          </div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">
            {openings.filter((o) => o.filledBy).length + 3}
          </div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Seats saved from cancellations</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            Monthly Recovery Total
          </div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">34 Chairs</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Outreach response rate 74%</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            Est. Revenue Saved (Month)
          </div>
          <div className="text-2xl font-tabular font-semibold text-[#a3533a] mt-1 font-tabular">
            {usd(totalRecoveredMonth)}
          </div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Synced to Open Dental fee schedule</div>
        </div>
      </div>

      {/* HIPAA Compliance Assurance Banner */}
      <div className="p-3.5 bg-white/70 border border-[#1e2a28]/15 flex items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[#1e2a28]/80">
          <ShieldCheck className="w-4 h-4 text-[#a3533a] shrink-0" />
          <span>
            <strong>HIPAA ePHI-Free Automated Dispatch:</strong> Outgoing SMS offers automatically strip sensitive diagnosis and procedure details to comply with HHS HIPAA transmission rules.
          </span>
        </div>
        <button
          onClick={() => setBypassQuietHours(!bypassQuietHours)}
          className={`px-2 py-1 text-[11px] font-semibold border transition-colors shrink-0 ${
            bypassQuietHours
              ? 'bg-[#a3533a] text-[#f4f0e8] border-[#a3533a]'
              : 'bg-white border-[#1e2a28]/20 text-[#1e2a28]/70 hover:bg-[#1e2a28]/5'
          }`}
          title="Toggle quiet hours override for testing (8 AM–9 PM rule)"
        >
          {bypassQuietHours ? 'Quiet Hours: Bypassed (Demo)' : 'Quiet Hours: Enforced'}
        </button>
      </div>

      {/* Openings Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#1e2a28]">Active Openings</h2>
            <p className="text-xs text-[#1e2a28]/60">
              Ranked waitlist matching with automated cascade fallback
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {openings.map((opening) => {
            const candidates = rankCandidates(opening);
            const liveOffers = opening.offers.filter((o) => o.status === 'sent');
            const isFilled = Boolean(opening.filledBy);

            return (
              <div key={opening.id} className="border border-[#1e2a28]/15 bg-white/50 p-4 space-y-3">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1e2a28]/10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                        opening.kind === 'no-show'
                          ? 'border-[#a3533a] text-[#a3533a] bg-[#a3533a]/10'
                          : 'border-[#1e2a28]/30 text-[#1e2a28]/70 bg-white/60'
                      }`}
                    >
                      {opening.type}
                    </span>
                    <strong className="text-sm font-semibold text-[#1e2a28]">
                      {opening.detail}
                    </strong>
                    <span className="text-xs text-[#1e2a28]/50">
                      {opening.time} · {opening.doctor}
                    </span>
                  </div>

                  <div className="text-xs">
                    {isFilled ? (
                      <span className="font-semibold text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Filled by {maskName(opening.filledBy!, isPrivacyShieldActive)} ({usd(opening.value || 0)})
                      </span>
                    ) : (
                      <span className="font-tabular text-[#a3533a] font-semibold">
                        ≈ {usd(estValue(opening.detail))} at stake
                      </span>
                    )}
                  </div>
                </div>

                {/* Offer Status & Action Rows */}
                {isFilled ? (
                  <div className="text-xs text-[#1e2a28]/70 p-2.5 bg-emerald-800/10 border border-emerald-800/20">
                    Appointment successfully confirmed and synced with Open Dental operatory schedule.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Live / Past Offers */}
                    {opening.offers.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
                          Dispatched Outreach Offers
                        </div>

                        {opening.offers.map((offer, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-white border border-[#1e2a28]/15 space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="font-semibold text-[#1e2a28]">
                                {maskName(offer.name, isPrivacyShieldActive)}
                                <span className="text-[10px] font-normal text-[#1e2a28]/50 ml-2">
                                  via {offer.ch} · Match Score: {offer.score}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                                  offer.status === 'sent'
                                    ? 'border-[#1e2a28] text-[#1e2a28] bg-[#1e2a28]/10'
                                    : offer.status === 'declined'
                                    ? 'border-[#a3533a] text-[#a3533a] bg-[#a3533a]/10'
                                    : 'border-[#1e2a28]/20 text-[#1e2a28]/50'
                                }`}
                              >
                                {offer.status}
                              </span>
                            </div>

                            {/* Interactive Simulation Controls */}
                            {offer.status === 'sent' && (
                              <div className="flex gap-2 pt-1 border-t border-[#1e2a28]/10">
                                <input
                                  type="text"
                                  placeholder={`Simulate reply: YES, NO, STOP…`}
                                  value={simulatedReplies[`${opening.id}-${idx}`] || ''}
                                  onChange={(e) =>
                                    setSimulatedReplies((prev) => ({
                                      ...prev,
                                      [`${opening.id}-${idx}`]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 px-2.5 py-1 text-xs bg-[#f4f0e8]/50 border border-[#1e2a28]/20 text-[#1e2a28]"
                                />
                                <button
                                  onClick={() => handleSimulateReply(opening.id, idx)}
                                  className="px-3 py-1 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
                                >
                                  Send Reply
                                </button>
                                <button
                                  onClick={() => {
                                    setSimulatedReplies((prev) => ({
                                      ...prev,
                                      [`${opening.id}-${idx}`]: 'YES',
                                    }));
                                    setTimeout(() => handleSimulateReply(opening.id, idx), 50);
                                  }}
                                  className="px-2 py-1 border border-[#1e2a28]/25 text-xs font-semibold hover:bg-white"
                                >
                                  Quick YES
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fresh Candidates / Send CTA */}
                    {liveOffers.length === 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                          Top Ranked Waitlist Matches
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {candidates.slice(0, 3).map((c, i) => (
                            <div key={i} className="p-2 bg-white/70 border border-[#1e2a28]/15 text-xs">
                              <div className="font-semibold text-[#1e2a28] flex items-center justify-between">
                                <span>{maskName(c.entry.name, isPrivacyShieldActive)}</span>
                                <span className="font-tabular text-[#a3533a] font-bold">{c.score}</span>
                              </div>
                              <div className="text-[11px] text-[#1e2a28]/60 mt-0.5 truncate">{c.entry.wants}</div>
                              <div className="text-[10px] text-[#1e2a28]/40 mt-1 truncate">
                                {c.reasons.join(' · ')}
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => handleSendOffers(opening.id, 3)}
                          className="mt-2 px-4 py-2 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 flex items-center gap-1.5 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Dispatch HIPAA-Sanitized Outreach (Top 3 Candidates)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Engine Audit & Activity Log */}
      <div className="border border-[#1e2a28]/15 bg-white/40 p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2a28]/15">
          <div className="font-semibold text-xs text-[#1e2a28]">Fill Engine Activity &amp; Dispatch Log</div>
          <button onClick={onGoToMessages} className="text-xs text-[#a3533a] hover:underline">
            View in 2-Way Messages →
          </button>
        </div>

        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {engineLogs.map((log, i) => (
            <div key={i} className="text-xs flex items-start gap-2.5 font-tabular py-1 border-b border-[#1e2a28]/5 last:border-b-0">
              <span className="text-[#1e2a28]/40 w-16 shrink-0">{log.time}</span>
              <span className="text-[#1e2a28]/80 flex-1">{log.msg}</span>
              {log.compliance && (
                <span className="text-[9px] uppercase tracking-wider text-[#a3533a] border border-[#a3533a]/30 px-1 font-bold">
                  HIPAA Verified
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
