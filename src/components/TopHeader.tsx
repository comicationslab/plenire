import React, { useState } from 'react';
import { useHIPAA } from '../context/HIPAAContext';
import { STAFF_USERS } from '../data/initialData';
import { Eye, EyeOff, Lock, ShieldAlert, ExternalLink, ShieldCheck, Clock } from 'lucide-react';
import { BreakGlassModal } from './BreakGlassModal';

interface TopHeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenPatientBooking: () => void;
  onToggleMobileMenu: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentView,
  onNavigate,
  onOpenPatientBooking,
  onToggleMobileMenu,
}) => {
  const {
    currentUser,
    switchUser,
    lockSession,
    secondsRemaining,
    isPrivacyShieldActive,
    togglePrivacyShield,
    isBreakGlassActive,
    breakGlassJustification,
    dismissBreakGlass,
  } = useHIPAA();

  const [isBreakGlassModalOpen, setIsBreakGlassModalOpen] = useState(false);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getViewTitle = () => {
    switch (currentView) {
      case 'today':
        return 'Today Schedule';
      case 'recovery':
        return 'Chair Recovery Engine';
      case 'messages':
        return 'Patient Messages (SMS)';
      case 'patients':
        return 'Patient Registry (CRM)';
      case 'waitlist':
        return 'Priority Waitlist';
      case 'compliance':
        return 'HIPAA Security Center';
      case 'settings':
        return 'Practice & Compliance Settings';
      default:
        return 'Chairfill Clinical Dashboard';
    }
  };

  return (
    <>
      {/* Break-glass banner if elevated */}
      {isBreakGlassActive && (
        <div className="bg-[#a3533a] text-[#f4f0e8] px-4 py-1.5 text-xs flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              EMERGENCY BREAK-GLASS PRIVILEGE ACTIVE — Clinical charts unrestricted. Justification: &quot;{breakGlassJustification}&quot;
            </span>
          </div>
          <button
            onClick={dismissBreakGlass}
            className="px-2.5 py-0.5 bg-white text-[#a3533a] text-xs font-bold hover:bg-white/90 uppercase tracking-wider"
          >
            Relinquish Override
          </button>
        </div>
      )}

      {/* Top Bar adhering to 3-zone contract */}
      <header className="min-h-[64px] border-b border-[#1e2a28]/15 bg-[#f4f0e8]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
        {/* Zone 1: Brand / Active View Wordmark */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 border border-[#1e2a28]/20 hover:bg-[#1e2a28]/5"
            aria-label="Toggle navigation"
          >
            <span className="text-base leading-none">☰</span>
          </button>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1e2a28] truncate">
              {getViewTitle()}
            </h1>
            <p className="text-[11px] text-[#1e2a28]/50 hidden sm:block truncate">
              Lakeside Dental · Open Dental EHR Integrated · HIPAA Rule Enforced
            </p>
          </div>
        </div>

        {/* Zone 2: Fast Navigation & Compliance Status */}
        <div className="hidden lg:flex items-center gap-2">
          <button
            onClick={() => onNavigate('compliance')}
            className={`px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              currentView === 'compliance'
                ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                : 'bg-white/50 text-[#1e2a28]/80 border-[#1e2a28]/15 hover:bg-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#a3533a]" />
            <span>HIPAA Audit Trail & Safeguards</span>
          </button>

          <button
            onClick={onOpenPatientBooking}
            className="px-2.5 py-1 text-xs font-semibold bg-[#a3533a]/10 text-[#a3533a] border border-[#a3533a]/30 hover:bg-[#a3533a]/20 flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Patient Booking Portal</span>
          </button>
        </div>

        {/* Zone 3: Privacy Shield, Role Switcher, Session Timer & Lock */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Privacy Shield Toggle (Reception Desk Mode) */}
          <button
            onClick={togglePrivacyShield}
            className={`px-2.5 py-1.5 text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              isPrivacyShieldActive
                ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                : 'bg-white/60 text-[#1e2a28]/70 border-[#1e2a28]/20 hover:bg-white'
            }`}
            title="Toggle Reception Privacy Shield (§ 164.530(c)) - Masks patient names & treatments on screen"
          >
            {isPrivacyShieldActive ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-[#a3533a]" />
                <span className="hidden sm:inline">Screen Shield: ON</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Screen Shield: OFF</span>
              </>
            )}
          </button>

          {/* Role switcher for testing RBAC */}
          <div className="relative">
            <select
              value={currentUser.id}
              onChange={(e) => switchUser(e.target.value)}
              className="text-xs bg-white/70 border border-[#1e2a28]/20 py-1.5 px-2 text-[#1e2a28] focus:outline-none focus:border-[#1e2a28] font-medium max-w-[140px] sm:max-w-[180px] truncate"
              title="Switch Staff Role to test RBAC & Minimum Necessary Access"
            >
              {STAFF_USERS.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role === 'front_desk' ? 'Front Desk' : user.role === 'hygienist' ? 'Hygienist' : user.role === 'dentist' ? 'Dentist' : 'Compliance'})
                </option>
              ))}
            </select>
          </div>

          {/* Break-Glass Emergency Button */}
          {!isBreakGlassActive && currentUser.role === 'front_desk' && (
            <button
              onClick={() => setIsBreakGlassModalOpen(true)}
              className="px-2 py-1.5 text-xs font-semibold border border-[#a3533a]/40 bg-[#a3533a]/5 text-[#a3533a] hover:bg-[#a3533a]/15 hidden xl:flex items-center gap-1"
              title="Emergency Break-Glass Override (§ 164.312(a)(2)(ii))"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Break Glass</span>
            </button>
          )}

          {/* Inactivity countdown & lock */}
          <div className="flex items-center border border-[#1e2a28]/20 bg-white/60">
            <div
              className="px-2 py-1 text-[11px] font-tabular text-[#1e2a28]/70 flex items-center gap-1 border-r border-[#1e2a28]/15"
              title="Session auto-lock countdown (§ 164.312(a)(2)(iii))"
            >
              <Clock className="w-3 h-3 text-[#1e2a28]/50" />
              <span>{formatTimer(secondsRemaining)}</span>
            </div>
            <button
              onClick={() => lockSession('User clicked lock in header')}
              className="p-1.5 text-[#1e2a28]/70 hover:text-[#1e2a28] hover:bg-[#1e2a28]/5 transition-colors"
              title="Lock terminal immediately (Ctrl+L)"
              aria-label="Lock terminal"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <BreakGlassModal
        isOpen={isBreakGlassModalOpen}
        onClose={() => setIsBreakGlassModalOpen(false)}
      />
    </>
  );
};
