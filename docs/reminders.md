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
   `npm run reminders:send`, which selects due subscriptions and sends through
   `src/lib/server/push.js`. The 20-hour gap and the 7-8am / 8-9pm window live
   in `src/lib/shared/reminders.js`, shared with the in-app due query
   (`src/lib/server/storage.js: listDuePushSubscriptions`). 404/410 endpoints
   are disabled (kept in the table), other failures record `last_error`.
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
Chrome through the whole pipeline: the opt-in toggle, a real push delivered via
FCM, the hourly sender, and archive-on-unsubscribe. It also injects a failing
subscribe response to prove the toggle stays off and the browser subscription
is rolled back.

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
- Telemetry: `reminder:opt-in` (`enabled: true|false`, plus timezone) is
  allowlisted in `src/lib/shared/telemetryEvents.js`.
