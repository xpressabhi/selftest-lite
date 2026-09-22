# Daily Reminder Time — Design

Date: 2026-09-22
Status: Draft (awaiting spec review)

## Goal

Let a learner choose when their daily practice reminder arrives ("10 AM", "5 PM")
instead of the fixed 7–8am / 8–9pm windows, and offer the opt-in right after the
first submitted test instead of after two. Auto-enabling a reminder on first
visit is explicitly out of scope: a permission prompt without context is denied
permanently all too often, iOS requires an installed PWA, and push services
penalize senders users did not ask for. The opt-in stays explicit; only its
moment moves earlier.

## Decisions (from ideation)

| #   | Decision                 | Choice                                                               |
| --- | ------------------------ | -------------------------------------------------------------------- |
| 1   | Picker location          | Inline on the results card, next to the reminder toggle              |
| 2   | Opt-in moment            | After the first submitted test (was two)                             |
| 3   | Auto-reminder on visit   | No — explicit opt-in; the first results page is the contextual prompt |
| 4   | Schedule semantics       | One chosen local hour ("around 10 AM"); hourly sender unchanged      |
| 5   | Default when unchosen    | Keep the smart 7–8am / 8–9pm windows (`NULL` = smart)                |
| 6   | Scope                    | Per device subscription, no cross-device sync                        |
| 7   | Time change              | Clear `last_sent_at` so the new slot can fire the same day           |
| 8   | Storage                  | Nullable `reminder_hour` on `push_subscription`                      |

## Architecture

`reminder_hour SMALLINT NULL` on `push_subscription` (0–23; `NULL` = smart
windows). The due rule — SQL text and parameters — lives once in
`src/lib/shared/reminders.js` and is executed by both the in-app due query
(`storage.js: listDuePushSubscriptions`) and the hourly sender
(`scripts/send-reminders.mjs`), so app and cron cannot drift. The client keeps a
localStorage mirror for display and `PATCH`es changes to the existing subscribe
endpoint; changing the hour resets the last-send timestamp.

Chosen over storing the hour in the user profile (`app_user_state`: the sender
would need a second join, and anonymous users lose parity) and over an array of
times (not asked for; complicates the dedupe/gap rules and the UI).

## Section 1 — Data model & migration

- `push_subscription.reminder_hour SMALLINT NULL`, `CHECK (reminder_hour BETWEEN 0 AND 23)`;
  added both to the `CREATE TABLE` (fresh databases) and via the existing
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS` pattern in `ensureStorageSchema`.
- `push_subscription_archive` gets the same column (the archive table is created
  as `LIKE push_subscription`, so existing archives must be altered explicitly).
- `archivePushSubscription` and the e2e cleanup insert switch from
  `SELECT *, NOW()` to explicit column lists: adding a source column makes the
  positional `SELECT *` land after the archive's `archived_at`, so the insert
  mis-maps columns and fails. Explicit lists survive future columns too.
- `check (reminder_hour between 0 and 23)` guards bad writes even if a future
  caller bypasses validation.

## Section 2 — Scheduling rule

`src/lib/shared/reminders.js` exports the rule once:

```sql
SELECT id, endpoint, p256dh, auth, timezone
FROM push_subscription,
     LATERAL (
       SELECT EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(NULLIF(timezone, ''), $3)))::int AS local_hour
     ) clock
WHERE enabled = TRUE
  AND (last_sent_at IS NULL OR last_sent_at < NOW() - make_interval(hours => $2::int))
  AND CASE
        WHEN reminder_hour IS NULL THEN clock.local_hour = ANY($1::int[])
        ELSE clock.local_hour = reminder_hour
      END
