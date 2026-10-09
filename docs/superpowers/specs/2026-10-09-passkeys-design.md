# Passkey sign-up and sign-in (Design)

Date: 2026-10-09
Status: approved (approach 1 — `@simplewebauthn/server` on top of the existing account/session tables)
Scope: let a new user create an account with a passkey — no Google account, no email — and sign in
with it on any device where the passkey is available. Reuses `app_user`, `app_user_session`, the
session cookie, and the post-login sync chain. Adds one credential table, one challenge table, four
routes, one opt-in flag on `/api/auth/google`, a client module, and three UI entry points.

## 1. Objective

Sign-in today is Google-only and effectively unused. Production telemetry for the last 30 days:

| Signal                                     | Value                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Successful Google sign-ins                 | 2                                                                          |
| New accounts                               | 0 (12 accounts exist in total; last login 2026-09-25)                      |
| Anonymous identities                       | 1,545                                                                      |
| Failed sign-in attempts                    | 0 (`/api/auth/google` returned no 4xx/5xx; `/auth/redirect` had no events) |
| Android WebView (Capacitor app) identities | 5                                                                          |
| Accepted PWA installs                      | 2 all-time, against 315 identities that saw the prompt                     |

Two conclusions drive this design. First, the existing method is not broken — nothing is failing —
so the barrier is the cost of getting an account at all. Second, the installed-app and installed-PWA
populations are too small to justify native integration work, so this is a web-only feature.

Success criteria:

- A first-time visitor can go from the sign-in sheet to a signed-in account with one biometric
  prompt, no form fields, and no Google consent screen.
- A returning user on the same device signs in with one prompt and lands on the same account, with
  pre-signup anonymous history and locally graded attempts attached.
- A signed-in user can add a second passkey from another device, revoke a passkey, and link a Google
  account so the account survives losing every passkey.
- Nothing about the existing Google flow changes for a user who never touches a passkey.

## 2. Non-goals

- Replacing Google sign-in. It stays as-is for signed-out users and becomes the recovery path.
- Android WebView support. `navigator.credentials.create` for public-key credentials is not available
  in Android WebView, so the Capacitor app never shows the passkey affordance. Native Credential
  Manager (plus `delegate_permission/common.get_login_creds` in
  `static/.well-known/assetlinks.json`, which currently only declares `handle_all_urls`) is a
  separate project.
- Account merge. Linking a Google identity that already owns a different `app_user` row is refused
  with an explicit message, not merged.
- Email one-time-code recovery. The repository has no email provider; Google linking covers recovery.
- Passkey as a second factor. Passkeys here are `userVerification: 'required'`, which is user
  verification, not a second authentication factor alongside Google.
- Conditional UI (`autocomplete="webauthn"` autofill). Deferred; v1 is an explicit button.

## 3. Decisions

**D1 — Passkey-first accounts, not passkey-as-re-login.** With 12 existing accounts and 2 monthly
sign-ins, optimizing re-login for people who already sign in changes nothing measurable. The
registration ceremony therefore supports an anonymous "create an account" mode. Rejected: passkeys
only as an added credential on existing Google accounts (cannot create an account, so it cannot move
the funnel).

**D2 — Google linking is the recovery path, and it never merges.** A passkey cannot be recovered if
the user loses every device. Signed-in users get a "Link Google" action that attaches `google_sub`,
`email`, `name`, and `picture_url` to their current row when that Google identity is unclaimed. If
the identity already belongs to another `app_user` row, the request fails with a clear message
telling the user to sign in with Google instead. Rejected for v1: automatic merge, which would have
to move `app_user_state`, test records, `push_subscription`, and `premium_entitlements` between rows
and archive the loser.
Rejected: email one-time codes (new provider dependency, cost, deliverability).

**D3 — Signup collects nothing.** `app_user.name` is `NOT NULL`, so a generated display name
(`Learner 4821`, four random digits) is stored; `google_sub` and `email` are left NULL, and the UI
renders the generated name as-is. Rejected: optional email step (adds a form and a half-built
recovery channel for no measured demand), required name+email (a classic signup form, which is the
friction this feature exists to remove).

