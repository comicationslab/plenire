import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { ApiError } from '../../api/client';
import { useAddProvider, useMe, useProviders, useSavePracticeSettings, useUpdateProvider } from '../../api/hooks';
import { ChangePasswordCard } from '../ui/ChangePassword';
import { PageHead } from '../ui/Metric';

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center border border-[#a3533a]/60 bg-[#a3533a]/[0.08] text-[#a3533a] px-2.5 py-1 text-[12px] font-semibold">{children}</span>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="p-5 border border-[#1e2a28]/15 bg-white/40 space-y-2">
    <h3 className="text-[15px] font-semibold tracking-tight m-0">{title}</h3>
    {children}
  </section>
);

const inputCls = 'w-full h-[35px] px-3 bg-white border border-[#1e2a28]/30 text-xs tabular-nums';

const ScreenLockCard: React.FC = () => {
  const { hasPin, setPin, idleMinutes, setIdleMinutes } = useHIPAA();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await setPin(next, hasPin ? current : undefined);
    setStatus({ ok: r.ok, text: r.ok ? (hasPin ? 'PIN changed.' : 'PIN set. Auto-lock is now on.') : (r.message ?? 'Could not save.') });
    if (r.ok) { setCurrent(''); setNext(''); }
  };

  return (
    <Card title="Screen lock">
      <p className="text-[12px] text-[#1e2a28]/70 leading-relaxed m-0">
        {hasPin ? 'The screen locks after the time below with no activity.' : 'Set a PIN to turn on auto-lock for shared computers.'}
      </p>
      <form onSubmit={save} className="space-y-2 pt-1">
        {hasPin && (
          <input type="password" inputMode="numeric" autoComplete="off" aria-label="Current PIN" placeholder="Current PIN" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        )}
        <input type="password" inputMode="numeric" autoComplete="off" aria-label={hasPin ? 'New PIN' : 'PIN'} placeholder={hasPin ? 'New PIN (4–8 digits)' : 'PIN (4–8 digits)'} value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
        <button type="submit" className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold">{hasPin ? 'Change PIN' : 'Set PIN'}</button>
        {status && <div role="status" className={`text-xs font-semibold ${status.ok ? 'text-emerald-800' : 'text-[#a3533a]'}`}>{status.text}</div>}
      </form>
      <div className="pt-2">
        <label htmlFor="idle" className="block text-[12px] font-semibold mb-1">Lock after</label>
        <select id="idle" value={idleMinutes} onChange={(e) => setIdleMinutes(Number(e.target.value))} className={inputCls}>
          {[1, 5, 10, 15].map((m) => <option key={m} value={m}>{m} minute{m > 1 ? 's' : ''} of inactivity</option>)}
        </select>
      </div>
    </Card>
  );
};

const ProvidersCard: React.FC = () => {
  const providers = useProviders();
  const add = useAddProvider();
  const update = useUpdateProvider();
  const [f, setF] = useState({ name: '', initials: '', chair: '', title: '' });
  const [err, setErr] = useState('');
  const fail = (e: unknown) => setErr(e instanceof ApiError ? e.message : 'Something went wrong');
  return (
    <Card title="Providers & chairs">
      <p className="text-[12px] text-[#1e2a28]/70 leading-relaxed m-0">Everyone who sees patients. Each needs a chair or room to appear on the schedule.</p>
      <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10">
        {(providers.data ?? []).map((p) => (
          <li key={p.id} className="py-1.5 flex items-center justify-between text-[12px]">
            <span><b>{p.name}</b> <span className="text-[#1e2a28]/70">· {p.chair ?? 'no chair'}{p.title ? ` · ${p.title}` : ''}</span></span>
            <button onClick={() => { if (window.confirm(`Remove ${p.name} from the schedule? Past visits are kept.`)) update.mutate({ id: p.id, active: false }, { onError: fail }); }} className="text-[11px] underline font-semibold text-[#a3533a]">Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); setErr(''); add.mutate({ name: f.name, initials: f.initials || f.name.split(' ').map((w) => w[0]).join('').slice(0, 3), chair: f.chair || null, title: f.title || null }, { onSuccess: () => setF({ name: '', initials: '', chair: '', title: '' }), onError: fail }); }} className="grid grid-cols-2 gap-2 pt-2">
        <input aria-label="Provider name" placeholder="Name (e.g. Dr. Lee)" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
        <input aria-label="Chair or room" placeholder="Chair (e.g. Op 2)" required value={f.chair} onChange={(e) => setF({ ...f, chair: e.target.value })} className={inputCls} />
        <input aria-label="Title" placeholder="Title (optional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} />
        <button type="submit" disabled={add.isPending} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Add provider</button>
      </form>
      {err && <div role="alert" className="text-xs text-[#a3533a] font-semibold">{err}</div>}
    </Card>
  );
};

