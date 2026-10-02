import type { Db } from './db/adapter';
import { dispatchOutbox, type MessageProvider } from './services/messaging';
import { expireOffers } from './services/recovery';

/**
 * The scheduled work, for every active practice. In AWS this is a Lambda triggered every minute by EventBridge.
 * Each practice is handled in its own small transaction (one practice's problem never blocks another), a few at a time.
 */
export async function runScheduled(db: Db, provider: MessageProvider, concurrency = 8): Promise<{ practices: number; failed: number }> {
  const ids = await db.platform((q) => q.query<{ id: string }>("SELECT id FROM practices WHERE status = 'active'"));
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const { id } = ids[next++];
      try {
        await expireOffers(db, id);
        await dispatchOutbox(db, id, provider);
      } catch {
        failed++; // logged without details: the error could contain patient data
        console.error('[jobs] a practice run failed');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return { practices: ids.length, failed };
}
