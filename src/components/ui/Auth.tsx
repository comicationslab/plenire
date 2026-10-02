import React, { useState } from 'react';

/** Centered card used by sign-in, invitation and reset pages. */
export const AuthShell: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <main className="min-h-screen flex items-center justify-center bg-[#f4f0e8] text-[#1e2a28] p-6">
    <div className="w-full max-w-sm border border-[#1e2a28] p-7 space-y-5">
      <div className="flex items-center gap-2.5">
        <div aria-hidden="true" className="w-8 h-8 rounded-full border border-[#1e2a28] flex items-center justify-center font-bold text-[12px]">pl</div>
        <span className="font-bold text-[20px] tracking-tight">Plenire</span>
      </div>
      <div>
        <h1 className="text-[18px] font-semibold tracking-tight m-0">{title}</h1>
        {subtitle && <p className="text-[13px] text-[#1e2a28]/70 mt-1 mb-0 leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </div>
  </main>
);

export const inputCls = 'w-full h-[38px] px-3 bg-white border border-[#1e2a28]/40 text-sm';
export const primaryBtn = 'w-full py-2 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold disabled:opacity-60';

export const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="block text-[12px] font-semibold">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-[#1e2a28]/70 m-0">{hint}</p>}
  </div>
);

export const ErrorLine: React.FC<{ message: string }> = ({ message }) =>
  message ? <div role="alert" className="text-xs text-[#a3533a] font-semibold">{message}</div> : null;

/** Shows a one-time link (development) with a copy button. In production the link is emailed instead and never shown. */
export const InviteLinkBox: React.FC<{ email?: string; emailSent: boolean; link?: string; onClose?: () => void }> = ({ email, emailSent, link, onClose }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="p-3 border border-[#a3533a]/50 bg-[#a3533a]/[0.06] space-y-2 text-xs">
      <div className="font-semibold">
        {emailSent ? `Invitation emailed${email ? ` to ${email}` : ''}.` : `Could not send the email${email ? ` to ${email}` : ''}.`}
      </div>
      {link && (
        <>
          <p className="m-0 text-[#1e2a28]/80">Development mode: copy this one-time link and open it in a private window to set the password.</p>
          <div className="flex gap-2">
            <input readOnly value={link} aria-label="One-time invitation link" onFocus={(e) => e.currentTarget.select()} className="flex-1 h-[30px] px-2 bg-white border border-[#1e2a28]/30 text-[11px]" />
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); }} className="px-3 bg-[#1e2a28] text-[#f4f0e8] font-semibold">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </>
      )}
      {onClose && <button type="button" onClick={onClose} className="underline font-semibold">Done</button>}
    </div>
  );
};