**D4 — Use `@simplewebauthn/server` (14.0.3) for verification.** Verification is the one place in
this feature where a subtle bug is silent and catastrophic, so it uses the reference implementation
rather than code we own. Measured cost: bundling the library with esbuild for a server target adds
**0.88 MB** (925 KB) of JS. That weight is _not_ confined to the passkey routes — the deployed app
runs as **one** serverless function (every route's `.func` in `.vercel/output/functions` symlinks to
`![-]/catchall.func`, 25 MB, and SvelteKit's generated manifest imports every route module
statically), so the shared function grows by ~4% and the parse lands on every cold start, not only on
passkey requests. Against the observed ~1 s cold start (Lambda init + Neon WebSocket handshake + SSR
bootstrap) that is a few milliseconds — the right price for not owning signature verification. The
adapter's `split: true` would isolate the weight per route, but it would also give every route its own
cold start, and cold start is this app's remaining tail (§10); rejected for that reason. Rejected:
hand-rolled CBOR/COSE/signature verification on Node `crypto` (no new dependency, but we would own the
crypto check); hosted auth provider (replaces the working session layer, adds vendor cost and a
per-request hop, and would rewrite the Google flow that already works).

**D5 — Challenges live in a single-use database row, not a signed cookie.** A signed cookie would
need a new server secret to manage; a table needs none, gives server-side single-use enforcement
(a leaked challenge cannot be replayed), and is consistent with repository practice for short-lived
state. The extra round trip is measured against the acceptance criteria in §10 and the database is
in the same region as the functions (`regions: ["sin1"]`).

**D6 — Capability detection, not an environment flag.** The affordance renders when
`window.PublicKeyCredential` exists and `navigator.credentials.create` is a function. This hides the
feature in Android WebView automatically and needs no deployment step to enable. `isUVPAA()`
(`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable`) is used only to pick copy; it is
not a gate, because it reports on _platform_ authenticators and would wrongly hide roaming security
keys and cross-device QR sign-in. This also keeps the ceremony reachable from the E2E virtual
authenticator.

**D7 — No account row before attestation succeeds.** Signup mode stores the pending WebAuthn user
handle and the generated display name on the challenge row and inserts `app_user` only after
verification, so a failed ceremony never leaves an orphan account.

## 4. Data model

All statements go inside `ensureStorageSchema` in `src/lib/server/storage.js` and must be idempotent.

```sql
-- Existing table: relax the Google-shaped constraints, add a stable WebAuthn handle.
ALTER TABLE app_user ALTER COLUMN google_sub DROP NOT NULL; -- metadata-only, keeps UNIQUE
ALTER TABLE app_user ALTER COLUMN email      DROP NOT NULL; -- UNIQUE still permits many NULLs
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS webauthn_user_handle TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_webauthn_handle
  ON app_user (webauthn_user_handle) WHERE webauthn_user_handle IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_user_passkey (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,   -- base64url
  public_key    TEXT NOT NULL,          -- base64url COSE key
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    TEXT[],
  device_type   TEXT,                   -- 'singleDevice' | 'multiDevice'
  backed_up     BOOLEAN,
  label         TEXT,                   -- user-visible, e.g. 'iPhone'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_user_passkey_user_id ON app_user_passkey (user_id);

CREATE TABLE IF NOT EXISTS passkey_challenge (
  challenge     TEXT PRIMARY KEY,       -- base64url
  kind          TEXT NOT NULL,          -- 'registration' | 'authentication'
  user_id       BIGINT,                 -- set for add-a-passkey, NULL for signup/login
  user_handle   TEXT,                   -- pending handle for signup mode
  display_name  TEXT,                   -- generated name for signup mode
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expires_at ON passkey_challenge (expires_at);
```

The two archive tables are declared in `ARCHIVE_TABLE_STATEMENTS` in `src/lib/shared/dataArchive.js`,
following the existing entries exactly (`CREATE TABLE IF NOT EXISTS app_user_passkey_archive (LIKE
app_user_passkey INCLUDING DEFAULTS)` plus an `archived_at` column, and the same for
`passkey_challenge_archive`). They are created after their source tables, which is why the schema
statements above have to run before the archive loop in `ensureStorageSchema`.

Notes:

- The handle is minted once per account (16 random bytes, base64url) and reused for every passkey
  added to that account: at signup for a passkey-first account, or on the first passkey added to one
  of the existing Google-created accounts, whose `webauthn_user_handle` is NULL. A stable `user.id`
  is what makes two passkeys on one account resolve to the same WebAuthn user on the platform side.
