import React, { useState } from 'react';
import { ApiError } from '../api/client';
import { useInviteStaff, useResendInvite, useStaff, useUpdateStaff } from '../api/hooks';
import { usePractice } from '../context/PracticeContext';
import { ErrorLine, InviteLinkBox, inputCls } from '../components/ui/Auth';
import { PageHead, Panel } from '../components/ui/Metric';
import { QueryBoundary } from '../components/ui/QueryBoundary';

const ROLES = [
  { id: 'front_desk', label: 'Front desk' },
  { id: 'hygienist', label: 'Hygienist' },
  { id: 'dentist', label: 'Dentist' },
  { id: 'owner', label: 'Owner' },
] as const;
type RoleId = (typeof ROLES)[number]['id'];

const STATUS_STYLE = { active: 'border-emerald-800/40 text-emerald-900', invited: 'border-[#a3533a]/60 text-[#a3533a]', disabled: 'border-[#1e2a28]/30 text-[#1e2a28]/70' } as const;

/** Owners add and manage their own people. Each person chooses their own password from an emailed link. */
export const Team: React.FC = () => {
  const { user } = usePractice();
  const staff = useStaff(true);
  const invite = useInviteStaff();
  const resend = useResendInvite();
  const update = useUpdateStaff();
  const [form, setForm] = useState({ name: '', email: '', role: 'front_desk' as RoleId });
  const [result, setResult] = useState<{ email?: string; emailSent: boolean; inviteLink?: string } | null>(null);
  const [error, setError] = useState('');
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    invite.mutate(form, {
      onSuccess: (r) => { setResult({ email: form.email, emailSent: r.emailSent, inviteLink: r.inviteLink }); setForm({ name: '', email: '', role: 'front_desk' }); },
      onError: fail,
    });
  };

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Team" title="Who can sign in" blurb="Invite people by email. They choose their own password. Turn someone off the moment they leave." />

      <Panel title="Invite a team member">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_160px_auto] gap-2 items-end">
          <div><label htmlFor="tn" className="block text-[11px] font-semibold mb-1">Name</label><input id="tn" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
          <div><label htmlFor="te" className="block text-[11px] font-semibold mb-1">Email</label><input id="te" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
          <div><label htmlFor="tr" className="block text-[11px] font-semibold mb-1">Role</label>
            <select id="tr" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleId })} className={inputCls}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
          <button type="submit" disabled={invite.isPending} className="h-[38px] px-4 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Send invite</button>
        </form>
        <div className="mt-3 space-y-2">
          <ErrorLine message={error} />
          {result && <InviteLinkBox {...result} onClose={() => setResult(null)} />}
        </div>
      </Panel>

      <QueryBoundary queries={[staff]}>
        <Panel title="Your team" note={`${(staff.data ?? []).filter((s) => s.status !== 'disabled').length} people`}>
          <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10">
            {(staff.data ?? []).map((s) => {
              const me = s.id === user.id;
              return (
                <li key={s.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{s.name}{me && <span className="ml-2 text-[11px] text-[#1e2a28]/70">(you)</span>}</div>
                    <div className="text-[12px] text-[#1e2a28]/70 truncate">{s.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${s.id}`}>Role for {s.name}</label>
                    <select id={`role-${s.id}`} value={s.role} disabled={me || s.status === 'disabled'} onChange={(e) => update.mutate({ id: s.id, role: e.target.value as RoleId }, { onError: fail })} className="h-[30px] px-2 bg-white border border-[#1e2a28]/30 text-xs">
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <span className={`px-2 py-0.5 border text-[11px] font-semibold uppercase ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                    {s.status === 'invited' && (
                      <button onClick={() => resend.mutate(s.id, { onSuccess: (r) => setResult({ email: s.email, emailSent: r.emailSent, inviteLink: r.inviteLink }), onError: fail })} className="px-2.5 py-1 border border-[#1e2a28]/30 text-xs font-semibold">Resend invite</button>
                    )}
                    {!me && (
                      <button onClick={() => update.mutate({ id: s.id, active: s.status === 'disabled' }, { onError: fail })} className="px-2.5 py-1 border border-[#1e2a28]/30 text-xs font-semibold">
                        {s.status === 'disabled' ? 'Turn on' : 'Turn off'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </QueryBoundary>
    </div>
  );
};
