# Plenire

Patient scheduling, confirmations and no-show recovery for dental practices.

**Status: front-end prototype.** All data is sample data held in browser memory; there is no backend, real login or real texting yet.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # typecheck + production build
```

## Views

- **Dashboard** – one per role. *Front desk* shows the Recovery rate; *Owner* shows Estimated revenue recovered. (Use "Demo: view as" in the sidebar to switch.)
- **Today**, **Recovery**, **Messages**, **Patients**, **Waitlist**, **Settings**, plus a patient **booking page**.

## Code map

- `src/context/PracticeContext.tsx` – current practice, user and role (demo switch today, real session later)
- `src/context/HIPAAContext.tsx` – screen lock (PIN + idle timer), Screen Shield, activity log, outgoing-text check
- `src/lib/metrics.ts` – recovery rate and revenue maths
- `src/services/hipaaCompliance.ts` – health-term detector, masking helpers, consent text

## Not production-ready yet

The PIN lock is a convenience screen lock, not authentication. Do not enter real patient data until the backend, sign-in, encryption and signed BAAs are in place.
