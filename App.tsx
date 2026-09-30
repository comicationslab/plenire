import { useState } from 'react';
import { PracticeProvider, usePractice } from './context/PracticeContext';
import { HIPAAProvider } from './context/HIPAAContext';
import { CleanLayout } from './components/CleanLayout';
import { DashboardFrontDesk } from './components/views/DashboardFrontDesk';
import { DashboardOwner } from './components/views/DashboardOwner';
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
import { uid } from './lib/format';

function AppShell() {
  const { role } = usePractice();
  const [appMode, setAppMode] = useState<'staff' | 'booking'>('staff');
  const [activeView, setActiveView] = useState<string>('dashboard');

  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [openings, setOpenings] = useState<RecoveryOpening[]>(INITIAL_RECOVERY);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(INITIAL_WAITLIST);
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);

  const handleAddRecoveryOpening = (newOp: Omit<RecoveryOpening, 'id' | 'offers'>) => {
    setOpenings((prev) => [{ id: uid('rec'), ...newOp, offers: [] }, ...prev]);
  };

  const handleBooked = (appt: Appointment, patient: Patient) => {
    setAppointments((prev) => [...prev, appt]);
    setPatients((prev) => [patient, ...prev]);
  };

  if (appMode === 'booking') {
    return <CleanBooking onBack={() => setAppMode('staff')} onBooked={handleBooked} />;
  }

  return (
    <CleanLayout activeView={activeView} onNavigate={setActiveView} onOpenBooking={() => setAppMode('booking')}>
      {activeView === 'dashboard' &&
        (role === 'owner' ? (
          <DashboardOwner openings={openings} onNavigate={setActiveView} />
        ) : (
          <DashboardFrontDesk openings={openings} conversations={conversations} appointments={appointments} onNavigate={setActiveView} />
        ))}

      {activeView === 'today' && (
        <CleanToday
          appointments={appointments}
          setAppointments={setAppointments}
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
          setConversations={setConversations}
        />
      )}

      {activeView === 'messages' && (
        <CleanMessages conversations={conversations} setConversations={setConversations} />
      )}
      {activeView === 'patients' && <CleanPatients patients={patients} />}
      {activeView === 'waitlist' && <CleanWaitlist waitlist={waitlist} />}
      {activeView === 'settings' && <CleanSettings />}
    </CleanLayout>
  );
}

export default function App() {
  return (
    <PracticeProvider>
      <HIPAAProvider>
        <AppShell />
      </HIPAAProvider>
    </PracticeProvider>
  );
}
