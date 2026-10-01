import type { UseQueryResult } from '@tanstack/react-query';
import React from 'react';

/** Shows "Loading…" or a clear error with a retry button until all the data a screen needs has arrived. */
export const QueryBoundary: React.FC<{ queries: UseQueryResult<unknown>[]; children: React.ReactNode }> = ({ queries, children }) => {
  const failed = queries.find((q) => q.isError);
  if (failed) {
    return (
      <div role="alert" className="p-5 border border-[#a3533a]/50 bg-[#a3533a]/[0.06] space-y-2 max-w-md">
        <div className="text-[13px] font-semibold">This screen couldn’t load</div>
        <div className="text-[12px] text-[#1e2a28]/80">{failed.error instanceof Error ? failed.error.message : 'Unknown problem'}</div>
        <button onClick={() => queries.forEach((q) => void q.refetch())} className="px-3 py-1.5 bg-[#1e2a28] text-[#f4f0e8] text-xs font-semibold">Try again</button>
      </div>
    );
  }
  if (queries.some((q) => q.isPending)) return <p role="status" className="text-[13px] text-[#1e2a28]/70">Loading…</p>;
  return <>{children}</>;
};
