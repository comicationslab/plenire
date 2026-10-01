import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, setUnauthorizedHandler } from '../api/client';
import { loginSchema, type Role } from '../api/schemas';

/*
 * SIGN-IN (development).
 * Today the browser asks the local server for a token by email. When we move to AWS, this one file is
 * swapped for Amazon Cognito (hosted sign-in with password + MFA); the rest of the app stays the same.
 * The token is kept for this browser tab only (sessionStorage) and is cleared on sign-out.
 */
const KEY = 'plenire.session.v1';

interface Session { token: string; user: { id: string; name: string; role: Role; practiceId: string } }
interface AuthState { session: Session | null; login: (email: string) => Promise<void>; logout: () => void }

const AuthContext = createContext<AuthState | undefined>(undefined);

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    if (s) setToken(s.token);
    return s;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(load);

  const logout = useCallback(() => {
    setToken(null);
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    setSession(null);
    qc.clear(); // no patient data left in memory after sign-out
  }, [qc]);

  const login = useCallback(async (email: string) => {
    const r = await api('POST', '/auth/dev-login', loginSchema, { email });
    setToken(r.token);
    try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
    setSession(r);
  }, []);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
