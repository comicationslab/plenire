import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAudit, useAuditVerify } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useHIPAA, validatePin } from '../context/HIPAAContext';
import { roleLabel, usePractice } from '../context/PracticeContext';
import { todayLong } from '../lib/format';
import {
  CalendarDays, Eye, EyeOff, LayoutDashboard, ListChecks, Lock, Menu, MessageSquare, RefreshCcw,
  LogOut, Settings as SettingsIcon, ShieldCheck, UserCog, Users, X,
} from 'lucide-react';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/today', label: 'Today', Icon: CalendarDays },
  { path: '/recovery', label: 'Recovery', Icon: RefreshCcw },
  { path: '/messages', label: 'Messages', Icon: MessageSquare },
  { path: '/patients', label: 'Patients', Icon: Users },
  { path: '/waitlist', label: 'Waitlist', Icon: ListChecks },
  { path: '/team', label: 'Team', Icon: UserCog, ownerOnly: true },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
];

/** Full-screen lock. Opaque (not see-through) so patient data is never visible behind it. */
const ScreenLock: React.FC = () => {
  const { hasPin, unlock, setPin } = useHIPAA();
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    if (hasPin) {
      const r = await unlock(pin);
      if (!r.ok) setError(r.message ?? 'Incorrect PIN.');
    } else {
      const problem = validatePin(pin) ?? (pin !== confirm ? 'The two PINs do not match.' : null);
      if (problem) setError(problem);
      else {
        const r = await setPin(pin);
        if (r.ok) await unlock(pin);
        else setError(r.message ?? 'Could not set PIN.');
      }
    }
    setPinValue('');
    setConfirm('');
    setBusy(false);
  };

  const field = 'w-full py-2 px-3 bg-white border border-[#1e2a28]/40 text-center text-sm tracking-widest tabular-nums';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lock-title" className="fixed inset-0 z-50 flex items-center justify-center bg-[#f4f0e8] p-4">
      <div className="w-full max-w-sm border border-[#1e2a28] p-6 text-center">
        <div className="w-12 h-12 rounded-full border border-[#1e2a28] flex items-center justify-center mx-auto mb-3">
          <Lock className="w-5 h-5 text-[#a3533a]" aria-hidden="true" />
        </div>
        <h2 id="lock-title" className="text-lg font-medium">{hasPin ? 'Screen locked' : 'Create a PIN to lock the screen'}</h2>
        <p className="text-xs text-[#1e2a28]/70 mt-1 mb-4">
          {hasPin ? 'Enter your PIN to continue.' : 'Choose 4 to 8 digits. You will use it to unlock.'}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin}
            onChange={(e) => { setPinValue(e.target.value); setError(''); }}
            aria-label={hasPin ? 'PIN' : 'New PIN'} placeholder={hasPin ? 'PIN' : 'New PIN'} className={field}
          />
          {!hasPin && (
            <input
              type="password" inputMode="numeric" autoComplete="off" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              aria-label="Confirm PIN" placeholder="Confirm PIN" className={field}
            />
          )}
          {error && <div role="alert" className="text-xs text-[#a3533a] font-semibold">{error}</div>}
          <button type="submit" disabled={busy} className="w-full py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-80">
            {hasPin ? 'Unlock' : 'Set PIN and lock'}
          </button>
        </form>
      </div>
    </div>
  );
};

