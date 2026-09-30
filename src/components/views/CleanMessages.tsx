import React, { useRef, useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { Conversation } from '../../types/hipaa';
import { clockNow } from '../../lib/format';

interface CleanMessagesProps {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
}

export const CleanMessages: React.FC<CleanMessagesProps> = ({
  conversations,
  setConversations,
}) => {
  const { maskName, maskPhone, logAudit, checkOutgoing, safeMessage } = useHIPAA();
  const [activeId, setActiveId] = useState(conversations[0]?.id || '');
  const [inputVal, setInputVal] = useState('');
  const [phiTerms, setPhiTerms] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = conversations.find((c) => c.id === activeId);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputVal.trim();
    if (!text || !active) return;

    // Warn, never silently rewrite: staff decide what goes out.
    const { hasPHI, terms } = checkOutgoing(text);
    if (hasPHI) {
      setPhiTerms(terms);
      logAudit('EPHI_BLOCKED', `Held a text to ${active.patient}: health wording detected`);
      return;
    }

    const time = clockNow();
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? { ...c, time, preview: text, lastFrom: 'practice', messages: [...c.messages, { from: 'practice', time, text }] }
          : c
      )
    );
    logAudit('SMS_SENT', `SMS sent to ${active.patient}`);
    setInputVal('');
    setPhiTerms(null);
  };

  const useSafeWording = () => {
    if (!active) return;
    setInputVal(safeMessage(active.patient.split(' ')[0]));
    setPhiTerms(null);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-widest uppercase text-[#a3533a] font-bold">Messages</div>
        <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">Patient conversations</h2>
        <p className="text-[13px] text-[#1e2a28]/70 mt-1 max-w-lg leading-relaxed">
          Confirmations, reschedules and replies — all two-way SMS in one inbox.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 items-start">
        {/* List */}
        <div className="border border-[#1e2a28]/14 bg-white/40 divide-y divide-[#1e2a28]/12 max-h-[620px] overflow-auto">
          {conversations.map((c) => {
            const isAct = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  setPhiTerms(null);
                }}
                className={`w-full p-3.5 px-4 flex items-center gap-3 text-left transition-colors ${
                  isAct ? 'bg-[#a3533a]/10' : 'hover:bg-[#1e2a28]/5'
                }`}
              >
                <div className="w-9 h-9 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs shrink-0">
                  {c.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="text-[12.5px] font-semibold text-[#1e2a28] truncate">
                      {maskName(c.patient)}
                    </strong>
                    <span className="text-[11px] text-[#1e2a28]/70 shrink-0 tabular-nums">{c.time}</span>
                  </div>
                  <p className="text-[11.5px] text-[#1e2a28]/70 truncate mt-1">
                    {c.lastFrom === 'practice' ? 'You: ' : ''}{c.preview}
                  </p>
                </div>
                {c.unread && <span className="w-2 h-2 rounded-full bg-[#a3533a] shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Chat Thread */}
        {active ? (
          <div className="border border-[#1e2a28]/14 bg-white/40 flex flex-col h-[620px]">
            {/* Header */}
            <div className="p-3.5 px-4 border-b border-[#1e2a28]/12 flex items-center justify-between bg-white/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs">
                  {active.initials}
                </div>
                <div>
                  <strong className="text-[13px] font-semibold block">{maskName(active.patient)}</strong>
                  <span className="text-[11px] text-[#1e2a28]/70 tabular-nums">{maskPhone(active.phone)}</span>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 border border-[#1e2a28]/15 uppercase text-[#1e2a28]/70">
                {active.status}
              </span>
            </div>

            {/* Thread */}
            <div className="flex-1 p-4 overflow-auto space-y-2.5">
              {active.messages.map((m, idx) => {
                const isPractice = m.from === 'practice';
                return (
                  <div key={idx} className={`flex ${isPractice ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] p-2.5 px-3 text-[12.5px] leading-relaxed ${
                        isPractice
                          ? 'bg-[#1e2a28] text-[#f4f0e8]'
                          : 'bg-[#1e2a28]/[0.08] text-[#1e2a28]'
                      }`}
                    >
                      <div>{m.text}</div>
                      <span className="block text-[11px] opacity-80 mt-1 text-right">{m.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {phiTerms && (
              <div role="alert" className="p-3 bg-[#a3533a]/10 text-[#1e2a28] text-xs border-t border-[#a3533a]/40 space-y-2">
                <div>
                  <strong>This message was not sent.</strong> Texts are not a secure channel, and it mentions health details ({phiTerms.join(', ')}).
                  Remove them, or start from our generic wording.
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setPhiTerms(null); inputRef.current?.focus(); }} className="px-3 py-1.5 border border-[#1e2a28]/40 font-semibold">Edit message</button>
                  <button type="button" onClick={useSafeWording} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] font-semibold">Use safe wording</button>
                </div>
              </div>
            )}

            {/* Compose */}
            <form onSubmit={handleSend} className="p-3 border-t border-[#1e2a28]/12 flex gap-2 bg-white/60">
              <input
                type="text"
                ref={inputRef}
                aria-label="Message"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Write a message…"
                className="flex-1 px-3 py-2 bg-transparent border border-[#1e2a28]/20 text-xs focus:outline-none focus:border-[#1e2a28]"
              />
              <button
                type="submit"
                className="px-4 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90"
              >
                Send
              </button>
            </form>
          </div>
        ) : (
          <div className="p-8 text-center text-[#1e2a28]/70 border border-[#1e2a28]/15 bg-white/40">
            Select a conversation to reply
          </div>
        )}
      </div>
    </div>
  );
};