```

- Parameters: `[REMINDER_HOURS, REMINDER_MIN_GAP_HOURS, DEFAULT_REMINDER_TIMEZONE]`.
- Due = enabled AND at least the 20-hour gap since the last send AND the local
  hour matches the chosen hour, or the smart windows when nothing is chosen.
- Explicit time: because the workflow runs hourly, "10 AM" delivers within
  10:00–10:59 local; copy says "around".
- Time change (`PATCH`): when the value actually changes, clear `last_sent_at`
  and set `enabled = TRUE`. The gap alone would otherwise suppress the first
  reminder at the new time for up to a day; re-enabling also retries a row that
  a 404/410 disabled.
- `parseReminderHour(value)` in the same shared module accepts `null`/`''` →
  `null`, integers and numeric strings `0–23` → number, anything else →
  `undefined` (invalid). One validator for API and client.

## Section 3 — API

`src/routes/api/reminders/subscribe/+server.js`:

- `POST` gains optional `hour` in the body; invalid → `400 INVALID_HOUR`.
  Saved through `savePushSubscription({ …, reminderHour })`; the upsert sets
  `reminder_hour = EXCLUDED.reminder_hour` so re-enabling with a selection
  applies it.
- New `PATCH` accepts `{ endpoint, hour }` (endpoint must be an `https://`
  string; hour validated as above) and updates exactly that endpoint:
  `UPDATE push_subscription SET reminder_hour = $2, last_sent_at = CASE WHEN reminder_hour IS DISTINCT FROM $2 THEN NULL ELSE last_sent_at END, enabled = TRUE, updated_at = NOW() WHERE endpoint = $1 RETURNING id`.
  No row → `404 SUBSCRIPTION_NOT_FOUND`.
- Both methods keep the existing rate-limit bucket (`/api/reminders:subscribe`,
  20/min) and `logApiEvent` style (`action: 'update'` for PATCH).
- Why PATCH on the same route: the subscription endpoint is the resource; a
  second route would duplicate validation and logging for one field.

## Section 4 — Client & UI

`src/lib/client/reminders.js`:

- `getReminderHour()` / `setReminderHour(hour)` read/write the localStorage
  mirror `selftest_reminder_hour` (new key in `src/lib/client/constants.js`),
  validated with `parseReminderHour`.
- `enableReminders()` includes `hour: getReminderHour()` in the `POST`.
- `setReminderHour(hour)` updates the mirror, then (only when a subscription
  exists) `PATCH`es; on failure it restores the previous value and returns
  `{ ok: false, reason: 'server' }`. Changing the value while reminders are off
  only updates the mirror; enabling applies it.
- `isReminderEnabled()` and the rollback behavior from the previous fix are
  unchanged.

`src/routes/results/+page.svelte`:

- The reminder block renders at `historyCount >= 1` (was `>= 2`).
- A "Reminder time" `<select>` sits next to the toggle: first option
  "Smart (morning/evening)" (`null`), then hours 0–23 rendered with
  `Intl.DateTimeFormat(activeLanguage, { hour: 'numeric', hour12: true })`
  so labels are localized 12-hour times (10 AM, 5 PM) — no 24 new keys.
- On change: call `setReminderHour`; on failure show the existing
  `reminderFailed` toast and restore the select. On success show
  `reminderTimeSet` with the formatted time; choosing smart shows
  `reminderTimeSmart` as the toast.
- New locale keys (EN + HI): `reminderTimeLabel`, `reminderTimeSmart`,
  `reminderTimeSet` (with `{time}` replacement).
- Telemetry: `reminder:time-set` with `{ hour }` (null for smart), added to the
  allowlist in `src/lib/shared/telemetryEvents.js` with its emit site.
- When notifications are unsupported/blocked, behavior is unchanged (row hidden
  or `reminderDenied` toast).

## Section 5 — Verification

Extend the opt-in push suite (`npm run test:e2e:push`), which already runs real
Chrome, real FCM and the real sender against `DATABASE_URL`:

1. With exactly one seeded test, the reminder row is visible (new gate).
2. Selecting a time sends `PATCH` → `200`, the row's `reminder_hour` matches,
   and the localStorage mirror is set.
3. The sender honors the chosen hour: set `timezone` to `Etc/GMT0` and
   `reminder_hour` to the current UTC hour → `1 due, 1 sent`; shift
   `reminder_hour` by one hour → `0 due` (proves the default windows no longer
   apply once a time is chosen).
4. The existing default-window case (`reminder_hour IS NULL`, timezone aligned
   to a window) still sends.
5. `PATCH` returning 500 restores the select and emits the failure toast;
   an invalid hour (`25`) is rejected with `400`.
6. Cleanup still archives the row and unsubscribes.

Also run `npm run lint`, `npm run test`, `npm run check`; update
`docs/reminders.md` (flow, new column, verification steps).

Not covered by automation: `notificationclick` (needs an OS-level click) and
iOS PWA-install gating — both unchanged by this work.
