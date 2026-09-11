# Daily practice reminders (Web Push)

A streak-aware reminder sent in the subscriber's morning (7–8am) or evening
(8–9pm) window, at most once per 20 hours. The opt-in is offered on the results
page only after the user has completed at least two tests.

## How it flows

1. Client (`src/lib/client/reminders.js`) requests notification permission,
   subscribes via `PushManager` with `PUBLIC_VAPID_KEY`, and POSTs the
   subscription + IANA timezone to `/api/reminders/subscribe`.
2. Rows live in `push_subscription`; unsubscribing moves the row to
   `push_subscription_archive` (archive-first, never deleted).
3. `.github/workflows/reminders.yml` runs hourly and calls
   `npm run reminders:send`, which selects due subscriptions
   (`src/lib/server/storage.js: listDuePushSubscriptions`) and sends via
   `web-push`. 404/410 endpoints are disabled (kept in the table), other
   failures record `last_error`.
4. The service worker handler (`static/push-handler.js`) is injected into the
   Workbox worker via `workbox.importScripts` and opens `/?daily=1`, which
   auto-starts the Daily 5 (`src/routes/+page.svelte`).

## Setup

1. Generate keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Add env vars:
   - Vercel (runtime): `PUBLIC_VAPID_KEY` (browser needs it).
   - GitHub Actions secrets: `DATABASE_URL`, `VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
3. Test locally with a production build (`npm run build && npm run preview`);
   `serviceWorker.ready` does not resolve reliably in `npm run dev`.

## Notes

- Without VAPID keys the send script exits 0 with a message and the client
  toggle reports "unconfigured" — the feature is inert, not broken.
- iOS requires the PWA to be installed (Add to Home Screen) before Web Push
  works; the toggle is simply hidden where the APIs are missing.
- Telemetry: `reminder:opt-in` (`enabled: true|false`, plus timezone) is
  allowlisted in `src/lib/shared/telemetryEvents.js`.
