import React, { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';

const DEMO = [
  { email: 'tracy@lakeside.test', label: 'Front desk', who: 'Tracy R.' },
  { email: 'mensah@lakeside.test', label: 'Owner', who: 'Dr. Mensah' },
];

export const Login: React.FC = () => {
  const { session, login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  const go = async (e: string) => {
    setBusy(true);
    setError('');
    try {
      await login(e.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f4f0e8] text-[#1e2a28] p-6">
      <div className="w-full max-w-sm border border-[#1e2a28] p-7 space-y-5">
        <div className="flex items-center gap-2.5">
          <div aria-hidden="true" className="w-8 h-8 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-[12px]">pl</div>
          <h1 className="font-bold text-[20px] tracking-tight m-0">Plenire</h1>
        </div>
        <p className="text-[13px] text-[#1e2a28]/70 m-0">Sign in to your practice.</p>

        <form onSubmit={(e) => { e.preventDefault(); void go(email); }} className="space-y-3">
          <label htmlFor="email" className="block text-[12px] font-semibold">Work email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full h-[38px] px-3 bg-white border border-[#1e2a28]/40 text-sm" />
          {error && <div role="alert" className="text-xs text-[#a3533a] font-semibold">{error}</div>}
          <button type="submit" disabled={busy} className="w-full py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="border-t border-[#1e2a28]/15 pt-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[#a3533a]">Local demo accounts</div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button key={d.email} disabled={busy} onClick={() => void go(d.email)} className="p-2.5 border border-[#1e2a28]/30 text-left hover:bg-[#1e2a28]/5 disabled:opacity-60">
                <span className="block text-xs font-semibold">{d.label}</span>
                <span className="block text-[11px] text-[#1e2a28]/70">{d.who}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#1e2a28]/70 m-0 leading-relaxed">Development sign-in only. Real accounts (password + MFA) arrive with the AWS setup.</p>
        </div>
      </div>
    </main>
  );
};
