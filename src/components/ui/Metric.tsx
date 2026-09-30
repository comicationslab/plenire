import React from 'react';

export const PageHead: React.FC<{ eyebrow: string; title: string; blurb?: string }> = ({ eyebrow, title, blurb }) => (
  <div className="flex flex-col gap-1">
    <div className="text-[11px] tracking-widest uppercase text-[#a3533a] font-bold">{eyebrow}</div>
    <h2 className="text-[30px] font-normal tracking-tight text-[#1e2a28] m-0">{title}</h2>
    {blurb && <p className="text-[13px] text-[#1e2a28]/70 mt-1 max-w-lg leading-relaxed">{blurb}</p>}
  </div>
);

export const MetricCard: React.FC<{ label: string; value: React.ReactNode; sub?: string; accent?: boolean }> = ({
  label,
  value,
  sub,
  accent,
}) => (
  <div className="p-4 border border-[#1e2a28]/15 bg-white/40">
    <div className="text-[11px] text-[#1e2a28]/70 font-semibold uppercase tracking-wider">{label}</div>
    <div className={`text-[29px] font-medium mt-2 tracking-tight tabular-nums ${accent ? 'text-[#a3533a]' : 'text-[#1e2a28]'}`}>
      {value}
    </div>
    {sub && <div className="text-[12px] text-[#1e2a28]/70 mt-1">{sub}</div>}
  </div>
);

export const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="border border-[#1e2a28]/15 bg-white/40">
    <div className="p-4 pb-3 border-b border-[#1e2a28]/10 flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-semibold tracking-tight m-0">{title}</h3>
      {note && <span className="text-[11px] text-[#1e2a28]/70">{note}</span>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export interface Bar {
  label: string;
  value: number;
  display: string;
  detail?: string;
}

/** Simple accessible bar chart (no chart library needed). The last bar is highlighted as "now". */
export const BarChart: React.FC<{ bars: Bar[]; ariaLabel: string }> = ({ bars, ariaLabel }) => {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul className="flex items-end gap-3 h-40 m-0 p-0 list-none" aria-label={ariaLabel}>
      {bars.map((b, i) => {
        const isLast = i === bars.length - 1;
        return (
          <li key={b.label} className="flex-1 h-full flex flex-col justify-end items-center gap-1.5 min-w-0">
            <span className="text-[12px] font-semibold tabular-nums text-[#1e2a28]">{b.display}</span>
            <div
              className={isLast ? 'w-full bg-[#a3533a]' : 'w-full bg-[#1e2a28]'}
              style={{ height: `${Math.max(4, (b.value / max) * 100)}%`, maxHeight: '75%' }}
              title={b.detail}
            />
            <span className="text-[11px] text-[#1e2a28]/70">{b.label}</span>
          </li>
        );
      })}
    </ul>
  );
};
