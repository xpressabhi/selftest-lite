# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

The profile page edits the name the user is shown by. It lives on the account (`app_user.name`), so
the header, user menu, public test stats and admin lists all show the same thing, and a name the user
chooses survives every later Google sign-in.

Change `CHG-0010` revision 1, proposal digest
`sha256:4bd14f22b613c3d5a7bfc7fc4fc40a3be022cb89e15062f8eea1dd94188fe909`.

## Verification

| Command            | Result                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| `npm run lint`     | pass, no output                                                                 |
| `npm run test`     | **979 passed / 78 files** (before: 975 / 77)                                    |
| `npm run test:e2e` | **186 passed** (before: 184)                                                    |
| `npm run check`    | **check-build-mode: OK — 193 chunks**, no DEV-only code, service worker present |

`src/lib/server/auth.db.test.js` runs both affected statements against an in-process Postgres and
covers the three ways the guard can be wrong: Google overwriting a chosen name; Google failing to
refresh a name nobody chose; the edited marker never being stamped. It also checks that a name update
for a non-existent id writes nothing.

The e2e specs sign up with a passkey — the only sign-in a spec can drive, and the account type whose
name is generated — then:

- `a generated name can be replaced, and the header follows immediately`: the field starts from the
  account name, the save shows "Profile saved.", the user menu shows the new name without a reload,
  `app_user.name` and `name_edited_at` are written, `/api/auth/me` agrees, and the value survives a
  reload.
- `a name the server refuses is reported, not silently kept`: a one-character name warns in the field,
  the save surfaces the refusal, `app_user.name` and `name_edited_at` are untouched, and the API
  itself answers `400 INVALID_DISPLAY_NAME` to the same value — the rule is not only in the form.

## Deviations and decisions

- **The version bump was required again.** `app_user.name_edited_at` is new DDL, so `SCHEMA_VERSION`
  went 11 → 12 and the fingerprint moved with it; the guard test failed first, as designed.
- **`saveProfile` changed shape.** It previously swallowed every server failure and returned the
  normalized profile, which would have made a rejected name look saved. It now returns
  `{ profile, user, error, code }`; the profile page maps `INVALID_DISPLAY_NAME` to localized copy and
  the wizard reads `result.profile`, keeping its local-first behaviour unchanged.
- **Passkey signup still asks for nothing.** The generated name is replaceable in the profile rather
  than prompted at signup, because collecting nothing is the point of that path.
- **Helpers moved, not duplicated.** The passkey sign-in helpers now live in
  `tests/e2e/passkeySignIn.js` so the new spec drives a real account without a second copy of the
  ceremony.

## Not verified here

- The Google-overwrite guard end to end: it needs a live Google credential, so it is pinned by the
  database test instead.
- A production check of the field; the change is not deployed yet.

## Follow-ups (not part of this change)

- Optional: let the profile wizard prefill the name, and show the chosen name on the results and stats
  pages beside the account avatar.
- Nothing enforces name uniqueness, and nothing needs to.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the user chose the account as the
home for the name in conversation before implementation, and the protected test change above is
declared.
