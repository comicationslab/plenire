import React from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { ShieldCheck, Clock, Server, Lock, FileText, CheckCircle2 } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { autoLockMinutes, setAutoLockMinutes, currentUser } = useHIPAA();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#1e2a28]/15">
        <h2 className="text-base font-semibold text-[#1e2a28]">Practice &amp; Security Settings</h2>
        <p className="text-xs text-[#1e2a28]/60">
          Chairfill practice profile, EHR connection, and statutory messaging policies
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Practice Details */}
        <section className="p-4 bg-white/60 border border-[#1e2a28]/15 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-[#1e2a28] uppercase tracking-wider">
              Practice Profile
            </h3>
            <span className="text-[10px] font-bold text-emerald-800 border border-emerald-800/30 px-1.5 py-0.5">
              Synced
            </span>
          </div>
          <div className="text-xs text-[#1e2a28]/80 space-y-1">
            <div className="font-semibold text-[#1e2a28]">Lakeside Dental</div>
            <div>9420 Elm Creek Blvd N, Maple Grove, MN 55369</div>
            <div>Phone: (763) 555-0100</div>
            <div className="text-[#1e2a28]/60 pt-2 border-t border-[#1e2a28]/10">
              Configured: 4 Operatories · 4 Providers · Timezone: America/Chicago
            </div>
          </div>
        </section>

        {/* Messaging Quiet Hours */}
        <section className="p-4 bg-white/60 border border-[#1e2a28]/15 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-[#1e2a28] uppercase tracking-wider">
              Messaging Quiet Hours
            </h3>
            <span className="text-[10px] font-bold text-emerald-800 border border-emerald-800/30 px-1.5 py-0.5">
              Enforced
            </span>
          </div>
          <p className="text-xs text-[#1e2a28]/70 leading-relaxed">
            Statutory TCPA and carrier guidelines require outreach messages to dispatch strictly between{' '}
            <strong>8:00 AM and 9:00 PM</strong> in the patient’s local time zone.
          </p>
          <div className="p-2 bg-[#f4f0e8]/50 border border-[#1e2a28]/10 text-[11px] text-[#1e2a28]/70 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#a3533a]" />
            <span>Off-hours outreach requests are held in queue until 8:00 AM.</span>
          </div>
        </section>

        {/* Inactivity Auto-Lock Settings */}
        <section className="p-4 bg-white/60 border border-[#1e2a28]/15 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-[#1e2a28] uppercase tracking-wider">
              Terminal Auto-Lock Duration
            </h3>
            <span className="text-[10px] font-bold text-[#a3533a] border border-[#a3533a]/30 px-1.5 py-0.5">
              § 164.312(a)(2)(iii)
            </span>
          </div>
          <p className="text-xs text-[#1e2a28]/70">
            Workstations lock automatically when left unattended to prevent unauthorized ePHI access.
          </p>
          <div className="flex items-center gap-2 pt-1">
            {[1, 2, 5, 15].map((mins) => (
              <button
                key={mins}
                onClick={() => setAutoLockMinutes(mins)}
                className={`flex-1 py-1.5 text-xs font-semibold border transition-colors ${
                  autoLockMinutes === mins
                    ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                    : 'bg-white border-[#1e2a28]/20 text-[#1e2a28]/70 hover:bg-[#1e2a28]/5'
                }`}
              >
                {mins} min{mins > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </section>

        {/* Telephony & TCPA A2P 10DLC */}
        <section className="p-4 bg-white/60 border border-[#1e2a28]/15 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-[#1e2a28] uppercase tracking-wider">
              A2P 10DLC Healthcare Campaign
            </h3>
            <span className="text-[10px] font-bold text-emerald-800 border border-emerald-800/30 px-1.5 py-0.5">
              Approved
            </span>
          </div>
          <p className="text-xs text-[#1e2a28]/70 leading-relaxed">
            Registered Healthcare 10DLC Campaign with major US carriers. Automatic keyword responders for{' '}
            <code>STOP</code> (opt-out) and <code>HELP</code> (support).
          </p>
          <div className="text-[10px] text-[#1e2a28]/50 pt-1 border-t border-[#1e2a28]/10 font-mono">
            Campaign ID: A2P-HLTH-LAKESIDE-9420 · Toll-Free Backup Enabled
          </div>
        </section>
      </div>
    </div>
  );
};
