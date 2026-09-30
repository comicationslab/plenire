import React from 'react';
import { useHIPAA } from '../context/HIPAAContext';
import {
  Calendar,
  Zap,
  MessageSquare,
  Users,
  ListOrdered,
  ShieldCheck,
  Settings,
  ExternalLink,
  Shield,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenPatientBooking: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onOpenPatientBooking,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { currentUser } = useHIPAA();

  const navItems = [
    { id: 'today', label: 'Today', icon: Calendar, note: '4 Operatories' },
    { id: 'recovery', label: 'Recovery', icon: Zap, note: 'Fill Engine' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, note: '2-way SMS' },
    { id: 'patients', label: 'Patients', icon: Users, note: 'CRM & Consents' },
    { id: 'waitlist', label: 'Waitlist', icon: ListOrdered, note: 'Priority Queue' },
    { id: 'compliance', label: 'HIPAA Center', icon: ShieldCheck, note: 'Audit & BAAs' },
    { id: 'settings', label: 'Settings', icon: Settings, note: 'Preferences' },
  ];

  const handleNav = (id: string) => {
    onNavigate(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-[#1e2a28]/40 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 w-64 bg-[#f4f0e8] border-r border-[#1e2a28]/15 flex flex-col z-40 transform transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-[#1e2a28]/15 bg-white/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-xs text-[#1e2a28] bg-white">
              cf
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight text-[#1e2a28] flex items-center gap-1.5">
                Chairfill
                <span className="text-[10px] font-semibold text-[#a3533a] border border-[#a3533a]/30 px-1 py-0.2 rounded-none">
                  HIPAA
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[#1e2a28]/60 mt-2 leading-relaxed">
            Scheduling &amp; Chair Recovery for Open Dental EHR
          </p>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Main Navigation">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#a3533a]">
            Clinical Workspace
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold transition-colors text-left ${
                  isActive
                    ? 'bg-[#1e2a28] text-[#f4f0e8]'
                    : 'text-[#1e2a28]/70 hover:bg-[#1e2a28]/5 hover:text-[#1e2a28]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#f4f0e8]' : 'text-[#1e2a28]/60'}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.note && (
                  <span
                    className={`text-[10px] font-normal ${
                      isActive ? 'text-[#f4f0e8]/70' : 'text-[#1e2a28]/40'
                    }`}
                  >
                    {item.note}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-4 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#a3533a]">
            Public Portal
          </div>
          <button
            onClick={() => {
              onOpenPatientBooking();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-[#a3533a] hover:bg-[#a3533a]/10 border border-[#a3533a]/30 transition-colors text-left"
          >
            <ExternalLink className="w-4 h-4 shrink-0 text-[#a3533a]" />
            <span className="flex-1 truncate">Patient Booking</span>
            <span className="text-[9px] uppercase tracking-wider font-bold">Live</span>
          </button>
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-[#1e2a28]/15 bg-white/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border border-[#1e2a28]/30 flex items-center justify-center font-bold text-xs bg-[#1e2a28] text-[#f4f0e8] shrink-0">
              {currentUser.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#1e2a28] truncate">{currentUser.name}</div>
              <div className="text-[10px] text-[#1e2a28]/60 truncate flex items-center gap-1">
                <Shield className="w-2.5 h-2.5 text-[#a3533a]" />
                <span>{currentUser.title}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
