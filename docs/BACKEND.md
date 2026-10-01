# Plenire backend (phases C1 + C2)

A small API (Hono + Node) on top of PostgreSQL. It owns the business rules, so they cannot be bypassed from a browser.

## Run it

```bash
npm install
npm run demo      # a guided tour, prints every step (nothing else to install)
npm run dev:all   # backend + web app together (http://localhost:3000)
npm run dev:api   # backend only, http://localhost:8787, built-in local database
npm test          # 58 tests (includes every screen rendered against the real backend)
```

Sign in (local development only): `POST /auth/dev-login {"email":"tracy@lakeside.test"}` (front desk) or `mensah@lakeside.test` (owner).

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
| `AUTH_MODE=dev` | `AUTH_MODE=cognito` (already implemented and tested with a local signing key). Staff get custom attributes `custom:practice_id` and `custom:role` |
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
- Staff invitation and password/MFA flows come from Cognito in C3.
