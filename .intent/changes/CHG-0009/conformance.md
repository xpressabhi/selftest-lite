# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

Passkeys are implemented end to end on the existing account model: passkey-first signup with no form
fields, one-tap sign-in over discoverable credentials, add/revoke from the profile, and Google
linking as the recovery path.

Change `CHG-0009` revision 1, proposal digest
`sha256:291bf5395659e2a49f8a7864018b2e898014a861d961728da3f129ee9efa296d`.

Six new routes (`register/options`, `register/verify`, `login/options`, `login/verify`, `list`,
`remove`), two new tables plus their archive siblings, three new client/shared modules, a nullable
`app_user`, one dependency, and a capability-gated affordance in the sign-in sheet, the profile page
and the exam-paper gate.

## Verification

| Command                                                                 | Result                                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                          | pass, no output                                                                                                                     |
| `npm run test`                                                          | **975 passed / 77 files** (before: 940 / 76; +35 passkey-policy tests, and `schemaMigrations.test.js` updated for the version bump) |
| `npm run test:e2e`                                                      | **183 passed** (before: 176; +7 passkey specs)                                                                                      |
| `npm run check`                                                         | **check-build-mode: OK — 193 chunks**, no DEV-only code, service worker registration present                                        |
| `npm run verify:vercel`                                                 | **OK** — 236 sitemap URLs, 232 prerendered pages, 232 clean-URL overrides, SSR function present                                     |
| `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0009` | proposal digest matches, changed paths within declared scope                                                                        |

The passkey specs drive a real Chrome ceremony through a CDP virtual authenticator (CTAP2, resident
key, user verified, automatic presence) on `http://localhost:5174`, where the resolved RP ID is
`localhost`:

| Spec                                                                      | What it proves                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `a visitor can create an account with a passkey, with no form fields`     | The account exists with a generated name, NULL `email`/`google_sub`, and exactly one stored credential                          |
| `a second visit signs back into the same account with one tap`            | Logout then passkey sign-in resolves to the _same_ user id                                                                      |
| `the anonymous identity is attached to the new account`                   | `backfillUserIdentity` ran: event rows carrying this browser's anonymous client id now carry the account                        |
| `a second passkey can be added, and revoking the first archives it`       | Second device (fresh authenticator) adds a credential; revocation leaves one row and exactly one `app_user_passkey_archive` row |
| `the only passkey of an account with no Google link cannot be revoked`    | `409 LAST_CREDENTIAL` surfaces as copy, one credential remains, and the session survives                                        |
| `the affordance is hidden where WebAuthn does not exist`                  | With `PublicKeyCredential` absent the passkey buttons are gone and the Google path remains                                      |
| `the device that already holds a passkey is told so, not failed silently` | The browser's `InvalidStateError` maps to the "already registered" wording                                                      |

## Test changes

One pre-existing test file was modified: `src/lib/server/schemaMigrations.test.js` records the
fingerprint of the DDL in `ensureStorageSchema()`. Its value changed because this change adds DDL,
and the guard requires the fingerprint and `SCHEMA_VERSION` to move together — that is the whole
point of the test. No test was skipped or deleted, and no assertion was weakened.

## Deviations and decisions

- **The version bump was not optional, and the guard caught it.** `SCHEMA_VERSION` went 10 → 11 in
  the same change as the DDL. Without it the new tables would only ever be created on a database
  bootstrapping from scratch, so production would have answered 500 for every passkey route. The
  fingerprint test failed first, exactly as designed.
- **Signup is one statement rather than a transaction.** A data-modifying CTE creates `app_user` and
  its first credential atomically. The PGlite test adapter has no `connect()`, so a
  BEGIN/COMMIT helper would not have been exercisable in the suite, and a duplicate credential now
  leaves no orphan account.
- **`@simplewebauthn/server` measured, then accepted.** 0.88 MB bundled (esbuild, server target), and
  because the whole app deploys as _one_ serverless function (every route's `.func` symlinks to
  `![-]/catchall.func`, 25 MB) that weight is shared rather than confined to the passkey routes. The
  design document was corrected on this point; the decision stood, since the observed ~1 s cold
  start is dominated by Lambda and Neon setup, not by 0.88 MB of parse.
