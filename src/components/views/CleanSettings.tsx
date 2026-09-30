import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
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

export const CleanSettings: React.FC = () => {
  const { practice } = usePractice();
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
