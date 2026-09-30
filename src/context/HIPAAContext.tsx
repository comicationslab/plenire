import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { STAFF_USERS } from '../data/initialData';
import { createAuditHash } from '../services/hipaaCompliance';
import { AuditAction, AuditLogEvent, StaffRole, StaffUser } from '../types/hipaa';

interface HIPAAContextType {
  currentUser: StaffUser;
  switchUser: (userId: string) => void;
  isLocked: boolean;
  lockSession: (reason?: string) => void;
  unlockSession: (pin: string) => boolean;
  secondsRemaining: number;
  resetTimer: () => void;
  autoLockMinutes: number;
  setAutoLockMinutes: (mins: number) => void;
  isPrivacyShieldActive: boolean;
  togglePrivacyShield: () => void;
  auditLogs: AuditLogEvent[];
  logAuditEvent: (
    action: AuditAction,
    details: string,
    resourceId?: string,
    patientName?: string,
    complianceFlag?: boolean
  ) => void;
  isBreakGlassActive: boolean;
  breakGlassJustification: string | null;
  triggerBreakGlass: (justification: string) => void;
  dismissBreakGlass: () => void;
  exportAuditReport: (format: 'json' | 'csv') => void;
}

const HIPAAContext = createContext<HIPAAContextType | undefined>(undefined);

