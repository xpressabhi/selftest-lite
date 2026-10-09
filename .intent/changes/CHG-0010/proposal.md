# Change intent

## Request and outcome

"Allow updating user name and profile user name in profile along with other details."

The profile page now has a **Your name** field at the top of the "About you" section. It is saved by
the same Save button as everything else, and it changes the name the user is shown by everywhere: the
header, the user menu, the public test-stats page and the admin lists.

## Context

There was no name field anywhere to edit. The learner profile schema
(`src/lib/shared/userProfile.js`) is `version`, `setupComplete`, `class`, `profession`, `examTarget`,
`subjects`, `preferences`, `declaredFocus` — and the only name in the system was `app_user.name`:
Google's name for a Google account, or the generated `Learner 4821` / `शिक्षार्थी 4821` for a
passkey-first account. The first real passkey user (`app_user` 43, `Learner 2407`) is exactly that
case, and `testStats.js` reads `u.name AS user_name` for the public stats page, so the name is
user-visible data, not internal.

The fork was where one edited name should live. The user chose the account.

## Decisions

- **One name, on the account.** `app_user.name` is what the header, the menu, public stats and the
  admin lists already read, so editing it keeps every surface in agreement. Rejected: a name inside
  the learner profile blob (the header would have to prefer it and the stats page would still show
  the account name, so the same person could appear under two names), and two separate names.
- **A later Google sign-in must not reset it.** `upsertGoogleUser` refreshed `name` from Google on
  every sign-in, which would silently undo a chosen name at the next login. The update now reads
  `name = CASE WHEN name_edited_at IS NULL THEN $3 ELSE name END`, and a new nullable
  `app_user.name_edited_at` is stamped by the profile save. Google keeps refreshing everything else
  (picture, locale, `last_login_at`).
- **Saved in the same request as the rest of the form.** `POST /api/user/profile` accepts an optional
  `displayName` and writes it to `app_user` after the profile blob, returning the updated account so
  the header can update without a second request. The profile page stays one form with one Save.
- **The server refuses a bad name instead of dropping it.** `normalizeDisplayName` (shared, so the
  field's `maxlength` and the server agree) cleans invisible characters and whitespace and requires
  2-40 characters; anything else answers `400 INVALID_DISPLAY_NAME` and nothing is written. Saving
  the rest of the form while silently ignoring the name would look like it worked.
- **`saveProfile` now reports failures.** It used to swallow every server error and return the
  normalized profile, so a rejected name would have looked saved. It returns
  `{ profile, user, error, code }`, the page maps `INVALID_DISPLAY_NAME` to a localized message, and
  the wizard (which sends no name) keeps its local-first behaviour by reading `result.profile`.

## Verification

| Check              | Result                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| `npm run lint`     | pass                                                                               |
| `npm run test`     | **979 passed / 78 files** (was 975 / 77: +4 database tests pinning the name guard) |
| `npm run test:e2e` | **186 passed** (was 184: +2 name specs)                                            |
| `npm run check`    | `check-build-mode: OK — 193 chunks`                                                |

`src/lib/server/auth.db.test.js` pins both statements against an in-process Postgres, because the
failure mode of the guard is invisible: Google overwriting a chosen name, Google failing to refresh a
name the user never chose, and the edited marker never being stamped.

The e2e specs sign up with a passkey (the only sign-in a spec can drive), replace the generated name,
and assert the header, `app_user.name`, `name_edited_at`, `/api/auth/me` and the value after a
reload; the second spec asserts a one-character name is refused by the field _and_ by the API, with
the stored row untouched.

## Test changes

- **`src/lib/server/schemaMigrations.test.js` (protected path, modified).** `DDL_FINGERPRINT` moves to
  `553f8fb1…:12` because this change adds a column and bumps `SCHEMA_VERSION` 11 → 12; the guard
  requires the fingerprint and the version to move together. No assertion was weakened.
- **`tests/e2e/passkeys.e2e.js` (modified).** Its sign-in helpers moved to
  `tests/e2e/passkeySignIn.js` so the new profile spec can reuse them instead of duplicating the
  ceremony. No assertion changed.
- **`tests/e2e/passkeySignIn.js`** and **`tests/e2e/profile-name.e2e.js`** (new).
- **`src/lib/server/auth.db.test.js`** (new, 4 tests).
- No test was deleted, skipped, or loosened.

## Known limits

- The name is account data, so it needs a signed-in account; the profile form is already sign-in
  gated, so anonymous visitors never see the field.
- The profile wizard still does not ask for a name: passkey-first signup exists to avoid a form, and
  the field is one tap away in the profile.
- Two people can choose the same name; nothing enforces uniqueness, and the public stats page keys on
  the account id.
