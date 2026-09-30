import React from 'react';

export const CleanSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-[10px] tracking-widest uppercase text-[#a3533a] font-bold">Workspace</div>
        <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">Settings</h2>
        <p className="text-[13px] text-[#1e2a28]/60 mt-1 max-w-lg leading-relaxed">
          Chairfill messaging and practice preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="p-5 border border-[#1e2a28]/14 bg-white/40 space-y-2">
          <h3 className="text-[15px] font-semibold tracking-tight m-0">Messaging hours</h3>
          <p className="text-[11px] text-[#1e2a28]/55 leading-relaxed m-0">
            Messages send between 8:00 AM and 9:00 PM in the patient’s local time zone.
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 border border-[#a3533a]/40 bg-[#a3533a]/[0.08] text-[#a3533a] px-2.5 py-1 text-[11px] font-semibold">
              Quiet hours enforced
            </span>
          </div>
        </section>

        <section className="p-5 border border-[#1e2a28]/14 bg-white/40 space-y-2">
          <h3 className="text-[15px] font-semibold tracking-tight m-0">Patient consent &amp; HIPAA</h3>
          <p className="text-[11px] text-[#1e2a28]/55 leading-relaxed m-0">
            STOP and HELP replies are handled automatically. Outreach remains PHI-free.
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 border border-[#a3533a]/40 bg-[#a3533a]/[0.08] text-[#a3533a] px-2.5 py-1 text-[11px] font-semibold">
              A2P 10DLC &amp; HIPAA compliant
            </span>
          </div>
        </section>

        <section className="p-5 border border-[#1e2a28]/14 bg-white/40 space-y-1">
          <h3 className="text-[15px] font-semibold tracking-tight m-0">Practice details</h3>
          <div className="text-[12px] text-[#1e2a28]/70 pt-2 leading-relaxed">
            Lakeside Dental<br />
            Maple Grove, MN<br />
            4 operatories · 4 providers
          </div>
        </section>
      </div>
    </div>
  );
};
