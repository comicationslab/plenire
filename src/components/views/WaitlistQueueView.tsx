import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { maskName, maskPhone } from '../../services/hipaaCompliance';
import { WaitlistEntry } from '../../types/hipaa';
import { Search, Clock, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';

interface WaitlistQueueViewProps {
  waitlist: WaitlistEntry[];
  onGoToRecovery: () => void;
}

export const WaitlistQueueView: React.FC<WaitlistQueueViewProps> = ({
  waitlist,
  onGoToRecovery,
}) => {
  const { isPrivacyShieldActive } = useHIPAA();
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = waitlist.filter(
    (w) =>
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.wants.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.provider.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e2a28]/15">
        <div>
          <h2 className="text-base font-semibold text-[#1e2a28]">Priority Patient Waitlist</h2>
          <p className="text-xs text-[#1e2a28]/60">
            Patients ready to move up for earlier cancellations &amp; gap openings
          </p>
        </div>
        <button
          onClick={onGoToRecovery}
          className="px-3 py-1.5 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 flex items-center gap-1.5 transition-colors"
        >
          <span>Open Recovery Engine</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#1e2a28]/40 absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search waitlist by patient name, requested visit, or provider…"
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-white/80 border border-[#1e2a28]/20 focus:outline-none focus:border-[#1e2a28] text-[#1e2a28]"
        />
      </div>

      {/* Waitlist Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-4 bg-white/50 border border-[#1e2a28]/15 flex items-start gap-3 hover:bg-white/80 transition-colors"
          >
            <div className="w-9 h-9 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8] shrink-0">
              {item.initials}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-[#1e2a28] truncate">
                  {maskName(item.name, isPrivacyShieldActive)}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                    item.reason === 'ASAP'
                      ? 'border-[#a3533a] text-[#a3533a] bg-[#a3533a]/10'
                      : 'border-[#1e2a28]/20 text-[#1e2a28]/60 bg-white/60'
                  }`}
                >
                  {item.reason}
                </span>
              </div>

              <div className="text-xs text-[#1e2a28] font-medium mt-1">{item.wants}</div>
              <div className="text-[11px] text-[#1e2a28]/60 mt-0.5">
                Target: {item.provider} · Availability: {item.when}
              </div>

              {item.phone && (
                <div className="text-[10px] font-tabular text-[#1e2a28]/50 mt-1">
                  {maskPhone(item.phone, isPrivacyShieldActive)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Compliance Note */}
      <div className="p-3 bg-white/40 border border-[#1e2a28]/15 text-[11px] text-[#1e2a28]/60 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#a3533a] shrink-0" />
        <span>
          Waitlist candidates are matched and dispatched automatically via Chairfill Recovery according to clinical category, provider op availability, and statutory quiet hours.
        </span>
      </div>
    </div>
  );
};
