import React from 'react';
import { toWaitlist } from '../../api/format';
import { useWaitlist } from '../../api/hooks';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { PageHead } from '../ui/Metric';
import { QueryBoundary } from '../ui/QueryBoundary';

export const CleanWaitlist: React.FC = () => {
  const { maskName } = useHIPAA();
  const { practice } = usePractice();
  const wl = useWaitlist();
  const waitlist = (wl.data ?? []).map((w) => toWaitlist(w, practice.timezone));

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Waitlist" title="Patients ready to move up" blurb="Matches are ordered by urgency and appointment fit." />
      <QueryBoundary queries={[wl]}>
        {waitlist.length === 0 && <p className="text-[13px] text-[#1e2a28]/70">Nobody is waiting right now.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {waitlist.map((p) => (
            <div key={p.id} className="p-4 border border-[#1e2a28]/14 bg-white/40 flex items-center gap-3">
              <span aria-hidden="true" className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs shrink-0">{p.initials}</span>
              <div className="flex-1 min-w-0">
                <strong className="block text-[13px] font-semibold truncate">{maskName(p.name)}</strong>
                <p className="text-[11px] text-[#1e2a28]/70 m-0 mt-0.5 truncate">{p.wants} · {p.provider}</p>
              </div>
              <div className="text-right text-[11px] text-[#1e2a28]/70 leading-tight shrink-0">
                <div>{p.reason}</div>
                <div>{p.stopped ? 'No texting consent' : p.when}</div>
              </div>
            </div>
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
};
