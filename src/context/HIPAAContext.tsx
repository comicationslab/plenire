import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuditAction, StaffRole } from '../types/hipaa';
import { usePractice } from './PracticeContext';
import {
  detectEPHI,
  genericMessage,
  maskEmail as maskEmailFn,
  maskName as maskNameFn,
  maskPhone as maskPhoneFn,
  maskTreatment as maskTreatmentFn,
} from '../services/hipaaCompliance';
import { clockNow, uid } from '../lib/format';

export interface AuditEntry {
  id: string;
  time: string;
  user: string;
  role: StaffRole;
  action: AuditAction;
  details: string;
}

export interface UnlockResult {
  ok: boolean;
  message?: string;
}

interface HIPAAContextType {
  isLocked: boolean;
  hasPin: boolean;
  lock: () => void;
  unlock: (pin: string) => Promise<UnlockResult>;
  setPin: (pin: string, currentPin?: string) => Promise<UnlockResult>;
  idleMinutes: number;
  setIdleMinutes: (minutes: number) => void;
  privacyShield: boolean;
  togglePrivacyShield: () => void;
  maskName: (name: string) => string;
  maskPhone: (phone: string) => string;
  maskEmail: (email: string) => string;
  maskTreatment: (treatment: string) => string;
  auditTrail: AuditEntry[];
  logAudit: (action: AuditAction, details: string) => void;
  /** Flags health details before an SMS goes out; staff decide what to do (nothing is rewritten silently). */
  checkOutgoing: (text: string) => { hasPHI: boolean; terms: string[] };
  safeMessage: (firstName: string, time?: string) => string;
}

const HIPAAContext = createContext<HIPAAContextType | undefined>(undefined);

/*
 * SCREEN LOCK — prototype-level only.
 * The PIN is salted + hashed (PBKDF2) and kept in this browser's localStorage. That is a
 * convenient screen lock for a shared front-desk computer; it is NOT authentication.
 * Real sign-in (email + password + MFA, server-side sessions) replaces it in the SaaS build.
 */
const PIN_KEY = 'plenire.screenlock.v1';
const IDLE_KEY = 'plenire.idleMinutes';
const DEFAULT_IDLE_MINUTES = 5;
const MAX_FAILED = 5;
const COOLDOWN_MS = 30_000;
const PBKDF2_ITERATIONS = 150_000;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(new Uint8Array(bits));
}

interface StoredPin { salt: string; hash: string }

function readStoredPin(): StoredPin | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as StoredPin) : null;
  } catch {
    return null;
  }
}

function readIdleMinutes(): number {
  try {
    const n = Number(localStorage.getItem(IDLE_KEY));
    return [1, 5, 10, 15].includes(n) ? n : DEFAULT_IDLE_MINUTES;
  } catch {
    return DEFAULT_IDLE_MINUTES;
  }
}

export function validatePin(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return 'Use 4 to 8 digits.';
  if (/^(\d)\1+$/.test(pin) || ['1234', '4321', '12345', '123456'].includes(pin)) return 'Pick a PIN that is harder to guess.';
  return null;
}

