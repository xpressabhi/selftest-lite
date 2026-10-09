# Change intent

## Request and outcome

"Manage passkey and Google auth outside profile, via settings page and allow to remove passkey or auth
when there are more than one login ways available otherwise restrict deleting passkey or auth or login
details, user must not be deleted."

A new **`/settings`** page owns sign-in methods: passkeys (add from another device, revoke) and the
Google identity (connect, disconnect). The profile page no longer carries the passkey panel; it links
to settings instead. One rule governs both removals — a method can only be removed while another way
in remains — and no path on the page deletes the user.

## Context

The passkey panel had been added to `/profile`, which mixed learner details with account security, and
`POST /api/auth/passkey/remove` already refused "last passkey **and** no Google link"
(`canRemovePasskey`). That rule was correct but expressed in passkey terms only, and there was no way
to disconnect Google at all: `google_sub`/`email` were only ever written by the sign-in and link
flows.

## Decisions

- **Settings owns sign-in methods.** `/settings` renders a "Sign-in & security" section with the
  Google row and the passkey list; `/profile` keeps a small card linking to it, so the entry point
  does not disappear. The page is linked from the desktop user menu and the mobile menu, and is
  `noindex` like the rest of the account surfaces.
- **One guard for both kinds of removal.** `canRemovePasskey` became
  `loginMethodCount`/`canRemoveLoginMethod` in `$lib/shared/passkeyPolicy`: a passkey plus a linked
  Google identity are both "ways in", and removal is refused when the total would drop to zero. Both
  routes answer `409 LAST_LOGIN_METHOD`, and the client shows one message for it.
- **Full disconnect, as chosen.** `POST /api/auth/google/unlink` clears `google_sub`, `email`,
  `picture_url` and `locale`; the row, its name, its passkeys, its history and its profile are
  untouched, and the session survives (disconnecting is not a sign-out). A later Google sign-in with
  the same address therefore creates a _new_ account rather than silently re-attaching — the
  confirmation says exactly that, and points at "Connect Google" from settings as the safe path.
- **The identity is released, not remembered.** Nothing keeps the email as a match key, because that
  would make the disconnect cosmetic. The released address is recorded in `api_request_events`
  metadata for auditability only.
- **Disabled controls plus a server refusal.** The page disables Disconnect/Remove and explains why
  when only one method remains, and the APIs enforce the same rule so the guarantee does not depend on
  the UI.
- **No user deletion anywhere.** Disconnecting clears columns on an existing row; revoking a passkey
  archives the credential (`app_user_passkey_archive`); the user row is only ever read or updated.
- **An expected rate limit is not a console error.** Running the suite in parallel surfaced six specs
  failing on `Failed to hydrate history from server`: the E2E harness shares one anonymous
  rate-limit bucket (`getClientKey` keys anonymous callers by IP, deliberately, so a caller cannot
  rotate buckets), and the extra page loads in this change pushed `/api/user/history` past its
  60/minute budget. The status was 429 — verified by temporarily including it in the message — and
  the fix is in the product, not the tests: background hydration now treats 429 like the 401 it
  already ignored, because a rate-limited background sync is expected, unactionable by the user, and
  already recorded in `api_request_events`. The repo's telemetry guidance already excludes expected
  rate-limit 429s from error counts, so the console error was the outlier.

## Verification

| Check              | Result                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run lint`     | pass                                                                                            |
| `npm run test`     | **980 passed / 78 files** (was 979: +1 policy case; the database suite grew to 7 tests)         |
| `npm run test:e2e` | **188 passed in parallel** (was 186; +6 sign-in-method specs, −4 moved out of the passkey spec) |
| `npm run check`    | `check-build-mode: OK — 193 chunks`                                                             |

The suite was also run single-worker (188 passed) to separate contention from defects: the six
failures seen in the parallel run were all the same 429, and none of them reproduced with one worker.

Database tests pin the two statements that make the promises real: a chosen name surviving a later
Google sign-in, and a disconnect clearing the identity while leaving the account row, its name and its
id intact — plus the consequence that the released identity no longer matches, so a later sign-in is a
new account.

The e2e suite covers: adding a second passkey from another device and archiving one; the only method
being unremovable through both the disabled control and the API; disconnecting Google while a passkey
remains (identity cleared, account and session intact); disconnect refused while Google is the only
way in; the settings page reachable from the desktop menu; and the same-authenticator refusal still
telling the user why.

## Test changes

- **`src/lib/shared/passkeyPolicy.test.js` (protected path, modified).** `canRemovePasskey` is now
  `canRemoveLoginMethod`, with cases for the Google side of the count (Google alone is protected, one
  passkey plus Google is removable). No case was weakened or removed.
- **`tests/e2e/passkeys.e2e.js` (modified).** Four panel tests moved to
  `tests/e2e/sign-in-methods.e2e.js` because the panel moved to `/settings`; the ceremony tests
  (signup, re-sign-in, identity backfill, capability hiding) stay. No assertion was dropped — the
  moved tests were retargeted at the settings page.
- **`tests/e2e/passkeySignIn.js` (modified).** Adds `openSignInMethods`.
- **`src/lib/server/auth.db.test.js` (modified, protected path).** Adds three disconnect cases.
- **`tests/e2e/sign-in-methods.e2e.js` (new).** Six specs.
- No test was weakened to accommodate the rate-limit finding: the fix is in `sync.js`, and the two
  specs that failed keep asserting a clean console.

## Known limits

- The Google link cannot be created by a spec (it needs live credentials), so the e2e suite seeds a
  linked identity through the dev-only test database bridge and drives the real disconnect endpoint.
- Disconnecting Google does not attempt to merge or migrate anything; the account keeps its name even
  when that name came from Google, because the user can change it in the profile.
- Accounts without an email (after a disconnect) still cannot receive admin premium grants, which
  look up by email — an existing, documented limitation.