- `public_key` stores the COSE key exactly as the authenticator returned it; conversion to a
  verifiable key happens inside the library at authentication time.
- Never-delete compliance: revoking a passkey and consuming a challenge both use the repository's
  archive-first CTE (`WITH moved AS (DELETE ... RETURNING *) INSERT INTO ..._archive SELECT *, NOW()
FROM moved`), matching `app_user_session_archive`.
- Expired challenge cleanup piggybacks on the existing probabilistic pattern
  (`cleanupExpiredSessionsMaybe`), archiving rows older than one hour.
- Relaxing the two `NOT NULL`s does not affect existing rows, and `upsertGoogleUser`'s
  `WHERE google_sub = $1 OR email = $2` can never match a row where both are NULL.

## 5. API contracts

All routes follow the house pattern: `resolveRequestContext`, `rateLimiter`, `logApiEvent` on every
exit path, `readJsonBody` for the POSTs, and JSON error bodies shaped `{ error, code }`. Every
endpoint answers `503 { code: 'PASSKEY_UNAVAILABLE' }` when the request's origin is not allowed
(§6). Session required means a valid `selftest_session` cookie; otherwise the route answers
`401 { code: 'SESSION_REQUIRED' }`.

### `POST /api/auth/passkey/register/options`

Request: `{}` (anonymous signup) or any body while a session cookie is present (add-a-passkey mode;
mode is decided by the session, never by the client).

Response `200`:

```json
{
  "mode": "signup" | "add",
  "options": { "challenge": "…", "rp": { "id": "selftest.in", "name": "Selftest" },
               "user": { "id": "…", "name": "learner-9f3c", "displayName": "Learner 4821" },
               "pubKeyCredParams": [ { "alg": -7, "type": "public-key" },
                                     { "alg": -257, "type": "public-key" } ],
               "timeout": 60000,
               "attestation": "none",
               "authenticatorSelection": { "residentKey": "required",
                                           "requireResidentKey": true,
                                           "userVerification": "required" },
               "excludeCredentials": [] }
}
```

An inserted `passkey_challenge` row carries `kind='registration'`, the pending handle and generated
name (signup), or `user_id` and that user's existing credential ids in `excludeCredentials` (add).
TTL 5 minutes. In add mode, a session user without a `webauthn_user_handle` (every account created
through Google) gets one minted and persisted before the options are returned, so a passkey added
today and one added next month carry the same WebAuthn user id.

### `POST /api/auth/passkey/register/verify`

Request: `{ response: <RegistrationResponseJSON>, label?: string, clientId?: string }`.

Behaviour: consume the challenge row first (archive-first CTE), so it is single-use even if
verification then fails, and verify with `verifyRegistrationResponse` against the consumed row's
`expectedChallenge`, the resolved `expectedOrigin`, and the resolved `expectedRPID`. On success:

- signup mode — insert `app_user` (`google_sub` NULL, `email` NULL, `name` = the challenge row's
  generated name, `webauthn_user_handle` = the challenge row's handle) and the `app_user_passkey` row
  in a single transaction, then `createSessionForUser`, `setSessionCookie`, and
  `backfillUserIdentity(user.id, clientId)`;
- add mode — insert the credential for the challenge row's `user_id`, which is the session user
  captured when the options endpoint ran (never a value from the request body). No other column of
  `app_user` is touched.

`label` is stored on the credential for display; when absent the UI renders a generic label.

Response `200`: `{ user }` (same shape as `/api/auth/me`). Errors: `400 PASSKEY_CHALLENGE_EXPIRED`,
`400 PASSKEY_VERIFICATION_FAILED`, `409 PASSKEY_ALREADY_REGISTERED` (credential id exists),
`429`, `503 PASSKEY_UNAVAILABLE`.

### `POST /api/auth/passkey/login/options`

Request: `{}`. Response `200`: `{ options: { challenge, rpId, timeout: 60000,
userVerification: 'required', allowCredentials: [] } }` — an empty `allowCredentials` selects
discoverable credentials, which is what makes this a one-tap sign-in with no identifier field.
Challenge row: `kind='authentication'`, `user_id` NULL, TTL 5 minutes.

### `POST /api/auth/passkey/login/verify`

Request: `{ response: <AuthenticationResponseJSON>, clientId?: string }`.

Behaviour: consume the challenge; look up `app_user_passkey` by `response.id`; verify with
`verifyAuthenticationResponse`. If the stored `counter` is greater than 0 and the new counter is not
greater, record a `counterAnomaly` telemetry event and continue — synced passkeys legitimately report 0. Update `counter`, `last_used_at`, `updated_at`, `device_type`, `backed_up`; create the session;
`backfillUserIdentity`; log the event.

Response `200`: `{ user }`. Errors: `400 PASSKEY_CHALLENGE_EXPIRED`, `401 PASSKEY_UNKNOWN_CREDENTIAL`
(uniform for "no such credential" and "verification failed", so the endpoint cannot be used to
enumerate accounts), `429`.

### `GET /api/auth/passkey/list`

Session required. Response `200`: `{ passkeys: [{ id, label, deviceType, backedUp, createdAt,
lastUsedAt }], googleLinked: boolean }`. Never returns `credential_id`, `public_key`, or the counter
— the browser never needs them, and `googleLinked` tells the UI whether removing the last passkey
would strand the account.

### `POST /api/auth/passkey/remove`

Session required. Request `{ id: number }`. The credential is removed only if it belongs to the
session user. Archive-first CTE into `app_user_passkey_archive`. Refused with
`409 { code: 'LAST_CREDENTIAL' }` when it is the user's last passkey **and** `google_sub IS NULL`,
because that combination leaves the account unreachable; when Google is already linked, removing the
last passkey is allowed and the user can sign in with Google. Response `200`: `{ removed: true }`.

### Rate limits

`register/options` 20, `register/verify` 20, `login/options` 30, `login/verify` 30,
`list` 120, `remove` 20 — per window per client, using the existing `rateLimiter` buckets, mirroring
the values used by `/api/auth/me` (900) and `/api/auth/google` (10).

### `POST /api/auth/google` (modified)

Unchanged unless the body contains `link: true` **and** a valid session cookie is present. In that
case the verified Google identity is attached to the current user's row:

- `google_sub` and `email` are both unclaimed by another row → attach to the current row, refresh
  `name`/`picture_url`/`last_login_at`, keep the existing session, return `{ user, linked: true }`;
- either identifier belongs to a different row → `409 { code: 'GOOGLE_LINK_CONFLICT' }` with a message
  that names the alternative ("sign in with Google to reach that account, then add a passkey there");
- the current row already holds the same `google_sub` → idempotent success.

Linking while signed out, and every other Google sign-in, keep today's path.

## 6. Relying party and origin resolution

One pure module decides this so it can be unit-tested without a request:

```
resolvePasskeyContext(url) -> { rpId, expectedOrigin } | null
```

- `PASSKEY_RP_ID` set → use it, and accept an origin whose host is that id or a subdomain of it.
- Otherwise derive from the request host, but only for: `localhost`, `127.0.0.1`, `selftest.in`,
  any `*.selftest.in`. The RP ID is `localhost` / `127.0.0.1` for local hosts, and `selftest.in`
  for both the apex and `www` (an RP ID covers its subdomains, so one passkey works on both).
- `PASSKEY_ALLOWED_ORIGINS` (comma-separated absolute origins) extends the allowlist, which is how a
  Vercel preview deployment can test the feature.
- Anything else → `null`, and the routes answer `503 PASSKEY_UNAVAILABLE`. This is what keeps a
  lookalike or preview host from minting credentials.

Both variables are optional; no deployment step is required to ship this.

## 7. Client and UI

New `src/lib/client/passkeys.js`:

- `isPasskeySupported()` — the D6 gate.
- `promptLabel()` — `"Use your fingerprint, face or screen lock"` vs a generic fallback, chosen from
  `isUVPAA()` when it resolves in time.
- `createPasskey({ mode })` / `signInWithPasskey()` — call the options endpoint, convert
  `challenge`/`user.id`/`excludeCredentials[].id` from base64url to `ArrayBuffer`, run
  `navigator.credentials.create|get`, convert the response back to base64url, post to `verify`, then
  call the shared post-login sync.
- `listPasskeys()` / `removePasskey(id)` / `linkGoogleCredential(credential)` for the profile page.

`syncAfterLogin()` is currently private in `src/lib/client/auth.js`; it gets exported and reused, so a
new passkey account immediately flushes pending attempts and hydrates server history and state.

Entry points (all mobile-first, 44px minimum target, all rendered only when
`isPasskeySupported()`):

1. `src/routes/+layout.svelte` sign-in sheet (~line 880) — "Create account with a passkey" and
   "Sign in with a passkey" above the Google button.
2. `src/routes/profile/+page.svelte` — passkey section: list (label, added, last used), "Add a
   passkey", per-row "Remove" with confirmation, and "Link Google for recovery" while
   `google_sub` is NULL.
3. `src/routes/exam-paper/+page.svelte` sign-in gate (~line 174) — the same two actions.

Error handling: `NotAllowedError` (user dismissed the OS prompt) resets the button silently;
`InvalidStateError` means the credential already exists on this device and routes to sign-in;
`PASSKEY_UNAVAILABLE`, `PASSKEY_CHALLENGE_EXPIRED`, and network failures surface a localized message.

Localization: every new string is added to both `src/lib/locales/english.json` and
`src/lib/locales/hindi.json`: `passkeyCreate`, `passkeySignIn`, `passkeyUnavailable`,
`passkeyExpired`, `passkeyFailed`, `passkeyAdded`, `passkeyRemoved`, `passkeyRemoveConfirm`,
`passkeysTitle`, `passkeyAddedOn`, `passkeyLastUsed`, `passkeyNeverUsed`, `passkeyLinkGoogle`,
`passkeyLinked`, `passkeyLinkConflict`, `passkeyGeneratedName` (hint explaining the generated name)
plus the OS-prompt label variants. `npm run locales:unused` must stay green.

## 8. Telemetry

Allowlist additions in `src/lib/shared/telemetryEvents.js` (the test scans for emitted-but-blocked
and allowlisted-but-unemitted events, so both sides ship together):

- `auth:passkey-signup-start`, `auth:passkey-signup-success`, `auth:passkey-signup-failure`
- `auth:passkey-login-start`, `auth:passkey-login-success`, `auth:passkey-login-failure`
- `auth:passkey-add-success`, `auth:passkey-revoke`, `auth:passkey-link-google-success`,
  `auth:passkey-link-google-conflict`, `auth:passkey-counter-anomaly`

Failure events carry a `reason` prop (`cancelled`, `unsupported`, `expired`, `verification`,
`conflict`, `network`). Each route additionally calls `logApiEvent` like the existing auth routes, so
`api_request_events` carries route-level latency and status for `/api/auth/passkey/*`.

## 9. Security

- Server-side single-use challenges with a 5-minute TTL; consumed before verification so a failed
  verification cannot be retried with the same challenge.
- `user_id` for add-a-passkey and login comes only from the consumed challenge row or the credential
  lookup, never from the request body.
- Origin, RP ID hash, and challenge are all checked by the library; `userVerification: 'required'`
  and `residentKey: 'required'` are requested and the verified UV flag is required.
- Uniform `401` for unknown credential and failed verification; login options never reveal whether an
  account exists (`allowCredentials: []`).
- Counter regression is recorded, not hard-failed (§5), so a synced passkey that reports 0 does not
  lock anyone out.
- Session semantics are unchanged: same `selftest_session` cookie, `httpOnly`, `sameSite: 'lax'`,
  `secure` in production, 30-day sliding expiry, revocable server-side row.
- CSRF posture is unchanged from the existing auth routes: JSON bodies, no CORS headers, and
  SvelteKit's origin check for form-shaped posts.
- Removal is archive-first; no `DELETE` without an `INSERT ... SELECT ... RETURNING` archive.

## 10. Testing and acceptance

E2E (`tests/e2e/passkeys.e2e.js`, artifact attached via `artifactReporter.js`) drives a real Chrome
ceremony through the Playwright CDP virtual authenticator:

```js
const client = await context.newCDPSession(page);
await client.send('WebAuthn.enable');
const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
	options: {
		protocol: 'ctap2',
		transport: 'internal',
		hasResidentKey: true,
		hasUserVerification: true,
		isUserVerified: true,
		automaticPresenceSimulation: true,
	},
});
```

Scenarios: the affordance renders on the sign-in sheet; signup creates an account whose
`/api/auth/me` returns a generated name and NULL email; a pre-signup anonymous attempt is backfilled
to the new user; after logout the same authenticator signs back into the _same_ user id; adding a
second passkey leaves one user with two credentials; revoking one leaves one and writes an archive
row; removing the last passkey is refused with `LAST_CREDENTIAL` while Google is unlinked; the
sign-in sheet hides the affordance when `PublicKeyCredential` is absent.

Isolated unit tests (written before the code, enumerating failure modes first) cover only the parts
the E2E cannot reach: `resolvePasskeyContext` (apex vs www vs localhost vs preview vs disallowed),
the generated display name, the last-passkey guard, and the Google-link decision table (unclaimed,
same-sub, sub-claimed-elsewhere, email-claimed-elsewhere, both-claimed). Google token verification
itself is not unit-tested; it is an existing, unchanged live call.

Acceptance criteria:

- `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` all pass (the pre-commit hook
  runs the last three as `smoke`).
- `npm run check` chunk count and per-chunk sizes for non-passkey routes are unchanged.
- After deploy, `/api/auth/passkey/*` p95 latency from `api_request_events` is under 250 ms, measured
  the same way as the region fix, and a real platform passkey (Touch ID or Android screen lock)
  completes signup and login on `https://www.selftest.in`.
- Because the dependency lands in the one shared function, the cold-start envelope of an unrelated
  DB-bound route (`/api/test:list`) is re-measured after deploy and stays inside the pre-change
  envelope (~1 s worst observed, p50 unaffected); a regression there means `split: true` gets
  reconsidered.
- `auth:passkey-*` events appear in `npm run telemetry:report` with `reason` on failures.

## 11. Rollout and verification

1. Implement behind no flag (D6 gates the affordance by capability), with `.intent/CHG-0009`
   recording the decisions above, `change.yaml`, and `conformance.md` written after verification.
2. Update `README.md` (endpoint table, env vars) and `docs/architecture.md`, and add the two optional
   variables to `.env.example`.
3. Run the full checklist in AGENTS.md, including mobile-width rendering checks for the sign-in sheet
   and profile section, and `npm run verify:vercel` if routes or prerender output change.
4. Deploy, verify a real passkey on production, then read `api_request_events` for the new routes.
5. Report the funnel against the baseline in §1: signups per sign-in-sheet view, and repeat sign-ins
   per identity, after at least a week of real traffic.

## 12. Known v1 limitations

- No account merge (§3 D2): the conflict path asks the user to sign in with Google instead.
- Accounts without an email cannot receive premium grants, which are looked up by email in
  `/api/admin/premium`; linking Google resolves this.
- Ceremony coverage is Chromium-only (the virtual authenticator is a CDP feature). Safari and iOS
  behaviour is verified by hand on production.
- Passkeys cannot be used in the Capacitor Android app (WebView has no WebAuthn), so Android app
  users still sign in with Google.
- No conditional-UI autofill, no passkey renaming, no "sign in on another device" QR hint.

## 13. File inventory

New:

- `src/lib/server/passkey.js` — ceremony options, verification wrapper, RP/origin resolution seam.
- `src/routes/api/auth/passkey/register/options/+server.js`
- `src/routes/api/auth/passkey/register/verify/+server.js`
- `src/routes/api/auth/passkey/login/options/+server.js`
- `src/routes/api/auth/passkey/login/verify/+server.js`
- `src/routes/api/auth/passkey/list/+server.js`
- `src/routes/api/auth/passkey/remove/+server.js`
- `src/lib/client/passkeys.js`
- `tests/e2e/passkeys.e2e.js`
- `src/lib/server/passkey.test.js` (isolated logic only)

Modified:

- `src/lib/server/storage.js` — schema (§4), passkey/challenge queries, archive-first removal.
- `src/lib/shared/dataArchive.js` — the two archive tables (§4).
- `src/lib/server/auth.js` — `linkProfileToUser`, nullable-aware `mapUserRow`, generated names.
- `src/routes/api/auth/google/+server.js` — the `link: true` branch.
- `src/lib/client/auth.js` — export `syncAfterLogin`.
- `src/routes/+layout.svelte`, `src/routes/profile/+page.svelte`,
  `src/routes/exam-paper/+page.svelte`.
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`,
  `src/lib/shared/telemetryEvents.js`.
- `package.json` / `package-lock.json` (one dependency), `README.md`, `docs/architecture.md`,
  `.env.example`.
