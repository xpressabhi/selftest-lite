import { defineEnvVars } from '@sveltejs/kit/env';

// Reviewed during the SvelteKit 3 migration: every consumer treats a falsy
// value as "not configured", so falling back to '' (where $env/dynamic/private
// previously yielded undefined for unset variables) preserves behaviour.
export const variables = defineEnvVars({
	GOOGLE_SITE_VERIFICATION: { schema: (input) => input ?? '' },
	E2E_DB_BRIDGE: { schema: (input) => input ?? '' },
	DATABASE_URL: { schema: (input) => input ?? '' },
	NUDGE_ENABLED: { schema: (input) => input ?? '' },
	TYPESAFE_API_KEY: { schema: (input) => input ?? '' },
	GEMINI_API_KEY: { schema: (input) => input ?? '' },
	ADMIN_USERNAME: { schema: (input) => input ?? '' },
	ADMIN_PASSWORD: { schema: (input) => input ?? '' },
	ADMIN_SESSION_SECRET: { schema: (input) => input ?? '' },
	GOOGLE_CLIENT_ID: { schema: (input) => input ?? '' },
	PUBLIC_GOOGLE_CLIENT_ID: { public: true, schema: (input) => input ?? '' },
	NODE_ENV: { schema: (input) => input ?? '' },
	PASSKEY_ALLOWED_ORIGINS: { schema: (input) => input ?? '' },
	PASSKEY_RP_ID: { schema: (input) => input ?? '' },
	PUBLIC_VAPID_KEY: { public: true, schema: (input) => input ?? '' },
});
