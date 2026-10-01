import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { ApiError } from './api/client';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { CleanLayout } from './components/CleanLayout';
import { CleanBooking } from './components/patient/CleanBooking';
import { CleanMessages } from './components/views/CleanMessages';
import { CleanPatients } from './components/views/CleanPatients';
import { CleanRecovery } from './components/views/CleanRecovery';
import { CleanSettings } from './components/views/CleanSettings';
import { CleanToday } from './components/views/CleanToday';
import { CleanWaitlist } from './components/views/CleanWaitlist';
import { DashboardFrontDesk } from './components/views/DashboardFrontDesk';
import { DashboardOwner } from './components/views/DashboardOwner';
import { HIPAAProvider } from './context/HIPAAContext';
import { PracticeProvider, usePractice } from './context/PracticeContext';
import { Login } from './pages/Login';

/** Everything behind sign-in: loads the practice, then starts the screen lock. */
function RequireAuth() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return (
    <PracticeProvider>
      <HIPAAProvider>
        <Outlet />
      </HIPAAProvider>
    </PracticeProvider>
  );
}

/** The dashboard depends on who you are. The server enforces it too. */
function Dashboard() {
  return usePractice().role === 'owner' ? <DashboardOwner /> : <DashboardFrontDesk />;
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            // Don't hammer the server on errors that retrying can't fix (bad login, forbidden, not found).
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route path="book" element={<CleanBooking />} />
              <Route element={<CleanLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="today" element={<CleanToday />} />
                <Route path="recovery" element={<CleanRecovery />} />
                <Route path="messages" element={<CleanMessages />} />
                <Route path="patients" element={<CleanPatients />} />
                <Route path="waitlist" element={<CleanWaitlist />} />
                <Route path="settings" element={<CleanSettings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
