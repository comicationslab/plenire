import React, { createContext, useContext, useMemo } from 'react';
import { useMe, useProviders } from '../api/hooks';
import type { Role } from '../api/schemas';
import { useAuth } from '../auth/AuthContext';
import { VISIT_TYPES } from '../config/booking';
import { initialsOf } from '../lib/format';
import type { PracticeInfo, StaffUser } from '../types/hipaa';

/** Who is signed in and which practice they work for. Comes from the server (the sign-in token), never from the browser. */
interface PracticeSession {
  practice: PracticeInfo;
  user: StaffUser;
  role: Role;
  /** Only owners see dollar figures. The server also withholds them from everyone else. */
  canSeeRevenue: boolean;
}

const Ctx = createContext<PracticeSession | undefined>(undefined);

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', front_desk: 'Front desk', dentist: 'Dentist', hygienist: 'Hygienist' };
export const roleLabel = (r: Role) => ROLE_LABEL[r];

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center bg-[#f4f0e8] text-[#1e2a28] p-6 text-center">{children}</div>
);

export const PracticeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const me = useMe();
  const providers = useProviders();
  const { logout } = useAuth();

  const value = useMemo<PracticeSession | null>(() => {
    if (!me.data || !providers.data) return null;
    const p = me.data.practice;
    const practice: PracticeInfo = {
      id: p.id, name: p.name, initials: initialsOf(p.name), tagline: '', timezone: p.timezone, address: p.address ?? '', phone: p.phone,
      providers: providers.data.map((x) => ({ id: x.id, name: x.name, role: x.title ?? '', initials: x.initials, op: x.chair ?? undefined, hours: x.hours })),
      visitTypes: VISIT_TYPES.map((v) => ({ ...v, providers: v.providers })),
    };
    const user: StaffUser = { id: me.data.staffId, name: me.data.name, initials: initialsOf(me.data.name), role: me.data.role, title: ROLE_LABEL[me.data.role], practice: p.name };
    return { practice, user, role: me.data.role, canSeeRevenue: me.data.role === 'owner' };
  }, [me.data, providers.data]);

  if (me.isError || providers.isError) {
    return (
      <Centered>
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">We couldn’t load your practice</h1>
          <p className="text-sm text-[#1e2a28]/70">{(me.error ?? providers.error)?.message}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => { void me.refetch(); void providers.refetch(); }} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold">Try again</button>
            <button onClick={logout} className="px-3 py-1.5 border border-[#1e2a28]/40 text-xs font-semibold">Sign out</button>
          </div>
        </div>
      </Centered>
    );
  }
  if (!value) return <Centered><p role="status" className="text-sm text-[#1e2a28]/70">Loading your practice…</p></Centered>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePractice = (): PracticeSession => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePractice must be used inside PracticeProvider');
  return ctx;
};
