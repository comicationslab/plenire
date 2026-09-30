import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { initialsOf, todayShort, uid } from '../../lib/format';
import { Appointment, Patient } from '../../types/hipaa';

interface CleanTodayProps {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  onGoToRecovery: () => void;
  onAddRecoveryOpening: (opening: any) => void;
}

export const CleanToday: React.FC<CleanTodayProps> = ({
  appointments,
  setAppointments,
  setPatients,
  onGoToRecovery,
  onAddRecoveryOpening,
}) => {
  const { maskName, maskTreatment, logAudit } = useHIPAA();
  const { practice } = usePractice();
  const chairs = practice.providers.filter((p) => p.op);

  const [chairFilter, setChairFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [customFollowup, setCustomFollowup] = useState(false);
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [customTime, setCustomTime] = useState('09:00');

  // Walk-in modal
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinEmail, setWalkinEmail] = useState('');
  const [walkinProvider, setWalkinProvider] = useState(chairs[0]?.name ?? '');
  const [walkinTime, setWalkinTime] = useState('12:00');
  const walkinDuration = '60';
  const [walkinTreatment, setWalkinTreatment] = useState('Emergency exam');
  const [walkinConsent, setWalkinConsent] = useState(true);
  const [walkinError, setWalkinError] = useState('');

  const calendarProviders = chairs.map((p) => ({ name: p.name, initials: p.initials, op: p.op ?? 'Op 1' }));

  const visible = chairFilter === 'all'
    ? appointments
    : appointments.filter((a) => a.provider === chairFilter);

  const seen = appointments.filter((a) => a.status === 'completed' || a.status === 'arrived').length;
  const noShows = appointments.filter((a) => a.status === 'noshow').length;
  const followups = appointments.filter((a) => a.followUp).length;
  const reviews = appointments.filter((a) => a.thanked).length;

  const handleStatusChange = (status: 'arrived' | 'completed' | 'noshow') => {
    if (!selectedAppt) return;
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === selectedAppt.id
          ? { ...a, status, thanked: status === 'completed' ? true : a.thanked }
          : a
      )
    );
    setSelectedAppt((p) => (p ? { ...p, status } : null));

    if (status === 'noshow') {
      onAddRecoveryOpening({
        type: 'No-show',
        kind: 'no-show',
        time: selectedAppt.time,
        doctor: selectedAppt.provider,
        patient: selectedAppt.patient,
        detail: selectedAppt.treatment,
      });
      logAudit('NO_SHOW_RECORDED', `No-show recorded for ${selectedAppt.patient}`);
    } else {
      logAudit('APPT_UPDATE', `Updated ${selectedAppt.patient} status to ${status}`);
    }
  };

  const handleUndo = () => {
    if (!selectedAppt) return;
    const nextStatus = selectedAppt.status === 'completed' ? 'arrived' : 'scheduled';
    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppt.id ? { ...a, status: nextStatus } : a))
    );
    setSelectedAppt((p) => (p ? { ...p, status: nextStatus } : null));
    logAudit('APPT_UNDO', `Reverted ${selectedAppt.patient} to ${nextStatus}`);
  };

  const handleSaveFollowup = (preset: string) => {
    if (!selectedAppt) return;
    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppt.id ? { ...a, followUp: preset } : a))
    );
    setSelectedAppt((p) => (p ? { ...p, followUp: preset } : null));
    setFollowupOpen(false);
    setCustomFollowup(false);
    logAudit('FOLLOWUP_SET', `Followup set for ${selectedAppt.patient}: ${preset}`);
  };

  const handleSaveCustomFollowup = () => {
    if (!selectedAppt || !customDate || !customTime) return;
    const [y, m, d] = customDate.split('-').map(Number);
    const [hour, minute] = customTime.split(':').map(Number);
    const month = new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short' });
    const clockH = hour % 12 || 12;
    const text = `Custom · ${month} ${d} · ${clockH}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    handleSaveFollowup(text);
  };

  const handleSaveWalkin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkinName.trim() || !walkinTreatment.trim()) {
      setWalkinError('Add patient name and visit type.');
      return;
    }
    const [h, m] = walkinTime.split(':').map(Number);
    const mins = h * 60 + m;
    const clockH = h % 12 || 12;
    const formatted = `${clockH}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    const initials = initialsOf(walkinName);
    const pInfo = calendarProviders.find((p) => p.name === walkinProvider);

    const newPatient: Patient = {
      id: uid('p'),
      name: walkinName.trim(),
      initials,
      phone: walkinPhone.trim() || 'Walk-in patient',
      email: walkinEmail.trim() || 'No email provided',
      lastVisit: todayShort(practice.timezone),
      recentVisit: `${walkinTreatment} · ${formatted}`,
      status: 'Active',
      smsConsent: walkinConsent && /\d/.test(walkinPhone),
      smsConsentAt: new Date().toISOString(),
      walkIn: true,
    };

    const newAppt: Appointment = {
      id: uid('appt'),
      time: formatted,
      mins,
      dur: Number(walkinDuration),
      patient: walkinName.trim(),
      initials,
      provider: walkinProvider,
      op: pInfo?.op || 'Op 1',
      treatment: walkinTreatment.trim(),
      status: 'arrived',
      walkIn: true,
    };

    setPatients((prev) => [newPatient, ...prev]);
    setAppointments((prev) => [...prev, newAppt]);
    logAudit('WALKIN_ADDED', `Walk-in added: ${walkinName} (${walkinTreatment})`);

    setWalkinOpen(false);
    setWalkinName('');
    setWalkinPhone('');
    setWalkinEmail('');
    setWalkinError('');
  };

  return (
    <div className="space-y-6">
      {/* Metric row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Booked today</div>
          <div className="text-[28px] font-medium tracking-tight text-[#1e2a28] mt-2">{appointments.length}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Across {chairs.length} operatories</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Seen / arrived</div>
          <div className="text-[28px] font-medium tracking-tight text-[#1e2a28] mt-2">{seen}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Completed appointments</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">No-shows</div>
          <div className="text-[28px] font-medium tracking-tight text-[#a3533a] mt-2">{noShows}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Needs recovery</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Follow-ups set</div>
          <div className="text-[28px] font-medium tracking-tight text-[#1e2a28] mt-2">{followups}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Follow-ups assigned</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40 col-span-2 md:col-span-1">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Reviews sent</div>
          <div className="text-[28px] font-medium tracking-tight text-[#1e2a28] mt-2">{reviews}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Thank-you requests</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setChairFilter('all')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-none border transition-colors ${
              chairFilter === 'all'
                ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                : 'border-[#1e2a28]/15 text-[#1e2a28]/70 hover:border-[#1e2a28]'
            }`}
          >
            All chairs
          </button>
          {calendarProviders.map((p) => (
            <button
              key={p.name}
              onClick={() => setChairFilter(p.name)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-none border transition-colors ${
                chairFilter === p.name
                  ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                  : 'border-[#1e2a28]/15 text-[#1e2a28]/70 hover:border-[#1e2a28]'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setWalkinOpen(true)}
            className="px-3 py-1 bg-[#a3533a] text-[#f4f0e8] text-[11px] font-semibold hover:bg-[#a3533a]/90 flex items-center gap-1"
          >
            <span>+ Walk-in</span>
          </button>

          <div className="flex border border-[#1e2a28]/15">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-2.5 py-1 text-[11px] font-semibold ${
                viewMode === 'calendar' ? 'bg-[#1e2a28] text-[#f4f0e8]' : 'text-[#1e2a28]/70'
              }`}
            >
              ▦ Calendar
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 text-[11px] font-semibold ${
                viewMode === 'list' ? 'bg-[#1e2a28] text-[#f4f0e8]' : 'text-[#1e2a28]/70'
              }`}
            >
              ☷ List
            </button>
          </div>
        </div>
      </div>

      {/* Calendar or List View */}
      {viewMode === 'calendar' ? (
        <div className="border border-[#1e2a28]/15 bg-transparent overflow-x-auto">
          {/* Header row */}
          <div className="grid grid-cols-[56px_repeat(4,minmax(160px,1fr))] min-w-[760px] border-b border-[#1e2a28]/15 bg-[#1e2a28]/[0.02]">
            <div className="h-[54px] border-r border-[#1e2a28]/15" />
            {calendarProviders
              .filter((p) => chairFilter === 'all' || chairFilter === p.name)
              .map((p) => (
                <div key={p.name} className="h-[54px] border-r border-[#1e2a28]/15 last:border-r-0 flex items-center gap-2 px-3">
                  <span className="w-6 h-6 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-[11px]">
                    {p.initials}
                  </span>
                  <div>
                    <strong className="block text-[11px] font-semibold leading-tight">{p.name}</strong>
                    <small className="block text-[11px] text-[#1e2a28]/70">{p.op}</small>
                  </div>
                </div>
              ))}
          </div>

          {/* Time body */}
          <div className="grid grid-cols-[56px_repeat(4,minmax(160px,1fr))] min-w-[760px] relative h-[780px]">
            {/* Hours axis */}
            <div className="border-r border-[#1e2a28]/15 bg-[#1e2a28]/[0.025] relative">
              {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => (
                <span
                  key={h}
                  style={{ top: `${(h * 60 - 480) * 1.4}px` }}
                  className="absolute right-2 -translate-y-1/2 text-[11px] text-[#1e2a28]/70"
                >
                  {h % 12 || 12} {h < 12 ? 'AM' : 'PM'}
                </span>
              ))}
            </div>

            {/* Provider Operatory Columns */}
            {calendarProviders
              .filter((p) => chairFilter === 'all' || chairFilter === p.name)
              .map((p) => {
                const chairAppts = visible.filter((a) => a.provider === p.name);
                return (
                  <div
                    key={p.name}
                    className="border-r border-[#1e2a28]/15 last:border-r-0 relative bg-[repeating-linear-gradient(to_bottom,transparent_0px,transparent_83px,rgba(30,42,40,0.11)_83px,rgba(30,42,40,0.11)_84px)]"
                  >
                    {chairAppts.map((appt) => {
                      const top = (appt.mins - 480) * 1.4;
                      const height = Math.max(32, appt.dur * 1.4 - 6);
                      const isNoShow = appt.status === 'noshow';

                      return (
                        <div
                          key={appt.id}
                          onClick={() => {
                            setSelectedAppt(appt);
                            setFollowupOpen(false);
                            setCustomFollowup(false);
                          }}
                          style={{ top: `${top}px`, height: `${height}px` }}
                          className={`absolute left-2 right-2 p-2 border-l-2 text-left cursor-pointer transition-all hover:translate-x-0.5 overflow-hidden ${
                            isNoShow
                              ? 'border-[#a3533a] bg-[#a3533a]/15 text-[#1e2a28]'
                              : 'border-[#1e2a28] bg-[#1e2a28]/[0.09] text-[#1e2a28]'
                          }`}
                        >
                          <strong className="block text-[11px] font-semibold truncate leading-tight">
                            {maskName(appt.patient)}
                          </strong>
                          <span className="block text-[11px] text-[#1e2a28]/80 truncate mt-0.5">
                            {maskTreatment(appt.treatment)}
                          </span>
                          <small className="block text-[8px] text-[#1e2a28]/70 mt-0.5">{appt.time}</small>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* List view */
        <div className="border border-[#1e2a28]/15 divide-y divide-[#1e2a28]/10 bg-white/30">
          {visible
            .slice()
            .sort((a, b) => a.mins - b.mins)
            .map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  setSelectedAppt(a);
                  setFollowupOpen(false);
                }}
                className="p-3 px-4 flex items-center justify-between gap-3 hover:bg-[#1e2a28]/5 cursor-pointer text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 tabular-nums text-[11px] text-[#1e2a28]/70">{a.time}</div>
                  <div>
                    <strong className="block text-xs font-semibold">{maskName(a.patient)}</strong>
                    <span className="text-[11px] text-[#1e2a28]/70">{a.provider} · {maskTreatment(a.treatment)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.followUp && (
                    <span className="text-[11px] text-[#a3533a] font-semibold border border-[#a3533a]/30 px-1.5 py-0.5">
                      {a.followUp}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 border ${
                      a.status === 'noshow'
                        ? 'text-[#a3533a] border-[#a3533a]/50'
                        : 'text-[#1e2a28]/70 border-[#1e2a28]/20'
                    }`}
                  >
                    {a.status === 'completed'
                      ? 'Completed'
                      : a.status === 'arrived'
                      ? 'Arrived'
                      : a.status === 'noshow'
                      ? 'No-show'
                      : 'Scheduled'}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Appointment modal - Original clean aesthetic */}
      {selectedAppt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1e2a28]/30 p-4">
          <div className="w-full max-w-[390px] bg-[#f4f0e8] border border-[#1e2a28] p-5 shadow-none text-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs shrink-0">
                {selectedAppt.initials}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[19px] font-medium tracking-tight text-[#1e2a28] m-0">
                  {maskName(selectedAppt.patient)}
                </h3>
                <p className="text-[11px] text-[#1e2a28]/70 mt-1">{maskTreatment(selectedAppt.treatment)}</p>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="w-7 h-7 border border-[#1e2a28]/20 flex items-center justify-center text-sm"
              >
                ×
              </button>
            </div>

            <div className="flex gap-2 my-3 text-[11px] text-[#1e2a28]/70 tabular-nums">
              <span>{selectedAppt.time}</span>
              <span>·</span>
              <span>{selectedAppt.op}</span>
              <span>·</span>
              <span>{selectedAppt.provider}</span>
            </div>

            {/* Follow up box */}
            {followupOpen && (
              <div className="p-3 border border-[#1e2a28]/15 bg-white/40 my-3 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1e2a28]/70 mb-2">
                  Assign follow-up
                </div>
                {['2-week post-op check', '6-week crown seat', '3-month perio maintenance', '6-month recall + exam'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleSaveFollowup(preset)}
                    className="w-full text-left p-1.5 hover:bg-[#1e2a28]/5 text-xs font-semibold"
                  >
                    {preset}
                  </button>
                ))}
                <button
                  onClick={() => setCustomFollowup(!customFollowup)}
                  className="w-full text-left p-1.5 text-[#a3533a] font-semibold text-xs pt-2 border-t border-[#1e2a28]/10"
                >
                  ◷ Custom date &amp; time…
                </button>

                {customFollowup && (
                  <div className="pt-2 border-t border-[#1e2a28]/15 space-y-2 mt-2">
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full p-1.5 bg-transparent border border-[#1e2a28]/20 text-xs"
                    />
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full p-1.5 bg-transparent border border-[#1e2a28]/20 text-xs"
                    />
                    <button
                      onClick={handleSaveCustomFollowup}
                      className="w-full py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                    >
                      Confirm date &amp; time
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedAppt.followUp && !followupOpen && (
              <div className="p-2 border border-[#a3533a]/30 text-[#a3533a] my-2 text-xs font-semibold">
                Follow-up: {selectedAppt.followUp}
              </div>
            )}

            {/* Dialog actions */}
            <div className="pt-3 border-t border-[#1e2a28]/15 flex gap-2">
              {followupOpen ? (
                <button
                  onClick={() => setFollowupOpen(false)}
                  className="w-full py-2 border border-[#1e2a28]/20 text-xs font-semibold"
                >
                  Cancel
                </button>
              ) : selectedAppt.status === 'scheduled' ? (
                <>
                  <button
                    onClick={() => handleStatusChange('arrived')}
                    className="flex-1 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                  >
                    Arrived
                  </button>
                  <button
                    onClick={() => handleStatusChange('noshow')}
                    className="flex-1 py-2 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold"
                  >
                    No-show
                  </button>
                </>
              ) : selectedAppt.status === 'arrived' ? (
                <>
                  <button
                    onClick={() => setFollowupOpen(true)}
                    className="flex-1 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                  >
                    Assign follow-up
                  </button>
                  <button
                    onClick={() => handleStatusChange('completed')}
                    className="flex-1 py-2 border border-[#1e2a28]/20 text-xs font-semibold"
                  >
                    Seen
                  </button>
                </>
              ) : selectedAppt.status === 'completed' ? (
                <button
                  onClick={() => setFollowupOpen(true)}
                  className="w-full py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                >
                  Assign follow-up
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSelectedAppt(null);
                    onGoToRecovery();
                  }}
                  className="w-full py-2 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold"
                >
                  View recovery
                </button>
              )}
            </div>

            {!followupOpen && selectedAppt.status !== 'scheduled' && (
              <button
                onClick={handleUndo}
                className="w-full text-center text-[11px] text-[#1e2a28]/70 hover:text-[#1e2a28] pt-2 mt-2 border-t border-[#1e2a28]/10"
              >
                ↺ Undo — back to {selectedAppt.status === 'arrived' ? 'scheduled' : 'arrived'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Walk-in modal */}
      {walkinOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1e2a28]/30 p-4">
          <div className="w-full max-w-[450px] bg-[#f4f0e8] border border-[#1e2a28] p-5 shadow-none text-xs">
            <div className="flex items-start justify-between pb-3 border-b border-[#1e2a28]/15">
              <div>
                <h3 className="text-lg font-medium text-[#1e2a28]">Add walk-in patient</h3>
                <p className="text-[11px] text-[#1e2a28]/70 mt-0.5">
                  Create patient record and place appointment on a chair.
                </p>
              </div>
              <button onClick={() => setWalkinOpen(false)} className="w-7 h-7 border border-[#1e2a28]/20">
                ×
              </button>
            </div>

            <form onSubmit={handleSaveWalkin} className="space-y-3 my-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="f-cleantoday-24600" className="block text-[11px] font-semibold text-[#1e2a28]/70 mb-1">Patient name *</label>
                  <input id="f-cleantoday-24600"
                    type="text"
                    required
                    value={walkinName}
                    onChange={(e) => setWalkinName(e.target.value)}
                    placeholder="Jordan Lee"
                    className="w-full p-2 bg-transparent border border-[#1e2a28]/20 text-xs text-[#1e2a28]"
                  />
                </div>
                <div>
                  <label htmlFor="f-cleantoday-25127" className="block text-[11px] font-semibold text-[#1e2a28]/70 mb-1">Phone</label>
                  <input id="f-cleantoday-25127"
                    type="tel"
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full p-2 bg-transparent border border-[#1e2a28]/20 text-xs text-[#1e2a28]"
                  />
                </div>
                <div>
                  <label htmlFor="f-cleantoday-25621" className="block text-[11px] font-semibold text-[#1e2a28]/70 mb-1">Email</label>
                  <input id="f-cleantoday-25621"
                    type="email"
                    value={walkinEmail}
                    onChange={(e) => setWalkinEmail(e.target.value)}
                    placeholder="jordan@example.com"
                    className="w-full p-2 bg-transparent border border-[#1e2a28]/20 text-xs text-[#1e2a28]"
                  />
                </div>
                <div>
                  <label htmlFor="f-cleantoday-26121" className="block text-[11px] font-semibold text-[#1e2a28]/70 mb-1">Chair / provider *</label>
                  <select id="f-cleantoday-26121"
                    value={walkinProvider}
                    onChange={(e) => setWalkinProvider(e.target.value)}
                    className="w-full p-2 bg-transparent border border-[#1e2a28]/20 text-xs text-[#1e2a28]"
                  >
                    {calendarProviders.map((p) => (
                      <option key={p.name} value={p.name}>{p.name} · {p.op}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-cleantoday-26743" className="block text-[11px] font-semibold text-[#1e2a28]/70 mb-1">Time *</label>
                  <input id="f-cleantoday-26743"
                    type="time"
                    required
                    value={walkinTime}
                    onChange={(e) => setWalkinTime(e.target.value)}
                    className="w-full p-2 bg-transparent border border-[#1e2a28]/20 text-xs text-[#1e2a28]"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="f-cleantoday-27240" className="block text-[11px] font-semibold text-[#1e2a28]/70 mb-1">Visit / treatment *</label>
                  <input id="f-cleantoday-27240"
                    type="text"
                    required
                    value={walkinTreatment}
                    onChange={(e) => setWalkinTreatment(e.target.value)}
                    placeholder="Emergency exam"
                    className="w-full p-2 bg-transparent border border-[#1e2a28]/20 text-xs text-[#1e2a28]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[#1e2a28]/70">
                    <input
                      type="checkbox"
                      checked={walkinConsent}
                      onChange={(e) => setWalkinConsent(e.target.checked)}
                      className="accent-[#1e2a28]"
                    />
                    <span>Patient consented to receive appointment confirmations (TCPA / HIPAA).</span>
                  </label>
                </div>
              </div>

              {walkinError && (
                <div className="text-[11px] text-[#a3533a] p-2 bg-[#a3533a]/10">{walkinError}</div>
              )}

              <div className="flex gap-2 pt-2 border-t border-[#1e2a28]/15">
                <button
                  type="button"
                  onClick={() => setWalkinOpen(false)}
                  className="flex-1 py-2 border border-[#1e2a28]/20 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                >
                  Save walk-in
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
