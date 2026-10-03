# Plenire backend (phases C1, C2 and accounts)

A small API (Hono + Node) on top of PostgreSQL. It owns the business rules, so they cannot be bypassed from a browser.

## Run it

```bash
npm install
npm run demo      # a guided tour, prints every step (nothing else to install)
npm run dev:all   # backend + web app together (http://localhost:3000)
npm run dev:api   # backend only, http://localhost:8787, built-in local database
npm test          # 91 tests (includes every screen rendered against the real backend)
npm run loadtest  # 100-clinic load test (needs a throwaway PostgreSQL, see below)
npm run admin:create -- you@example.com "Your Name"   # first platform admin in a real deployment
```

Local demo sign-ins (printed in the terminal when the API starts): `admin@plenire.test` (platform admin), `mensah@lakeside.test` (clinic owner), `tracy@lakeside.test` (front desk). Real users never get a password from you: they choose their own from an invitation link.

To test against real PostgreSQL: `TEST_DATABASE_URL=postgres://user:pass@localhost:5432/dbname npm test`
(on Windows PowerShell: `$env:TEST_DATABASE_URL="postgres://..."; npm test`). The database is wiped by the tests, so use an empty one.

## The rules the server enforces

| Rule | Where | Test |
|---|---|---|
| A practice only ever sees its own rows (row-level security, fails closed) | `001_init.sql` | `security.test.ts` |
| Rows can't point at another practice's patient/provider (composite foreign keys) | `001_init.sql` | `security.test.ts` |
| The app database role can't edit or delete the audit log; chain detects tampering | `001_init.sql` | `security.test.ts`, `recovery.test.ts` |
| Audit entries hold ids and counts only (no names, no message text) | `services/audit.ts` | `recovery.test.ts` |
| First valid YES wins the slot; simultaneous YES → exactly one winner | `services/recovery.ts` (row lock) | `recovery.test.ts` (real race on PostgreSQL) |
| Offers expire on the database clock; late YES is refused; sweeper reopens the slot | `services/recovery.ts` | `recovery.test.ts` |
| STOP opts out instantly, withdraws offers, never texted again; START/HELP handled | `services/recovery.ts` | `recovery.test.ts` |
| Texts need consent and may not mention health details (checked on the server) | `services/messaging.ts`, `shared/phi.ts` | `recovery.test.ts` |
| Front desk gets the recovery **rate**; only the owner gets **revenue** and the audit log | `app.ts` | `api.test.ts` |
| Tokens: wrong key, expired, unknown role, no practice → 401 | `auth/tokens.ts` | `api.test.ts` |
| Dollar figures are removed from API responses for non-owners (openings, metrics) | `app.ts` | `screens.test.ts`, `ui.test.ts` |
| Double-booking a provider is refused (per-provider lock) | `services/scheduling.ts` | `screens.test.ts` |
| Undoing a no-show closes its opening and withdraws offers | `services/recovery.ts` | `screens.test.ts` |
| Browser can only log whitelisted workstation events, never business events | `app.ts` | `screens.test.ts` |
| Screens never break on a changed response: every response is checked with Zod | `src/api/schemas.ts` | `ui.test.ts` |
| Won't start in production with dev login, no database, or the simulator on | `config.ts` | `api.test.ts` |

## Accounts and sign-in

```
 You (platform admin) ──▶ create clinic + owner email ──▶ one-time link emailed to the owner
 Owner opens link ──▶ chooses their OWN password ──▶ signed in ──▶ invites staff the same way
 Everyone later:  email + password ──▶ 10-minute access token (kept in memory) + private refresh cookie
```

| Part | How it works |
|---|---|
| Passwords | scrypt, random salt per password, 12-character minimum, common/obvious passwords refused, stored only in the `credentials` table that only the sign-in database role can touch |
| Wrong guesses | 5 wrong attempts lock that account for 15 minutes (kept in the database, so it holds across many servers). Unknown and wrong-password look identical and take the same time |
| Sessions | Refresh token in an HttpOnly, SameSite=Strict cookie; each use issues a new one; replaying an old one (stolen cookie) ends that whole sign-in; 12-hour maximum, 30-minute idle limit |
| Invitations / resets | Single-use random links (only a hash is stored), 72 hours for invitations, 1 hour for resets; "forgot password" gives the same answer whether or not the email exists |
| Sign out everywhere | Changing or resetting a password, switching someone off, or pausing a clinic revokes sessions |
| Roles | `platform_admin` (you), `owner`, `front_desk`, `dentist`, `hygienist`. Owners manage their team and providers; only owners see revenue and the audit log |
| Three database roles | `plenire_app` (a signed-in clinic, locked to one clinic), `plenire_auth` (sign-in only), `plenire_platform` (the operator console: can create clinics and users, **no access to patient data, enforced by the database and tested**) |
| Seat limits | Each clinic has a team-seat limit (default 25) the operator can change |

