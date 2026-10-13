## scope.included

- A \"Your name\" field at the top of the profile page's learner section, saved by the existing Save button.
- app_user gains name_edited_at; POST /api/user/profile accepts displayName and writes app_user.name, returning the updated account.
- upsertGoogleUser stops refreshing a name the user chose, while still refreshing picture, locale and last_login_at.
- shared/displayName.js: normalization and limits used by both the field and the server.
- saveProfile() reports server failures instead of swallowing them; the page maps INVALID_DISPLAY_NAME to a localised message.
- EN + HI copy for the field, its hint and the refusal.

## scope.excluded

- A name inside the learner profile blob, or two separate names.
- Asking for a name during the profile wizard or at passkey signup.
- Renaming or greeting surfaces beyond the existing account name (header, menu, public stats, admin lists).
- Uniqueness of names.

## preserved

- Google sign-in still refreshes picture_url, locale and last_login_at on every sign-in.
- A Google account that never edits its name keeps following the Google name.
- The learner profile blob, its normalization and its reset behaviour are unchanged.
- Anonymous (client_id) profile saves keep working; a displayName is only written when there is an account.
- Passkey signup stays form-free: the generated name is editable afterwards, not at signup.

## decisions

- One name on the account: app_user.name is already what the header, menu, public stats and admin lists read, so every surface agrees. A name in the profile blob would let the stats page and the header disagree.
- name_edited_at is the guard: without it the next Google sign-in would silently reset a name the user typed, which is impossible to notice until it happens.
- The name is saved in the same request as the profile blob so the page keeps one form and one Save button; the response carries the updated account so the header updates without another round trip.
- An unusable name is refused with 400 INVALID_DISPLAY_NAME rather than dropped: saving the rest while ignoring the name would look like success.
- saveProfile now returns { profile, user, error, code } instead of swallowing server errors, which is what makes a refused name visible to the user.
- The guard is pinned by a database test rather than review, because its failure only appears after a later sign-in.

