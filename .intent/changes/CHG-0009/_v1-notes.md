## scope.included

- Six routes under /api/auth/passkey: register options/verify, login options/verify, list, remove.
- /api/auth/google: link:true attaches a verified identity to the signed-in account and answers 409 GOOGLE_LINK_CONFLICT instead of merging.
- storage.js: nullable google_sub/email, webauthn_user_handle, app_user_passkey, passkey_challenge, and the passkey queries (archive-first revocation and challenge consumption).
- dataArchive.js: app_user_passkey_archive and passkey_challenge_archive.
- SCHEMA_VERSION 10 -> 11 so the new DDL reaches warm databases.
- passkeyPolicy.js (pure decisions, 35 unit tests) and server/passkey.js (the only importer of @simplewebauthn/server).
- client/passkeys.js, the sign-in sheet, the profile passkey panel, the exam-paper gate, EN+HI locale keys, and the telemetry allowlist entries.
- tests/e2e/passkeys.e2e.js: seven specs on a CDP virtual authenticator.

## scope.excluded

- Account merge when a Google identity already belongs to another account; the conflict is reported instead.
- Email one-time-code recovery (no email provider in the repository).
- Passkeys in the Capacitor Android app (WebView has no WebAuthn; native Credential Manager is a separate project).
- Conditional-UI autofill, passkey renaming, and the cross-device QR hint.
- A feature flag: the affordance is gated by capability detection, which is what hides it in Android WebView.

## preserved

- Google sign-in for signed-out visitors is unchanged; link:true is the only new branch.
- Session semantics are unchanged: the same selftest_session cookie, 30-day sliding expiry, revocable server-side row.
- The post-login sync chain (flushPendingAttempts -> hydrateHistoryFromServer -> hydrateUserState) runs for a passkey login exactly as for Google.
- Premium entitlements stay keyed on user_id, so email-less accounts work.
- computeAttemptMarks, grading, and the results page are untouched.

## decisions

- @simplewebauthn/server 14.0.3 rather than hand-rolled verification: measured at 0.88 MB bundled, which lands in the single shared serverless function, and a fraction of the observed ~1 s cold start. Owning signature verification was rejected.
- Challenges are single-use rows consumed before verification rather than signed cookies: no new secret, and replay fails even when verification passes.
- Pure policy lives in shared/passkeyPolicy.js so auth.js can use the Google-link table without importing the WebAuthn library; server/passkey.js is the only importer.
- Signup inserts the account and its first credential in one data-modifying CTE, so no orphan account can exist without needing a transaction helper the PGlite test adapter does not provide.
- RP ID defaults to selftest.in (apex + subdomains) and to the host on localhost; PASSKEY_RP_ID and PASSKEY_ALLOWED_ORIGINS are opt-in, and unknown hosts get 503 PASSKEY_UNAVAILABLE rather than minting credentials.
- isUVPAA() is used for wording only, never as a gate: gating on it would hide roaming keys and cross-device sign-in, and would make the e2e virtual authenticator unreachable.
- SCHEMA_VERSION was bumped in the same change; the repository's schema-fingerprint test caught the omission before it shipped, which would have left a warm production database without the new tables.
- A second passkey from the same authenticator is refused by the browser (InvalidStateError, because the account's credential is in excludeCredentials); the client maps that to specific copy, and the e2e spec simulates a second device by swapping the virtual authenticator.

