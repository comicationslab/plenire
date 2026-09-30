import React, { createContext, useContext, useEffect, useState } from 'react';

export interface AuditEntry {
  id: string;
  time: string;
  user: string;
  action: string;
  details: string;
}

interface HIPAAContextType {
  isLocked: boolean;
  lock: () => void;
  unlock: (pin: string) => boolean;
  privacyShield: boolean;
  togglePrivacyShield: () => void;
  maskName: (name: string) => string;
  maskPhone: (phone: string) => string;
  auditTrail: AuditEntry[];
  logAudit: (action: string, details: string) => void;
  scrubEPHI: (text: string) => { cleanText: string; hadPHI: boolean };
}

const HIPAAContext = createContext<HIPAAContextType | undefined>(undefined);

const RESTRICTED_TERMS = [
  'root canal', 'scaling', 'planing', 'perio', 'cavity', 'abscess',
  'extraction', 'implant', 'biopsy', 'caries', 'infection', 'tooth #'
];

export const HIPAAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);

  const logAudit = (action: string, details: string) => {
    const entry: AuditEntry = {
      id: Math.random().toString(36).substring(2, 7),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      user: 'Tracy R. (Front Desk)',
      action,
      details,
    };
    setAuditTrail((prev) => [entry, ...prev.slice(0, 40)]);
  };

  const lock = () => {
    setIsLocked(true);
    logAudit('WORKSTATION_LOCK', 'Workstation auto-locked (§ 164.312)');
  };

  const unlock = (pin: string) => {
    if (pin === '1234' || pin === '') {
      setIsLocked(false);
      logAudit('WORKSTATION_UNLOCK', 'Workstation unlocked via PIN');
      return true;
    }
    return false;
  };

  const togglePrivacyShield = () => {
    setPrivacyShield((p) => {
      const next = !p;
      logAudit('PRIVACY_SHIELD', next ? 'Screen Shield activated' : 'Screen Shield deactivated');
      return next;
    });
  };

  const maskName = (name: string) => {
    if (!privacyShield) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  const maskPhone = (phone: string) => {
    if (!privacyShield) return phone;
    return phone.replace(/(\(\d{3}\)\s*)\d{3}(-\d{4})/, '$1***$2');
  };

  const scrubEPHI = (text: string) => {
    let lower = text.toLowerCase();
    let had = false;
    for (const term of RESTRICTED_TERMS) {
      if (lower.includes(term)) {
        had = true;
        break;
      }
    }
    if (had) {
      return {
        hadPHI: true,
        cleanText: 'Hi, this is Lakeside Dental regarding your upcoming appointment. Please reply YES to confirm or call (763) 555-0100. Reply STOP to opt out.',
      };
    }
    return { hadPHI: false, cleanText: text };
  };

  return (
    <HIPAAContext.Provider
      value={{
        isLocked,
        lock,
        unlock,
        privacyShield,
        togglePrivacyShield,
        maskName,
        maskPhone,
        auditTrail,
        logAudit,
        scrubEPHI,
      }}
    >
      {children}
    </HIPAAContext.Provider>
  );
};

export const useHIPAA = () => {
  const ctx = useContext(HIPAAContext);
  if (!ctx) throw new Error('useHIPAA must be in HIPAAProvider');
  return ctx;
};
