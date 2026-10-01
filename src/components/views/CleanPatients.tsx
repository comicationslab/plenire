import React, { useState } from 'react';
import { useHIPAA } from '../../context/HIPAAContext';
import { usePractice } from '../../context/PracticeContext';
import { toPatient } from '../../api/format';
import { usePatients, usePatientSummary } from '../../api/hooks';
import { QueryBoundary } from '../ui/QueryBoundary';

export const CleanPatients: React.FC = () => {
  const { maskName, maskPhone, maskEmail } = useHIPAA();
  const { practice } = usePractice();
  const pq = usePatients();
  const summary = usePatientSummary();
  const patients = (pq.data ?? []).map((p) => toPatient(p, practice.timezone));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All patients');

  const filtered = patients.filter((p) => {
    const matchQ = [p.name, p.phone, p.email].join(' ').toLowerCase().includes(search.toLowerCase());
    const matchF = filter === 'All patients' || p.status === filter;
    return matchQ && matchF;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-widest uppercase text-[#a3533a] font-bold">Patient CRM</div>
        <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">All patients</h2>
        <p className="text-[13px] text-[#1e2a28]/70 mt-1 max-w-lg leading-relaxed">
          One place for the people behind every appointment and recovery.
        </p>
      </div>

      <QueryBoundary queries={[pq, summary]}>
      {/* Metric row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Total patients</div>
          <div className="text-[29px] font-medium text-[#1e2a28] mt-2 tracking-tight">{summary.data?.total ?? 0}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Everyone in your practice</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Texting consent</div>
          <div className="text-[29px] font-medium text-[#1e2a28] mt-2 tracking-tight">{summary.data?.consented ?? 0}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Patients ready for outreach</div>
        </div>
        <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
          <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">Recovered · 28 days</div>
          <div className="text-[29px] font-medium text-[#a3533a] mt-2 tracking-tight">{summary.data?.recovered ?? 0}</div>
          <div className="text-[11px] text-[#1e2a28]/70 mt-1">Patients who reclaimed a seat</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or email…"
          aria-label="Search patients"
          className="flex-1 max-w-[390px] h-[35px] px-3 bg-transparent border border-[#1e2a28]/17 text-xs text-[#1e2a28] placeholder-[#1e2a28]/65 focus:outline-none focus:border-[#1e2a28]"
        />
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-[35px] px-3 bg-transparent border border-[#1e2a28]/16 text-xs text-[#1e2a28]/70"
        >
          <option>All patients</option>
          <option>Recovered</option>
          <option>Waitlist</option>
          <option>Active</option>
        </select>
      </div>

      {/* Table */}
      <div className="border border-[#1e2a28]/14 bg-white/40 overflow-x-auto">
        <div className="grid grid-cols-[1.35fr_1.1fr_1fr_1.1fr_0.8fr] gap-4 p-3 px-4 bg-[#1e2a28]/[0.035] text-[11px] font-bold uppercase tracking-wider text-[#1e2a28]/70 border-b border-[#1e2a28]/12 min-w-[680px]">
          <div>Patient</div>
          <div>Contact</div>
          <div>Last visit</div>
          <div>Recent appointment</div>
          <div>Status</div>
        </div>
        <div className="divide-y divide-[#1e2a28]/12 min-w-[680px]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#1e2a28]/70">No patients match this search.</div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1.35fr_1.1fr_1fr_1.1fr_0.8fr] gap-4 p-3 px-4 items-center text-xs hover:bg-[#1e2a28]/[0.02]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full border border-[#1e2a28]/25 flex items-center justify-center font-bold text-[11px] shrink-0">
                    {p.initials}
                  </span>
                  <div>
                    <strong className="block text-[12px] font-semibold">{maskName(p.name)}</strong>
                    <span className="text-[11px] text-[#1e2a28]/70">Patient record</span>
                  </div>
                </div>

                <div className="text-[11px] text-[#1e2a28]/70 leading-tight">
                  <b className="block text-[12px] font-semibold text-[#1e2a28] tabular-nums">{maskPhone(p.phone)}</b>
                  {maskEmail(p.email)}
                </div>

                <div className="text-[11px] text-[#1e2a28]/70 leading-tight">
                  <b className="block text-[12px] font-semibold text-[#1e2a28]">{p.lastVisit}</b>
                  Last appointment
                </div>

                <div className="text-[11px] text-[#1e2a28]/70 leading-tight">
                  <b className="block text-[12px] font-semibold text-[#1e2a28]">{p.recentVisit}</b>
                  Plenire activity
                </div>

                <div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 border border-[#1e2a28]/18 text-[#1e2a28]/70">
                    {p.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </QueryBoundary>
    </div>
  );
};
