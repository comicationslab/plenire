import React, { useState } from 'react';
import { HIPAAProvider } from './context/HIPAAContext';
import { CleanLayout } from './components/CleanLayout';
import { CleanToday } from './components/views/CleanToday';
import { CleanRecovery } from './components/views/CleanRecovery';
import { CleanMessages } from './components/views/CleanMessages';
import { CleanPatients } from './components/views/CleanPatients';
import { CleanWaitlist } from './components/views/CleanWaitlist';
import { CleanSettings } from './components/views/CleanSettings';
import { CleanBooking } from './components/patient/CleanBooking';
import {
  INITIAL_APPOINTMENTS,
  INITIAL_CONVERSATIONS,
  INITIAL_PATIENTS,
  INITIAL_RECOVERY,
  INITIAL_WAITLIST,
} from './data/initialData';
import { Appointment, Conversation, Patient, RecoveryOpening, WaitlistEntry } from './types/hipaa';

export default function App() {
  const [appMode, setAppMode] = useState<'staff' | 'booking'>('staff');
  const [activeView, setActiveView] = useState<string>('today');

  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [openings, setOpenings] = useState<RecoveryOpening[]>(INITIAL_RECOVERY);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(INITIAL_WAITLIST);
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);

  const handleAddRecoveryOpening = (newOp: any) => {
    setOpenings((prev) => [{ id: `rec-${Date.now()}`, ...newOp, offers: [] }, ...prev]);
  };

  const handleBooked = (appt: Appointment, patient: Patient) => {
    setAppointments((prev) => [...prev, appt]);
    setPatients((prev) => [patient, ...prev]);
  };

  return (
    <HIPAAProvider>
      {appMode === 'booking' ? (
        <CleanBooking
          onBack={() => setAppMode('staff')}
          onBooked={handleBooked}
        />
      ) : (
        <CleanLayout
          activeView={activeView}
          onNavigate={(view) => setActiveView(view)}
          onOpenBooking={() => setAppMode('booking')}
        >
          {activeView === 'today' && (
            <CleanToday
              appointments={appointments}
              setAppointments={setAppointments}
              patients={patients}
              setPatients={setPatients}
              onGoToRecovery={() => setActiveView('recovery')}
              onAddRecoveryOpening={handleAddRecoveryOpening}
            />
          )}

          {activeView === 'recovery' && (
            <CleanRecovery
              openings={openings}
              setOpenings={setOpenings}
              waitlist={waitlist}
              setWaitlist={setWaitlist}
              patients={patients}
              setPatients={setPatients}
              appointments={appointments}
              setAppointments={setAppointments}
              conversations={conversations}
              setConversations={setConversations}
              onGoToMessages={() => setActiveView('messages')}
            />
          )}

          {activeView === 'messages' && (
            <CleanMessages
              conversations={conversations}
              setConversations={setConversations}
              patients={patients}
            />
          )}

          {activeView === 'patients' && (
            <CleanPatients patients={patients} setPatients={setPatients} />
          )}

          {activeView === 'waitlist' && <CleanWaitlist waitlist={waitlist} />}

          {activeView === 'settings' && <CleanSettings />}
        </CleanLayout>
      )}
    </HIPAAProvider>
  );
}