const REMINDER_CHOICES = [48, 24, 2];

/** Owner-only: the Google review link in thank-you texts, and when appointment reminders go out. */
const PatientTextsCard: React.FC = () => {
  const me = useMe();
  const save = useSavePracticeSettings();
  const saved = me.data?.practice;
  const [url, setUrl] = useState<string | null>(null);
  const [hours, setHours] = useState<number[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const curUrl = url ?? saved?.googleReviewUrl ?? '';
  const curHours = hours ?? saved?.reminderHours ?? [24, 2];
  const toggle = (h: number) => setHours(curHours.includes(h) ? curHours.filter((x) => x !== h) : [...curHours, h]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    save.mutate({ googleReviewUrl: curUrl.trim() || null, reminderHours: curHours }, {
      onSuccess: () => setMsg({ ok: true, text: 'Saved.' }),
      onError: (err) => setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save' }),
    });
  };
  return (
    <Card title="Patient texts">
      <p className="text-[12px] text-[#1e2a28]/70 leading-relaxed m-0">
        Sent automatically to patients who agreed to texts: a confirmation when they book, reminders before the visit, a follow-up confirmation, and a thank-you with your review link when you press Seen.
      </p>
      <form onSubmit={submit} className="space-y-2 pt-1">
        <label className="block text-[12px] font-semibold" htmlFor="review-url">Google review link</label>
        <input id="review-url" type="url" placeholder="https://g.page/r/…/review" value={curUrl} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
        {!curUrl.trim() && <p className="text-[11px] text-[#a3533a] m-0">No link yet: thank-you texts will go out without a review request.</p>}
        <div className="text-[12px] font-semibold pt-1">Send a reminder</div>
        <div className="flex gap-4 text-[12px]">
          {REMINDER_CHOICES.map((h) => (
            <label key={h} className="flex items-center gap-1.5">
              <input type="checkbox" checked={curHours.includes(h)} onChange={() => toggle(h)} className="accent-[#1e2a28]" />
              {h} hours before
            </label>
          ))}
        </div>
        <p className="text-[11px] text-[#1e2a28]/70 m-0">Reminders are only sent between 8:00 AM and 9:00 PM clinic time.</p>
        <button type="submit" disabled={save.isPending} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60">Save</button>
        {msg && <div role={msg.ok ? 'status' : 'alert'} className={`text-xs font-semibold ${msg.ok ? 'text-emerald-800' : 'text-[#a3533a]'}`}>{msg.text}</div>}
      </form>
    </Card>
  );
};

export const CleanSettings: React.FC = () => {
  const { practice, role } = usePractice();
  const rooms = practice.providers.filter((p) => p.op).length;

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Workspace" title="Settings" blurb="Messaging, screen lock and practice preferences." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Messaging hours">
          <p className="text-[12px] text-[#1e2a28]/70 leading-relaxed m-0">
            Plan: messages go out between 8:00 AM and 9:00 PM in the patient’s local time.
          </p>
          <div className="pt-2"><Pill>Applies once text messaging is connected</Pill></div>
        </Card>

        <Card title="Patient consent & privacy">
          <p className="text-[12px] text-[#1e2a28]/70 leading-relaxed m-0">
            Consent is recorded per patient. STOP and HELP replies are handled. Staff are warned before a text that mentions health details is sent.
          </p>
          <div className="pt-2"><Pill>Compliance review pending</Pill></div>
        </Card>

        <ScreenLockCard />
        <ChangePasswordCard />
        {role === 'owner' && <PatientTextsCard />}
        {role === 'owner' && <ProvidersCard />}

        <Card title="Practice details">
          <div className="text-[13px] text-[#1e2a28]/80 pt-1 leading-relaxed">
            {practice.name}<br />
            {practice.address}<br />
            {practice.phone}<br />
            {rooms} operatories · {rooms} providers
          </div>
        </Card>
      </div>
    </div>
  );
};
