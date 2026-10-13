## scope.included

- New /settings page owning sign-in methods: Google connect/disconnect and passkeys list/add/remove.
- The passkey panel is removed from /profile, which now links to settings.
- POST /api/auth/google/unlink clears google_sub, email, picture_url and locale; the row, name, passkeys, history and session stay.
- loginMethodCount/canRemoveLoginMethod in shared/passkeyPolicy; both removals answer 409 LAST_LOGIN_METHOD.
- Settings links in the desktop user menu and the mobile menu; auth:google-unlink in the telemetry allowlist.
- EN + HI copy for the page, the disconnect warning and the refusal.

## scope.excluded

- Deleting a user, or any endpoint that removes the account row.
- Keeping the released email as a match key so a later Google sign-in re-attaches (chosen against: disconnect must be real).
- Moving unrelated preferences (theme, language, notifications) onto the settings page.
- Account merge, and premium grants for email-less accounts.

## preserved

- Signing in with a passkey, linking Google and the profile page's other sections are unchanged.
- A linked Google identity keeps being refreshed by Google sign-in (picture, locale, last login).
- The account row is never deleted by any path here; passkey revocation stays archive-first.
- Anonymous (client_id) profile saves and the learner profile blob are untouched.
- The last-method rule still refuses exactly what it refused before, and now covers Google as well.

## decisions

- One guard for both removals: loginMethodCount counts every passkey plus a linked Google identity, and removal is refused when the total would reach zero, so the account can never be left unreachable.
- Disconnect clears google_sub, email, picture_url and locale and keeps the name: the row and everything on it survive, but Google genuinely stops being a way in.
- The released identity is not remembered as a match key, so a later Google sign-in is a new account; the confirmation says so and points at Connect Google while signed in.
- Disabled controls plus an API refusal: the page explains the rule, and the endpoints enforce it so the guarantee does not depend on the UI.
- The linked email travels with the passkey list response rather than being read from the session snapshot, so the settings page is correct even when the session is stale.
- The e2e suite seeds a Google link through the dev-only test bridge because linking needs live Google credentials; the disconnect itself is driven through the real endpoint.
- A 429 on a background hydration is treated like the 401 that was already ignored: the E2E harness shares one anonymous rate-limit bucket, and a rate-limited sync is expected, unactionable and already recorded server-side. Fixing this in sync.js keeps the specs' clean-console assertions intact instead of filtering the message in tests.

