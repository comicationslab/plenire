import React, { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthShell, ErrorLine, Field, inputCls, primaryBtn } from '../components/ui/Auth';

export const homeFor = (role: string) => (role === 'platform_admin' ? '/admin' : '/dashboard');

export const Login: React.FC = () => {
  const { session, status, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'ready' && session) return <Navigate to={homeFor(session.user.role)} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use the email and password you chose when you accepted your invitation.">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field id="email" label="Work email">
          <input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <ErrorLine message={error} />
        <button type="submit" disabled={busy || !email || !password} className={primaryBtn}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="text-[12px] flex justify-between">
        <Link to="/forgot-password" className="underline font-semibold text-[#a3533a]">Forgot password?</Link>
      </div>
      {import.meta.env.DEV && (
        <p className="text-[11px] text-[#1e2a28]/70 m-0 leading-relaxed border-t border-[#1e2a28]/15 pt-3">
          Development: demo accounts and their password are printed in the terminal where the API started
          (admin@plenire.test, mensah@lakeside.test, tracy@lakeside.test).
        </p>
      )}
    </AuthShell>
  );
};