export const HIPAAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, practice } = usePractice();

  const [isLocked, setIsLocked] = useState(false);
  const [hasPin, setHasPin] = useState<boolean>(() => readStoredPin() !== null);
  const [idleMinutes, setIdleMinutesState] = useState<number>(readIdleMinutes);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);

  const failures = useRef({ count: 0, until: 0 });

  // In-memory only on purpose: entries contain patient names. Production: append-only server table.
  const logAudit = useCallback(
    (action: AuditAction, details: string) => {
      const entry: AuditEntry = { id: uid('aud'), time: clockNow(), user: user.name, role: user.role, action, details };
      setAuditTrail((prev) => [entry, ...prev].slice(0, 200));
    },
    [user],
  );

  const lock = useCallback(() => {
    setIsLocked(true);
    logAudit('WORKSTATION_LOCK', 'Screen locked manually');
  }, [logAudit]);

  // Real idle timer: locks after N quiet minutes (only once a PIN exists, so nobody can set one on an unattended screen).
  useEffect(() => {
    if (isLocked || !hasPin) return;
    const limit = idleMinutes * 60_000;
    let timer = window.setTimeout(fire, limit);
    let last = Date.now();

    function fire() {
      setIsLocked(true);
      logAudit('WORKSTATION_AUTO_LOCK', `Screen locked after ${idleMinutes} min of inactivity`);
    }
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return; // throttle
      last = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, limit);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [isLocked, hasPin, idleMinutes, logAudit]);

  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      const now = Date.now();
      if (now < failures.current.until) {
        return { ok: false, message: `Too many attempts. Try again in ${Math.ceil((failures.current.until - now) / 1000)}s.` };
      }
      const stored = readStoredPin();
      if (!stored || !pin) return { ok: false, message: 'Enter your PIN.' };

      const ok = (await derive(pin, fromHex(stored.salt) as Uint8Array<ArrayBuffer>)) === stored.hash;
      if (ok) {
        failures.current = { count: 0, until: 0 };
        setIsLocked(false);
        logAudit('WORKSTATION_UNLOCK', 'Screen unlocked');
        return { ok: true };
      }
      failures.current.count += 1;
      logAudit('UNLOCK_FAILED', `Incorrect PIN (attempt ${failures.current.count})`);
      if (failures.current.count >= MAX_FAILED) {
        failures.current = { count: 0, until: Date.now() + COOLDOWN_MS };
        return { ok: false, message: 'Too many attempts. Wait 30 seconds and try again.' };
      }
      return { ok: false, message: 'Incorrect PIN.' };
    },
    [logAudit],
  );

  const setPin = useCallback(
    async (pin: string, currentPin?: string): Promise<UnlockResult> => {
      const problem = validatePin(pin);
      if (problem) return { ok: false, message: problem };

      const existing = readStoredPin();
      if (existing) {
        const okCurrent = currentPin && (await derive(currentPin, fromHex(existing.salt) as Uint8Array<ArrayBuffer>)) === existing.hash;
        if (!okCurrent) return { ok: false, message: 'Current PIN is incorrect.' };
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(pin, salt);
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify({ salt: toHex(salt), hash } satisfies StoredPin));
      } catch {
        return { ok: false, message: 'Could not save the PIN in this browser.' };
      }
      setHasPin(true);
      logAudit(existing ? 'PIN_CHANGED' : 'PIN_SET', existing ? 'Screen-lock PIN changed' : 'Screen-lock PIN created');
      return { ok: true };
    },
    [logAudit],
  );

  const setIdleMinutes = useCallback(
    (minutes: number) => {
      setIdleMinutesState(minutes);
      try { localStorage.setItem(IDLE_KEY, String(minutes)); } catch { /* ignore */ }
      logAudit('IDLE_TIMEOUT_CHANGED', `Auto-lock set to ${minutes} min`);
    },
    [logAudit],
  );

  const togglePrivacyShield = useCallback(() => {
    setPrivacyShield((p) => {
      logAudit('PRIVACY_SHIELD', !p ? 'Screen Shield turned on' : 'Screen Shield turned off');
      return !p;
    });
  }, [logAudit]);

  const value = useMemo<HIPAAContextType>(
    () => ({
      isLocked,
      hasPin,
      lock,
      unlock,
      setPin,
      idleMinutes,
      setIdleMinutes,
      privacyShield,
      togglePrivacyShield,
      maskName: (n) => maskNameFn(n, privacyShield),
      maskPhone: (p) => maskPhoneFn(p, privacyShield),
      maskEmail: (e) => maskEmailFn(e, privacyShield),
      maskTreatment: (t) => maskTreatmentFn(t, privacyShield),
      auditTrail,
      logAudit,
      checkOutgoing: (text) => {
        const { hasEPHI, detectedTerms } = detectEPHI(text);
        return { hasPHI: hasEPHI, terms: detectedTerms };
      },
      safeMessage: (firstName, time) => genericMessage(practice, firstName, time),
    }),
    [isLocked, hasPin, lock, unlock, setPin, idleMinutes, setIdleMinutes, privacyShield, togglePrivacyShield, auditTrail, logAudit, practice],
  );

  return <HIPAAContext.Provider value={value}>{children}</HIPAAContext.Provider>;
};

export const useHIPAA = () => {
  const ctx = useContext(HIPAAContext);
  if (!ctx) throw new Error('useHIPAA must be used inside HIPAAProvider');
  return ctx;
};
