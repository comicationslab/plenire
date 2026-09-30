import React, { useState } from 'react';
import { useHIPAA } from '../context/HIPAAContext';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

interface BreakGlassModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BreakGlassModal: React.FC<BreakGlassModalProps> = ({ isOpen, onClose }) => {
  const { triggerBreakGlass, currentUser } = useHIPAA();
  const [justification, setJustification] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (justification.trim().length < 8) {
      setError(true);
      return;
    }
    triggerBreakGlass(justification.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#f4f0e8] border-2 border-[#a3533a] p-6 shadow-2xl">
        <div className="flex items-start justify-between pb-3 border-b border-[#a3533a]/25">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-[#a3533a] bg-[#a3533a]/10 text-[#a3533a]">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-[#1e2a28] flex items-center gap-2">
                Emergency Break-Glass Access
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-[#a3533a] text-[#a3533a]">
                  HIPAA § 164.312
                </span>
              </h2>
              <p className="text-xs text-[#1e2a28]/60">Elevated ePHI privilege override</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#1e2a28]/60 hover:text-[#1e2a28] p-1"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4 space-y-3">
          <div className="p-3 bg-[#a3533a]/10 border-l-4 border-[#a3533a] text-xs text-[#1e2a28]/80 leading-relaxed">
            <div className="font-semibold text-[#a3533a] flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-4 h-4" />
              Statutory Notice: All Emergency Overrides Are Indelibly Audited
            </div>
            Emergency access permits staff to view restricted clinical charts, medical histories, and diagnostic notes.
            Every break-glass action creates an indelible, tamper-evident audit record transmitted to the Privacy Officer.
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1e2a28] mb-1.5 uppercase tracking-wide">
              Clinical Justification (Required)
            </label>
            <textarea
              value={justification}
              onChange={(e) => {
                setJustification(e.target.value);
                setError(false);
              }}
              rows={3}
              placeholder="e.g., Unconscious emergency trauma walk-in; dentist requires immediate antibiotic allergy history."
              className="w-full p-2.5 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28] focus:outline-none focus:border-[#a3533a]"
            />
            {error && (
              <p className="text-xs text-[#a3533a] mt-1">
                Please enter a detailed clinical justification (minimum 8 characters).
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#1e2a28]/60 bg-white/50 p-2.5 border border-[#1e2a28]/10">
            <span>Authorizing User: <strong>{currentUser.name}</strong></span>
            <span>Role: <strong>{currentUser.title}</strong></span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-3 border border-[#1e2a28]/25 text-xs font-semibold hover:bg-white/80"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 px-3 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 flex items-center justify-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4" />
            Confirm Emergency Override
          </button>
        </div>
      </div>
    </div>
  );
};
