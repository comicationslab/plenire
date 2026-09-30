import React, { useState } from 'react';
import { useHIPAA } from '../context/HIPAAContext';
import { Lock, ShieldCheck, Eye, EyeOff, X } from 'lucide-react';

interface CleanLayoutProps {
  children: React.ReactNode;
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenBooking: () => void;
}

export const CleanLayout: React.FC<CleanLayoutProps> = ({
  children,
  activeView,
  onNavigate,
  onOpenBooking,
}) => {
  const { isLocked, unlock, lock, privacyShield, togglePrivacyShield, auditTrail } = useHIPAA();
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlock(pin)) {
      setPinError(true);
    } else {
      setPin('');
      setPinError(false);
    }
  };

  const navItems = [
    { id: 'today', label: 'Today', icon: '▦' },
    { id: 'recovery', label: 'Recovery', icon: '↗' },
    { id: 'messages', label: 'Messages', icon: '✉' },
    { id: 'patients', label: 'Patients', icon: '◎' },
    { id: 'waitlist', label: 'Waitlist', icon: '☷' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  const getTitle = () => {
    switch (activeView) {
      case 'today':
        return { title: 'Today', sub: 'Tuesday, June 30 · Lakeside Dental' };
      case 'recovery':
        return { title: 'Recovery', sub: 'Openings, offers & estimated revenue recovered' };
      case 'messages':
        return { title: 'Messages', sub: 'Two-way SMS conversations with patients' };
      case 'patients':
        return { title: 'Patients', sub: 'CRM · patient history, contact details & recovery activity' };
      case 'waitlist':
        return { title: 'Waitlist', sub: 'Everyone ready to take an earlier opening' };
      case 'settings':
        return { title: 'Settings', sub: 'Messaging, compliance & practice preferences' };
      default:
        return { title: 'Lakeside Dental', sub: 'Open Dental EHR' };
    }
  };

  const currentInfo = getTitle();

  return (
    <div className="flex min-h-screen bg-[#f4f0e8] text-[#1e2a28]">
      {/* Workstation Auto-Lock Modal */}
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#f4f0e8] border border-[#1e2a28] p-6 shadow-xl text-center">
            <div className="w-12 h-12 rounded-full border border-[#1e2a28] flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 text-[#a3533a]" />
            </div>
            <h2 className="text-lg font-medium text-[#1e2a28]">Workstation Locked</h2>
            <p className="text-xs text-[#1e2a28]/60 mt-1 mb-4">
              HIPAA Privacy Safeguard (§ 164.312) · Enter staff PIN
            </p>
            <form onSubmit={handleUnlock} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setPinError(false);
                }}
                placeholder="Enter PIN (Default: 1234)"
                className="w-full py-2 px-3 bg-white border border-[#1e2a28]/25 text-center font-mono text-sm tracking-widest focus:outline-none focus:border-[#1e2a28]"
              />
              {pinError && (
                <div className="text-xs text-[#a3533a]">Incorrect PIN (try 1234)</div>
              )}
              <button
                type="submit"
                className="w-full py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
              >
                Unlock Workstation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#f4f0e8] border border-[#1e2a28] p-5 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e2a28]/15">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#a3533a]" />
                <h3 className="font-semibold text-sm">HIPAA Audit Trail (§ 164.312)</h3>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="p-1 hover:text-[#a3533a]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto my-3 divide-y divide-[#1e2a28]/10 text-xs">
              {auditTrail.length === 0 ? (
                <div className="py-6 text-center text-[#1e2a28]/50">
                  Audit events recorded automatically as staff interacts.
                </div>
              ) : (
                auditTrail.map((entry) => (
                  <div key={entry.id} className="py-2 space-y-0.5 font-mono">
                    <div className="flex items-center justify-between text-[#1e2a28]/50 text-[10px]">
                      <span>{entry.time}</span>
                      <span>{entry.action}</span>
                    </div>
                    <div className="font-sans text-[11px] text-[#1e2a28]">{entry.details}</div>
                  </div>
                ))
              )}
            </div>
            <div className="pt-2 border-t border-[#1e2a28]/15 flex justify-end">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Exact original minimal aesthetic */}
      <aside
        className={`fixed md:static inset-y-0 left-0 w-[248px] flex-shrink-0 bg-[#f4f0e8] border-r border-[#1e2a28]/15 flex flex-col z-30 transform transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-7 pb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-[11px] tracking-tighter">
              cf
            </div>
            <div className="font-bold text-[17px] tracking-tight text-[#1e2a28]">Chairfill</div>
          </div>
          <p className="text-[11px] text-[#1e2a28]/60 mt-3 leading-relaxed">
            Scheduling &amp; fill for Open Dental
          </p>
        </div>

        <nav className="px-3 flex-1 space-y-1">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 min-h-[40px] text-[13px] font-medium transition-colors text-left ${
                  active
                    ? 'bg-[#1e2a28] text-[#f4f0e8]'
                    : 'text-[#1e2a28]/70 hover:bg-[#1e2a28]/5 hover:text-[#1e2a28]'
                }`}
              >
                <span className="w-4 text-center font-normal">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 px-3">
            <button
              onClick={() => {
                onOpenBooking();
                setMobileMenuOpen(false);
              }}
              className="w-full py-2 px-3 border border-[#a3533a]/40 text-[#a3533a] text-xs font-semibold hover:bg-[#a3533a]/10 text-left flex items-center justify-between"
            >
              <span>Patient Booking</span>
              <span>↗</span>
            </button>
          </div>
        </nav>

        {/* User Card */}
        <div className="border-t border-[#1e2a28]/15 p-5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-[10px] bg-transparent">
            TR
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-[#1e2a28] truncate">Tracy R.</div>
            <div className="text-[10px] text-[#1e2a28]/55 truncate">Front desk · Lakeside Dental</div>
          </div>
        </div>
      </aside>

      {/* Main shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="min-h-[76px] px-6 md:px-9 flex items-center justify-between gap-4 border-b border-[#1e2a28]/15 bg-[#f4f0e8] sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 border border-[#1e2a28]/20"
            >
              ☰
            </button>
            <div>
              <h1 className="text-[21px] font-semibold tracking-tight text-[#1e2a28]">
                {currentInfo.title}
              </h1>
              <p className="text-[12px] text-[#1e2a28]/60 mt-0.5 hidden sm:block">
                {currentInfo.sub}
              </p>
            </div>
          </div>

          {/* Discreet HIPAA Controls */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={togglePrivacyShield}
              className={`p-1.5 px-2.5 border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                privacyShield
                  ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                  : 'bg-transparent border-[#1e2a28]/20 text-[#1e2a28]/70 hover:border-[#1e2a28]'
              }`}
              title="Screen Shield masks patient names on counter monitors"
            >
              {privacyShield ? <EyeOff className="w-3.5 h-3.5 text-[#a3533a]" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{privacyShield ? 'Shield ON' : 'Shield'}</span>
            </button>

            <button
              onClick={() => setShowAuditModal(true)}
              className="p-1.5 px-2.5 border border-[#1e2a28]/20 text-[#1e2a28]/70 hover:border-[#1e2a28] flex items-center gap-1"
              title="Audit trail"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#a3533a]" />
              <span className="hidden sm:inline">Audit</span>
            </button>

            <button
              onClick={lock}
              className="p-1.5 border border-[#1e2a28]/20 text-[#1e2a28]/70 hover:text-[#1e2a28]"
              title="Lock terminal"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 p-6 md:p-9 max-w-[1180px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
