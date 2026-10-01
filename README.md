# Plenire

Patient scheduling, confirmations and no-show recovery for dental practices.

**Status:** the screens now run on a real backend (database, sign-in, roles, audit log). Sign-in is a local development login until the AWS phase. See [docs/BACKEND.md](docs/BACKEND.md).

## Run it

```bash
npm install
npm run dev:all   # starts the backend and the web app together, then open http://localhost:3000
```

Sign in with the **Front desk** or **Owner** button on the login screen.

Other commands: `npm run demo` (guided tour of the backend), `npm test` (58 tests), `npm run build` (typecheck + production build), `npm run dev:api` / `npm run dev` (run each half on its own).

## Views

- **Dashboard** – one per role, decided by who signs in. *Front desk* shows the Recovery rate; *Owner* shows Estimated revenue recovered.
- **Today**, **Recovery**, **Messages**, **Patients**, **Waitlist**, **Settings**, plus a patient **booking page**.

## Code map

- `src/api/` – talks to the server: `client.ts` (sign-in token, error handling), `schemas.ts` (Zod: what each response must look like), `hooks.ts` (every screen's data), `format.ts` (server data → what screens draw)
- `src/auth/AuthContext.tsx` – sign-in (swapped for Amazon Cognito in the AWS phase)
- `src/context/` – `PracticeContext` (who/which practice, from the server), `HIPAAContext` (screen lock, Screen Shield, outgoing-text check)
- `src/App.tsx` – routes: `/login`, `/dashboard`, `/today`, `/recovery`, `/messages`, `/patients`, `/waitlist`, `/settings`, `/book`
- `server/` – the API and database rules (see docs/BACKEND.md)
- `shared/phi.ts` – the health-wording check used by both browser and server

## Not production-ready yet

Sign-in is a development login, the booking page is staff-assisted (not public), and nothing is deployed. Do not enter real patient data until the AWS setup, signed BAAs and a compliance review are done.