export const CleanLayout: React.FC = () => {
  const { isLocked, lock, privacyShield, togglePrivacyShield, auditTrail } = useHIPAA();
  const { practice, user, role } = usePractice();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const isOwner = role === 'owner';
  const [showAudit, setShowAudit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const auditBtn = useRef<HTMLButtonElement>(null);
  const serverLog = useAudit(showAudit && isOwner);
  const verify = useAuditVerify(showAudit && isOwner);

  useEffect(() => {
    if (!showAudit) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAudit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const closeAudit = () => {
    setShowAudit(false);
    auditBtn.current?.focus();
  };

  const titles: Record<string, { title: string; sub: string }> = {
    dashboard: { title: 'Dashboard', sub: `${roleLabel(role)} view · ${practice.name}` },
    today: { title: 'Today', sub: `${todayLong(practice.timezone)} · ${practice.name}` },
    recovery: { title: 'Recovery', sub: role === 'owner' ? 'Openings, offers & estimated revenue recovered' : 'Openings, offers & recovery rate' },
    messages: { title: 'Messages', sub: 'Two-way SMS conversations with patients' },
    patients: { title: 'Patients', sub: 'Patient history, contact details & recovery activity' },
    waitlist: { title: 'Waitlist', sub: 'Everyone ready to take an earlier opening' },
    team: { title: 'Team', sub: 'Invite people and manage who can sign in' },
    settings: { title: 'Settings', sub: 'Messaging, screen lock & practice preferences' },
  };
  const current = titles[pathname.split('/')[1] ?? ''] ?? { title: practice.name, sub: '' };

  return (
    <>
      {/* Everything behind a modal is inert: no keyboard/screen-reader access while locked. */}
      <div inert={isLocked || showAudit} className="flex min-h-screen bg-[#f4f0e8] text-[#1e2a28]">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-[#1e2a28] focus:text-[#f4f0e8] focus:px-3 focus:py-2 text-xs font-semibold">
          Skip to main content
        </a>

        {menuOpen && <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-[#1e2a28]/40 md:hidden" />}

        <aside
          className={`fixed md:static inset-y-0 left-0 w-[248px] flex-shrink-0 bg-[#f4f0e8] border-r border-[#1e2a28]/15 flex flex-col z-30 transform transition-transform duration-200 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="p-7 pb-6">
            <div className="flex items-center gap-2.5">
              <div aria-hidden="true" className="w-7 h-7 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-[11px] tracking-tighter">pl</div>
              <div className="font-bold text-[17px] tracking-tight">Plenire</div>
            </div>
            <p className="text-[12px] text-[#1e2a28]/70 mt-3 leading-relaxed">Patient scheduling &amp; no-show recovery</p>
          </div>

          <nav aria-label="Main" className="px-3 flex-1 space-y-1">
            {NAV.filter((n) => !('ownerOnly' in n) || isOwner).map(({ path, label, Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 min-h-[40px] text-[13px] font-medium transition-colors text-left ${
                    isActive ? 'bg-[#1e2a28] text-[#f4f0e8]' : 'text-[#1e2a28]/80 hover:bg-[#1e2a28]/5 hover:text-[#1e2a28]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
            <div className="pt-4 px-3">
              <NavLink
                to="/book"
                onClick={() => setMenuOpen(false)}
                className="w-full py-2 px-3 border border-[#a3533a]/60 text-[#a3533a] text-xs font-semibold hover:bg-[#a3533a]/10 text-left flex items-center justify-between"
              >
                <span>Book an appointment</span>
                <span aria-hidden="true">↗</span>
              </NavLink>
            </div>
          </nav>

          <div className="border-t border-[#1e2a28]/15 p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div aria-hidden="true" className="w-8 h-8 rounded-full border border-[#1e2a28]/40 flex items-center justify-center font-bold text-[11px]">{user.initials}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold truncate">{user.name}</div>
                <div className="text-[11px] text-[#1e2a28]/70 truncate">{roleLabel(role)} · {practice.name}</div>
              </div>
            </div>
            <button onClick={() => void logout()} className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-[#1e2a28]/30 text-[11px] font-semibold text-[#1e2a28]/80 hover:bg-[#1e2a28]/5">
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-[76px] px-6 md:px-9 flex items-center justify-between gap-4 border-b border-[#1e2a28]/15 bg-[#f4f0e8] sticky top-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                className="md:hidden p-1.5 border border-[#1e2a28]/30"
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>
              <div>
                <h1 className="text-[21px] font-semibold tracking-tight">{current.title}</h1>
                <p className="text-[12px] text-[#1e2a28]/70 mt-0.5 hidden sm:block">{current.sub}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={togglePrivacyShield}
                aria-pressed={privacyShield}
                title="Screen Shield hides patient names, phones and visit details on counter monitors"
                className={`p-1.5 px-2.5 border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  privacyShield ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]' : 'bg-transparent border-[#1e2a28]/30 text-[#1e2a28]/80 hover:border-[#1e2a28]'
                }`}
              >
                {privacyShield ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                <span className="hidden sm:inline">{privacyShield ? 'Shield on' : 'Shield'}</span>
                <span className="sr-only sm:hidden">Screen Shield</span>
              </button>
              <button
                ref={auditBtn}
                onClick={() => setShowAudit(true)}
                className="p-1.5 px-2.5 border border-[#1e2a28]/30 text-[#1e2a28]/80 hover:border-[#1e2a28] flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#a3533a]" aria-hidden="true" />
                <span className="hidden sm:inline">Activity</span>
                <span className="sr-only sm:hidden">Activity log</span>
              </button>
              <button onClick={lock} aria-label="Lock screen" title="Lock screen" className="p-1.5 border border-[#1e2a28]/30 text-[#1e2a28]/80 hover:text-[#1e2a28]">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="flex-1 p-6 md:p-9 max-w-[1180px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {isLocked && <ScreenLock />}

      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="audit-title" className="w-full max-w-lg bg-[#f4f0e8] border border-[#1e2a28] p-5 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e2a28]/15">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#a3533a]" aria-hidden="true" />
                <h2 id="audit-title" className="font-semibold text-sm">Activity log</h2>
              </div>
              <button onClick={closeAudit} aria-label="Close activity log" className="p-1 hover:text-[#a3533a]">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {isOwner && verify.data && (
              <div role="status" className={`mt-3 text-[11px] font-semibold ${verify.data.intact ? 'text-emerald-800' : 'text-[#a3533a]'}`}>
                {verify.data.intact ? 'Tamper check: the log is intact ✔' : `Tamper check FAILED at entry #${verify.data.firstBrokenSeq}`}
              </div>
            )}
            <div className="flex-1 overflow-y-auto my-3 divide-y divide-[#1e2a28]/10 text-xs">
              {isOwner ? (
                serverLog.isLoading ? <div className="py-6 text-center text-[#1e2a28]/70">Loading…</div> :
                serverLog.isError ? <div className="py-6 text-center text-[#a3533a]">Could not load the log.</div> :
                (serverLog.data ?? []).map((e) => (
                  <div key={e.seq} className="py-2 flex items-center justify-between text-[12px]">
                    <span className="tabular-nums text-[#1e2a28]/70">#{e.seq} · {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {e.actorRole}</span>
                    <span className="font-semibold">{e.action}</span>
                  </div>
                ))
              ) : auditTrail.length === 0 ? (
                <div className="py-6 text-center text-[#1e2a28]/70">Activity from this session appears here.</div>
              ) : (
                auditTrail.map((e) => (
                  <div key={e.id} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between text-[#1e2a28]/70 text-[11px] tabular-nums"><span>{e.time} · {e.user}</span><span>{e.action}</span></div>
                    <div className="text-[12px]">{e.details}</div>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-[#1e2a28]/70 m-0 mb-3">
              {isOwner ? 'Practice-wide log, stored on the server. Entries cannot be edited or deleted.' : 'This session only. The owner can see the full practice log.'}
            </p>
            <div className="pt-2 border-t border-[#1e2a28]/15 flex justify-end">
              <button onClick={closeAudit} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
