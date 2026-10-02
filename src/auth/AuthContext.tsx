import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, refreshSession, setRefreshHandler, setToken, setUnauthorizedHandler } from '../api/client';
import { okSchema, sessionSchema, type Session } from '../api/schemas';

/*
 * SIGN-IN.
 * Email + password → a short-lived access token (kept in memory only) and a private HttpOnly refresh cookie.
 * Reloading the page quietly gets a fresh token from the cookie, so people stay signed in without any token
 * being stored where scripts could read it. When we move to Amazon Cognito, this one file is swapped.
 *
 * Staying signed in is tied to the person actually using the app: quiet for too long and the session ends,
 * even though screens refresh their data in the background.
 */
const IDLE_LIMIT_MS = 25 * 60_000; // a little under the server's 30 minute idle limit

interface AuthState {
  status: 'loading' | 'ready';
  session: Session | null;
  login: (email: string, password: string) => Promise<Session>;
  /** Used after accepting an invitation or resetting a password: the server already signed the person in. */
  adopt: (s: Session) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const lastActive = useRef(Date.now());
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const clear = useCallback(() => {
    setToken(null);
    window.clearTimeout(timer.current);
    setSession(null);
    qc.clear(); // nothing from the practice stays in memory after sign-out
  }, [qc]);

  const adopt = useCallback((s: Session) => {
    setToken(s.accessToken);
    setSession(s);
    setStatus('ready');
  }, []);

  // One refresh at a time, and never for someone who has walked away.
  const refresh = useCallback((): Promise<boolean> => {
    if (Date.now() - lastActive.current > IDLE_LIMIT_MS) return Promise.resolve(false);
    inFlight.current ??= refreshSession().then((s) => {
      inFlight.current = null;
      if (s) { setToken(s.accessToken); setSession(s); }
      return Boolean(s);
    });
    return inFlight.current;
  }, []);

  useEffect(() => {
    const touch = () => { lastActive.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch));
  }, []);

  useEffect(() => {
    setRefreshHandler(refresh);
    setUnauthorizedHandler(clear);
    return () => setRefreshHandler(null);
  }, [refresh, clear]);

  // On first load, restore the session from the private cookie (if there is one).
  useEffect(() => {
    let cancelled = false;
    refreshSession().then((s) => {
      if (cancelled) return;
      if (s) adopt(s);
      else setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [adopt]);

  // Renew the token shortly before it expires, but only while the person is active.
  useEffect(() => {
    if (!session) return;
    timer.current = window.setTimeout(() => { void refresh(); }, Math.max(30, session.expiresIn * 0.8) * 1000);
    return () => window.clearTimeout(timer.current);
  }, [session, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api('POST', '/auth/login', sessionSchema, { email, password });
    lastActive.current = Date.now();
    adopt(s);
    return s;
  }, [adopt]);

  const logout = useCallback(async () => {
    await api('POST', '/auth/logout', okSchema, undefined, { csrf: true }).catch(() => {});
    clear();
  }, [clear]);

  const value = useMemo(() => ({ status, session, login, adopt, logout }), [status, session, login, adopt, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
