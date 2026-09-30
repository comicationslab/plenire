import React from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { WaitlistEntry } from '../../types/hipaa';

export const CleanWaitlist: React.FC<{ waitlist: WaitlistEntry[] }> = ({ waitlist }) => {
  const { maskName } = useHIPAA();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-[10px] tracking-widest uppercase text-[#a3533a] font-bold">Waitlist</div>
        <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">Patients ready to move up</h2>
        <p className="text-[13px] text-[#1e2a28]/60 mt-1 max-w-lg leading-relaxed">
          Matches are ordered by urgency and appointment fit.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {waitlist.map((p) => (
          <div key={p.id} className="p-4 border border-[#1e2a28]/14 bg-white/40 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs shrink-0">
              {p.initials}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="block text-[13px] font-semibold truncate">{maskName(p.name)}</strong>
              <p className="text-[11px] text-[#1e2a28]/55 m-0 mt-0.5 truncate">{p.wants} · {p.provider}</p>
            </div>
            <div className="text-right text-[10px] text-[#1e2a28]/55 leading-tight shrink-0">
              <div>{p.reason}</div>
              <div>{p.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
