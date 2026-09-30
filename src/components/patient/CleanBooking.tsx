import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { bookingRef as makeBookingRef, initialsOf, todayShort, uid } from '../../lib/format';
import { TCPA_CONSENT_STATEMENT } from '../../services/hipaaCompliance';
import { Appointment, Patient } from '../../types/hipaa';

interface CleanBookingProps {
  onBack: () => void;
  onBooked: (appt: Appointment, patient: Patient) => void;
}

export const CleanBooking: React.FC<CleanBookingProps> = ({ onBack, onBooked }) => {
  const { logAudit } = useHIPAA();
  const { practice } = usePractice();

  const [step, setStep] = useState(1);
  const [visitType, setVisitType] = useState<any>(null);
  const [provider, setProvider] = useState('any');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [newPatient, setNewPatient] = useState(true);
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  const [bookedWith, setBookedWith] = useState('');

  const [notifEmail, setNotifEmail] = useState(false);
  const [notifSms, setNotifSms] = useState(false);

  // Generate 21 days
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return {
      iso: d.toISOString().slice(0, 10),
      dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
      num: d.getDate(),
      closed: d.getDay() === 0,
    };
  });

  const slots = [
    { time: '09:00', label: '9:00 AM' },
    { time: '09:30', label: '9:30 AM' },
    { time: '10:00', label: '10:00 AM' },
    { time: '10:30', label: '10:30 AM' },
    { time: '11:00', label: '11:00 AM' },
    { time: '01:30', label: '1:30 PM' },
    { time: '02:00', label: '2:00 PM' },
    { time: '02:30', label: '2:30 PM' },
    { time: '03:00', label: '3:00 PM' },
  ];

  const isValidForm =
    firstName.trim() &&
    lastName.trim() &&
    /^\+?[\d\s()-]{7,}$/.test(phone.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleContinue = () => {
    if (step < 4) {
      setStep((s) => s + 1);
      window.scrollTo(0, 0);
    } else {
      const ref = makeBookingRef();
      setBookingRef(ref);

      const resolvedProvider =
        provider === 'any'
          ? (practice.providers.find((p) => p.op)?.name ?? 'Your provider')
          : practice.providers.find((p) => p.id === provider)?.name || (practice.providers.find((p) => p.op)?.name ?? 'Your provider');
      setBookedWith(resolvedProvider);

      const [h, m] = (time || '09:30').split(':').map(Number);
      const mins = h * 60 + m;
      const formatted = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;

      const newAppt: Appointment = {
        id: uid('appt'),
        time: formatted,
        mins,
        dur: visitType.duration,
        patient: `${firstName} ${lastName}`,
        initials: initialsOf(`${firstName} ${lastName}`),
        provider: resolvedProvider,
        op: 'Op 1',
        treatment: visitType.name,
        status: 'scheduled',
      };

      const newPat: Patient = {
        id: uid('p'),
        name: `${firstName} ${lastName}`,
        initials: initialsOf(`${firstName} ${lastName}`),
        phone,
        email,
        lastVisit: date || todayShort(practice.timezone),
        recentVisit: `${visitType.name} · ${formatted}`,
        status: 'Active',
        smsConsent: consent,
        smsConsentAt: consent ? new Date().toISOString() : undefined,
      };

      onBooked(newAppt, newPat);
      logAudit('PATIENT_BOOKED', `Online booking ref ${ref} for ${firstName} ${lastName}`);

      setStep(5);
      window.scrollTo(0, 0);

      setTimeout(() => setNotifEmail(true), 900);
      if (consent) setTimeout(() => setNotifSms(true), 1500);
    }
  };

  const ctaDisabled = () => {
    if (step === 1) return !visitType;
    if (step === 2) return !(date && time);
    if (step === 3) return !isValidForm;
    return false;
  };

  return (
    <div className="min-h-screen bg-[#f4f0e8] text-[#1e2a28] flex flex-col justify-between">
      <div className="max-w-[480px] w-full mx-auto my-0 sm:my-4 border-0 sm:border border-[#1e2a28]/14 bg-[#f4f0e8] flex flex-col min-h-screen sm:min-h-[calc(100vh-32px)]">
        {/* Topbar */}
        <div className="p-4 px-5 border-b border-[#1e2a28]/14 bg-[#f4f0e8]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-[34px] h-[34px] rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-[13px]">
                {practice.initials}
              </div>
              <div>
                <div className="font-bold text-[15px] leading-tight">{practice.name}</div>
                <div className="text-[12px] text-[#1e2a28]/70 mt-0.5">Book your visit — takes about a minute</div>
              </div>
            </div>
            <button
              onClick={onBack}
              className="text-[11px] underline text-[#a3533a] font-semibold"
            >
              Exit to app
            </button>
          </div>
        </div>

        {/* Progress */}
        {step < 5 && (
          <div className="p-3 px-5 pb-0 bg-[#f4f0e8]">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-[13px] font-semibold text-[#1e2a28]/70 hover:text-[#1e2a28] mb-2 flex items-center gap-1"
              >
                ‹ Back
              </button>
            )}
            <div className="h-[3px] bg-[#1e2a28]/12 w-full">
              <div
                className="h-full bg-[#1e2a28] transition-all"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#a3533a] my-2 uppercase font-bold tracking-widest">
              <span>Step {step} of 4</span>
              <span>{['', 'Visit', 'Time', 'Details', 'Review'][step]}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-5 pb-24 overflow-y-auto">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-[23px] font-medium tracking-tight m-0">What can we help with?</h1>
              <p className="text-[13px] text-[#1e2a28]/70 m-0">Pick a visit type, then choose who you&apos;d like to see.</p>

              <div className="text-[11px] uppercase font-bold text-[#a3533a] tracking-widest pt-2">Visit type</div>
              <div className="grid grid-cols-2 gap-2.5">
                {practice.visitTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setVisitType(t)}
                    className={`p-3 text-left border flex flex-col gap-1 transition-colors ${
                      visitType?.id === t.id
                        ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                        : 'border-[#1e2a28]/16 bg-[#f4f0e8] hover:border-[#1e2a28]'
                    }`}
                  >
                    <span className="font-semibold text-[13.5px] leading-tight">{t.name}</span>
                    <span className={`text-[11px] ${visitType?.id === t.id ? 'text-[#f4f0e8]/75' : 'text-[#1e2a28]/70'}`}>
                      ~{t.duration} min
                    </span>
                  </button>
                ))}
              </div>

              {visitType && (
                <div className="space-y-2 pt-3">
                  <div className="text-[11px] uppercase font-bold text-[#a3533a] tracking-widest">Provider</div>
                  <div className="space-y-2">
                    <button
                      onClick={() => setProvider('any')}
                      className={`w-full p-2.5 px-3 border text-left flex items-center gap-3 transition-colors ${
                        provider === 'any'
                          ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                          : 'border-[#1e2a28]/16 bg-[#f4f0e8] hover:border-[#1e2a28]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center font-bold text-xs shrink-0">
                        ✦
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[13.5px]">Any available provider</div>
                        <div className={`text-[11px] ${provider === 'any' ? 'text-[#f4f0e8]/75' : 'text-[#1e2a28]/70'}`}>
                          We&apos;ll match you to the soonest opening
                        </div>
                      </div>
                      <span className="text-[11px] uppercase font-bold tracking-wider border border-current px-2 py-0.5 rounded-full">
                        Fastest
                      </span>
                    </button>

                    {practice.providers
                      .filter((p) => p.id !== 'any' && visitType.providers.includes(p.id))
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setProvider(p.id)}
                          className={`w-full p-2.5 px-3 border text-left flex items-center gap-3 transition-colors ${
                            provider === p.id
                              ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                              : 'border-[#1e2a28]/16 bg-[#f4f0e8] hover:border-[#1e2a28]'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center font-bold text-xs shrink-0">
                            {p.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[13.5px]">{p.name}</div>
                            <div className={`text-[11px] ${provider === p.id ? 'text-[#f4f0e8]/75' : 'text-[#1e2a28]/70'}`}>
                              {p.role}
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-[23px] font-medium tracking-tight m-0">Choose a time</h1>
              <p className="text-[13px] text-[#1e2a28]/70 m-0">{visitType?.name}</p>

              <div className="flex items-center gap-2 text-[11px] text-[#1e2a28]/70">
                <span className="w-2 h-2 rounded-full bg-[#a3533a] inline-block animate-pulse" />
                <span>Live availability, synced with the practice calendar</span>
              </div>

              {/* Date strip */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((d) => (
                  <button
                    key={d.iso}
                    disabled={d.closed}
                    onClick={() => setDate(d.iso)}
                    className={`w-[54px] p-2 text-center border shrink-0 transition-colors ${
                      d.closed
                        ? 'opacity-35 cursor-not-allowed border-[#1e2a28]/16'
                        : date === d.iso
                        ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                        : 'border-[#1e2a28]/16 bg-[#f4f0e8] hover:border-[#1e2a28]'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase">{d.dow}</div>
                    <div className="text-[16px] font-bold tabular-nums mt-0.5">{d.num}</div>
                    <div className={`w-1 h-1 rounded-full mx-auto mt-1 ${date === d.iso ? 'bg-[#f4f0e8]' : 'bg-[#a3533a]'}`} />
                  </button>
                ))}
              </div>

              {/* Slots */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1e2a28]">Openings</div>
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      onClick={() => setTime(s.time)}
                      className={`p-2.5 text-center border text-[12.5px] font-semibold tabular-nums transition-colors ${
                        time === s.time
                          ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                          : 'border-[#1e2a28]/16 bg-[#f4f0e8] hover:border-[#1e2a28]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-3.5">
              <h1 className="text-[23px] font-medium tracking-tight m-0">Your details</h1>
              <p className="text-[13px] text-[#1e2a28]/70 m-0">We&apos;ll send your confirmation to the contact info below.</p>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <div>
                  <label htmlFor="f-cleanbooking-13922" className="block text-[12px] font-semibold mb-1">First name</label>
                  <input id="f-cleanbooking-13922"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jordan"
                    className="w-full p-2.5 bg-transparent border border-[#1e2a28]/18 text-sm focus:outline-none focus:border-[#1e2a28]"
                  />
                </div>
                <div>
                  <label htmlFor="f-cleanbooking-14421" className="block text-[12px] font-semibold mb-1">Last name</label>
                  <input id="f-cleanbooking-14421"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Reyes"
                    className="w-full p-2.5 bg-transparent border border-[#1e2a28]/18 text-sm focus:outline-none focus:border-[#1e2a28]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="f-cleanbooking-14934" className="block text-[12px] font-semibold mb-1">Mobile number</label>
                <input id="f-cleanbooking-14934"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full p-2.5 bg-transparent border border-[#1e2a28]/18 text-sm focus:outline-none focus:border-[#1e2a28]"
                />
              </div>

              <div>
                <label htmlFor="f-cleanbooking-15416" className="block text-[12px] font-semibold mb-1">Email</label>
                <input id="f-cleanbooking-15416"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jordan@email.com"
                  className="w-full p-2.5 bg-transparent border border-[#1e2a28]/18 text-sm focus:outline-none focus:border-[#1e2a28]"
                />
              </div>

              <div className="pt-1">
                <label className="block text-[11px] uppercase font-bold text-[#a3533a] tracking-widest mb-1.5">
                  Are you a new or returning patient?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPatient(true)}
                    className={`flex-1 p-2.5 border text-center text-[13px] font-semibold transition-colors ${
                      newPatient
                        ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                        : 'border-[#1e2a28]/16 bg-[#f4f0e8]'
                    }`}
                  >
                    New patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPatient(false)}
                    className={`flex-1 p-2.5 border text-center text-[13px] font-semibold transition-colors ${
                      !newPatient
                        ? 'border-[#1e2a28] bg-[#1e2a28] text-[#f4f0e8]'
                        : 'border-[#1e2a28]/16 bg-[#f4f0e8]'
                    }`}
                  >
                    Returning patient
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold mb-1">
                  Scheduling notes <span className="font-normal text-[#1e2a28]/70">(optional; please don&apos;t include health details)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. prefer early mornings"
                  className="w-full p-2.5 bg-transparent border border-[#1e2a28]/18 text-sm min-h-[64px] focus:outline-none focus:border-[#1e2a28]"
                />
              </div>

              {/* Consent */}
              <div className="p-3 bg-[#1e2a28]/[0.04] border border-[#1e2a28]/12 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 accent-[#1e2a28]"
                />
                <p className="text-[12px] text-[#1e2a28]/70 m-0 leading-relaxed">
                  {TCPA_CONSENT_STATEMENT(practice.name)}
                </p>
              </div>
              <p className="text-[11px] text-[#1e2a28]/70 m-0">Optional. We&apos;ll always email your confirmation.</p>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h1 className="text-[23px] font-medium tracking-tight m-0">Review your booking</h1>
              <p className="text-[13px] text-[#1e2a28]/70 m-0">Double check the details below, then confirm.</p>

              <div className="border border-[#1e2a28]/16 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest text-[#1e2a28]/70">
                  <span>Visit</span>
                  <button onClick={() => setStep(1)} className="text-[#a3533a]">Edit</button>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/12 pb-2">
                  <span className="text-[#1e2a28]/70">Type</span>
                  <strong className="font-semibold">{visitType?.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1e2a28]/70">Provider</span>
                  <strong className="font-semibold">{provider === 'any' ? 'Any available provider' : provider}</strong>
                </div>
              </div>

              <div className="border border-[#1e2a28]/16 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest text-[#1e2a28]/70">
                  <span>Time</span>
                  <button onClick={() => setStep(2)} className="text-[#a3533a]">Edit</button>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/12 pb-2">
                  <span className="text-[#1e2a28]/70">Date</span>
                  <strong className="font-semibold">{date}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1e2a28]/70">Time</span>
                  <strong className="font-semibold">{time}</strong>
                </div>
              </div>

              <div className="border border-[#1e2a28]/16 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest text-[#1e2a28]/70">
                  <span>Contact</span>
                  <button onClick={() => setStep(3)} className="text-[#a3533a]">Edit</button>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/12 pb-2">
                  <span className="text-[#1e2a28]/70">Name</span>
                  <strong className="font-semibold">{firstName} {lastName}</strong>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/12 pb-2">
                  <span className="text-[#1e2a28]/70">Phone</span>
                  <strong className="font-semibold tabular-nums">{phone}</strong>
                </div>
                <div className="flex justify-between border-b border-[#1e2a28]/12 pb-2">
                  <span className="text-[#1e2a28]/70">Email</span>
                  <strong className="font-semibold">{email}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1e2a28]/70">Text reminders</span>
                  <strong className="font-semibold">{consent ? 'Yes' : 'No (email only)'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Confirmation */}
          {step === 5 && (
            <div className="space-y-5 text-center pt-2">
              <div className="w-[60px] h-[60px] rounded-full border-[1.5px] border-[#1e2a28] flex items-center justify-center mx-auto text-[28px]">
                ✓
              </div>
              <h1 className="text-[21px] font-medium tracking-tight m-0">You&apos;re booked</h1>
              <p className="text-[13px] text-[#1e2a28]/70 m-0 leading-relaxed">
                See you at {practice.name} on {date}, {time}.
              </p>

              <div className="border border-[#1e2a28]/16 p-4 text-left text-xs space-y-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#1e2a28]/70">Booking reference</div>
                  <div className="text-[15px] font-semibold text-[#a3533a] tabular-nums mt-0.5">{bookingRef}</div>
                </div>
                <div className="h-[1px] bg-[#1e2a28]/14" />
                <div className="space-y-2 text-[13.5px]">
                  <div>{visitType?.name} — <b>{bookedWith}</b></div>
                  <div><b>{date}</b></div>
                  <div><b>{time}</b> (~{visitType?.duration} min)</div>
                </div>
              </div>

              {/* Notification status */}
              <div className="text-left space-y-2">
                <div className="text-[11px] uppercase font-bold text-[#a3533a] tracking-widest">Sending your confirmation</div>
                <div className="border border-[#1e2a28]/16 p-3 flex items-center justify-between text-xs">
                  <span>Email</span>
                  <span className="text-emerald-800 font-semibold">{notifEmail ? 'Sent ✓' : 'Sending…'}</span>
                </div>
                {consent && (
                  <div className="border border-[#1e2a28]/16 p-3 flex items-center justify-between text-xs">
                    <span>Text message</span>
                    <span className="text-emerald-800 font-semibold">{notifSms ? 'Sent ✓' : 'Sending…'}</span>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={onBack}
                  className="w-full p-3 bg-[#1e2a28] text-[#f4f0e8] text-[13px] font-semibold"
                >
                  Back to Plenire
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky CTA bar for steps 1-4 */}
        {step < 5 && (
          <div className="p-4 px-5 border-t border-[#1e2a28]/14 bg-[#f4f0e8] sticky bottom-0">
            <button
              onClick={handleContinue}
              disabled={ctaDisabled()}
              className="w-full py-3.5 bg-[#1e2a28] text-[#f4f0e8] text-[15px] font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {step === 4 ? 'Confirm booking' : 'Continue ›'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
