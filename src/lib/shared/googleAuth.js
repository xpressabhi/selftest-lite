// Google OAuth client configuration.
//
// The client ID is public by design: it ships inside the Google Sign-In
// script tag on every page that renders a sign-in button. We keep it as a
// fallback so sign-in keeps working even when PUBLIC_GOOGLE_CLIENT_ID is
// missing from a deployment's environment. Environment variables always win
// when present.
export const GOOGLE_CLIENT_ID_FALLBACK =
	'712722478360-2mrcdd0c746u7muep4dsctl7c0ih8goe.apps.googleusercontent.com';

/** Returns the configured client id, falling back to the built-in one. */
export function resolveGoogleClientId(envValue) {
	return typeof envValue === 'string' && envValue.trim().length > 0
		? envValue.trim()
		: GOOGLE_CLIENT_ID_FALLBACK;
}
