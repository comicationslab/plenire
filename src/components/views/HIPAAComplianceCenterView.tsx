import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { INITIAL_BAA_LIST } from '../../data/initialData';
import { AuditAction } from '../../types/hipaa';
import {
  ShieldCheck,
  Lock,
  FileText,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  Key,
  Eye,
  RefreshCw,
} from 'lucide-react';

export const HIPAAComplianceCenterView: React.FC = () => {
  const {
    auditLogs,
    exportAuditReport,
    autoLockMinutes,
    setAutoLockMinutes,
    isPrivacyShieldActive,
    togglePrivacyShield,
    lockSession,
    triggerBreakGlass,
    isBreakGlassActive,
    dismissBreakGlass,
  } = useHIPAA();

  const [auditSearch, setAuditSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(auditSearch.toLowerCase()) ||
      (log.patientName && log.patientName.toLowerCase().includes(auditSearch.toLowerCase())) ||
      log.details.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.hash.toLowerCase().includes(auditSearch.toLowerCase());

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const actionList: AuditAction[] = [
    'LOGIN',
    'LOGOUT',
    'SESSION_TIMEOUT',
    'SESSION_UNLOCK',
    'READ_EPHI',
    'CREATE_WALKIN',
    'UPDATE_APPOINTMENT',
    'SEND_OUTREACH',
    'RECOVERY_FILLED',
    'EXPORT_AUDIT',
    'BREAK_GLASS_ACCESS',
    'TCPA_CONSENT_RECORDED',
    'OPT_OUT_RECORDED',
    'EPHI_SCRUBBER_TRIGGERED',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2a28]/15">
        <div>
          <h2 className="text-lg font-semibold text-[#1e2a28] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#a3533a]" />
            <span>HIPAA Security Rule &amp; Compliance Center</span>
          </h2>
          <p className="text-xs text-[#1e2a28]/60 mt-0.5">
            45 CFR Part 160 &amp; Part 164 Subparts A &amp; C · Automated Audit Trail &amp; Safeguards
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportAuditReport('csv')}
            className="px-3 py-1.5 border border-[#1e2a28]/25 bg-white text-xs font-semibold hover:bg-[#1e2a28]/5 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => exportAuditReport('json')}
            className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON (Audit Vault)</span>
          </button>
        </div>
      </div>

      {/* 7 Safeguards Verification Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white/70 border border-[#1e2a28]/15 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#1e2a28]">Access Control &amp; RBAC</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-[10px] text-[#1e2a28]/50 uppercase font-mono">§ 164.312(a)(1)</div>
          <p className="text-[11px] text-[#1e2a28]/70 leading-snug">
            Role-based access enforced. Front desk, hygienist, and dentist privileges segregated.
          </p>
        </div>

        <div className="p-3.5 bg-white/70 border border-[#1e2a28]/15 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#1e2a28]">Inactivity Auto-Lock</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-[10px] text-[#1e2a28]/50 uppercase font-mono">§ 164.312(a)(2)(iii)</div>
          <p className="text-[11px] text-[#1e2a28]/70 leading-snug">
            Current timeout: <strong>{autoLockMinutes} minutes</strong>. Terminal locks automatically.
          </p>
        </div>

        <div className="p-3.5 bg-white/70 border border-[#1e2a28]/15 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#1e2a28]">Audit Controls</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-[10px] text-[#1e2a28]/50 uppercase font-mono">§ 164.312(b)</div>
          <p className="text-[11px] text-[#1e2a28]/70 leading-snug">
            Immutable log records with cryptographic tamper-evident hashes for all ePHI events.
          </p>
        </div>

        <div className="p-3.5 bg-white/70 border border-[#1e2a28]/15 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#1e2a28]">Data Minimization</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-[10px] text-[#1e2a28]/50 uppercase font-mono">§ 164.312(e)(1)</div>
          <p className="text-[11px] text-[#1e2a28]/70 leading-snug">
            Real-time ePHI scrubber strips diagnoses from unencrypted patient SMS outreach.
          </p>
        </div>
      </div>

      {/* Security Policies Configuration Panel */}
      <div className="p-4 bg-white/50 border border-[#1e2a28]/15 space-y-3">
        <h3 className="font-semibold text-xs text-[#1e2a28] uppercase tracking-wider">
          HIPAA Safeguard Controls &amp; Testing Drills
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Timeout selection */}
          <div className="p-3 bg-white border border-[#1e2a28]/15 space-y-1.5">
            <span className="font-semibold text-[#1e2a28] block">Inactivity Auto-Lock Duration</span>
            <select
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
              className="w-full p-1.5 bg-[#f4f0e8]/50 border border-[#1e2a28]/20 text-xs"
            >
              <option value={1}>1 Minute (Fast Test)</option>
              <option value={2}>2 Minutes</option>
              <option value={5}>5 Minutes (Standard Practice)</option>
              <option value={15}>15 Minutes</option>
            </select>
            <span className="text-[10px] text-[#1e2a28]/50 block">Complies with 45 CFR § 164.312</span>
          </div>

          {/* Privacy screen toggle */}
          <div className="p-3 bg-white border border-[#1e2a28]/15 space-y-1.5">
            <span className="font-semibold text-[#1e2a28] block">Reception Desk Privacy Shield</span>
            <button
              onClick={togglePrivacyShield}
              className={`w-full py-1.5 px-2 text-xs font-semibold border transition-colors ${
                isPrivacyShieldActive
                  ? 'bg-[#1e2a28] text-[#f4f0e8] border-[#1e2a28]'
                  : 'bg-white border-[#1e2a28]/20 text-[#1e2a28]'
              }`}
            >
              {isPrivacyShieldActive ? 'Shield: Active (Masking ePHI)' : 'Activate Reception Shield'}
            </button>
            <span className="text-[10px] text-[#1e2a28]/50 block">Physical safeguard for monitors</span>
          </div>

          {/* Emergency break-glass drill */}
          <div className="p-3 bg-white border border-[#1e2a28]/15 space-y-1.5">
            <span className="font-semibold text-[#1e2a28] block">Emergency Access Drill</span>
            {isBreakGlassActive ? (
              <button
                onClick={dismissBreakGlass}
                className="w-full py-1.5 px-2 bg-[#a3533a] text-white text-xs font-semibold"
              >
                Relinquish Override
              </button>
            ) : (
              <button
                onClick={() => triggerBreakGlass('Quarterly HIPAA Emergency Access Compliance Drill')}
                className="w-full py-1.5 px-2 border border-[#a3533a]/40 bg-[#a3533a]/10 text-[#a3533a] hover:bg-[#a3533a]/20 text-xs font-semibold"
              >
                Simulate Break-Glass Drill
              </button>
            )}
            <span className="text-[10px] text-[#1e2a28]/50 block">Logs emergency audit event</span>
          </div>
        </div>
      </div>

      {/* Audit Log Table Viewer */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm text-[#1e2a28]">Immutable Audit Trail (§ 164.312(b))</h3>
            <p className="text-xs text-[#1e2a28]/60">
              {auditLogs.length} chronological audit entries recorded with cryptographic hashes
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#1e2a28]/40 absolute left-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail…"
                className="pl-8 pr-2.5 py-1 text-xs bg-white border border-[#1e2a28]/20 w-48"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="py-1 px-2 text-xs bg-white border border-[#1e2a28]/20"
            >
              <option value="ALL">All Actions</option>
              {actionList.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border border-[#1e2a28]/15 bg-white/70 overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f4f0e8] border-b border-[#1e2a28]/15 text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60 sticky top-0 z-10">
              <tr>
                <th className="p-2.5">Timestamp (UTC)</th>
                <th className="p-2.5">User &amp; Role</th>
                <th className="p-2.5">Action</th>
                <th className="p-2.5">Resource / Patient</th>
                <th className="p-2.5">Details</th>
                <th className="p-2.5">Tamper Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2a28]/10 font-tabular">
              {filteredLogs.map((log) => {
                const isBreakGlass = log.action === 'BREAK_GLASS_ACCESS';
                const isScrubber = log.action === 'EPHI_SCRUBBER_TRIGGERED';

                return (
                  <tr
                    key={log.id}
                    className={`hover:bg-white transition-colors ${
                      isBreakGlass
                        ? 'bg-[#a3533a]/10 font-semibold'
                        : isScrubber
                        ? 'bg-amber-50/60'
                        : ''
                    }`}
                  >
                    <td className="p-2.5 text-[#1e2a28]/70 whitespace-nowrap text-[11px]">
                      {log.timestamp.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <div className="font-semibold text-[#1e2a28]">{log.user}</div>
                      <div className="text-[10px] text-[#1e2a28]/50 font-sans">{log.userRole}</div>
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${
                          isBreakGlass
                            ? 'border-[#a3533a] text-[#a3533a] bg-[#a3533a]/15'
                            : isScrubber
                            ? 'border-amber-600 text-amber-700 bg-amber-50'
                            : 'border-[#1e2a28]/25 text-[#1e2a28]/70 bg-white'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="p-2.5 text-[#1e2a28] whitespace-nowrap text-[11px]">
                      {log.patientName || log.resourceId || 'System'}
                    </td>
                    <td className="p-2.5 text-[#1e2a28]/80 font-sans text-xs max-w-xs truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="p-2.5 text-[10px] text-[#1e2a28]/50 font-mono whitespace-nowrap">
                      {log.hash}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Business Associate Agreements (BAA) Tracker */}
      <div className="border border-[#1e2a28]/15 bg-white/50 p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2a28]/15">
          <div>
            <h3 className="font-semibold text-xs text-[#1e2a28] uppercase tracking-wider">
              Business Associate Agreements (BAAs) — 45 CFR § 164.502(e)
            </h3>
            <p className="text-xs text-[#1e2a28]/60 mt-0.5">
              Verified legal contracts binding third-party software vendors to HIPAA data protections
            </p>
          </div>
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-800/10 border border-emerald-800/30 px-2 py-0.5">
            4 / 4 BAAs Executed &amp; Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {INITIAL_BAA_LIST.map((baa, i) => (
            <div key={i} className="p-3 bg-white border border-[#1e2a28]/15 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-[#1e2a28]">{baa.vendor}</strong>
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                  {baa.status}
                </span>
              </div>
              <div className="text-[#1e2a28]/70 text-[11px]">{baa.service}</div>
              <div className="text-[10px] text-[#1e2a28]/50 pt-1 border-t border-[#1e2a28]/10 font-tabular flex items-center justify-between">
                <span>Signed: {baa.baaSignedDate}</span>
                <span>{baa.encryptionLevel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
