import React, { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { fmtDate, fmtTime } from '../../api/format';
import { useConversations, useMarkRead, useMessages, useSendMessage } from '../../api/hooks';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { initialsOf } from '../../lib/format';
import { PageHead } from '../ui/Metric';
import { QueryBoundary } from '../ui/QueryBoundary';

export const CleanMessages: React.FC = () => {
  const { maskName, maskPhone, checkOutgoing, safeMessage, logAudit } = useHIPAA();
  const { practice } = usePractice();
  const tz = practice.timezone;

  const convs = useConversations();
  const [activeId, setActiveId] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [phiTerms, setPhiTerms] = useState<string[] | null>(null);
  const [sendError, setSendError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const list = convs.data ?? [];
  const active = list.find((c) => c.patientId === (activeId || list[0]?.patientId));
  const thread = useMessages(active?.patientId);
  const send = useSendMessage();
  const markRead = useMarkRead();

  // Opening a conversation marks its replies as read.
  const unreadHere = active?.unread ?? 0;
  const activePatient = active?.patientId;
  useEffect(() => {
    if (activePatient && unreadHere > 0) markRead.mutate(activePatient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient, unreadHere]);

  const stamp = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? fmtTime(iso, tz) : fmtDate(iso, tz);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputVal.trim();
    if (!text || !active) return;
    setSendError('');

    // Quick check in the browser; the server repeats it, so it cannot be skipped.
    const { hasPHI, terms } = checkOutgoing(text);
    if (hasPHI) {
      setPhiTerms(terms);
      logAudit('EPHI_BLOCKED', 'A text with health wording was held');
      return;
    }
    send.mutate({ patientId: active.patientId, body: text }, {
      onSuccess: () => { setInputVal(''); setPhiTerms(null); },
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'PHI_IN_MESSAGE') setPhiTerms(['health details']);
        else setSendError(err instanceof ApiError ? (err.code === 'NO_SMS_CONSENT' ? 'This patient has not agreed to texts (or has opted out), so nothing was sent.' : err.message) : 'Could not send.');
      },
    });
  };

  const useSafeWording = () => {
    if (!active) return;
    setInputVal(safeMessage(active.name.split(' ')[0]));
    setPhiTerms(null);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Messages" title="Patient conversations" blurb="Confirmations, reschedules and replies, all two-way SMS in one inbox." />

      <QueryBoundary queries={[convs]}>
        {list.length === 0 ? (
          <div className="p-8 text-center text-[#1e2a28]/70 border border-[#1e2a28]/15 bg-white/40">No conversations yet. Send offers from Recovery and replies will show up here.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 items-start">
            <div className="border border-[#1e2a28]/14 bg-white/40 divide-y divide-[#1e2a28]/12 max-h-[620px] overflow-auto">
              {list.map((c) => {
                const isAct = c.patientId === active?.patientId;
                return (
                  <button
                    key={c.patientId}
                    onClick={() => { setActiveId(c.patientId); setPhiTerms(null); setSendError(''); }}
                    className={`w-full p-3.5 px-4 flex items-center gap-3 text-left transition-colors ${isAct ? 'bg-[#a3533a]/10' : 'hover:bg-[#1e2a28]/5'}`}
                  >
                    <div aria-hidden="true" className="w-9 h-9 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs shrink-0">{initialsOf(c.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <strong className="text-[12.5px] font-semibold text-[#1e2a28] truncate">{maskName(c.name)}</strong>
                        <span className="text-[11px] text-[#1e2a28]/70 shrink-0 tabular-nums">{stamp(c.at)}</span>
                      </div>
                      <p className="text-[11.5px] text-[#1e2a28]/70 truncate mt-1">{c.lastDirection === 'out' ? 'You: ' : ''}{c.preview}</p>
                    </div>
                    {c.unread > 0 && <span aria-label={`${c.unread} unread`} className="w-2 h-2 rounded-full bg-[#a3533a] shrink-0" />}
                  </button>
                );
              })}
            </div>

            {active && (
              <div className="border border-[#1e2a28]/14 bg-white/40 flex flex-col h-[620px]">
                <div className="p-3.5 px-4 border-b border-[#1e2a28]/12 flex items-center justify-between bg-white/50">
                  <div className="flex items-center gap-2.5">
                    <div aria-hidden="true" className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs">{initialsOf(active.name)}</div>
                    <div>
                      <strong className="text-[13px] font-semibold block">{maskName(active.name)}</strong>
                      <span className="text-[11px] text-[#1e2a28]/70 tabular-nums">{maskPhone(active.phone ?? 'No phone')}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 border border-[#1e2a28]/15 uppercase text-[#1e2a28]/70">
                    {active.optedOut ? 'Opted out' : active.unread > 0 ? 'Needs reply' : 'Up to date'}
                  </span>
                </div>

                <div className="flex-1 p-4 overflow-auto space-y-2.5">
                  {thread.isPending && <p role="status" className="text-xs text-[#1e2a28]/70">Loading…</p>}
                  {(thread.data ?? []).map((m) => {
                    const mine = m.direction === 'out';
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] p-2.5 px-3 text-[12.5px] leading-relaxed ${mine ? 'bg-[#1e2a28] text-[#f4f0e8]' : 'bg-[#1e2a28]/[0.08] text-[#1e2a28]'}`}>
                          <div>{m.body}</div>
                          <span className="block text-[11px] opacity-80 mt-1 text-right">{fmtTime(m.at, tz)}{mine && m.status === 'failed' ? ' · not delivered' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {phiTerms && (
                  <div role="alert" className="p-3 bg-[#a3533a]/10 text-[#1e2a28] text-xs border-t border-[#a3533a]/40 space-y-2">
                    <div>
                      <strong>This message was not sent.</strong> Texts are not a secure channel, and it mentions health details ({phiTerms.join(', ')}). Remove them, or start from our generic wording.
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setPhiTerms(null); inputRef.current?.focus(); }} className="px-3 py-1.5 border border-[#1e2a28]/40 font-semibold">Edit message</button>
                      <button type="button" onClick={useSafeWording} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] font-semibold">Use safe wording</button>
                    </div>
                  </div>
                )}
                {sendError && <div role="alert" className="p-3 text-xs border-t border-[#a3533a]/40 bg-[#a3533a]/10 font-semibold">{sendError}</div>}

                <form onSubmit={handleSend} className="p-3 border-t border-[#1e2a28]/12 flex gap-2 bg-white/60">
                  <input
                    type="text" ref={inputRef} aria-label="Message" value={inputVal} maxLength={320}
                    onChange={(e) => setInputVal(e.target.value)} placeholder="Write a message…"
                    className="flex-1 px-3 py-2 bg-transparent border border-[#1e2a28]/20 text-xs focus:outline-none focus:border-[#1e2a28]"
                  />
                  <button type="submit" disabled={send.isPending} className="px-4 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 disabled:opacity-60">Send</button>
                </form>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
};
