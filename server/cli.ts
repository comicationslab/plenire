/**
 * Operator commands.   npm run admin:create -- you@example.com "Your Name"
 * Creates the FIRST platform admin (or another one) and prints a one-time link to choose a password.
 */
import { loadConfig } from './config';
import { migrate, openDb } from './db/adapter';
import { inviteAdmin } from './services/accounts';
import { inviteLink } from './routes/auth';

const [cmd, email, ...nameParts] = process.argv.slice(2);
if (cmd !== 'create-admin' || !email) {
  console.error('Usage: npm run admin:create -- you@example.com "Your Name"');
  process.exit(1);
}
const config = loadConfig();
const db = await openDb(config.DATABASE_URL);
await migrate(db);
const out = await inviteAdmin(db, null, { email: email.trim().toLowerCase(), name: nameParts.join(' ') || email });
console.log(`\nPlatform admin invited. Open this link ONCE to choose a password (valid 72 hours):\n\n  ${inviteLink(config.APP_URL, 'accept-invite', out.token)}\n`);
await db.close();
