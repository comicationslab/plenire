import React, { useState } from 'react';
import { useHIPAA } from '../context/HIPAAContext';
import { Lock, ShieldCheck, AlertCircle, KeyRound } from 'lucide-react';

export const LockScreenModal: React.FC = () => {
  const { isLocked, currentUser, unlockSession } = useHIPAA();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isLocked) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = unlockSession(pin);
    if (!success) {
      setError(true);
    } else {
      setPin('');
      setError(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#f4f0e8] border border-[#1e2a28] p-8 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#1e2a28]/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-sm bg-white/60">
              cf
            </div>
            <div>
              <h2 className="font-semibold text-lg text-[#1e2a28]">Workstation Locked</h2>
              <p className="text-xs text-[#1e2a28]/60">Lakeside Dental Clinical Terminal</p>
            </div>
          </div>
          <div className="p-2 border border-[#a3533a]/30 bg-[#a3533a]/10 text-[#a3533a]">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <div className="my-6 space-y-3">
          <div className="p-3 bg-white/70 border border-[#1e2a28]/15 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border border-[#1e2a28]/30 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8]">
              {currentUser.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-[#1e2a28]">{currentUser.name}</div>
              <div className="text-xs text-[#1e2a28]/60 truncate">{currentUser.title}</div>
            </div>
          </div>

          <div className="text-xs text-[#1e2a28]/70 leading-relaxed bg-[#a3533a]/5 border-l-2 border-[#a3533a] p-3">
            <span className="font-semibold text-[#a3533a] block mb-1">HIPAA Security Rule § 164.312(a)(2)(iii)</span>
            Session locked to prevent unauthorized ePHI disclosure at unattended clinical terminals. Enter PIN to resume.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1e2a28]/70 mb-1.5 uppercase tracking-wider">
              Staff Security PIN / Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(false);
                }}
                autoFocus
                placeholder="Enter PIN (Default: 1234)"
                className="w-full px-3 py-2.5 bg-white border border-[#1e2a28]/25 text-[#1e2a28] text-sm focus:outline-none focus:border-[#1e2a28] font-tabular tracking-widest"
              />
              <KeyRound className="w-4 h-4 text-[#1e2a28]/40 absolute right-3 top-3 pointer-events-none" />
            </div>
            {error && (
              <p className="text-xs text-[#a3533a] mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Invalid PIN. Enter default staff PIN: <strong className="underline ml-1">1234</strong>
              </p>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-[#1e2a28] text-[#f4f0e8] text-sm font-semibold hover:bg-[#1e2a28]/90 transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              Unlock Session
            </button>
            <button
              type="button"
              onClick={() => {
                setPin('1234');
                unlockSession('1234');
              }}
              className="py-2.5 px-3 border border-[#1e2a28]/20 bg-white/60 text-xs font-semibold text-[#1e2a28]/80 hover:bg-white"
              title="Quick demo bypass"
            >
              Demo Auto-Fill (1234)
            </button>
          </div>
        </form>

        <div className="mt-6 pt-3 border-t border-[#1e2a28]/10 text-center">
          <p className="text-[11px] text-[#1e2a28]/50">
            Emergency lock or lost credential? Contact HIPAA Privacy Officer at extension 404.
          </p>
        </div>
      </div>
    </div>
  );
};
