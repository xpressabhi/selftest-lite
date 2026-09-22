# Daily practice reminders (Web Push)

A daily practice reminder at the subscriber's chosen local hour (10 AM, 5 PM,
…), or in the smart morning (7–8am) / evening (8–9pm) windows when they have not
chosen one, at most once per 20 hours. The opt-in is offered on the results page
after the first completed test.

## How it flows

1. Client (`src/lib/client/reminders.js`) requests notification permission,
   subscribes via `PushManager` with `PUBLIC_VAPID_KEY`, and POSTs the
   subscription + IANA timezone + chosen hour (null = smart) to
   `/api/reminders/subscribe`. Picking a different time (`PATCH` to the same
   route) updates that subscription's `reminder_hour`; the client mirrors the
   selection in `localStorage` (`selftest_reminder_hour`) so the picker renders
   before the server answers. Changing the hour clears `last_sent_at`, so the
   new slot can fire the same day instead of waiting out the 20-hour gap.
2. Rows live in `push_subscription` (`reminder_hour` 0–23, null = smart);
   unsubscribing moves the row to `push_subscription_archive` (archive-first,
   never deleted). Archive inserts name their columns explicitly: the archive is
   `LIKE push_subscription` + `archived_at`, so a positional `SELECT *` would
   mis-map once a new source column lands after `archived_at`.
3. `.github/workflows/reminders.yml` runs hourly and calls
   `npm run reminders:send`, which selects due subscriptions and sends through
   `src/lib/server/push.js`. The whole due rule — chosen hour or smart windows,
   the 20-hour gap, the timezone fallback — is one SQL statement in
   `src/lib/shared/reminders.js`, executed by both the sender and the in-app
   query (`src/lib/server/storage.js: listDuePushSubscriptions`). Because the
   workflow is hourly, "10 AM" delivers within 10:00–10:59 local. 404/410
   endpoints are disabled (kept in the table), other failures record
   `last_error`.
4. The service worker handler (`static/push-handler.js`) is injected into the
   Workbox worker via `workbox.importScripts` and opens `/?daily=1`, which
   auto-starts the Daily 5 (`src/routes/+page.svelte`).

## Setup

1. Generate keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Add env vars:
   - Vercel (runtime): `PUBLIC_VAPID_KEY` as **Plaintext/config** — Vercel rejects
     `PUBLIC_`-prefixed variables marked `Sensitive` ("public framework prefix
     cannot use visibility: secret"). The public key is not a secret: it is
     sent to the browser with every subscription.
     ```bash
     vercel env add PUBLIC_VAPID_KEY production   # paste public key, answer "no" to sensitive
     ```
   - GitHub Actions secrets: `DATABASE_URL`, `VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
     The private key is only used by the hourly sender, so it never needs to
     live in Vercel.
3. Redeploy after adding the Vercel variable (env changes apply per
   deployment), then test locally with a production build
   (`npm run build && npm run preview`); `serviceWorker.ready` does not resolve
   reliably in `npm run dev`.

## Verifying end-to-end

`npm run test:e2e:push` builds the production app, previews it and drives real
Chrome through the whole pipeline: the reminder row after the first test, the
time picker (local while off, saved on enable), a real push delivered via FCM,
the hourly sender honoring the chosen hour (and sending nothing at an adjacent
hour), the smart default windows, the hourly sender, and
archive-on-unsubscribe (including the archived `reminder_hour`). It also injects
failing save/update responses to prove the toggle stays off, the browser
subscription is rolled back, the picker snaps back, and invalid hours are
rejected.

Requirements: Chrome installed, network access to FCM, `DATABASE_URL` (env or
`.env.local`) and a headed session. Headless Chrome denies notification
permission and incognito disables the Push API, so the suite is excluded from
the default `npm run test:e2e`. It signs with throwaway test keys from
`tests/e2e/pushTestKeys.js`; the preview server gets the matching public key.
Each run creates one subscription row and archives it at the end (archive-first,
so `push_subscription_archive` grows by one row per run). Evidence lands in
`test-results/push-e2e-artifact.json`.

## Notes

- Without VAPID keys the send script exits 0 with a message and the client
  toggle reports "unconfigured" — the feature is inert, not broken.
- iOS requires the PWA to be installed (Add to Home Screen) before Web Push
  works; the toggle is simply hidden where the APIs are missing.
- Telemetry: `reminder:opt-in` (`enabled: true|false`, plus timezone) and
  `reminder:time-set` (`hour`, null for smart) are allowlisted in
  `src/lib/shared/telemetryEvents.js`.
