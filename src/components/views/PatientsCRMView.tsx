import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { maskEmail, maskName, maskPhone } from '../../services/hipaaCompliance';
import { Patient } from '../../types/hipaa';
import { Search, ShieldAlert, CheckCircle, X, Shield, Lock, FileText } from 'lucide-react';

interface PatientsCRMViewProps {
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
}

export const PatientsCRMView: React.FC<PatientsCRMViewProps> = ({
  patients,
  setPatients,
}) => {
  const { isPrivacyShieldActive, currentUser, isBreakGlassActive, logAuditEvent } = useHIPAA();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const filtered = patients.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handlePatientClick = (patient: Patient) => {
    setSelectedPatient(patient);
    logAuditEvent(
      'READ_EPHI',
      `Viewed EHR chart & demographic record for ${patient.name}.`,
      patient.id,
      patient.name
    );
  };

  const handleToggleConsent = () => {
    if (!selectedPatient) return;
    const nextConsent = !selectedPatient.smsConsent;

    setPatients((prev) =>
      prev.map((p) =>
        p.id === selectedPatient.id
          ? {
              ...p,
              smsConsent: nextConsent,
              smsConsentAt: nextConsent ? new Date().toISOString() : undefined,
            }
          : p
      )
    );

    setSelectedPatient((prev) =>
      prev
        ? {
            ...prev,
            smsConsent: nextConsent,
            smsConsentAt: nextConsent ? new Date().toISOString() : undefined,
          }
        : null
    );

    logAuditEvent(
      nextConsent ? 'TCPA_CONSENT_RECORDED' : 'OPT_OUT_RECORDED',
      `Updated SMS communication consent for ${selectedPatient.name} to ${nextConsent ? 'CONSENTED' : 'REVOKED'}.`,
      selectedPatient.id,
      selectedPatient.name,
      true
    );
  };

  const canViewClinical =
    currentUser.role === 'dentist' ||
    currentUser.role === 'hygienist' ||
    currentUser.role === 'compliance_officer' ||
    isBreakGlassActive;

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            Total Patients in Registry
          </div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">1,284</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Synced from Open Dental EHR</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            Active SMS Outreach Consent
          </div>
          <div className="text-2xl font-tabular font-semibold text-[#1e2a28] mt-1">842 Patients</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">TCPA &amp; HIPAA NPP logged</div>
        </div>
        <div className="p-4 bg-white/50 border border-[#1e2a28]/15">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            Recovered Seats This Month
          </div>
          <div className="text-2xl font-tabular font-semibold text-[#a3533a] mt-1">24 Patients</div>
          <div className="text-[11px] text-[#1e2a28]/50 mt-1">Reclaimed open clinic hours</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#1e2a28]/40 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patients by name, phone, or email…"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white/80 border border-[#1e2a28]/20 focus:outline-none focus:border-[#1e2a28] text-[#1e2a28]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 text-xs bg-white/80 border border-[#1e2a28]/20 text-[#1e2a28]"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Waitlist">Waitlist</option>
            <option value="Recovered">Recovered</option>
          </select>
        </div>
      </div>

      {/* Patient Table */}
      <div className="border border-[#1e2a28]/15 bg-white/40 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/80 border-b border-[#1e2a28]/15 text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/60">
            <tr>
              <th className="p-3">Patient</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Last Visit</th>
              <th className="p-3">Recent Visit / Activity</th>
              <th className="p-3">Communication Consent</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2a28]/10">
            {filtered.map((patient) => (
              <tr
                key={patient.id}
                onClick={() => handlePatientClick(patient)}
                className="hover:bg-white/70 cursor-pointer transition-colors"
              >
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8] shrink-0">
                      {patient.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-[#1e2a28]">
                        {maskName(patient.name, isPrivacyShieldActive)}
                      </div>
                      <div className="text-[10px] text-[#1e2a28]/50">EHR Record</div>
                    </div>
                  </div>
                </td>

                <td className="p-3">
                  <div className="font-tabular font-medium text-[#1e2a28]">
                    {maskPhone(patient.phone, isPrivacyShieldActive)}
                  </div>
                  <div className="text-[11px] text-[#1e2a28]/50">
                    {maskEmail(patient.email, isPrivacyShieldActive)}
                  </div>
                </td>

                <td className="p-3 text-[#1e2a28]/70 font-tabular">{patient.lastVisit}</td>

                <td className="p-3">
                  <span className="font-medium text-[#1e2a28]">{patient.recentVisit}</span>
                </td>

                <td className="p-3">
                  {patient.smsConsent ? (
                    <span className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>SMS &amp; Email Active</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#a3533a] font-semibold flex items-center gap-1">
                      <X className="w-3.5 h-3.5" />
                      <span>Email Only (Opted Out)</span>
                    </span>
                  )}
                </td>

                <td className="p-3">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                      patient.status === 'Recovered'
                        ? 'border-emerald-800 text-emerald-800 bg-emerald-800/10'
                        : patient.status === 'Waitlist'
                        ? 'border-[#a3533a] text-[#a3533a] bg-[#a3533a]/10'
                        : 'border-[#1e2a28]/30 text-[#1e2a28]/70'
                    }`}
                  >
                    {patient.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Patient Detail Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e2a28]/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#f4f0e8] border border-[#1e2a28] p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-[#1e2a28]/15">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full border border-[#1e2a28]/30 flex items-center justify-center font-bold text-sm bg-[#1e2a28] text-[#f4f0e8]">
                  {selectedPatient.initials}
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-[#1e2a28]">
                    {maskName(selectedPatient.name, isPrivacyShieldActive)}
                  </h3>
                  <p className="text-xs text-[#1e2a28]/60">
                    Open Dental Patient ID: {selectedPatient.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="text-[#1e2a28]/60 hover:text-[#1e2a28] p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 space-y-4 text-xs">
              {/* Demographics */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-white border border-[#1e2a28]/15">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#1e2a28]/50 block">Phone</span>
                  <span className="font-tabular font-semibold text-[#1e2a28]">
                    {maskPhone(selectedPatient.phone, isPrivacyShieldActive)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#1e2a28]/50 block">Email</span>
                  <span className="font-semibold text-[#1e2a28]">
                    {maskEmail(selectedPatient.email, isPrivacyShieldActive)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#1e2a28]/50 block">Last Visit</span>
                  <span className="text-[#1e2a28] font-tabular">{selectedPatient.lastVisit}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#1e2a28]/50 block">Status</span>
                  <span className="font-semibold text-[#1e2a28]">{selectedPatient.status}</span>
                </div>
              </div>

              {/* TCPA & HIPAA Communication Consent Safeguard */}
              <div className="p-3 bg-white/70 border border-[#1e2a28]/15 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a3533a]">
                    TCPA &amp; HIPAA Communication Consent
                  </span>
                  <button
                    onClick={handleToggleConsent}
                    className="text-[11px] underline text-[#a3533a] font-semibold"
                  >
                    {selectedPatient.smsConsent ? 'Revoke SMS Consent' : 'Record Patient Consent'}
                  </button>
                </div>
                <div className="text-[#1e2a28]/80 leading-relaxed">
                  {selectedPatient.smsConsent ? (
                    <div className="flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>
                        Verified Opt-In Consent on file (Captured {selectedPatient.smsConsentAt?.slice(0, 10) || '2026-05-12'}). Permitted for booking alerts and fill outreach.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[#a3533a]">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        Patient has opted out of mobile text alerts (STOP). Outreach is strictly restricted to secure email or phone calls.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Clinical Notes (Enforcing Minimum Necessary Rule § 164.502(b)) */}
              <div className="p-3 bg-white/70 border border-[#1e2a28]/15 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1e2a28]/70 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-[#a3533a]" />
                    <span>Clinical Dental Records (§ 164.502(b))</span>
                  </span>
                  {!canViewClinical && (
                    <span className="text-[10px] text-[#a3533a] font-semibold">Protected</span>
                  )}
                </div>

                {canViewClinical ? (
                  <p className="text-[#1e2a28] p-2 bg-[#f4f0e8]/50 border border-[#1e2a28]/10 leading-relaxed">
                    {selectedPatient.clinicalNotes || 'No acute pathology noted on last exam.'}
                  </p>
                ) : (
                  <div className="p-2.5 bg-[#a3533a]/10 border border-[#a3533a]/25 text-[11px] text-[#1e2a28]/80 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#a3533a] shrink-0" />
                    <span>
                      Access restricted to Clinical roles (Hygienist / Dentist). Front desk staff view scheduling metadata only under HIPAA Minimum Necessary requirements.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedPatient(null)}
                className="px-4 py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold hover:bg-[#1e2a28]/90"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
