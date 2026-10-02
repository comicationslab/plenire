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
import { AcceptInvite } from './pages/AcceptInvite';
import { AdminConsole } from './pages/Admin';
import { ForgotPassword } from './pages/ForgotPassword';
import { homeFor, Login } from './pages/Login';
import { Team } from './pages/Team';

const Loading = () => <div className="min-h-screen flex items-center justify-center bg-[#f4f0e8] text-sm text-[#1e2a28]/70" role="status">Loading…</div>;

/** Only signed-in people get past this. Clinic staff and platform admins are kept to their own areas. */
function RequireAuth({ scope }: { scope: 'practice' | 'platform' }) {
  const { status, session } = useAuth();
  if (status === 'loading') return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  const isPlatform = session.user.role === 'platform_admin';
  if (scope === 'platform' && !isPlatform) return <Navigate to={homeFor(session.user.role)} replace />;
  if (scope === 'practice' && isPlatform) return <Navigate to="/admin" replace />;
  if (scope === 'platform') return <Outlet />;
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

function OwnerOnly({ children }: { children: React.ReactNode }) {
  return usePractice().role === 'owner' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function Home() {
  const { status, session } = useAuth();
  if (status === 'loading') return <Loading />;
  return <Navigate to={session ? homeFor(session.user.role) : '/login'} replace />;
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
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/reset-password" element={<AcceptInvite />} />

            <Route element={<RequireAuth scope="platform" />}>
              <Route path="admin" element={<AdminConsole />} />
            </Route>

            <Route element={<RequireAuth scope="practice" />}>
              <Route path="book" element={<CleanBooking />} />
              <Route element={<CleanLayout />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="today" element={<CleanToday />} />
                <Route path="recovery" element={<CleanRecovery />} />
                <Route path="messages" element={<CleanMessages />} />
                <Route path="patients" element={<CleanPatients />} />
                <Route path="waitlist" element={<CleanWaitlist />} />
                <Route path="team" element={<OwnerOnly><Team /></OwnerOnly>} />
                <Route path="settings" element={<CleanSettings />} />
              </Route>
            </Route>

            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