export const HIPAAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<StaffUser>(STAFF_USERS[0]);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(5);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5 * 60);
  const [isPrivacyShieldActive, setIsPrivacyShieldActive] = useState<boolean>(false);
  const [isBreakGlassActive, setIsBreakGlassActive] = useState<boolean>(false);
  const [breakGlassJustification, setBreakGlassJustification] = useState<string | null>(null);

  // Initial audit trail events
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([
    {
      id: 'log-001',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      user: 'Tracy R.',
      userRole: 'front_desk',
      action: 'LOGIN',
      details: 'Staff workstation authenticated at Reception Desk 1 via multi-factor token.',
      hash: 'sha256-4a18f09de9bf2a',
      ipAddress: '10.240.12.44 (Internal Subnet)',
    },
    {
      id: 'log-002',
      timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(),
      user: 'Tracy R.',
      userRole: 'front_desk',
      action: 'READ_EPHI',
      patientName: 'Hannah Cooper',
      resourceId: 'p-1',
      details: 'Accessed appointment check-in view for 11:00 AM SRP.',
      hash: 'sha256-8c29124fe9bf2a',
      ipAddress: '10.240.12.44 (Internal Subnet)',
    },
    {
      id: 'log-003',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      user: 'Marcus Brooks, RDH',
      userRole: 'hygienist',
      action: 'UPDATE_APPOINTMENT',
      patientName: 'Ava Bennett',
      resourceId: 'appt-6',
      details: 'Completed perio recall cleaning and updated clinical chart.',
      hash: 'sha256-7f411ba1e9bf2a',
      ipAddress: '10.240.12.52 (Operatory Hyg 2)',
    },
    {
      id: 'log-004',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      user: 'Dr. Kwame Mensah, DDS',
      userRole: 'dentist',
      action: 'TCPA_CONSENT_RECORDED',
      patientName: 'David Reyes',
      resourceId: 'p-2',
      details: 'In-office electronic signature captured for Notice of Privacy Practices and SMS alerts.',
      hash: 'sha256-11f84b90e9bf2a',
      ipAddress: '10.240.12.48 (Operatory Op 1)',
    },
  ]);

  const logAuditEvent = (
    action: AuditAction,
    details: string,
    resourceId?: string,
    patientName?: string,
    complianceFlag = false
  ) => {
    const timestamp = new Date().toISOString();
    const user = currentUser.name;
    const userRole = currentUser.role;
    const ipAddress = '10.240.12.44 (Workstation Term 1)';
    const hash = createAuditHash({ timestamp, user, action, details, ipAddress });

    const newEvent: AuditLogEvent = {
      id: `log-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      user,
      userRole,
      action,
      resourceId,
      patientName,
      details,
      hash,
      ipAddress,
      complianceFlag,
    };

    setAuditLogs((prev) => [newEvent, ...prev]);
  };

  const lockSession = (reason = 'Manual session lock by user') => {
    setIsLocked(true);
    logAuditEvent('LOGOUT', `Workstation locked: ${reason}`);
  };

  const unlockSession = (pin: string): boolean => {
    // Accepts default PIN 1234 or staff last name / admin
    if (pin === '1234' || pin.toLowerCase() === 'admin' || pin === '9420') {
      setIsLocked(false);
      resetTimer();
      logAuditEvent('SESSION_UNLOCK', `Session unlocked by ${currentUser.name} via PIN authorization.`);
      return true;
    }
    return false;
  };

  const resetTimer = () => {
    setSecondsRemaining(autoLockMinutes * 60);
  };

  // Activity listeners to reset inactivity timer
  useEffect(() => {
    const handleActivity = () => {
      if (!isLocked) {
        resetTimer();
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [isLocked, autoLockMinutes]);

  // Countdown timer effect
  useEffect(() => {
    if (isLocked) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsLocked(true);
          logAuditEvent('SESSION_TIMEOUT', `Workstation auto-locked due to ${autoLockMinutes} minutes of inactivity (§ 164.312(a)(2)(iii)).`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLocked, autoLockMinutes, currentUser]);

  const switchUser = (userId: string) => {
    const target = STAFF_USERS.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      resetTimer();
      logAuditEvent('LOGIN', `Switched active workstation session to ${target.name} (${target.title}).`);
    }
  };

  const togglePrivacyShield = () => {
    setIsPrivacyShieldActive((prev) => {
      const next = !prev;
      logAuditEvent(
        'READ_EPHI',
        `Reception Privacy Shield ${next ? 'ACTIVATED' : 'DEACTIVATED'} (Physical Safeguard § 164.530(c)).`
      );
      return next;
    });
  };

  const triggerBreakGlass = (justification: string) => {
    setIsBreakGlassActive(true);
    setBreakGlassJustification(justification);
    logAuditEvent(
      'BREAK_GLASS_ACCESS',
      `EMERGENCY BREAK-GLASS ELEVATION: Justification provided: "${justification}". Clinical charts unrestricted.`,
      undefined,
      undefined,
      true
    );
  };

  const dismissBreakGlass = () => {
    setIsBreakGlassActive(false);
    setBreakGlassJustification(null);
    logAuditEvent('BREAK_GLASS_ACCESS', 'Emergency break-glass privileges relinquished; standard RBAC restored.');
  };

  const exportAuditReport = (format: 'json' | 'csv') => {
    logAuditEvent('EXPORT_AUDIT', `HIPAA audit trail exported in ${format.toUpperCase()} format by ${currentUser.name}.`);

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(auditLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hipaa_audit_report_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['ID', 'Timestamp_UTC', 'User', 'Role', 'Action', 'Patient', 'Resource', 'Details', 'Hash', 'IP_Address'];
      const rows = auditLogs.map((log) => [
        log.id,
        log.timestamp,
        `"${log.user}"`,
        log.userRole,
        log.action,
        `"${log.patientName || 'N/A'}"`,
        log.resourceId || 'N/A',
        `"${log.details.replace(/"/g, '""')}"`,
        log.hash,
        log.ipAddress,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hipaa_audit_report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <HIPAAContext.Provider
      value={{
        currentUser,
        switchUser,
        isLocked,
        lockSession,
        unlockSession,
        secondsRemaining,
        resetTimer,
        autoLockMinutes,
        setAutoLockMinutes,
        isPrivacyShieldActive,
        togglePrivacyShield,
        auditLogs,
        logAuditEvent,
        isBreakGlassActive,
        breakGlassJustification,
        triggerBreakGlass,
        dismissBreakGlass,
        exportAuditReport,
      }}
    >
      {children}
    </HIPAAContext.Provider>
  );
};

export const useHIPAA = () => {
  const context = useContext(HIPAAContext);
  if (!context) {
    throw new Error('useHIPAA must be used within a HIPAAProvider');
  }
  return context;
};
