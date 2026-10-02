import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAdminAdmins, useAdminPractices, useCreatePractice, useInviteAdmin, useOwnerInvite, useUpdatePractice } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { ErrorLine, InviteLinkBox, inputCls } from '../components/ui/Auth';
import { ChangePasswordCard } from '../components/ui/ChangePassword';
import { MetricCard, PageHead, Panel } from '../components/ui/Metric';
import { QueryBoundary } from '../components/ui/QueryBoundary';

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London'];
type LinkResult = { email?: string; ownerEmail?: string; emailSent: boolean; inviteLink?: string };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * The operator console (for you, the Plenire owner). It manages practices and accounts only.
 * It cannot open any clinic's patients, schedule or messages: the database does not allow it.
 */
export const AdminConsole: React.FC = () => {
  const { session, logout } = useAuth();
  const practices = useAdminPractices();
  const admins = useAdminAdmins();
  const create = useCreatePractice();
  const update = useUpdatePractice();
  const reinvite = useOwnerInvite();
  const inviteAdmin = useInviteAdmin();

  const blank = { name: '', phone: '', address: '', timezone: 'America/Chicago', ownerName: '', ownerEmail: '', staffLimit: 25 };
  const [form, setForm] = useState(blank);
  const [adminForm, setAdminForm] = useState({ name: '', email: '' });
  const [result, setResult] = useState<(LinkResult & { for: string }) | null>(null);
  const [error, setError] = useState('');
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong');

  const list = practices.data ?? [];
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: k === 'staffLimit' ? Number(e.target.value) : e.target.value });

  return (
    <div className="min-h-screen bg-[#f4f0e8] text-[#1e2a28]">
      <header className="min-h-[64px] px-6 md:px-9 flex items-center justify-between border-b border-[#1e2a28]/15">
        <div className="flex items-center gap-2.5">
          <div aria-hidden="true" className="w-7 h-7 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-[11px]">pl</div>
          <span className="font-bold text-[17px] tracking-tight">Plenire Platform</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#1e2a28]/70 hidden sm:inline">{session?.user.name}</span>
          <button onClick={() => void logout()} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[#1e2a28]/30 font-semibold"><LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out</button>
        </div>
      </header>

      <main className="p-6 md:p-9 max-w-[1180px] mx-auto space-y-6">
        <PageHead eyebrow="Operator" title="Clinics on Plenire" blurb="Add a clinic, invite its owner, and pause access if needed. You cannot see any clinic's patient data from here." />
        <ErrorLine message={error} />

        <QueryBoundary queries={[practices, admins]}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Clinics" value={list.length} sub="All time" accent />
            <MetricCard label="Active" value={list.filter((p) => p.status === 'active').length} sub="Can sign in" />
            <MetricCard label="Paused" value={list.filter((p) => p.status === 'suspended').length} sub="Suspended" />
            <MetricCard label="People" value={list.reduce((n, p) => n + p.activeStaff, 0)} sub="Active staff accounts" />
          </div>

          <Panel title="Add a clinic">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError('');
                create.mutate({ name: form.name, phone: form.phone, address: form.address || null, timezone: form.timezone, ownerName: form.ownerName, ownerEmail: form.ownerEmail, staffLimit: form.staffLimit }, {
                  onSuccess: (r) => { setResult({ ...r, for: form.name }); setForm(blank); },
                  onError: fail,
                });
              }}
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              {([['name', 'Clinic name', 'text', true], ['phone', 'Clinic phone', 'tel', true], ['address', 'Address (optional)', 'text', false], ['ownerName', "Owner's name", 'text', true], ['ownerEmail', "Owner's email", 'email', true]] as const).map(([k, label, type, req]) => (
                <div key={k}><label htmlFor={`f-${k}`} className="block text-[11px] font-semibold mb-1">{label}</label>
                  <input id={`f-${k}`} type={type} required={req} value={form[k]} onChange={set(k)} className={inputCls} /></div>
              ))}
              <div><label htmlFor="f-tz" className="block text-[11px] font-semibold mb-1">Time zone</label>
                <input id="f-tz" list="zones" required value={form.timezone} onChange={set('timezone')} className={inputCls} />
                <datalist id="zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist></div>
              <div><label htmlFor="f-lim" className="block text-[11px] font-semibold mb-1">Team seats</label>
                <input id="f-lim" type="number" min={1} max={500} value={form.staffLimit} onChange={set('staffLimit')} className={inputCls} /></div>
              <div className="flex items-end"><button type="submit" disabled={create.isPending} className="h-[38px] px-4 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Create clinic &amp; invite owner</button></div>
            </form>
            {result && <div className="mt-3"><InviteLinkBox email={result.ownerEmail ?? result.email} emailSent={result.emailSent} link={result.inviteLink} onClose={() => setResult(null)} /></div>}
          </Panel>

          <Panel title="All clinics" note={`${list.length} total`}>
            {list.length === 0 && <p className="text-[13px] text-[#1e2a28]/70 m-0">No clinics yet. Add your first one above.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-[#1e2a28]/70">
                  {['Clinic', 'Owner', 'Status', 'People', 'Last active', ''].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-[#1e2a28]/10">
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-3"><div className="font-semibold">{p.name}</div><div className="text-[#1e2a28]/70">{p.timezone} · {p.plan}</div></td>
                      <td className="py-2.5 pr-3">{p.ownerEmail ?? '—'}{p.pendingInvites > 0 && <div className="text-[#a3533a] font-semibold">invite pending</div>}</td>
                      <td className="py-2.5 pr-3"><span className={`px-2 py-0.5 border text-[11px] font-semibold uppercase ${p.status === 'active' ? 'border-emerald-800/40 text-emerald-900' : 'border-[#a3533a]/60 text-[#a3533a]'}`}>{p.status}</span></td>
                      <td className="py-2.5 pr-3 tabular-nums">{p.activeStaff} / {p.staffLimit}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{when(p.lastActiveAt)}</td>
                      <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                        {p.pendingInvites > 0 && (
                          <button onClick={() => reinvite.mutate({ id: p.id }, { onSuccess: (r) => setResult({ ...r, for: p.name }), onError: fail })} className="px-2.5 py-1 border border-[#1e2a28]/30 font-semibold">Resend owner invite</button>
                        )}
                        <button
                          onClick={() => {
                            const suspending = p.status === 'active';
                            if (suspending && !window.confirm(`Pause ${p.name}? Everyone there is signed out and cannot sign in until you reactivate.`)) return;
                            update.mutate({ id: p.id, status: suspending ? 'suspended' : 'active' }, { onError: fail });
                          }}
                          className="px-2.5 py-1 border border-[#1e2a28]/30 font-semibold"
                        >{p.status === 'active' ? 'Pause' : 'Reactivate'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Platform admins" note="Can manage clinics, never patient data">
              <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10 mb-3">
                {(admins.data ?? []).map((a) => (
                  <li key={a.id} className="py-2 flex justify-between text-[12px]"><span><b>{a.name}</b> · {a.email}</span><span className="uppercase text-[11px] font-semibold text-[#1e2a28]/70">{a.status}</span></li>
                ))}
              </ul>
              <form onSubmit={(e) => { e.preventDefault(); setError(''); inviteAdmin.mutate(adminForm, { onSuccess: (r) => { setResult({ ...r, email: adminForm.email, for: 'admin' }); setAdminForm({ name: '', email: '' }); }, onError: fail }); }} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div><label htmlFor="an" className="block text-[11px] font-semibold mb-1">Name</label><input id="an" required value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} className={inputCls} /></div>
                <div><label htmlFor="ae" className="block text-[11px] font-semibold mb-1">Email</label><input id="ae" type="email" required value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} className={inputCls} /></div>
                <button type="submit" disabled={inviteAdmin.isPending} className="h-[38px] px-4 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Invite</button>
              </form>
            </Panel>
            <ChangePasswordCard platform />
          </div>
        </QueryBoundary>
      </main>
    </div>
  );
};
