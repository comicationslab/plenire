import React, { useState } from 'react';
import { ApiError } from '../../api/client';
import { useChangePassword } from '../../api/hooks';
import { ErrorLine, inputCls } from './Auth';

/** Change your own password. Every other device is signed out; this one stays. */
export const ChangePasswordCard: React.FC<{ platform?: boolean }> = ({ platform = false }) => {
  const change = useChangePassword(platform);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const mismatch = again.length > 0 && again !== next;

  return (
    <section className="p-5 border border-[#1e2a28]/15 bg-white/40 space-y-2">
      <h3 className="text-[15px] font-semibold tracking-tight m-0">Change password</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDone(false);
          change.mutate({ currentPassword: cur, newPassword: next }, { onSuccess: () => { setDone(true); setCur(''); setNext(''); setAgain(''); } });
        }}
        className="space-y-2"
      >
        <input type="password" autoComplete="current-password" aria-label="Current password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} className={inputCls} />
        <input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password (12+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
        <input type="password" autoComplete="new-password" aria-label="Repeat new password" placeholder="Repeat new password" value={again} onChange={(e) => setAgain(e.target.value)} className={inputCls} />
        <ErrorLine message={mismatch ? 'The two new passwords do not match.' : change.error instanceof ApiError ? change.error.message : ''} />
        {done && <div role="status" className="text-xs font-semibold text-emerald-800">Password changed. Your other devices were signed out.</div>}
        <button type="submit" disabled={change.isPending || !cur || next.length < 12 || next !== again} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Change password</button>
      </form>
    </section>
  );
};
