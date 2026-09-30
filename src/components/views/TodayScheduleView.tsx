import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { maskName, maskTreatment } from '../../services/hipaaCompliance';
import { Appointment, Patient } from '../../types/hipaa';
import {
  Calendar as CalendarIcon,
  List as ListIcon,
  UserPlus,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  X,
  RotateCcw,
} from 'lucide-react';

interface TodayScheduleViewProps {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  onGoToRecovery: () => void;
  onAddRecoveryOpening: (opening: {
    type: 'No-show';
    kind: 'no-show';
    time: string;
    doctor: string;
    patient: string;
    detail: string;
  }) => void;
}

export const TodayScheduleView: React.FC<TodayScheduleViewProps> = ({
  appointments,
  setAppointments,
  patients,
  setPatients,
  onGoToRecovery,
  onAddRecoveryOpening,
}) => {
  const { isPrivacyShieldActive, currentUser, isBreakGlassActive, logAuditEvent } = useHIPAA();

  const [chairFilter, setChairFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [customFollowupOpen, setCustomFollowupOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [customTime, setCustomTime] = useState('09:00');

  // Walk-in modal state
  const [isWalkinModalOpen, setIsWalkinModalOpen] = useState(false);
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinEmail, setWalkinEmail] = useState('');
  const [walkinProvider, setWalkinProvider] = useState('Dr. Mensah');
  const [walkinTime, setWalkinTime] = useState('12:00');
  const [walkinDuration, setWalkinDuration] = useState('60');
  const [walkinTreatment, setWalkinTreatment] = useState('Emergency Exam & Pain Check');
  const [walkinConsent, setWalkinConsent] = useState(true);
  const [walkinError, setWalkinError] = useState('');

  const providers = [
    { name: 'Dr. Mensah', initials: 'NM', op: 'Op 1' },
    { name: 'Dr. Patel', initials: 'AP', op: 'Op 3' },
    { name: 'RDH Nguyen', initials: 'LN', op: 'Hyg 1' },
    { name: 'RDH Brooks', initials: 'MB', op: 'Hyg 2' },
  ];

  const visibleAppointments =
    chairFilter === 'all'
      ? appointments
      : appointments.filter((a) => a.provider === chairFilter);

  const seenCount = appointments.filter((a) => a.status === 'completed' || a.status === 'arrived').length;
  const noshowCount = appointments.filter((a) => a.status === 'noshow').length;
  const followupsCount = appointments.filter((a) => a.followUp).length;

  const handleApptClick = (appt: Appointment) => {
    setSelectedAppt(appt);
    setFollowupOpen(false);
    setCustomFollowupOpen(false);
    logAuditEvent('READ_EPHI', `Viewed appointment details for ${appt.patient} (${appt.treatment}).`, appt.id, appt.patient);
  };

  const updateApptStatus = (status: 'arrived' | 'completed' | 'noshow') => {
    if (!selectedAppt) return;
    const oldStatus = selectedAppt.status;

    setAppointments((prev) =>
      prev.map((a) => {
        if (a.id === selectedAppt.id) {
          return {
            ...a,
            status,
            thanked: status === 'completed' ? true : a.thanked,
          };
        }
        return a;
      })
    );

    setSelectedAppt((prev) => (prev ? { ...prev, status } : null));

    logAuditEvent(
      'UPDATE_APPOINTMENT',
      `Updated appointment status for ${selectedAppt.patient} from ${oldStatus} to ${status}.`,
      selectedAppt.id,
      selectedAppt.patient
    );

    if (status === 'noshow') {
      onAddRecoveryOpening({
        type: 'No-show',
        kind: 'no-show',
        time: selectedAppt.time,
        doctor: selectedAppt.provider,
        patient: selectedAppt.patient,
        detail: selectedAppt.treatment,
      });
    }
  };

  const handleUndoStatus = () => {
    if (!selectedAppt) return;
    let nextStatus: 'scheduled' | 'arrived' = 'scheduled';
    if (selectedAppt.status === 'completed') {
      nextStatus = 'arrived';
    } else {
      nextStatus = 'scheduled';
    }

    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppt.id ? { ...a, status: nextStatus } : a))
    );
    setSelectedAppt((prev) => (prev ? { ...prev, status: nextStatus } : null));

    logAuditEvent(
      'UPDATE_APPOINTMENT',
      `Reverted appointment status for ${selectedAppt.patient} back to ${nextStatus}.`,
      selectedAppt.id,
      selectedAppt.patient
    );
  };

  const handleAssignFollowup = (preset: string) => {
    if (!selectedAppt) return;
    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppt.id ? { ...a, followUp: preset } : a))
    );
    setSelectedAppt((prev) => (prev ? { ...prev, followUp: preset } : null));
    setFollowupOpen(false);
    setCustomFollowupOpen(false);

    logAuditEvent(
      'UPDATE_APPOINTMENT',
      `Assigned follow-up for ${selectedAppt.patient}: "${preset}".`,
      selectedAppt.id,
      selectedAppt.patient
    );
  };

  const handleSaveCustomFollowup = () => {
    if (!selectedAppt || !customDate || !customTime) return;
    const [year, month, day] = customDate.split('-').map(Number);
    const [hour, minute] = customTime.split(':').map(Number);
    const monthName = new Date(year, month - 1, day).toLocaleString('en-US', { month: 'short' });
    const clockHour = hour % 12 || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    const text = `Custom · ${monthName} ${day} at ${clockHour}:${String(minute).padStart(2, '0')} ${ampm}`;

    handleAssignFollowup(text);
  };

  const handleDeleteWalkin = () => {
    if (!selectedAppt) return;
    setAppointments((prev) => prev.filter((a) => a.id !== selectedAppt.id));
    setPatients((prev) => prev.filter((p) => p.name !== selectedAppt.patient || !p.walkIn));
    logAuditEvent(
      'UPDATE_APPOINTMENT',
      `Removed walk-in appointment for ${selectedAppt.patient}.`,
      selectedAppt.id,
      selectedAppt.patient
    );
    setSelectedAppt(null);
  };

  const handleSaveWalkin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkinName.trim() || !walkinTreatment.trim()) {
      setWalkinError('Please enter the patient name and visit type.');
      return;
    }

    const [hour, minute] = walkinTime.split(':').map(Number);
    const mins = hour * 60 + minute;
    if (mins < 480 || mins > 1020) {
      setWalkinError('Please select a time between 8:00 AM and 5:00 PM.');
      return;
    }

    const clockHour = hour % 12 || 12;
    const formattedTime = `${clockHour}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    const nameParts = walkinName.trim().split(/\s+/);
    const initials = (nameParts[0][0] + (nameParts[1]?.[0] || '')).toUpperCase();
    const providerObj = providers.find((p) => p.name === walkinProvider);

    const newPatient: Patient = {
      id: `p-${Date.now()}`,
      name: walkinName.trim(),
      initials,
      phone: walkinPhone.trim() || '(Unlisted Walk-in)',
      email: walkinEmail.trim() || 'walkin@example.com',
      lastVisit: 'Jun 30, 2026',
      recentVisit: `${walkinTreatment} · ${formattedTime}`,
      status: 'Active',
      smsConsent: walkinConsent && /\d/.test(walkinPhone),
      smsConsentAt: walkinConsent ? new Date().toISOString() : undefined,
      notes: 'Emergency Walk-In Patient',
      walkIn: true,
      clinicalNotes: 'Walk-in emergency presentation. Triage completed.',
    };

    const newAppt: Appointment = {
      id: `appt-${Date.now()}`,
      time: formattedTime,
      mins,
      dur: Number(walkinDuration),
      patient: walkinName.trim(),
      initials,
      provider: walkinProvider,
      op: providerObj?.op || 'Op 1',
      treatment: walkinTreatment.trim(),
      status: 'arrived',
      walkIn: true,
    };

    setPatients((prev) => [newPatient, ...prev]);
    setAppointments((prev) => [...prev, newAppt]);

    logAuditEvent(
      'CREATE_WALKIN',
      `Created emergency walk-in appointment for ${walkinName} (${walkinTreatment}) on ${walkinProvider}'s chair. Consent recorded: ${walkinConsent ? 'YES' : 'NO'}.`,
      newAppt.id,
      walkinName.trim()
    );

    setIsWalkinModalOpen(false);
    setWalkinName('');
    setWalkinPhone('');
    setWalkinEmail('');
    setWalkinError('');
  };

  // Check if clinical chart notes are permissible for current role (§ 164.502(b))
  const canViewClinicalNotes =
    currentUser.role === 'dentist' ||
    currentUser.role === 'hygienist' ||
    currentUser.role === 'compliance_officer' ||
    isBreakGlassActive;

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">Booked Today</div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">{appointments.length}</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Across 4 operatories</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">Seen / Arrived</div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">{seenCount}</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">In chair or completed</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">No-Shows</div>
          <div className="text-2xl font-tabular font-semibold text-[#a3533a] mt-1">{noshowCount}</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Sent to recovery queue</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">Follow-Ups Set</div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">{followupsCount}</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Post-op &amp; recall scheduled</div>
        </div>
      </div>

      {/* Calendar Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#1e2a28]/15">
        {/* Chair filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setChairFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${
              chairFilter === 'all'
                ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                : 'bg-white/50 text-[#1e2a28]/70 border-[#1e2a28]/20 hover:bg-white'
            }`}
          >
            All Chairs
          </button>
          {providers.map((p) => (
            <button
              key={p.name}
              onClick={() => setChairFilter(p.name)}
              className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${
                chairFilter === p.name
                  ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                  : 'bg-white/50 text-[#1e2a28]/70 border-[#1e2a28]/20 hover:bg-white'
              }`}
            >
              {p.name} ({p.op})
            </button>
          ))}
        </div>

        {/* View Mode & Add Walk-in */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsWalkinModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-[#a3533a] text-[#f4f0e8] hover:bg-[#a3533a]/90 flex items-center gap-1.5 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Walk-In</span>
          </button>

          <div className="flex border border-[#1e2a28]/20 bg-white/60">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-2.5 py-1 text-xs font-medium flex items-center gap-1 ${
                viewMode === 'calendar' ? 'bg-[#1e2a28] text-[#f4f0e8]' : 'text-[#1e2a28]/70 hover:bg-white'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 text-xs font-medium flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-[#1e2a28] text-[#f4f0e8]' : 'text-[#1e2a28]/70 hover:bg-white'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Display */}
      {viewMode === 'calendar' ? (
        <div className="border border-[#1e2a28]/20 bg-white/40 overflow-x-auto">
          {/* Header Row */}
          <div className="grid grid-cols-[60px_repeat(4,minmax(180px,1fr))] border-b border-[#1e2a28]/15 bg-white/70">
            <div className="p-3 text-[10px] font-bold uppercase text-[#1e2a28]/50 border-r border-[#1e2a28]/15 text-center">
              Time
            </div>
            {providers
              .filter((p) => chairFilter === 'all' || chairFilter === p.name)
              .map((p) => (
                <div
                  key={p.name}
                  className="p-3 border-r border-[#1e2a28]/15 last:border-r-0 flex items-center gap-2"
                >
                  <div className="w-7 h-7 rounded-full border border-[#1e2a28]/30 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8]">
                    {p.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-[#1e2a28] truncate">{p.name}</div>
                    <div className="text-[10px] text-[#1e2a28]/60">{p.op}</div>
                  </div>
                </div>
              ))}
          </div>

          {/* Time Grid (8 AM to 5 PM) */}
          <div className="grid grid-cols-[60px_repeat(4,minmax(180px,1fr))] relative h-[780px]">
            {/* Time labels column */}
            <div className="border-r border-[#1e2a28]/15 relative bg-white/30">
              {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => {
                const top = (hour * 60 - 480) * 1.4;
                const clockHour = hour % 12 || 12;
                const ampm = hour < 12 ? 'AM' : 'PM';
                return (
                  <div
                    key={hour}
                    className="absolute right-2 -translate-y-1/2 text-[10px] font-tabular text-[#1e2a28]/60"
                    style={{ top: `${top}px` }}
                  >
                    {clockHour} {ampm}
                  </div>
                );
              })}
            </div>

            {/* Provider Operatory Columns */}
            {providers
              .filter((p) => chairFilter === 'all' || chairFilter === p.name)
              .map((provider) => {
                const chairAppts = visibleAppointments.filter((a) => a.provider === provider.name);

                return (
                  <div
                    key={provider.name}
                    className="border-r border-[#1e2a28]/15 last:border-r-0 relative bg-[repeating-linear-gradient(to_bottom,transparent_0px,transparent_83px,rgba(30,42,40,0.08)_83px,rgba(30,42,40,0.08)_84px)]"
                  >
                    {chairAppts.map((appt) => {
                      const top = (appt.mins - 480) * 1.4;
                      const height = Math.max(34, appt.dur * 1.4 - 4);
                      const isNoShow = appt.status === 'noshow';
                      const isCompleted = appt.status === 'completed';
                      const isArrived = appt.status === 'arrived';

                      return (
                        <div
                          key={appt.id}
                          onClick={() => handleApptClick(appt)}
                          style={{ top: `${top}px`, height: `${height}px` }}
                          className={`absolute inset-x-1.5 p-2 text-xs border-l-4 cursor-pointer transition-all hover:translate-x-0.5 overflow-hidden shadow-sm ${
                            isNoShow
                              ? 'bg-[#a3533a]/15 border-[#a3533a] text-[#1e2a28]'
                              : isCompleted
                              ? 'bg-emerald-800/10 border-emerald-800 text-[#1e2a28]'
                              : isArrived
                              ? 'bg-[#1e2a28]/15 border-[#1e2a28] text-[#1e2a28]'
                              : 'bg-white/80 border-[#1e2a28]/60 text-[#1e2a28]'
                          }`}
                        >
                          <div className="font-semibold truncate text-[11px]">
                            {maskName(appt.patient, isPrivacyShieldActive)}
                          </div>
                          <div className="text-[10px] text-[#1e2a28]/70 truncate">
                            {maskTreatment(appt.treatment, isPrivacyShieldActive)}
                          </div>
                          <div className="text-[9px] text-[#1e2a28]/50 mt-0.5 font-tabular">
                            {appt.time} · {appt.dur}m
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="border border-[#1e2a28]/15 bg-white/40 divide-y divide-[#1e2a28]/10">
          {visibleAppointments
            .slice()
            .sort((a, b) => a.mins - b.mins)
            .map((appt) => (
              <div
                key={appt.id}
                onClick={() => handleApptClick(appt)}
                className="p-3 sm:p-4 flex items-center justify-between gap-4 hover:bg-white/70 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-16 font-tabular text-xs font-semibold text-[#1e2a28]">
                    {appt.time}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs sm:text-sm text-[#1e2a28] truncate">
                      {maskName(appt.patient, isPrivacyShieldActive)}
                    </div>
                    <div className="text-xs text-[#1e2a28]/60 truncate">
                      {appt.provider} ({appt.op}) · {maskTreatment(appt.treatment, isPrivacyShieldActive)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {appt.followUp && (
                    <span className="text-[10px] font-semibold text-[#a3533a] border border-[#a3533a]/30 px-2 py-0.5 hidden sm:inline">
                      {appt.followUp}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                      appt.status === 'noshow'
                        ? 'border-[#a3533a] text-[#a3533a] bg-[#a3533a]/10'
                        : appt.status === 'completed'
                        ? 'border-emerald-800 text-emerald-800 bg-emerald-800/10'
                        : appt.status === 'arrived'
                        ? 'border-[#1e2a28] text-[#1e2a28] bg-[#1e2a28]/10'
                        : 'border-[#1e2a28]/30 text-[#1e2a28]/70 bg-white/60'
                    }`}
                  >
                    {appt.status}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Appointment Detail & Status Actions Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#f4f0e8] border border-[#1e2a28] p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-[#1e2a28]/15">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-sm bg-white">
                  {selectedAppt.initials}
                </div>
                <div>
                  <h3 className="font-semibold text-base text-[#1e2a28]">
                    {maskName(selectedAppt.patient, isPrivacyShieldActive)}
                  </h3>
                  <p className="text-xs text-[#1e2a28]/60">
                    {maskTreatment(selectedAppt.treatment, isPrivacyShieldActive)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="text-[#1e2a28]/60 hover:text-[#1e2a28] p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 text-xs text-[#1e2a28]/70 border-b border-[#1e2a28]/15 flex items-center gap-2 font-tabular">
              <span>{selectedAppt.time}</span>
              <span>·</span>
              <span>{selectedAppt.op}</span>
              <span>·</span>
              <span>{selectedAppt.provider}</span>
              <span>·</span>
              <span className="uppercase font-semibold text-[#a3533a]">{selectedAppt.status}</span>
            </div>

            {/* Minimum Necessary Rule check for Clinical Notes (§ 164.502(b)) */}
            <div className="my-3 p-3 bg-white/60 border border-[#1e2a28]/15 text-xs">
              <div className="font-semibold text-[#1e2a28] mb-1 flex items-center justify-between">
                <span>Clinical Chart &amp; Operatory Notes</span>
                {!canViewClinicalNotes && (
                  <span className="text-[10px] text-[#a3533a] font-normal">Restricted (RBAC)</span>
                )}
              </div>
              {canViewClinicalNotes ? (
                <p className="text-[#1e2a28]/80 leading-relaxed italic">
                  Patient scheduled for {selectedAppt.treatment}. Vitals nominal upon entry. No adverse drug interactions flagged.
                </p>
              ) : (
                <div className="text-[#1e2a28]/50 text-[11px] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#a3533a]" />
                  <span>Clinical notes restricted to clinical roles. Front desk access shielded (§ 164.502(b)).</span>
                </div>
              )}
            </div>

            {/* Follow-up Selector Box */}
            {followupOpen && (
              <div className="p-3 bg-white border border-[#1e2a28]/20 my-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                  Assign Clinical Follow-Up
                </div>
                <div className="grid grid-cols-1 gap-1 text-xs font-medium">
                  <button
                    onClick={() => handleAssignFollowup('2-week post-op check')}
                    className="p-2 text-left hover:bg-[#1e2a28]/5 border border-transparent hover:border-[#1e2a28]/10"
                  >
                    2-Week Post-Op Check
                  </button>
                  <button
                    onClick={() => handleAssignFollowup('6-week crown seat')}
                    className="p-2 text-left hover:bg-[#1e2a28]/5 border border-transparent hover:border-[#1e2a28]/10"
                  >
                    6-Week Crown Seat
                  </button>
                  <button
                    onClick={() => handleAssignFollowup('3-month perio maintenance')}
                    className="p-2 text-left hover:bg-[#1e2a28]/5 border border-transparent hover:border-[#1e2a28]/10"
                  >
                    3-Month Perio Maintenance
                  </button>
                  <button
                    onClick={() => handleAssignFollowup('6-month recall + exam')}
                    className="p-2 text-left hover:bg-[#1e2a28]/5 border border-transparent hover:border-[#1e2a28]/10"
                  >
                    6-Month Recall + Exam
                  </button>
                  <button
                    onClick={() => setCustomFollowupOpen(!customFollowupOpen)}
                    className="p-2 text-left text-[#a3533a] font-semibold hover:bg-[#a3533a]/5"
                  >
                    Custom Date &amp; Time…
                  </button>
                </div>

                {customFollowupOpen && (
                  <div className="p-2 border-t border-[#1e2a28]/15 space-y-2 mt-2">
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="flex-1 p-1.5 text-xs bg-white border border-[#1e2a28]/20"
                      />
                      <input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="w-24 p-1.5 text-xs bg-white border border-[#1e2a28]/20"
                      />
                    </div>
                    <button
                      onClick={handleSaveCustomFollowup}
                      className="w-full py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold"
                    >
                      Confirm Date &amp; Time
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedAppt.followUp && !followupOpen && (
              <div className="p-2.5 bg-[#a3533a]/10 border border-[#a3533a]/30 my-3 text-xs flex items-center justify-between">
                <span>Follow-up: <strong>{selectedAppt.followUp}</strong></span>
                <button
                  onClick={() => setFollowupOpen(true)}
                  className="text-[11px] underline text-[#a3533a]"
                >
                  Change
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex gap-2">
              {followupOpen ? (
                <button
                  onClick={() => setFollowupOpen(false)}
                  className="w-full py-2 border border-[#1e2a28]/25 text-xs font-semibold"
                >
                  Cancel
                </button>
              ) : selectedAppt.status === 'scheduled' ? (
                <>
                  <button
                    onClick={() => updateApptStatus('arrived')}
                    className="flex-1 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
                  >
                    Mark Arrived
                  </button>
                  <button
                    onClick={() => updateApptStatus('noshow')}
                    className="flex-1 py-2 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90"
                  >
                    Record No-Show
                  </button>
                </>
              ) : selectedAppt.status === 'arrived' ? (
                <>
                  <button
                    onClick={() => updateApptStatus('completed')}
                    className="flex-1 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
                  >
                    Mark Completed
                  </button>
                  <button
                    onClick={() => setFollowupOpen(true)}
                    className="flex-1 py-2 border border-[#1e2a28] text-[#1e2a28] text-xs font-semibold hover:bg-white"
                  >
                    Assign Follow-up
                  </button>
                </>
              ) : selectedAppt.status === 'completed' ? (
                <button
                  onClick={() => setFollowupOpen(true)}
                  className="w-full py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
                >
                  Assign Follow-up
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSelectedAppt(null);
                    onGoToRecovery();
                  }}
                  className="w-full py-2 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90"
                >
                  View in Recovery Engine
                </button>
              )}
            </div>

            {/* Undo status and delete walkin */}
            {!followupOpen && selectedAppt.status !== 'scheduled' && (
              <button
                onClick={handleUndoStatus}
                className="w-full mt-3 pt-2 border-t border-[#1e2a28]/15 text-xs text-[#1e2a28]/60 hover:text-[#1e2a28] flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Undo Status</span>
              </button>
            )}

            {selectedAppt.walkIn && (
              <button
                onClick={handleDeleteWalkin}
                className="w-full mt-2 text-xs text-[#a3533a] hover:underline"
              >
                Remove Walk-In Appointment
              </button>
            )}
          </div>
        </div>
      )}

      {/* Walk-In Form Modal */}
      {isWalkinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#f4f0e8] border border-[#1e2a28] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e2a28]/15">
              <div>
                <h3 className="font-semibold text-lg text-[#1e2a28]">Add Emergency Walk-In</h3>
                <p className="text-xs text-[#1e2a28]/60">
                  Creates patient record &amp; places immediate appointment on chair.
                </p>
              </div>
              <button
                onClick={() => setIsWalkinModalOpen(false)}
                className="text-[#1e2a28]/60 hover:text-[#1e2a28] p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWalkin} className="space-y-4 my-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1e2a28] mb-1">
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={walkinName}
                    onChange={(e) => setWalkinName(e.target.value)}
                    placeholder="e.g. Jordan Reyes"
                    className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Mobile Phone</label>
                  <input
                    type="tel"
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value)}
                    placeholder="(763) 555-0123"
                    className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Email</label>
                  <input
                    type="email"
                    value={walkinEmail}
                    onChange={(e) => setWalkinEmail(e.target.value)}
                    placeholder="jordan@example.com"
                    className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Chair / Provider *</label>
                  <select
                    value={walkinProvider}
                    onChange={(e) => setWalkinProvider(e.target.value)}
                    className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                  >
                    {providers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} · {p.op}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Appointment Time *</label>
                  <input
                    type="time"
                    required
                    value={walkinTime}
                    onChange={(e) => setWalkinTime(e.target.value)}
                    className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Visit / Treatment *</label>
                  <input
                    type="text"
                    required
                    value={walkinTreatment}
                    onChange={(e) => setWalkinTreatment(e.target.value)}
                    placeholder="e.g. Emergency exam & toothache check"
                    className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                  />
                </div>

                {/* HIPAA & TCPA Consent Requirement */}
                <div className="sm:col-span-2 p-3 bg-white/80 border border-[#1e2a28]/15 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#1e2a28]">
                    <input
                      type="checkbox"
                      checked={walkinConsent}
                      onChange={(e) => setWalkinConsent(e.target.checked)}
                      className="mt-0.5 accent-[#1e2a28]"
                    />
                    <span className="leading-snug">
                      <strong>TCPA &amp; HIPAA Communication Consent:</strong> Patient consented verbally to receive appointment confirmations and reminders. (If unchecked, outreach is restricted to email only).
                    </span>
                  </label>
                </div>
              </div>

              {walkinError && (
                <div className="text-xs text-[#a3533a] p-2 bg-[#a3533a]/10 border border-[#a3533a]/25">
                  {walkinError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWalkinModalOpen(false)}
                  className="flex-1 py-2 border border-[#1e2a28]/25 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
                >
                  Save &amp; Place on Chair
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
