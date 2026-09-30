import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { Conversation, Patient } from '../../types/hipaa';

interface CleanMessagesProps {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  patients: Patient[];
}

export const CleanMessages: React.FC<CleanMessagesProps> = ({
  conversations,
  setConversations,
  patients,
}) => {
  const { maskName, scrubEPHI, logAudit } = useHIPAA();
  const [activeId, setActiveId] = useState(conversations[0]?.id || '');
  const [inputVal, setInputVal] = useState('');
  const [phiNotice, setPhiNotice] = useState(false);

  const active = conversations.find((c) => c.id === activeId);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || !active) return;

    // Check HIPAA scrubber
    const { hadPHI, cleanText } = scrubEPHI(inputVal);
    let textToSend = inputVal.trim();

    if (hadPHI) {
      setPhiNotice(true);
      textToSend = cleanText;
      logAudit('EPHI_SCRUBBED', `Scrubbed sensitive health terms from outgoing SMS to ${active.patient}`);
    }

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? {
              ...c,
              time,
              preview: textToSend,
              lastFrom: 'practice',
              messages: [...c.messages, { from: 'practice', time, text: textToSend }],
            }
          : c
      )
    );

    logAudit('SMS_SENT', `SMS sent to ${active.patient}`);
    setInputVal('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-[10px] tracking-widest uppercase text-[#a3533a] font-bold">Messages</div>
        <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">Patient conversations</h2>
        <p className="text-[13px] text-[#1e2a28]/60 mt-1 max-w-lg leading-relaxed">
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
                  setPhiNotice(false);
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
                    <span className="text-[10px] text-[#1e2a28]/50 shrink-0 font-mono">{c.time}</span>
                  </div>
                  <p className="text-[11.5px] text-[#1e2a28]/60 truncate mt-1">
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
                  <span className="text-[10.5px] text-[#1e2a28]/55 font-mono">{active.phone}</span>
                </div>
              </div>
              <span className="text-[9px] font-semibold px-2 py-0.5 border border-[#1e2a28]/15 uppercase text-[#1e2a28]/60">
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
                      <span className="block text-[9px] opacity-60 mt-1 text-right">{m.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scrubber alert if ePHI prevented */}
            {phiNotice && (
              <div className="p-2 px-3 bg-[#a3533a]/15 text-[#a3533a] text-xs border-t border-[#a3533a]/30">
                Notice: Specific health diagnostic terms were sanitized to protect patient ePHI (§ 164.530).
              </div>
            )}

            {/* Compose */}
            <form onSubmit={handleSend} className="p-3 border-t border-[#1e2a28]/12 flex gap-2 bg-white/60">
              <input
                type="text"
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
          <div className="p-8 text-center text-[#1e2a28]/50 border border-[#1e2a28]/15 bg-white/40">
            Select a conversation to reply
          </div>
        )}
      </div>
    </div>
  );
};
