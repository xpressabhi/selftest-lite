# Accounts, Google Sign-In & User Activity Tracking — Implementation Plan

Status: In progress (implemented alongside this doc)
Last updated: Aug 2026

## Goal

- Bring Google Sign-In back (it existed in the old Next.js app — commits
  `7597cb7`, `c48961e` — but was dropped in the SvelteKit migration).
- Assign every visitor a stable anonymous `client_id` so activity is trackable
  before login.
- On login, merge all pre-login activity (attempts, telemetry) into the user's
  record via the same `client_id` — seamless, no data loss.
- Tests stay **public** (no login wall). Test submissions and user activity are
  saved server-side and visible per user.
- Work identically on Web, PWA and the Capacitor Android app (which is a
  WebView shell loading `https://www.selftest.in`).

## Platform risk assessment

| Platform | Risk | Mitigation |
| --- | --- | --- |
| Web browser | Low | Standard GIS popup flow + httpOnly cookie. |
| PWA (standalone) | Low | Same origin, first-party cookie. Redirect-mode fallback if popups are blocked in standalone windows. |
| Android app (Capacitor WebView) | High | GIS popup mode can fail silently in WebViews (popups blocked). Use `ux_mode: 'redirect'` on native + enable JS popups in `MainActivity` as belt-and-suspenders. Must be device-tested. |
| iOS PWA | Note | Safari evicts PWA storage after ~7 days unused; user re-logs in. Inherent to iOS, not fixable. |

## Architecture

```
Browser / PWA / Android WebView
  │  x-client-id header (anonymous UUID in localStorage)
  │  selftest_session cookie (httpOnly, SameSite=Lax, 30-day sliding)
  ▼
/api/auth/google   POST  id_token → verify → upsert user → create session →
                          set cookie → backfill user_id on client_id rows
/api/auth/me       GET   resolve session, slide expiry
/api/auth/logout   POST  revoke session, clear cookie
/api/test/submit   POST  grade + persist attempt {user_id|client_id, user_answers}
/api/test          GET   include myAttempt for identity (user_id or client_id)
/api/user/history  GET   server-side submissions for identity (login merge/hydration)
/api/telemetry     POST  feature events tagged with client_id (+ user_id when logged in)
```

Identity resolution order on the server:
1. Session cookie → `user_id`
2. `x-client-id` header → `client_id`
3. Fallback: legacy `getClientKey(request)` (ip+ua hash) for backwards compat

## Data model changes (`ensureStorageSchema` in `src/lib/server/storage.js`)

- `app_user` — id, google_sub (unique), email (unique), name, picture_url,
  locale, last_login_at, created_at, updated_at (ported from old app)
- `app_user_session` — user_id FK, session_token_hash (unique), expires_at,
  created_at, last_seen_at (ported)
- `ai_test_attempts` += `user_id BIGINT REFERENCES app_user(id)`,
  `client_id TEXT`, `user_answers JSONB` + index on (client_id), (user_id)
- `ai_test` += `created_by_user_id BIGINT REFERENCES app_user(id)` (attribution)
- `feature_events` += `client_id TEXT`, `user_id BIGINT`
- `api_request_events` += `user_id BIGINT` (client_key already exists)

## Implementation phases

1. **Server auth** — `src/lib/server/auth.js` (verifyGoogleCredential via
   `oauth2.googleapis.com/tokeninfo`, upsertGoogleUser, createSessionForUser,
   getSessionFromRequest, revokeSession, cookie helpers) + DDL in storage.js.
2. **Auth routes** — `/api/auth/google`, `/api/auth/me`, `/api/auth/logout`,
   rate limited, with `client_id` backfill on login.
3. **Anonymous identity** — `src/lib/client/identity.js` (stable UUID,
   `x-client-id` header on all API calls) + `getClientIdentity(request)`
   server-side.
4. **Attempts persistence** — submit + test GET + `/api/user/history`
   (GET pulls, POST upserts client-pushed attempts for offline replay).
5. **Client sync + UI** — `src/lib/client/auth.js` store, `GoogleSignInButton`,
   header sign-in/avatar menu, history hydration via
   `src/lib/client/sync.js`, locale strings (en/hi).
6. **Android** — `ux_mode: 'redirect'` on native platforms + popup-enabled
   WebView in `MainActivity.java`.
7. **Telemetry** — tag feature events with client_id/user_id; server routes
   already receive the headers.

## Out of scope / follow-ups

- Google OAuth consent screen setup + privacy policy linkage (needs manual
  Google Cloud Console work).
- Admin per-user dashboard.
- Account deletion endpoint (required before Play Store publishing).
- Upgrade id_token verification from `tokeninfo` to JWKS signature check.
- Draft/unsubmitted-test sync to server (bookmarks, presets, question
  bookmarks, attempts and test history are all synced; in-progress drafts stay
  local-only).

## Bookmarks & preset sync (added Aug 2026)

- `app_user_state` table: one row per (identity, state_key) with JSONB value —
  identity is `user_id` when logged in, else the anonymous `client_id`.
- `GET/POST /api/user/state` (rate-limited): pull the identity's storage or
  upsert validated state. Only the allowlisted keys
  (`selftest_bookmarked_exams`, `selftest_bookmarked_quiz_presets`,
  `selftest_bookmarks`) are accepted, with per-key size caps
  (`src/lib/shared/userState.js`).
- On login, `backfillUserIdentity` rebinds anonymous `app_user_state` rows to
  the user (clearing `client_id`) and dedupes to keep the newest row per
  (user_id, state_key), so server state from earlier logins and this device's
  anonymous state coexist correctly.
- Client `startStateSync()` (called from the layout) hydrates once on load and
  on visibilitychange, then pushes debounced on localStorage changes of the
  synced keys; the merge (`mergeStateSnapshots` in
  `src/lib/shared/userState.js`) unions + dedupes bookmarks/presets so
  additions made on any device survive. The bookmarks page re-hydrates on
  view.

## Verification

- `npm run lint`, `npm run check`, `npm run test`
- Manual: sign in on web, PWA standalone, Android app; verify pre-login
  attempts appear in history after login; verify `myAttempt` on test page.
