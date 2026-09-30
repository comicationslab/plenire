import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { detectEPHI, maskName, maskPhone, sanitizeForSMS } from '../../services/hipaaCompliance';
import { Conversation, Patient } from '../../types/hipaa';
import { Send, ShieldAlert, Sparkles, AlertCircle, ArrowLeft, Phone, UserCheck } from 'lucide-react';

interface MessagesInboxViewProps {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  patients: Patient[];
}

export const MessagesInboxView: React.FC<MessagesInboxViewProps> = ({
  conversations,
  setConversations,
  patients,
}) => {
  const { isPrivacyShieldActive, logAuditEvent } = useHIPAA();

  const [activeId, setActiveId] = useState<string>(conversations[0]?.id || '');
  const [inputText, setInputText] = useState('');
  const [ephiWarning, setEphiWarning] = useState<string[]>([]);

  const activeConvo = conversations.find((c) => c.id === activeId);
  const patientRecord = patients.find((p) => p.name === activeConvo?.patient);
  const isOptedOut = patientRecord?.smsConsent === false;

  const handleSelectConvo = (id: string) => {
    setActiveId(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: false } : c))
    );
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    const { hasEPHI, detectedTerms } = detectEPHI(text);
    if (hasEPHI) {
      setEphiWarning(detectedTerms);
    } else {
      setEphiWarning([]);
    }
  };

  const handleAutoSanitize = () => {
    if (!activeConvo) return;
    const sanitized = sanitizeForSMS(inputText, activeConvo.patient);
    setInputText(sanitized);
    setEphiWarning([]);
    logAuditEvent(
      'EPHI_SCRUBBER_TRIGGERED',
      `Auto-sanitized drafted SMS to remove ePHI terms: [${ephiWarning.join(', ')}].`,
      activeConvo.id,
      activeConvo.patient,
      true
    );
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConvo) return;

    if (isOptedOut) {
      alert('Cannot send SMS: Patient has revoked texting consent (TCPA STOP).');
      return;
    }

    const { hasEPHI, detectedTerms } = detectEPHI(inputText);
    if (hasEPHI) {
      logAuditEvent(
        'EPHI_SCRUBBER_TRIGGERED',
        `Warning: Staff dispatched message with flagged terms: [${detectedTerms.join(', ')}].`,
        activeConvo.id,
        activeConvo.patient,
        true
      );
    }

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const newMsg = {
      from: 'practice' as const,
      time: timeStr,
      text: inputText.trim(),
      sanitized: !hasEPHI,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvo.id) {
          return {
            ...c,
            time: timeStr,
            preview: inputText.trim(),
            lastFrom: 'practice',
            messages: [...c.messages, newMsg],
          };
        }
        return c;
      })
    );

    logAuditEvent(
      'SEND_OUTREACH',
      `Sent SMS to ${activeConvo.patient}: "${inputText.trim().slice(0, 45)}..."`,
      activeConvo.id,
      activeConvo.patient
    );

    setInputText('');
    setEphiWarning([]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e2a28]/15">
        <div>
          <h2 className="text-base font-semibold text-[#1e2a28]">Patient Messages (Two-Way SMS)</h2>
          <p className="text-xs text-[#1e2a28]/60">
            A2P 10DLC Healthcare Campaign Registered · Real-Time ePHI Leak Prevention
          </p>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] border border-[#1e2a28]/20 bg-white/40 h-[640px] overflow-hidden">
        {/* Left: Conversations list */}
        <div className="border-r border-[#1e2a28]/15 flex flex-col h-full bg-[#f4f0e8]/30">
          <div className="p-3 border-b border-[#1e2a28]/10 text-xs font-semibold text-[#1e2a28]/70 flex items-center justify-between">
            <span>Inbox ({conversations.length})</span>
            <span className="text-[10px] text-[#a3533a] font-bold">TCPA Verified</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#1e2a28]/10">
            {conversations.map((convo) => {
              const isActive = convo.id === activeId;
              return (
                <button
                  key={convo.id}
                  onClick={() => handleSelectConvo(convo.id)}
                  className={`w-full p-3 text-left transition-colors flex items-start gap-2.5 ${
                    isActive ? 'bg-white shadow-sm' : 'hover:bg-white/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full border border-[#1e2a28]/30 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8] shrink-0">
                    {convo.initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-[#1e2a28] truncate">
                        {maskName(convo.patient, isPrivacyShieldActive)}
                      </span>
                      <span className="text-[10px] font-tabular text-[#1e2a28]/50 shrink-0">
                        {convo.time}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#1e2a28]/70 truncate mt-0.5">
                      {convo.lastFrom === 'practice' ? 'You: ' : ''}
                      {convo.preview}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] uppercase tracking-wider text-[#1e2a28]/50 border border-[#1e2a28]/15 px-1">
                        {convo.status}
                      </span>
                      {convo.unread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#a3533a]" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Chat Thread */}
        {activeConvo ? (
          <div className="flex flex-col h-full bg-white/60">
            {/* Thread Header */}
            <div className="p-3.5 border-b border-[#1e2a28]/15 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full border border-[#1e2a28]/30 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8]">
                  {activeConvo.initials}
                </div>
                <div>
                  <div className="font-semibold text-xs sm:text-sm text-[#1e2a28] flex items-center gap-2">
                    <span>{maskName(activeConvo.patient, isPrivacyShieldActive)}</span>
                    <span className="text-[10px] font-normal text-[#1e2a28]/60 font-tabular">
                      {maskPhone(activeConvo.phone, isPrivacyShieldActive)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#1e2a28]/50 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-emerald-800" />
                    <span>Consent Recorded · Outreach Permitted</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-semibold text-[#1e2a28]/70 uppercase tracking-wider">
                  {activeConvo.status}
                </span>
              </div>
            </div>

            {/* Messages Scroll View */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#f4f0e8]/20">
              {activeConvo.messages.map((msg, index) => {
                const isPractice = msg.from === 'practice';
                return (
                  <div
                    key={index}
                    className={`flex ${isPractice ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] p-3 text-xs leading-relaxed shadow-sm ${
                        isPractice
                          ? 'bg-[#1e2a28] text-[#f4f0e8]'
                          : 'bg-white border border-[#1e2a28]/15 text-[#1e2a28]'
                      }`}
                    >
                      <div>{msg.text}</div>
                      <div
                        className={`text-[9px] font-tabular mt-1.5 flex items-center justify-between gap-3 ${
                          isPractice ? 'text-[#f4f0e8]/60' : 'text-[#1e2a28]/40'
                        }`}
                      >
                        <span>{msg.time}</span>
                        {isPractice && (
                          <span className="text-[8px] uppercase tracking-widest text-[#f4f0e8]/40">
                            Sent via A2P 10DLC
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ePHI Scrubber Warning Alert */}
            {ephiWarning.length > 0 && (
              <div className="p-3 bg-[#a3533a]/15 border-t border-[#a3533a] flex items-center justify-between gap-3 text-xs text-[#1e2a28]">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#a3533a] shrink-0" />
                  <span>
                    <strong>HIPAA ePHI Detected:</strong> Prohibited clinical terms:{' '}
                    <code className="bg-white/80 px-1 py-0.5 text-[#a3533a] font-semibold">
                      {ephiWarning.join(', ')}
                    </code>
                    . Unencrypted SMS must contain scheduling info only.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoSanitize}
                  className="px-2.5 py-1 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 flex items-center gap-1 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Sanitize</span>
                </button>
              </div>
            )}

            {/* Opt-Out Banner */}
            {isOptedOut && (
              <div className="p-3 bg-red-100 border-t border-red-300 text-xs text-red-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
                <span>
                  <strong>Recipient Opted Out:</strong> Patient sent STOP. Statutory TCPA &amp; HIPAA rules prohibit sending further text messages to this phone number.
                </span>
              </div>
            )}

            {/* Compose Bar */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#1e2a28]/15 bg-white flex gap-2">
              <input
                type="text"
                disabled={isOptedOut}
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder={
                  isOptedOut
                    ? 'Patient opted out of SMS outreach (STOP)'
                    : 'Type a message (ePHI Scrubber active)…'
                }
                className="flex-1 px-3 py-2 text-xs bg-[#f4f0e8]/30 border border-[#1e2a28]/20 focus:outline-none focus:border-[#1e2a28] text-[#1e2a28] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isOptedOut || !inputText.trim()}
                className="px-4 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#1e2a28]/60 flex items-center justify-center">
            Select a conversation from the left to view message history.
          </div>
        )}
      </div>
    </div>
  );
};