- **The e2e suite taught us two real behaviours.** A second passkey cannot be created by the same
  authenticator — the browser raises `InvalidStateError` because the account's credential is in
  `excludeCredentials` — which is now mapped to specific copy and covered by its own spec; and the
  profile wizard covers the page for a brand-new account, so the spec dismisses it before touching
  the profile.
- **The link path is unit-tested, not e2e-tested.** `POST /api/auth/google` with `link: true` calls
  the live `oauth2.googleapis.com/tokeninfo`, so the decision table (`attach` / `idempotent` /
  `conflict`) is covered by tests; the wiring around it is the same code path the Google sign-in
  route already used.

## Not verified here (needs a human or a deploy)

- A real platform passkey (Touch ID / Android screen lock) on `https://www.selftest.in`, and the
  Safari/iOS ceremony: the virtual authenticator is a Chromium CDP feature.
- The Google `link: true` happy path against real Google credentials.
- Production latency for the new routes; the design sets a p95 budget of 250 ms from
  `api_request_events`, to be read after deploy along with the cold-start envelope of an unrelated
  DB-bound route (the dependency lands in the shared function).

## Follow-ups (not part of this change)

- Account merge when a Google identity is already claimed, instead of the current conflict message.
- Conditional-UI autofill, passkey renaming and the cross-device QR hint.
- Native Credential Manager for the Capacitor Android app (needs `get_login_creds` in
  `static/.well-known/assetlinks.json` on top of a Capacitor plugin).
- Premium grants for email-less accounts (the admin grant looks up by email until Google is linked).

## Post-deploy verification and the first real account

Deployed by the user from `b816265`. The deploy was mid-flight when it was reported: the route
answered 404 at 21:57:13 IST and 200 at 21:57:35 IST, so the checks below ran after the switch-over.

| Check                                     | Result                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/passkey/login/options`    | 200 — `rpId: "selftest.in"`, `userVerification: "required"`, `allowCredentials: []`                                                                                                |
| `POST /api/auth/passkey/register/options` | 200 — `mode: "signup"`, `attestation: "none"`, `residentKey: "required"`, ES256 + RS256, generated name `Learner 3940`                                                             |
| `GET /list`, `POST /remove` anonymous     | 401 `SESSION_REQUIRED`                                                                                                                                                             |
| Schema migration                          | **`app_schema.version = 11`**, applied by the first request to the new build                                                                                                       |
| Tables                                    | `app_user_passkey`, `app_user_passkey_archive`, `passkey_challenge`, `passkey_challenge_archive` all present; `app_user.google_sub`/`email` nullable, `webauthn_user_handle` added |
| 5xx in the hour after deploy              | 0                                                                                                                                                                                  |

**The first real passkey account** (created by the user on macOS Chrome, 17:02Z): `app_user` id 43,
name `Learner 2407`, `google_sub` and `email` NULL, `webauthn_user_handle` set; one credential
(label `Mac`, `multiDevice`, `backed_up = true`, counter 0); `auth:passkey-signup-start` and
`-success` in `feature_events`; `/api/auth/passkey/list` answered 200 in 7 ms from their browser. The
end-to-end path works in production.

### Two defects the first user found, both fixed

1. **`/profile` was unreachable on desktop.** The only links to it were the mobile hamburger menu and
   a conditional "edit" chip on the home page, so a signed-in desktop user — including a brand-new
   passkey account with no profile — could not open the passkey panel at all. The desktop user menu
   (which already held History) now links Profile too.
2. **"Add a passkey" read as "your passkey was not saved."** No `auth:passkey-add-start` event was
   recorded, so the button was never clicked — it was misread, which is a copy defect, not a
   behaviour defect. With at least one passkey the button now reads "Add a passkey on another
   device", with one line explaining that the passkey is already saved here and a second one needs
   another device (the real `InvalidStateError` constraint).

Both are covered by a new spec, `the passkey panel is reachable on desktop, and says what it has
saved`, which asserts the desktop menu path, the rendered credential row, and the contextual copy.
Suite after the fix: lint clean, **975 unit tests**, **184 e2e tests**, `check-build-mode: OK`.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`. The design was approved by the user
in conversation before implementation (`docs/superpowers/specs/2026-10-09-passkeys-design.md`), and no
path under a protected glob was modified.
