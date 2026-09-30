import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { PRACTICES } from '../../data/initialData';
import { TCPA_CONSENT_STATEMENT, HIPAA_NPP_SUMMARY } from '../../services/hipaaCompliance';
import { Appointment, Patient, PracticeInfo } from '../../types/hipaa';
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  Download,
  CalendarPlus,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  FileText,
  X,
  Stethoscope,
  Mail,
  MessageSquare,
} from 'lucide-react';

interface PatientBookingPortalProps {
  onReturnToDashboard: () => void;
  onAppointmentBooked: (newAppt: Appointment, newPatient: Patient) => void;
}

export const PatientBookingPortal: React.FC<PatientBookingPortalProps> = ({
  onReturnToDashboard,
  onAppointmentBooked,
}) => {
  const { logAuditEvent } = useHIPAA();

  const [selectedPracticeSlug, setSelectedPracticeSlug] = useState<string>('lakeside-dental');
  const practice: PracticeInfo = PRACTICES[selectedPracticeSlug] || PRACTICES['lakeside-dental'];

  const [step, setStep] = useState<number>(1);
  const [selectedVisitTypeId, setSelectedVisitTypeId] = useState<string>('cleaning');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('any');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [selectedTime, setSelectedTime] = useState<string>('09:30');
  const [assignedProvider, setAssignedProvider] = useState<string>('Dr. Mensah');

  // Patient details state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isNewPatient, setIsNewPatient] = useState(true);
  const [notes, setNotes] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [bookingRef, setBookingRef] = useState<string>('');

  // NPP modal
  const [isNPPModalOpen, setIsNPPModalOpen] = useState(false);
  const [notificationStatuses, setNotificationStatuses] = useState({
    email: false,
    sms: false,
  });

  const visitType = practice.visitTypes.find((t) => t.id === selectedVisitTypeId) || practice.visitTypes[0];
  const eligibleProviders = practice.providers.filter(
    (p) => p.id !== 'any' && visitType.providers.includes(p.id)
  );

  // Generate 21 upcoming days
  const upcomingDays = Array.from({ length: 21 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return {
      iso: d.toISOString().slice(0, 10),
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      dateObj: d,
      isSunday: d.getDay() === 0,
    };
  });

  // Time slots
  const morningSlots = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
  const afternoonSlots = ['01:30', '02:00', '02:30', '03:00', '03:30', '04:00'];

  const isFormValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^\+?[\d\s()-]{7,}$/.test(phone.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleNext = () => {
    if (step < 4) {
      setStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Confirm booking
      const ref = 'CF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      setBookingRef(ref);

      const [hour, minute] = selectedTime.split(':').map(Number);
      const mins = hour * 60 + minute;
      const clockHour = hour % 12 || 12;
      const formattedTime = `${clockHour}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;

      const resolvedDoctor =
        selectedProviderId === 'any'
          ? eligibleProviders[0]?.name || 'Dr. Mensah'
          : practice.providers.find((p) => p.id === selectedProviderId)?.name || 'Dr. Mensah';

      const newAppt: Appointment = {
        id: `appt-web-${Date.now()}`,
        time: formattedTime,
        mins,
        dur: visitType.duration,
        patient: `${firstName.trim()} ${lastName.trim()}`,
        initials: (firstName[0] + lastName[0]).toUpperCase(),
        provider: resolvedDoctor,
        op: 'Op 1',
        treatment: visitType.name,
        status: 'scheduled',
      };

      const newPatient: Patient = {
        id: `p-${Date.now()}`,
        name: `${firstName.trim()} ${lastName.trim()}`,
        initials: (firstName[0] + lastName[0]).toUpperCase(),
        phone: phone.trim(),
        email: email.trim(),
        lastVisit: selectedDate,
        recentVisit: `${visitType.name} · ${formattedTime}`,
        status: 'Active',
        smsConsent: consentChecked,
        smsConsentAt: consentChecked ? new Date().toISOString() : undefined,
        notes: notes.trim(),
        clinicalNotes: 'Self-scheduled online booking via patient portal.',
      };

      onAppointmentBooked(newAppt, newPatient);

      logAuditEvent(
        'TCPA_CONSENT_RECORDED',
        `Online booking confirmed ref ${ref}. TCPA & HIPAA NPP consent captured (${consentChecked ? 'SMS Permitted' : 'Email Only'}).`,
        ref,
        newPatient.name,
        true
      );

      setStep(5);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Trigger simulated notifications
      setTimeout(() => {
        setNotificationStatuses((prev) => ({ ...prev, email: true }));
      }, 900);

      if (consentChecked) {
        setTimeout(() => {
          setNotificationStatuses((prev) => ({ ...prev, sms: true }));
        }, 1800);
      }
    }
  };

  const downloadICS = () => {
    const [h, m] = selectedTime.split(':').map(Number);
    const start = new Date(selectedDate + 'T00:00:00');
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + visitType.duration * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Chairfill//HIPAA Patient Booking//EN',
      'BEGIN:VEVENT',
      `UID:${bookingRef}@chairfill.app`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${visitType.name} — ${practice.name}`,
      `DESCRIPTION:Appointment with ${practice.name}. Booking Reference: ${bookingRef}. Please arrive 10 minutes early.`,
      `LOCATION:${practice.address}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appointment_${bookingRef}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openGoogleCalendar = () => {
    const [h, m] = selectedTime.split(':').map(Number);
    const start = new Date(selectedDate + 'T00:00:00');
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + visitType.duration * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const title = encodeURIComponent(`${visitType.name} — ${practice.name}`);
    const details = encodeURIComponent(
      `Appointment at ${practice.name}. Booking Ref: ${bookingRef}. Address: ${practice.address}`
    );
    const loc = encodeURIComponent(practice.address);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${loc}`;

    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#f4f0e8] text-[#1e2a28] flex flex-col justify-between">
      {/* Return to staff workspace bar */}
      <div className="bg-[#1e2a28] text-[#f4f0e8] px-4 py-2 text-xs flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#a3533a]" />
          <span>Patient-Facing Booking Portal (Live View)</span>
        </div>
        <button
          onClick={onReturnToDashboard}
          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-[#f4f0e8] text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Staff Dashboard</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-lg mx-auto flex-1 flex flex-col p-4 sm:p-6">
        {/* Practice Header & Switcher */}
        <div className="p-4 bg-white/60 border border-[#1e2a28]/15 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-sm bg-white">
                {practice.initials}
              </div>
              <div>
                <h1 className="font-bold text-base text-[#1e2a28]">{practice.name}</h1>
                <p className="text-xs text-[#1e2a28]/60">{practice.tagline}</p>
              </div>
            </div>

            {/* Practice switcher */}
            <select
              value={selectedPracticeSlug}
              onChange={(e) => {
                setSelectedPracticeSlug(e.target.value);
                setSelectedProviderId('any');
              }}
              className="text-[11px] bg-white border border-[#1e2a28]/20 px-2 py-1"
            >
              <option value="lakeside-dental">Lakeside Dental (MN)</option>
              <option value="riverside-family">Riverside Family (NY)</option>
            </select>
          </div>
        </div>

        {/* Progress Bar */}
        {step < 5 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#a3533a] uppercase tracking-wider">
              <span>Step {step} of 4</span>
              <span>{['', 'Visit Type', 'Time & Date', 'Patient Details', 'Review Booking'][step]}</span>
            </div>
            <div className="h-1 bg-[#1e2a28]/15 w-full">
              <div
                className="h-full bg-[#1e2a28] transition-all duration-300"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 1: Visit Type & Provider */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#1e2a28]">What can we help with?</h2>
              <p className="text-xs text-[#1e2a28]/60 mt-1">
                Select your visit type, then choose your preferred provider.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#a3533a]">
                Visit Type
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {practice.visitTypes.map((type) => {
                  const isSelected = selectedVisitTypeId === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => {
                        setSelectedVisitTypeId(type.id);
                        if (!type.providers.includes(selectedProviderId)) {
                          setSelectedProviderId('any');
                        }
                      }}
                      className={`p-3 text-left border transition-all ${
                        isSelected
                          ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                          : 'bg-white/60 text-[#1e2a28] border-[#1e2a28]/15 hover:border-[#1e2a28]'
                      }`}
                    >
                      <div className="font-semibold text-xs leading-snug">{type.name}</div>
                      <div
                        className={`text-[11px] mt-1 ${
                          isSelected ? 'text-[#f4f0e8]/70' : 'text-[#1e2a28]/50'
                        }`}
                      >
                        ~{type.duration} mins
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Provider List */}
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#a3533a]">
                Provider Preference
              </div>
              <div className="space-y-1.5">
                <button
                  onClick={() => setSelectedProviderId('any')}
                  className={`w-full p-2.5 text-left border flex items-center gap-3 transition-colors ${
                    selectedProviderId === 'any'
                      ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                      : 'bg-white/60 text-[#1e2a28] border-[#1e2a28]/15 hover:border-[#1e2a28]'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center font-bold text-xs shrink-0">
                    ✦
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs">Any available provider</div>
                    <div
                      className={`text-[10px] ${
                        selectedProviderId === 'any' ? 'text-[#f4f0e8]/70' : 'text-[#1e2a28]/50'
                      }`}
                    >
                      Fastest booking · Matches soonest open chair
                    </div>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider font-bold border border-current px-1.5 py-0.5">
                    Fastest
                  </span>
                </button>

                {eligibleProviders.map((p) => {
                  const isSelected = selectedProviderId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProviderId(p.id)}
                      className={`w-full p-2.5 text-left border flex items-center gap-3 transition-colors ${
                        isSelected
                          ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                          : 'bg-white/60 text-[#1e2a28] border-[#1e2a28]/15 hover:border-[#1e2a28]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center font-bold text-xs shrink-0">
                        {p.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs">{p.name}</div>
                        <div
                          className={`text-[10px] ${
                            isSelected ? 'text-[#f4f0e8]/70' : 'text-[#1e2a28]/50'
                          }`}
                        >
                          {p.role}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Date & Time Picker */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#1e2a28]">Choose an appointment time</h2>
              <p className="text-xs text-[#1e2a28]/60 mt-1">
                {visitType.name} with{' '}
                {selectedProviderId === 'any'
                  ? 'Any Available Provider'
                  : practice.providers.find((p) => p.id === selectedProviderId)?.name}
              </p>
            </div>

            {/* Date strip */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#a3533a]">
                Select Date
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {upcomingDays.map((d) => {
                  const isSelected = selectedDate === d.iso;
                  return (
                    <button
                      key={d.iso}
                      disabled={d.isSunday}
                      onClick={() => setSelectedDate(d.iso)}
                      className={`w-14 p-2 text-center border shrink-0 transition-colors ${
                        d.isSunday
                          ? 'opacity-30 border-[#1e2a28]/10 cursor-not-allowed bg-white/20'
                          : isSelected
                          ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                          : 'bg-white/60 text-[#1e2a28] border-[#1e2a28]/15 hover:border-[#1e2a28]'
                      }`}
                    >
                      <div className="text-[10px] font-semibold uppercase">{d.dow}</div>
                      <div className="text-base font-bold font-tabular mt-0.5">{d.dayNum}</div>
                      <div
                        className={`w-1 h-1 rounded-full mx-auto mt-1 ${
                          isSelected ? 'bg-[#f4f0e8]' : d.isSunday ? 'bg-transparent' : 'bg-[#a3533a]'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slot Groups */}
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/70">
                  Morning Slots
                </div>
                <div className="grid grid-cols-3 gap-2 font-tabular text-xs">
                  {morningSlots.map((slot) => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={`py-2 px-1 text-center border font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                            : 'bg-white/70 text-[#1e2a28] border-[#1e2a28]/15 hover:border-[#1e2a28]'
                        }`}
                      >
                        {slot} AM
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/70">
                  Afternoon Slots
                </div>
                <div className="grid grid-cols-3 gap-2 font-tabular text-xs">
                  {afternoonSlots.map((slot) => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={`py-2 px-1 text-center border font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                            : 'bg-white/70 text-[#1e2a28] border-[#1e2a28]/15 hover:border-[#1e2a28]'
                        }`}
                      >
                        {slot} PM
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Patient Details & HIPAA Consent */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-[#1e2a28]">Your Contact Details</h2>
              <p className="text-xs text-[#1e2a28]/60 mt-1">
                We will send your confidential booking confirmation and calendar invite here.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1e2a28] mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Jordan"
                  className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Reyes"
                  className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Mobile Phone *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1e2a28] mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.com"
                className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
              />
            </div>

            {/* New or Returning toggle */}
            <div>
              <label className="block text-xs font-semibold text-[#1e2a28] mb-1.5">
                Are you a new or returning patient?
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsNewPatient(true)}
                  className={`p-2 border text-center transition-colors ${
                    isNewPatient
                      ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                      : 'bg-white/60 text-[#1e2a28] border-[#1e2a28]/20'
                  }`}
                >
                  New Patient
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewPatient(false)}
                  className={`p-2 border text-center transition-colors ${
                    !isNewPatient
                      ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                      : 'bg-white/60 text-[#1e2a28] border-[#1e2a28]/20'
                  }`}
                >
                  Returning Patient
                </button>
              </div>
            </div>

            {/* Notes with HIPAA Warning */}
            <div>
              <label className="block text-xs font-semibold text-[#1e2a28] mb-1">
                Scheduling Preferences{' '}
                <span className="font-normal text-[#1e2a28]/50">
                  (optional; please do NOT enter medical history or health details here)
                </span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Prefer early morning or parking inquiries"
                className="w-full p-2 bg-white border border-[#1e2a28]/25 text-xs text-[#1e2a28]"
              />
            </div>

            {/* Explicit TCPA & HIPAA Consent Checkbox */}
            <div className="p-3 bg-white/80 border border-[#1e2a28]/20 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#1e2a28]">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 accent-[#1e2a28]"
                />
                <span className="leading-relaxed">
                  {TCPA_CONSENT_STATEMENT(practice.name)}
                </span>
              </label>

              <div className="pt-1 flex items-center justify-between text-[11px] text-[#1e2a28]/60 border-t border-[#1e2a28]/10">
                <span>Optional. Confirmations are always emailed.</span>
                <button
                  type="button"
                  onClick={() => setIsNPPModalOpen(true)}
                  className="text-[#a3533a] underline font-semibold"
                >
                  Notice of Privacy Practices (NPP)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review Booking */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-[#1e2a28]">Review Your Appointment</h2>
              <p className="text-xs text-[#1e2a28]/60 mt-1">
                Please verify your details before confirming.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white border border-[#1e2a28]/15 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                  <span>Visit Information</span>
                  <button onClick={() => setStep(1)} className="text-[#a3533a] underline font-normal">
                    Edit
                  </button>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/10 pb-1.5">
                  <span className="text-[#1e2a28]/60">Visit Type</span>
                  <span className="font-semibold text-[#1e2a28]">{visitType.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1e2a28]/60">Provider</span>
                  <span className="font-semibold text-[#1e2a28]">
                    {selectedProviderId === 'any'
                      ? 'Any Available Provider (Fastest)'
                      : practice.providers.find((p) => p.id === selectedProviderId)?.name}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white border border-[#1e2a28]/15 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                  <span>Date &amp; Time</span>
                  <button onClick={() => setStep(2)} className="text-[#a3533a] underline font-normal">
                    Edit
                  </button>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/10 pb-1.5">
                  <span className="text-[#1e2a28]/60">Date</span>
                  <span className="font-semibold text-[#1e2a28]">{selectedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1e2a28]/60">Time</span>
                  <span className="font-semibold text-[#1e2a28] font-tabular">
                    {selectedTime} (~{visitType.duration} mins)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white border border-[#1e2a28]/15 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                  <span>Patient &amp; Notifications</span>
                  <button onClick={() => setStep(3)} className="text-[#a3533a] underline font-normal">
                    Edit
                  </button>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/10 pb-1.5">
                  <span className="text-[#1e2a28]/60">Name</span>
                  <span className="font-semibold text-[#1e2a28]">
                    {firstName} {lastName}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/10 pb-1.5">
                  <span className="text-[#1e2a28]/60">Mobile</span>
                  <span className="font-semibold text-[#1e2a28] font-tabular">{phone}</span>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/10 pb-1.5">
                  <span className="text-[#1e2a28]/60">Email</span>
                  <span className="font-semibold text-[#1e2a28]">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1e2a28]/60">SMS Reminders</span>
                  <span className="font-semibold text-[#1e2a28]">
                    {consentChecked ? 'Yes (Opted In)' : 'No (Email Only)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && (
          <div className="space-y-6 text-center py-4">
            <div className="w-14 h-14 rounded-full border-2 border-[#1e2a28] flex items-center justify-center mx-auto text-[#1e2a28]">
              <CheckCircle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-[#1e2a28]">You&apos;re Booked!</h2>
              <p className="text-xs text-[#1e2a28]/60 mt-1">
                We look forward to seeing you at {practice.name}.
              </p>
            </div>

            {/* Tokenized Reference Card */}
            <div className="p-4 bg-white border border-[#1e2a28]/20 text-left space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#1e2a28]/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/50">
                  Booking Reference
                </span>
                <span className="font-mono font-bold text-sm text-[#a3533a]">{bookingRef}</span>
              </div>

              <div className="space-y-1.5 text-xs text-[#1e2a28]/80">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-[#1e2a28]/60 shrink-0" />
                  <span>
                    <strong>{visitType.name}</strong> · {practice.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-[#1e2a28]/60 shrink-0" />
                  <span>{selectedDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#1e2a28]/60 shrink-0" />
                  <span className="font-tabular">
                    {selectedTime} (~{visitType.duration} mins)
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Multi-Channel Notification Status */}
            <div className="p-3 bg-white/60 border border-[#1e2a28]/15 text-left space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                Confirmation Dispatch Status
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[#1e2a28]">
                    <Mail className="w-3.5 h-3.5 text-[#1e2a28]/60" />
                    <span>Email Confirmation ({email})</span>
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-800">
                    {notificationStatuses.email ? 'Sent ✓' : 'Dispatching…'}
                  </span>
                </div>
                {consentChecked && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#1e2a28]">
                      <MessageSquare className="w-3.5 h-3.5 text-[#1e2a28]/60" />
                      <span>SMS Text Alert ({phone})</span>
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-800">
                      {notificationStatuses.sms ? 'Sent ✓' : 'Dispatching…'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Add to Calendar */}
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
                Add to Your Calendar
              </div>
              <div className="flex gap-2">
                <button
                  onClick={downloadICS}
                  className="flex-1 py-2.5 px-3 border border-[#1e2a28]/25 bg-white text-xs font-semibold hover:bg-[#1e2a28]/5 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .ics</span>
                </button>
                <button
                  onClick={openGoogleCalendar}
                  className="flex-1 py-2.5 px-3 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span>Google Calendar</span>
                </button>
              </div>
            </div>

            {/* Link back to dashboard */}
            <div className="pt-4 border-t border-[#1e2a28]/15">
              <button
                onClick={onReturnToDashboard}
                className="w-full py-2.5 bg-[#a3533a] text-[#f4f0e8] text-xs font-semibold hover:bg-[#a3533a]/90 transition-colors"
              >
                View Appointment on Staff Operatory Schedule →
              </button>
            </div>
          </div>
        )}

        {/* Step Navigation Buttons (Steps 1 to 4) */}
        {step < 5 && (
          <div className="pt-6 flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((prev) => prev - 1)}
                className="py-2.5 px-4 border border-[#1e2a28]/25 text-xs font-semibold hover:bg-white transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={step === 3 && !isFormValid}
              className="flex-1 py-2.5 px-4 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>{step === 4 ? 'Confirm Appointment' : 'Continue'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Notice of Privacy Practices Modal */}
      {isNPPModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#f4f0e8] border border-[#1e2a28] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e2a28]/15">
              <h3 className="font-semibold text-base text-[#1e2a28]">
                Notice of Privacy Practices (NPP)
              </h3>
              <button onClick={() => setIsNPPModalOpen(false)} className="p-1 text-[#1e2a28]/60 hover:text-[#1e2a28]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 text-xs text-[#1e2a28]/80 space-y-3 leading-relaxed">
              <p>
                <strong>Effective Date:</strong> January 1, 2025 · Complies with 45 CFR § 164.520
              </p>
              <p>
                This notice describes how health information about you may be used and disclosed and how you can get access to this information. Please review it carefully.
              </p>
              <div className="p-3 bg-white border border-[#1e2a28]/10 space-y-1">
                <strong>Our Legal Duty</strong>
                <p>
                  We are required by applicable federal and state law to maintain the privacy of your health information. We are also required to give you this Notice about our privacy practices, legal duties, and your rights concerning your health information.
                </p>
              </div>
              <div className="p-3 bg-white border border-[#1e2a28]/10 space-y-1">
                <strong>Electronic Communications &amp; SMS</strong>
                <p>
                  Text messages (SMS) are sent only with your express consent. To safeguard your ePHI, SMS messages are strictly restricted to generic scheduling notifications and will never include diagnosis or sensitive treatment records.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsNPPModalOpen(false)}
                className="px-4 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-4 text-center text-[11px] text-[#1e2a28]/50 border-t border-[#1e2a28]/10">
        Powered by <strong>Chairfill</strong> · HIPAA &amp; TCPA Compliant Scheduling Platform
      </footer>
    </div>
  );
};
