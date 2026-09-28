# Daily practice reminders (Web Push)

An evening nudge from the "study buddy": delivered in the subscriber's local
window from 4 PM — their chosen hour when it is later — until the quiet hour
(10 PM), at most once per 20 hours, and never on a day they have already taken
a test. Delivery catches up: GitHub schedules are best-effort (this repo has
measured ~6 runs a day, not 24), so a run landing hours after the window opened
still delivers that day's reminder instead of skipping it. Copy rotates by day
and language (6 English + 6 Hindi lines in `src/lib/shared/reminderCopy.js`).
Returning visitors (at least one completed test) get a one-tap opt-in prompt on
the home streak card; "Not now" is a seven-day cooldown, and the results page
keeps the manual toggle.

## How it flows

1. Client (`src/lib/client/reminders.js`) requests notification permission,
   subscribes via `PushManager` with `PUBLIC_VAPID_KEY`, and POSTs the
   subscription + IANA timezone + chosen hour (null = smart) + language to
   `/api/reminders/subscribe`. Picking a different time (`PATCH` to the same
   route) updates that subscription's `reminder_hour` (and its `language`); the
   client mirrors the selection in `localStorage` (`selftest_reminder_hour`) so
   the picker renders before the server answers. Changing the hour clears
   `last_sent_at`, so the new slot can fire the same day instead of waiting out
   the 20-hour gap.
2. Rows live in `push_subscription` (`reminder_hour` null = smart, `language`
   `en|hi`); unsubscribing moves the row to `push_subscription_archive`
   (archive-first, never deleted). Archive inserts name their columns
   explicitly: the archive is `LIKE push_subscription` + `archived_at`, so a
   positional `SELECT *` would mis-map once a new source column lands after
   `archived_at`.
3. `.github/workflows/reminders.yml` runs hourly and calls
   `npm run reminders:send`, which selects due subscriptions and sends through
   `src/lib/server/push.js`. The whole due rule — the evening window clamp, the
   catch-up window, the 20-hour gap, the timezone fallback, and the
   practiced-today skip (an `ai_test_attempts` row today for the same
   `client_id`/`user_id` means the reminder would only nag) — is one SQL
   statement in `src/lib/shared/reminders.js`, executed by the sender (and
   pinned by its PGlite test). Scheduled runs are best-effort, so a run at,
   say, 6 PM still delivers a 4 PM reminder instead of waiting for tomorrow.
   404/410 endpoints are disabled (kept in the table), other failures record
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
   reliably in `npm run dev`. The opt-in now fails fast there: with no
   registration it resolves immediately and reports "Reminders aren't available
   right now" instead of hanging.

## Verifying end-to-end

`npm run test:e2e:push` builds the production app, previews it and drives real
Chrome through the whole pipeline: the reminder controls after the first test,
the time picker (local while off, saved on enable, evening hours only), a real
push delivered via FCM, the hourly sender honoring the chosen hour (and sending
nothing at an adjacent hour), the smart default window, the stored-language
copy, and archive-on-unsubscribe (including the archived `reminder_hour`). It
also injects failing save/update responses to prove the opt-in stays off, the
browser subscription is rolled back, the picker snaps back, and invalid hours
are rejected.

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
  opt-in reports "unconfigured" — the feature is inert, not broken. The same
  outcome covers `npm run dev`, which registers no service worker: the prompt
  still renders, but enabling resolves straight to the unavailable toast rather
  than awaiting a worker that will never arrive. Real opt-in is tested through
  the preview build or `npm run test:e2e:push`.
- iOS requires the PWA to be installed (Add to Home Screen) before Web Push
  works; the toggle is simply hidden where the APIs are missing.
- Telemetry: `reminder:opt-in` (`enabled: true|false`, plus timezone) and
  `reminder:time-set` (`hour`, null for smart) are allowlisted in
  `src/lib/shared/telemetryEvents.js`.
