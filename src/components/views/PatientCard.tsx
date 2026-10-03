import React, { useState } from 'react';
import { ApiError } from '../../api/client';
import { usePatient, useUpdatePatient } from '../../api/hooks';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { toE164 } from '../../lib/format';

const inputCls = 'w-full h-[35px] px-3 bg-white border border-[#1e2a28]/30 text-xs';
const when = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }) : '—');

/**
 * One patient's card: contact details, texting status and visit history. Anyone on the team can open it.
 * Owners and front desk can edit it, but every change needs their own password (checked on the server).
 */
export const PatientCard: React.FC<{ patientId: string; onClose: () => void; canEdit: boolean }> = ({ patientId, onClose, canEdit }) => {
  const { practice } = usePractice();
  const { maskName, maskPhone, maskEmail, maskTreatment, privacyShield } = useHIPAA();
  const q = usePatient(patientId);
  const update = useUpdatePatient();
  const p = q.data;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const startEdit = () => {
    if (!p) return;
    setForm({ name: p.name, phone: p.phone ?? '', email: p.email ?? '', notes: p.notes ?? '' });
    setPassword(''); setErr(''); setNote(''); setEditing(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p) return;
    setErr('');
    const phone = form.phone.trim() ? toE164(form.phone) : null;
    update.mutate({ id: p.id, password, name: form.name.trim(), phone, email: form.email.trim() || null, notes: form.notes.trim() || null }, {
      onSuccess: (r) => {
        setEditing(false); setPassword('');
        setNote(!r.changed.length ? 'Nothing changed.' : r.consentReset ? 'Saved. The phone number changed, so texting is off until the patient agrees to texts for the new number.' : 'Saved.');
      },
      onError: (x) => setErr(x instanceof ApiError ? x.message : 'Something went wrong'),
    });
  };

  const textStatus = !p ? '' : p.optedOutAt ? 'Opted out (replied STOP)' : p.smsConsent ? `Agreed to texts · ${when(p.smsConsentAt, practice.timezone)}` : 'No texting consent';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1e2a28]/30 p-4" role="dialog" aria-modal="true" aria-label="Patient card">
      <div className="w-full max-w-[470px] max-h-[90vh] overflow-y-auto bg-[#f4f0e8] border border-[#1e2a28] p-5 text-xs space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[19px] font-medium tracking-tight m-0">{p ? maskName(p.name) : 'Patient'}</h3>
            <p className="text-[11px] text-[#1e2a28]/70 mt-1 mb-0">{p ? `${p.newPatient ? 'New patient' : 'Returning patient'}${p.walkIn ? ' · walk-in' : ''}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 border border-[#1e2a28]/20 flex items-center justify-center text-sm">×</button>
        </div>

        {q.isLoading && <p className="m-0 text-[#1e2a28]/70">Loading…</p>}
        {q.isError && <p role="alert" className="m-0 text-[#a3533a] font-semibold">Could not open this patient.</p>}

        {p && !editing && (
          <>
            <dl className="grid grid-cols-[96px_1fr] gap-y-2 m-0">
              <dt className="text-[#1e2a28]/70">Phone</dt><dd className="m-0 font-semibold tabular-nums">{p.phone ? maskPhone(p.phone) : '—'}</dd>
              <dt className="text-[#1e2a28]/70">Email</dt><dd className="m-0 font-semibold break-all">{p.email ? maskEmail(p.email) : '—'}</dd>
              <dt className="text-[#1e2a28]/70">Texting</dt><dd className="m-0 font-semibold">{textStatus}</dd>
              <dt className="text-[#1e2a28]/70">Notes</dt><dd className="m-0 whitespace-pre-wrap">{p.notes ? (privacyShield ? 'Hidden by privacy shield' : p.notes) : '—'}</dd>
              {p.updatedAt && (<><dt className="text-[#1e2a28]/70">Last edited</dt><dd className="m-0">{when(p.updatedAt, practice.timezone)}</dd></>)}
            </dl>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#1e2a28]/70 mb-1.5">Visits</div>
              {p.appointments.length === 0 && <p className="m-0 text-[#1e2a28]/70">No visits yet.</p>}
              <ul className="m-0 p-0 list-none divide-y divide-[#1e2a28]/10 border border-[#1e2a28]/14 bg-white/40">
                {p.appointments.map((a) => (
                  <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <b className="block font-semibold truncate">{maskTreatment(a.treatment)}</b>
                      <span className="text-[11px] text-[#1e2a28]/70">{when(a.startsAt, practice.timezone)} · {a.providerName}</span>
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 border border-[#1e2a28]/20 text-[#1e2a28]/70 shrink-0 capitalize">{a.status === 'noshow' ? 'No-show' : a.status}</span>
                  </li>
                ))}
              </ul>
            </div>

            {note && <p role="status" className="m-0 font-semibold text-emerald-800">{note}</p>}
            {canEdit && (
              <div className="flex items-center gap-3">
                <button onClick={startEdit} disabled={privacyShield} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] font-semibold disabled:opacity-50">Edit patient</button>
                {privacyShield && <span className="text-[11px] text-[#1e2a28]/70">Turn off the privacy shield to edit.</span>}
              </div>
            )}
          </>
        )}

        {p && editing && (
          <form onSubmit={save} className="space-y-2.5">
            <div><label htmlFor="pc-name" className="block text-[11px] font-semibold mb-1">Name</label><input id="pc-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="pc-phone" className="block text-[11px] font-semibold mb-1">Mobile phone</label><input id="pc-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="pc-email" className="block text-[11px] font-semibold mb-1">Email</label><input id="pc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="pc-notes" className="block text-[11px] font-semibold mb-1">Front-desk notes <span className="font-normal text-[#1e2a28]/70">(no clinical notes)</span></label>
              <textarea id="pc-notes" rows={3} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-white border border-[#1e2a28]/30 text-xs" /></div>
            {form.phone.trim() !== (p.phone ?? '') && p.smsConsent && (
              <p className="m-0 text-[11px] text-[#a3533a] font-semibold">Changing the phone number turns texting off until the patient agrees to texts for the new number.</p>
            )}
            <div className="border-t border-[#1e2a28]/15 pt-2.5">
              <label htmlFor="pc-pw" className="block text-[11px] font-semibold mb-1">Your password, to save this change</label>
              <input id="pc-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
            {err && <div role="alert" className="text-[#a3533a] font-semibold">{err}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 border border-[#1e2a28]/30 font-semibold">Cancel</button>
              <button type="submit" disabled={update.isPending || !password} className="px-3 py-1.5 bg-[#a3533a] text-[#f4f0e8] font-semibold disabled:opacity-60">{update.isPending ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
