// The name a user wants to be shown by.
//
// It lives on the account (`app_user.name`), so the header, the user menu, the
// public stats page and the admin lists all agree. A passkey-first account
// starts with a generated name (`Learner 4821`); a Google account starts with
// the Google name and keeps it until the user edits it here — after that the
// user's choice wins and a later Google sign-in no longer overwrites it.

import { sanitizeInputText } from './inputLimits';

/** The header truncates at 40, so nothing longer can ever be displayed. */
export const MAX_DISPLAY_NAME_CHARS = 40;

/** A single character is not a name, and likely a typo. */
export const MIN_DISPLAY_NAME_CHARS = 2;

/**
 * Cleans and validates a submitted name. Returns null when it cannot be a
 * name, which callers turn into a refusal rather than a silent fallback:
 * accepting a name the user did not type would be worse than rejecting it.
 */
export function normalizeDisplayName(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const cleaned = sanitizeInputText(value, MAX_DISPLAY_NAME_CHARS).trim();
	if (cleaned.length < MIN_DISPLAY_NAME_CHARS) {
		return null;
	}
	return cleaned;
}
