// Framework-neutral passkey policy.
//
// These decisions are the parts of the passkey flow that must never depend on
// the verification library or the database, and that a mistake in either mints
// credentials for the wrong host, detaches someone's recovery path, or strands
// an account: the origin allowlist, the generated name, the device label, the
// Google-link table, the last-passkey guard, and reading a challenge out of
// untrusted client data.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const OWN_DOMAIN = 'selftest.in';
const MAX_CHALLENGE_LENGTH = 512;

function normalizeHost(value) {
	return typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : '';
}

/**
 * Decides the relying-party ID and the exact origin a ceremony may run on.
 *
 * Returns `null` for anything unrecognised, which the routes turn into
 * `503 PASSKEY_UNAVAILABLE`: without this an unknown (or lookalike) host could
 * mint credentials that no production origin would ever accept.
 *
 * The RP ID is the registrable domain, so one passkey covers the apex and
 * every subdomain, while local development keeps the host itself (the browser
 * treats localhost as a secure context and requires it as the RP ID).
 */
export function resolvePasskeyContext(url, envValues = {}) {
	const host = url && typeof url.hostname === 'string' ? url.hostname.toLowerCase() : '';
	const protocol = url && typeof url.protocol === 'string' ? url.protocol : '';
	const origin = url && typeof url.origin === 'string' ? url.origin : '';
	if (!host || !origin || (protocol !== 'http:' && protocol !== 'https:')) {
		return null;
	}

	// Local development wins over the production override: a developer with
	// PASSKEY_RP_ID set in the environment must still be able to run the
	// ceremony against localhost.
	if (LOCAL_HOSTS.has(host)) {
		return { rpId: host, expectedOrigin: origin };
	}

	// Credentials are only ever created in a secure context.
	if (protocol !== 'https:') {
		return null;
	}

	const override = normalizeHost(envValues?.PASSKEY_RP_ID);
	if (override) {
		return host === override || host.endsWith(`.${override}`)
			? { rpId: override, expectedOrigin: origin }
			: null;
	}

	if (host === OWN_DOMAIN || host.endsWith(`.${OWN_DOMAIN}`)) {
		return { rpId: OWN_DOMAIN, expectedOrigin: origin };
	}

	// Preview deployments and staging hosts opt in explicitly.
	const allowedOrigins = String(envValues?.PASSKEY_ALLOWED_ORIGINS || '')
		.split(',')
		.map((value) => value.trim().replace(/\/+$/, ''))
		.filter(Boolean);
	if (allowedOrigins.includes(origin)) {
		return { rpId: host, expectedOrigin: origin };
	}

	return null;
}

/** Generated display name for a signup that collects no profile data. */
export function generateDisplayName({ random = Math.random, language = 'english' } = {}) {
	const word = language === 'hindi' ? 'शिक्षार्थी' : 'Learner';
	const draw = typeof random === 'function' ? Number(random()) : Number.NaN;
	const safe = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 0.999999) : 0;
	return `${word} ${1000 + Math.floor(safe * 9000)}`;
}

/** `hindi` or `english`, defaulting to english for anything else. */
export function normalizeDisplayLanguage(value) {
	return typeof value === 'string' && value.trim().toLowerCase() === 'hindi'
		? 'hindi'
		: 'english';
}

/**
 * Short device label for the profile list. The label is stored as data (like a
 * generated display name), not rendered from chrome copy.
 */
export function describePasskeyDevice(userAgent) {
	const ua = typeof userAgent === 'string' ? userAgent : '';
	if (/iPad/i.test(ua)) return 'iPad';
	if (/iPhone|iPod/i.test(ua)) return 'iPhone';
	if (/Android/i.test(ua)) return 'Android device';
	if (/CrOS/i.test(ua)) return 'Chromebook';
	if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
	if (/Windows/i.test(ua)) return 'Windows PC';
	if (/Linux|X11/i.test(ua)) return 'Linux device';
	return 'This device';
}

/**
 * Whether a verified Google identity may be attached to the signed-in account.
 *
 * `attach`     — the account has no Google identity and nobody else owns this one
 * `idempotent` — the account already holds this exact identity
 * `conflict`   — another account owns it, or this account is already linked to a
 *                different Google identity (never silently re-point recovery)
 */
export function decideGoogleLink({ currentGoogleSub, targetGoogleSub, claimedByAnotherUser } = {}) {
	const target = typeof targetGoogleSub === 'string' ? targetGoogleSub.trim() : '';
	if (!target || claimedByAnotherUser) {
		return 'conflict';
	}
	const current = typeof currentGoogleSub === 'string' ? currentGoogleSub.trim() : '';
	if (!current) {
		return 'attach';
	}
	return current === target ? 'idempotent' : 'conflict';
}

/**
 * Removing the last credential of an account with no Google identity would
 * strand it, so that single case is refused.
 */
export function canRemovePasskey({ passkeyCount, googleSub } = {}) {
	const count = typeof passkeyCount === 'number' && Number.isFinite(passkeyCount) ? passkeyCount : 0;
	if (count <= 0) {
		return false;
	}
	if (count > 1) {
		return true;
	}
	return typeof googleSub === 'string' && googleSub.trim().length > 0;
}

/**
 * Reads the challenge from an untrusted `clientDataJSON` so the matching
 * single-use challenge row can be consumed before verification. Never throws:
 * hostile input must not become a 500.
 */
export function readChallengeFromClientData(clientDataJSON) {
	if (typeof clientDataJSON !== 'string' || clientDataJSON.length === 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
		const challenge = parsed?.challenge;
		if (
			typeof challenge !== 'string' ||
			challenge.length === 0 ||
			challenge.length > MAX_CHALLENGE_LENGTH
		) {
			return null;
		}
		return challenge;
	} catch {
		return null;
	}
}

export function base64UrlToBytes(value) {
	if (typeof value !== 'string' || value.length === 0) {
		return new Uint8Array(0);
	}
	return new Uint8Array(Buffer.from(value, 'base64url'));
}

export function bytesToBase64Url(bytes) {
	if (!bytes || typeof bytes.length !== 'number') {
		return '';
	}
	return Buffer.from(bytes).toString('base64url');
}
