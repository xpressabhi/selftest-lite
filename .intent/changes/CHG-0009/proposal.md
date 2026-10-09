# Change intent

## Request and outcome

Add passkeys to sign-in, so a new user can create an account with one biometric prompt instead of a
Google account. The design was agreed first and lives in
`docs/superpowers/specs/2026-10-09-passkeys-design.md`; this record covers the implementation.

Shipped:

1. **Passkey-first signup** — a visitor with no account taps "Create account with a passkey", gets
   the platform prompt, and is signed in. No form fields: `app_user` gets a generated display name
   (`Learner 4821`, or `शिक्षार्थी 4821` in Hindi) and NULL `google_sub`/`email`.
2. **One-tap sign-in** — discoverable credentials (`allowCredentials: []`), so there is no
   identifier field and the server never confirms whether an account exists.
3. **Account management** — add another passkey from a second device, revoke one (archive-first), and
   link Google as the recovery path. Removing the last credential of an account with no Google link
   is refused with `409 LAST_CREDENTIAL`.
4. **Google linking without merging** — `POST /api/auth/google` with `link: true` and a session
   attaches the identity to the _current_ account. If another account owns it, the answer is
   `409 GOOGLE_LINK_CONFLICT`, never a silent merge or a re-pointed recovery path.

## Context

Production telemetry made the case for passkey-_first_ rather than passkey-as-re-login:

| Signal (30 days)                           | Value                                               |
| ------------------------------------------ | --------------------------------------------------- |
| Successful Google sign-ins                 | 2                                                   |
| New accounts                               | 0 (12 exist in total; last login 2026-09-25)        |
| Anonymous identities                       | 1,545                                               |
| Failed sign-in attempts                    | 0 — the existing flow is not broken, just unused    |
| Android WebView (Capacitor app) identities | 5                                                   |
| Accepted PWA installs                      | 2 all-time, against 315 identities shown the prompt |

So the cost of getting an account is the barrier, and the installed-app population is too small to
justify native work. The account and session layer already existed (`app_user`,
`app_user_session`, a 30-day httpOnly cookie, `/api/auth/me`, logout, and the post-login sync
chain), so passkeys are a second credential type on it, not new auth infrastructure. Premium keys on
`user_id`, not email, so email-less accounts do not break it.

Two constraints were designed around rather than against:

- **Android WebView has no WebAuthn**, so the Capacitor app can never use this. The affordance is
  gated on `window.PublicKeyCredential` presence, which hides it there without a deployment flag.
- **Google token verification is a live call** (`oauth2.googleapis.com/tokeninfo`), so the linking
  path cannot be covered by e2e; its decision table is unit-tested instead.

## Material decisions

- **`@simplewebauthn/server` (14.0.3) for verification.** A subtle bug in hand-rolled CBOR/COSE
  verification is silent and catastrophic, so the reference implementation is used even though the
  repository is otherwise dependency-light. Measured cost: 0.88 MB bundled, landing in the single
  shared serverless function (every route's `.func` symlinks to `![-]/catchall.func`, 25 MB) rather
  than only in the passkey routes. Against the observed ~1 s cold start that is a few milliseconds.
- **Challenges live in a single-use table, not a signed cookie.** No new secret to manage, and
  server-side single-use is stronger: the row is consumed (archived) before verification, so a
  replayed challenge fails even when verification passes.
- **Pure policy in `src/lib/shared/passkeyPolicy.js`.** The RP-ID/origin allowlist, generated name,
  device label, Google-link table, last-passkey guard and the untrusted challenge read have no
  library or database dependency, so `auth.js` can use the link table without pulling WebAuthn into
  every route. `src/lib/server/passkey.js` is the only importer of the library, which keeps the
  swap-the-verifier seam from the design.
- **Signup is one statement, not a transaction.** A data-modifying CTE inserts `app_user` and its
  first `app_user_passkey` row atomically, so a rejected credential cannot leave an orphan account
  behind without a transaction helper (the PGlite test adapter has no `connect()`).
- **The RP ID needs no configuration.** `selftest.in` for the apex and every subdomain (so one
  passkey works on `www` and the apex), the host itself on localhost, `PASSKEY_RP_ID` and
  `PASSKEY_ALLOWED_ORIGINS` as opt-in overrides. Unknown hosts answer `503 PASSKEY_UNAVAILABLE`.
- **No `isUVPAA()` gate.** It reports on _platform_ authenticators, so gating on it would hide
  roaming security keys and cross-device QR sign-in (and would make the ceremony unreachable from
  the e2e virtual authenticator). It is used for wording only.
- **`SCHEMA_VERSION` 10 → 11.** The new DDL would otherwise never run on a warm database; the
  repository's schema-fingerprint test caught this before it shipped.

## Test changes

- **`src/lib/server/schemaMigrations.test.js` (protected path, modified).** Its `DDL_FINGERPRINT`
  constant records a hash of the DDL in `ensureStorageSchema()` together with the `SCHEMA_VERSION` it
  ships with. This change adds DDL and bumps the version, so the recorded value moves from
  `33cf4ca2…:10` to `b8140dda…:11`. No assertion is weakened: the guard exists to force exactly this
  pairing, and it failed before the version bump was made.
- **`src/lib/shared/passkeyPolicy.test.js` (new).** 35 tests for the pure policy — origin/RP-ID
  allowlist, generated name, device label, Google-link decision table, last-passkey guard, and the
  hostile-input paths of the untrusted challenge read. Written before the module existed (red
  first), per the repository's testing rules.
- **`tests/e2e/passkeys.e2e.js` (new).** Seven specs on a CDP virtual authenticator, listed under
  Verification.
- No test was deleted, skipped, or loosened.

## Verification

| Check              | Result                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`     | pass                                                                                                                  |
| `npm run test`     | **975 passed / 77 files** (was 940/76: +35 policy tests; `schemaMigrations` fingerprint updated for the version bump) |
| `npm run test:e2e` | **183 passed** (was 176: +7 passkey specs)                                                                            |
| `npm run check`    | **check-build-mode: OK — 193 chunks**, no DEV-only code, service worker present                                       |

The e2e suite drives a real Chrome ceremony through the CDP virtual authenticator
(`WebAuthn.addVirtualAuthenticator`, CTAP2, resident key, user verified): signup creates an account
with a generated name and NULL Google columns; the same authenticator signs back into the same user
id; the anonymous identity is backfilled onto the account; a second passkey added from a _fresh_
authenticator (a second device) leaves two credentials and revoking one archives it; the last
credential of an unlinked account is refused; the affordance disappears when `PublicKeyCredential`
is absent; and adding a passkey from the device that already holds one shows the "already
registered" wording rather than a generic failure.

Two facts learned from running it, both now encoded in the code and the spec: a second passkey
genuinely cannot come from the same authenticator (the browser raises `InvalidStateError` because
the account's credential is in `excludeCredentials`) — the client maps that to a specific message —
and the profile wizard appears over the page for a brand-new account, so the spec dismisses it.

## Known limits (v1)

- No account merge: a link conflict tells the user to sign in with Google and add a passkey there.
- Accounts without an email cannot receive premium grants (the admin grant looks up by email) until
  Google is linked.
- Ceremony coverage is Chromium-only; Safari/iOS needs a hand check on production after deploy.
- Passkeys do not work in the Capacitor Android app (WebView has no WebAuthn), where users still
  sign in with Google.
- No conditional-UI autofill, passkey renaming, or cross-device QR hint.