### Onboarding a clinic (what you do)

1. Sign in at `/login` as a platform admin. You land on the operator console (`/admin`).
2. "Add a clinic": name, phone, time zone, the owner's name and email.
3. The owner gets an email with a one-time link. (In development the link is shown on screen so you can copy it.)
4. The owner chooses a password, then adds providers (Settings) and invites staff (Team).

## Scaling to hundreds of clinics

Measured with `npm run loadtest` on one small shared machine (one Node process + PostgreSQL on the same CPU):
**100 clinics, 100,000 patients, 24 staff at once → ~300 requests/second, response times about 70–130 ms, 0 errors, 0 cross-clinic data leaks.**
A clinic of 10 staff makes roughly 1 request per second, so one instance already covers 100+ clinics with headroom.

Why it scales: every table leads its indexes with `practice_id` (each clinic only touches its own slice, confirmed by the query plan), the API keeps nothing in memory between requests (run as many copies as you like), scheduled jobs handle each clinic in its own small transaction, and tenant isolation is enforced by the database, not by application code.

Still to do for growth: RDS Proxy or PgBouncer when many API copies run (connection pooling), read replica for dashboards, pagination on patient lists beyond ~500 patients per clinic, per-clinic rate limits at the WAF, and partitioning only if a single table passes hundreds of millions of rows.

## How it fits together

```
Browser ──(Bearer token)──▶ API (server/app.ts)
                              │ checks token → practice + role
                              ▼
                      db.tenant(practiceId)   ← one transaction, locked to one practice
                              ▼
                        PostgreSQL (RLS)
   messages written to an outbox in the same transaction ──▶ dispatcher sends them after commit
   scheduled job (server/jobs.ts): expire stale offers + send queued texts
```

## Moving to AWS (phase C3)

| Local today | AWS |
|---|---|
| Built-in database (PGlite) | RDS or Aurora PostgreSQL. Run migrations with the owner role; the API logs in as a user that is a member of `plenire_app` (`GRANT plenire_app TO api_user;`) |
| `AUTH_MODE=local` (our own email + password) | Keep it, or switch to `AUTH_MODE=cognito` (implemented and tested with a local signing key; staff get `custom:practice_id` and `custom:role`). Either way you MUST add MFA for owners and platform admins before real patient data |
| Console email (`EMAIL_PROVIDER=console`) | Amazon SES (`EMAIL_PROVIDER=ses`; the production check refuses to start until it is wired) |
| `setInterval` in `index.ts` | EventBridge Scheduler → Lambda running `runScheduled()` every minute |
| `consoleProvider` | A `MessageProvider` using AWS End User Messaging (SMS), plus an inbound webhook that calls `handleReply` |
| `node server/index.ts` | `hono/aws-lambda` adapter behind API Gateway (or a container on App Runner) |

Check current AWS HIPAA-eligible service lists and pricing, and sign the AWS BAA, before any real patient data.

## Known limits (honest list)

- Booking is staff-assisted (`POST /api/bookings`). A public per-practice booking page needs live availability, patient verification and abuse protection.
- Screens refresh by polling every 10–30 seconds; live push (WebSocket) is a later improvement.
- Dev sign-in keeps its token in the tab's sessionStorage; Cognito will use hosted sign-in with short-lived tokens.
- No inbound-SMS webhook or signature check yet (needs the real SMS provider).
- No rate limiting yet (API Gateway / WAF in C3).
- Single-region, no backups or encryption settings yet (RDS settings in C3).
- **No multi-factor authentication yet.** Add it for owners and platform admins before real use (Cognito provides it, or add TOTP here).
- Email delivery is a console stub until Amazon SES is connected (production mode refuses to start with it).
- The per-IP rate limit is per server instance; AWS WAF should enforce it globally. The account lockout is already global.


## Automatic patient texts

All go through `queueMessage` (consent, STOP and health-wording checks), appear in Messages, and are sent by the outbox. A text that cannot be sent never blocks the booking or status change. Code: `server/services/notifications.ts`.

| Text | Trigger | Sent |
|---|---|---|
| Booking confirmation | `POST /api/bookings`, `POST /api/appointments` (not walk-ins) | once per appointment |
| Reminder | scheduled job (`queueReminders`, run by `runScheduled`) at the practice's `reminder_hours` (default 24 and 2) | once per lead time, 8 AM to 9 PM clinic time, only for `scheduled` visits |
| Thank-you + Google review link | status set to Seen (`completed`) | once per visit; link comes from Settings (`practices.google_review_url`) |
| Follow-up confirmation | follow-up set or changed | timing only, never the clinical label |

`appointment_notifications` (unique on appointment + kind) is the sent ledger. `appointments.thanked` is true only when a thank-you was actually queued.
