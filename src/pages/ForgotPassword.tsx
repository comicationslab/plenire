import React, { useState } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { forgotSchema } from '../api/schemas';
import { AuthShell, ErrorLine, Field, inputCls, primaryBtn } from '../components/ui/Auth';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const send = useMutation({ mutationFn: () => api('POST', '/auth/forgot', forgotSchema, { email: email.trim() }) });

  return (
    <AuthShell title="Reset your password" subtitle="Enter your work email. If it matches an account, we'll send a link to choose a new password.">
      {send.isSuccess ? (
        <div className="space-y-3 text-[13px]" role="status">
          <p className="m-0">If that email has a Plenire account, a reset link is on its way. It works once and expires in 1 hour.</p>
          {send.data.devLink && (
            <p className="m-0 text-[12px] p-2 border border-[#a3533a]/50 bg-[#a3533a]/[0.06]">
              Development: <a className="underline font-semibold" href={send.data.devLink}>open the reset link</a>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-3">
          <Field id="email" label="Work email">
            <input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <ErrorLine message={send.error instanceof ApiError ? send.error.message : ''} />
          <button type="submit" disabled={send.isPending || !email} className={primaryBtn}>{send.isPending ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <Link to="/login" className="text-[12px] underline font-semibold text-[#a3533a]">Back to sign in</Link>
    </AuthShell>
  );
};
