import type { Db } from './db/adapter';
import { dispatchOutbox, type MessageProvider } from './services/messaging';
import { expireOffers } from './services/recovery';

/** The scheduled work. In AWS this is one Lambda triggered every minute by EventBridge Scheduler. */
export async function runScheduled(db: Db, provider: MessageProvider) {
  const ids = await db.admin((q) => q.query<{ id: string }>('SELECT id FROM practices'));
  for (const { id } of ids) {
    await expireOffers(db, id);
    await dispatchOutbox(db, id, provider);
  }
}
