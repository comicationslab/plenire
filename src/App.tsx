import React, { useState } from 'react';
import { HIPAAProvider } from './context/HIPAAContext';
import { LockScreenModal } from './components/LockScreenModal';
import { TopHeader } from './components/TopHeader';
import { Sidebar } from './components/Sidebar';
import { TodayScheduleView } from './components/views/TodayScheduleView';
import { RecoveryFillView } from './components/views/RecoveryFillView';
import { MessagesInboxView } from './components/views/MessagesInboxView';
import { PatientsCRMView } from './components/views/PatientsCRMView';
import { WaitlistQueueView } from './components/views/WaitlistQueueView';
import { HIPAAComplianceCenterView } from './components/views/HIPAAComplianceCenterView';
import { SettingsView } from './components/views/SettingsView';
import { PatientBookingPortal } from './components/patient/PatientBookingPortal';
import {
  INITIAL_APPOINTMENTS,
  INITIAL_CONVERSATIONS,
  INITIAL_PATIENTS,
  INITIAL_RECOVERY,
  INITIAL_WAITLIST,
} from './data/initialData';
import { Appointment, Conversation, Patient, RecoveryOpening, WaitlistEntry } from './types/hipaa';

export default function App() {
  const [appMode, setAppMode] = useState<'staff' | 'patient'>('staff');
  const [currentStaffView, setCurrentStaffView] = useState<string>('today');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Core application shared datasets
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [openings, setOpenings] = useState<RecoveryOpening[]>(INITIAL_RECOVERY);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(INITIAL_WAITLIST);
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);

  const handleAddRecoveryOpening = (newOpening: {
    type: 'No-show';
    kind: 'no-show';
    time: string;
    doctor: string;
    patient: string;
    detail: string;
  }) => {
    const opening: RecoveryOpening = {
      id: `rec-${Date.now()}`,
      ...newOpening,
      offers: [],
    };
    setOpenings((prev) => [opening, ...prev]);
  };

  const handleAppointmentBooked = (newAppt: Appointment, newPatient: Patient) => {
    setAppointments((prev) => [...prev, newAppt]);
    setPatients((prev) => [newPatient, ...prev]);
  };

  return (
    <HIPAAProvider>
      <LockScreenModal />

      {appMode === 'patient' ? (
        <PatientBookingPortal
          onReturnToDashboard={() => {
            setAppMode('staff');
            setCurrentStaffView('today');
          }}
          onAppointmentBooked={handleAppointmentBooked}
        />
      ) : (
        <div className="flex min-h-screen bg-[#f4f0e8] text-[#1e2a28]">
          <Sidebar
            currentView={currentStaffView}
            onNavigate={(view) => setCurrentStaffView(view)}
            onOpenPatientBooking={() => setAppMode('patient')}
            isOpenMobile={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
          />

          <div className="flex-1 flex flex-col min-w-0">
            <TopHeader
              currentView={currentStaffView}
              onNavigate={(view) => setCurrentStaffView(view)}
              onOpenPatientBooking={() => setAppMode('patient')}
              onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
              {currentStaffView === 'today' && (
                <TodayScheduleView
                  appointments={appointments}
                  setAppointments={setAppointments}
                  patients={patients}
                  setPatients={setPatients}
                  onGoToRecovery={() => setCurrentStaffView('recovery')}
                  onAddRecoveryOpening={handleAddRecoveryOpening}
                />
              )}

              {currentStaffView === 'recovery' && (
                <RecoveryFillView
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
                  onGoToMessages={() => setCurrentStaffView('messages')}
                />
              )}

              {currentStaffView === 'messages' && (
                <MessagesInboxView
                  conversations={conversations}
                  setConversations={setConversations}
                  patients={patients}
                />
              )}

              {currentStaffView === 'patients' && (
                <PatientsCRMView patients={patients} setPatients={setPatients} />
              )}

              {currentStaffView === 'waitlist' && (
                <WaitlistQueueView
                  waitlist={waitlist}
                  onGoToRecovery={() => setCurrentStaffView('recovery')}
                />
              )}

              {currentStaffView === 'compliance' && <HIPAAComplianceCenterView />}

              {currentStaffView === 'settings' && <SettingsView />}
            </main>
          </div>
        </div>
      )}
    </HIPAAProvider>
  );
}
