# Plenire

Patient scheduling, confirmations and no-show recovery for dental practices.

**Status:** the screens now run on a real backend (database, sign-in, roles, audit log). Sign-in is a local development login until the AWS phase. See [docs/BACKEND.md](docs/BACKEND.md).

## Run it

```bash
npm install
npm run dev:all   # starts the backend and the web app together, then open http://localhost:3000
```

The terminal prints demo sign-ins and their password (local development only). Try:

- `admin@plenire.test`: the platform console at `/admin` (add clinics, invite owners)
- `mensah@lakeside.test`: a clinic owner (dashboard with revenue, Team page)
- `tracy@lakeside.test`: front desk (dashboard with recovery rate)

Other commands: `npm run demo` (guided tour), `npm test`, `npm run build`, `npm run loadtest` (100-clinic load test), `npm run admin:create -- you@example.com "Your Name"` (first admin on a real deployment).

## Views

- **Platform console** (`/admin`) – for the Plenire operator: add clinics, invite owners, pause a clinic. Cannot see patient data.
- **Team** – clinic owners invite and manage their own people.
- **Dashboard** – one per role, decided by who signs in. *Front desk* shows the Recovery rate; *Owner* shows Estimated revenue recovered.
- **Today**, **Recovery**, **Messages**, **Patients**, **Waitlist**, **Settings**, plus a patient **booking page**.

## Code map

- `src/api/` – talks to the server: `client.ts` (sign-in token, error handling), `schemas.ts` (Zod: what each response must look like), `hooks.ts` (every screen's data), `format.ts` (server data → what screens draw)
- `src/auth/AuthContext.tsx` – sign-in session (token kept in memory, private refresh cookie)
- `src/pages/` – Login, Forgot password, Accept invitation / reset, Team, Admin console
- `src/context/` – `PracticeContext` (who/which practice, from the server), `HIPAAContext` (screen lock, Screen Shield, outgoing-text check)
- `src/App.tsx` – routes: `/login`, `/dashboard`, `/today`, `/recovery`, `/messages`, `/patients`, `/waitlist`, `/settings`, `/book`
- `server/` – the API and database rules (see docs/BACKEND.md)
- `shared/phi.ts` – the health-wording check used by both browser and server

## Not production-ready yet

Email is a console stub, there is no MFA yet, the booking page is staff-assisted (not public), and nothing is deployed. Do not enter real patient data until the AWS setup, signed BAAs and a compliance review are done.
