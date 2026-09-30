import React, { createContext, useContext, useMemo, useState } from 'react';
import { PRACTICES, STAFF_USERS } from '../data/initialData';
import { PracticeInfo, StaffRole, StaffUser } from '../types/hipaa';

/**
 * Who is using the app, and for which practice.
 *
 * DEMO NOTE: role switching exists so both dashboards can be shown without a login.
 * In production the practice and role come from the authenticated session (server-side),
 * and revenue figures must be withheld by the API, not just hidden in the UI.
 */
export type ViewRole = Extract<StaffRole, 'front_desk' | 'owner'>;

interface PracticeSession {
  practice: PracticeInfo;
  user: StaffUser;
  role: ViewRole;
  setRole: (role: ViewRole) => void;
  /** Only owners see dollar figures. */
  canSeeRevenue: boolean;
}

const PracticeContext = createContext<PracticeSession | undefined>(undefined);

const DEMO_PRACTICE_ID = 'lakeside-dental';

export const PracticeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<ViewRole>('front_desk');

  const value = useMemo<PracticeSession>(() => {
    const user = STAFF_USERS.find((u) => u.role === role) ?? STAFF_USERS[0];
    return {
      practice: PRACTICES[DEMO_PRACTICE_ID],
      user,
      role,
      setRole,
      canSeeRevenue: role === 'owner',
    };
  }, [role]);

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
};

export const usePractice = (): PracticeSession => {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error('usePractice must be used inside PracticeProvider');
  return ctx;
};
