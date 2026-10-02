import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { inviteInfoSchema, sessionSchema } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { AuthShell, ErrorLine, Field, inputCls, primaryBtn } from '../components/ui/Auth';
import { homeFor } from './Login';

/** Where people land from an invitation or reset email, to choose their OWN password. */
export const AcceptInvite: React.FC = () => {
  const { pathname } = useLocation();
  const isReset = pathname.startsWith('/reset-password');
  const { adopt, session } = useAuth();
  const [params] = useSearchParams();
  // Keep the token in memory and remove it from the address bar so it isn't left in history or shared by accident.
  const [token] = useState(() => {
    const t = params.get('token') ?? '';
    if (t && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    return t;
  });

  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api('GET', `/auth/invitations/${encodeURIComponent(token)}`, inviteInfoSchema), enabled: Boolean(token), retry: false });
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const submit = useMutation({
    mutationFn: () => api('POST', isReset ? '/auth/reset' : '/auth/accept-invite', sessionSchema, { token, password, ...(name && name !== info.data?.name ? { name } : {}) }),
    onSuccess: (s) => adopt(s),
  });

  if (session && submit.isSuccess) return <Navigate to={homeFor(session.user.role)} replace />;

  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 12 && password === confirm && !submit.isPending;

  if (!token || info.isError) {
    return (
      <AuthShell title="This link isn't working" subtitle="It may have expired, or already been used. Links work once.">
        <p className="text-[13px] m-0">{isReset ? 'Request a new reset link and try again.' : 'Ask the person who invited you to send a new invitation.'}</p>
        <Link to={isReset ? '/forgot-password' : '/login'} className="text-[12px] underline font-semibold text-[#a3533a]">{isReset ? 'Get a new reset link' : 'Go to sign in'}</Link>
      </AuthShell>
    );
  }
  if (info.isPending) return <AuthShell title="One moment…"><p role="status" className="text-[13px] m-0">Checking your link…</p></AuthShell>;

  return (
    <AuthShell
      title={isReset ? 'Choose a new password' : `Welcome${info.data.name ? `, ${info.data.name.split(' ')[0]}` : ''}`}
      subtitle={isReset ? info.data.email : `Create your password to join ${info.data.practiceName ?? 'Plenire'}. Only you will know it.`}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) submit.mutate(); }} className="space-y-3">
        {!isReset && (
          <Field id="name" label="Your name">
            <input id="name" value={name ?? info.data.name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputCls} />
          </Field>
        )}
        <Field id="pw" label="Password" hint="At least 12 characters. A few random words works well, e.g. Orange-Falcon-Lantern-27.">
          <input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <Field id="pw2" label="Type it again">
          <input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </Field>
        <ErrorLine message={tooShort ? 'Use at least 12 characters.' : mismatch ? 'The two passwords do not match.' : submit.error instanceof ApiError ? submit.error.message : ''} />
        <button type="submit" disabled={!canSubmit} className={primaryBtn}>{submit.isPending ? 'Saving…' : isReset ? 'Save new password' : 'Create password and sign in'}</button>
      </form>
    </AuthShell>
  );
};
