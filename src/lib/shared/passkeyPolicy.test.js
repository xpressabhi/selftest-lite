import { describe, expect, it } from 'vitest';
import {
	base64UrlToBytes,
	bytesToBase64Url,
	canRemovePasskey,
	decideGoogleLink,
	describePasskeyDevice,
	generateDisplayName,
	readChallengeFromClientData,
	resolvePasskeyContext
} from './passkeyPolicy.js';

// These are the parts of the passkey flow the e2e ceremony cannot reach: the
// origin allowlist (a mistake here mints credentials for the wrong host), the
// Google-link decision table (a mistake here detaches someone's recovery
// path), the last-passkey guard (a mistake here strands an account), and the
// untrusted challenge read (which must never throw on hostile input).
// Failure modes are enumerated per test group rather than discovered later.

describe('resolvePasskeyContext', () => {
	const production = {};

	it('accepts the apex and www, both mapped to the registrable domain', () => {
		expect(resolvePasskeyContext(new URL('https://selftest.in/'), production)).toEqual({
			rpId: 'selftest.in',
			expectedOrigin: 'https://selftest.in'
		});
		expect(resolvePasskeyContext(new URL('https://www.selftest.in/profile'), production)).toEqual({
			rpId: 'selftest.in',
			expectedOrigin: 'https://www.selftest.in'
		});
	});

	it('accepts a real subdomain under the same RP ID', () => {
		expect(resolvePasskeyContext(new URL('https://learn.selftest.in/'), production)).toEqual({
			rpId: 'selftest.in',
			expectedOrigin: 'https://learn.selftest.in'
		});
	});

	it('rejects a lookalike suffix that is not a subdomain', () => {
		expect(resolvePasskeyContext(new URL('https://evil-selftest.in/'), production)).toBeNull();
		expect(resolvePasskeyContext(new URL('https://selftest.in.evil.com/'), production)).toBeNull();
		expect(resolvePasskeyContext(new URL('https://notselftest.in/'), production)).toBeNull();
	});

	it('rejects plain http on a production host', () => {
		expect(resolvePasskeyContext(new URL('http://www.selftest.in/'), production)).toBeNull();
	});

	it('accepts localhost over http or https, keeping the host as the RP ID', () => {
		expect(resolvePasskeyContext(new URL('http://localhost:5174/'), production)).toEqual({
			rpId: 'localhost',
			expectedOrigin: 'http://localhost:5174'
		});
		expect(resolvePasskeyContext(new URL('http://127.0.0.1:5173/'), production)).toEqual({
			rpId: '127.0.0.1',
			expectedOrigin: 'http://127.0.0.1:5173'
		});
	});

	it('rejects a preview deployment unless it opts in', () => {
		const preview = new URL('https://selftest-lite-git-main.vercel.app/');
		expect(resolvePasskeyContext(preview, production)).toBeNull();
		expect(
			resolvePasskeyContext(preview, {
				PASSKEY_ALLOWED_ORIGINS: 'https://selftest-lite-git-main.vercel.app'
			})
		).toEqual({
			rpId: 'selftest-lite-git-main.vercel.app',
			expectedOrigin: 'https://selftest-lite-git-main.vercel.app'
		});
	});

	it('ignores unrelated entries in the origin allowlist', () => {
		const preview = new URL('https://selftest-lite-git-main.vercel.app/');
		expect(
			resolvePasskeyContext(preview, {
				PASSKEY_ALLOWED_ORIGINS: ' https://elsewhere.example , https://other.vercel.app '
			})
		).toBeNull();
	});

	it('honours PASSKEY_RP_ID for production hosts, including a parent domain', () => {
		expect(
			resolvePasskeyContext(new URL('https://learn.selftest.in/'), {
				PASSKEY_RP_ID: 'selftest.in'
			})
		).toEqual({ rpId: 'selftest.in', expectedOrigin: 'https://learn.selftest.in' });

		// An origin the override does not cover stays rejected.
		expect(
			resolvePasskeyContext(new URL('https://example.com/'), { PASSKEY_RP_ID: 'selftest.in' })
		).toBeNull();
	});

	it('still allows localhost when an RP ID override is configured', () => {
		expect(
			resolvePasskeyContext(new URL('http://localhost:5174/'), {
				PASSKEY_RP_ID: 'selftest.in'
			})
		).toEqual({ rpId: 'localhost', expectedOrigin: 'http://localhost:5174' });
	});

	it('returns null instead of throwing on unusable input', () => {
		expect(resolvePasskeyContext(null, production)).toBeNull();
		expect(resolvePasskeyContext(undefined, production)).toBeNull();
		expect(resolvePasskeyContext({}, production)).toBeNull();
		expect(resolvePasskeyContext(new URL('https://selftest.in/'), null)).toEqual({
			rpId: 'selftest.in',
			expectedOrigin: 'https://selftest.in'
		});
	});
});

describe('generateDisplayName', () => {
	it('always produces a four-digit learner name inside the documented range', () => {
		expect(generateDisplayName({ random: () => 0 })).toBe('Learner 1000');
		expect(generateDisplayName({ random: () => 0.999999 })).toBe('Learner 9999');
	});

	it('clamps hostile or broken randomness instead of emitting NaN', () => {
		expect(generateDisplayName({ random: () => 1 })).toBe('Learner 9999');
		expect(generateDisplayName({ random: () => -3 })).toBe('Learner 1000');
		expect(generateDisplayName({ random: () => Number.NaN })).toBe('Learner 1000');
		expect(generateDisplayName({ random: () => 'nope' })).toBe('Learner 1000');
		expect(generateDisplayName({ random: null })).toMatch(/^Learner \d{4}$/);
	});

	it('uses the Hindi word for a Hindi request and falls back for anything else', () => {
		expect(generateDisplayName({ random: () => 0, language: 'hindi' })).toBe('शिक्षार्थी 1000');
		expect(generateDisplayName({ random: () => 0, language: 'english' })).toBe('Learner 1000');
		expect(generateDisplayName({ random: () => 0, language: 'fr' })).toBe('Learner 1000');
		expect(generateDisplayName({ random: () => 0, language: null })).toBe('Learner 1000');
	});
});

describe('describePasskeyDevice', () => {
	const cases = [
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
			'iPhone'
		],
		[
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
			'Android device'
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
			'Windows PC'
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
			'Mac'
		],
		[
			'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
			'Chromebook'
		],
		['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Linux device']
	];

	it.each(cases)('labels %s', (userAgent, expected) => {
		expect(describePasskeyDevice(userAgent)).toBe(expected);
	});

	it('falls back for missing, empty or non-string headers', () => {
		expect(describePasskeyDevice(undefined)).toBe('This device');
		expect(describePasskeyDevice('')).toBe('This device');
		expect(describePasskeyDevice(null)).toBe('This device');
		expect(describePasskeyDevice(42)).toBe('This device');
	});
});

describe('decideGoogleLink', () => {
	const base = { currentGoogleSub: null, targetGoogleSub: 'google-1', claimedByAnotherUser: false };

	it('attaches to an account with no Google identity', () => {
		expect(decideGoogleLink(base)).toBe('attach');
	});

	it('is idempotent when the same Google identity is already linked', () => {
		expect(decideGoogleLink({ ...base, currentGoogleSub: 'google-1' })).toBe('idempotent');
	});

	it('refuses when another account already owns the identity', () => {
		expect(decideGoogleLink({ ...base, claimedByAnotherUser: true })).toBe('conflict');
		expect(
			decideGoogleLink({
				...base,
				currentGoogleSub: 'google-1',
				claimedByAnotherUser: true
			})
		).toBe('conflict');
	});

	it('refuses to detach a different Google identity from the account', () => {
		expect(decideGoogleLink({ ...base, currentGoogleSub: 'google-0' })).toBe('conflict');
	});

	it('refuses a missing target identity instead of clearing the column', () => {
		expect(decideGoogleLink({ ...base, targetGoogleSub: null })).toBe('conflict');
		expect(decideGoogleLink({ ...base, targetGoogleSub: '' })).toBe('conflict');
		expect(decideGoogleLink({})).toBe('conflict');
	});
});

describe('canRemovePasskey', () => {
	it('allows removing one of several passkeys', () => {
		expect(canRemovePasskey({ passkeyCount: 2, googleSub: null })).toBe(true);
		expect(canRemovePasskey({ passkeyCount: 5, googleSub: 'google-1' })).toBe(true);
	});

	it('refuses to strand an account whose only credential is a passkey', () => {
		expect(canRemovePasskey({ passkeyCount: 1, googleSub: null })).toBe(false);
		expect(canRemovePasskey({ passkeyCount: 1, googleSub: '' })).toBe(false);
	});

	it('allows removing the last passkey once Google can sign the user back in', () => {
		expect(canRemovePasskey({ passkeyCount: 1, googleSub: 'google-1' })).toBe(true);
	});

	it('refuses when there is nothing to remove or the count is unusable', () => {
		expect(canRemovePasskey({ passkeyCount: 0, googleSub: 'google-1' })).toBe(false);
		expect(canRemovePasskey({ passkeyCount: -1, googleSub: 'google-1' })).toBe(false);
		expect(canRemovePasskey({ passkeyCount: Number.NaN, googleSub: 'google-1' })).toBe(false);
		expect(canRemovePasskey({ passkeyCount: '2', googleSub: 'google-1' })).toBe(false);
		expect(canRemovePasskey()).toBe(false);
	});
});

describe('readChallengeFromClientData', () => {
	const encode = (value) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));

	it('reads the challenge out of a well-formed clientDataJSON', () => {
		expect(readChallengeFromClientData(encode({ type: 'webauthn.create', challenge: 'abc123' }))).toBe(
			'abc123'
		);
	});

	it('never throws on hostile or malformed input', () => {
		expect(readChallengeFromClientData(undefined)).toBeNull();
		expect(readChallengeFromClientData(null)).toBeNull();
		expect(readChallengeFromClientData('')).toBeNull();
		expect(readChallengeFromClientData('!!!not-base64!!!')).toBeNull();
		expect(readChallengeFromClientData(bytesToBase64Url(new TextEncoder().encode('not json')))).toBeNull();
		expect(readChallengeFromClientData(bytesToBase64Url(new Uint8Array([0xff, 0xfe, 0xfd])))).toBeNull();
	});

	it('rejects payloads where the challenge is missing or not a string', () => {
		expect(readChallengeFromClientData(encode({ type: 'webauthn.create' }))).toBeNull();
		expect(readChallengeFromClientData(encode({ challenge: 42 }))).toBeNull();
		expect(readChallengeFromClientData(encode({ challenge: null }))).toBeNull();
		expect(readChallengeFromClientData(encode({ challenge: '' }))).toBeNull();
		expect(readChallengeFromClientData(encode({ challenge: 'x'.repeat(5000) }))).toBeNull();
	});
});

describe('base64url helpers', () => {
	it('round-trips arbitrary bytes', () => {
		const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
		expect([...base64UrlToBytes(bytesToBase64Url(bytes))]).toEqual([...bytes]);
	});

	it('emits url-safe, unpadded output', () => {
		const encoded = bytesToBase64Url(new Uint8Array([251, 255, 190]));
		expect(encoded).not.toMatch(/[+/=]/);
	});

	it('tolerates unusable input without throwing', () => {
		expect(base64UrlToBytes('').length).toBe(0);
		expect(base64UrlToBytes(undefined).length).toBe(0);
		expect(bytesToBase64Url(undefined)).toBe('');
		expect(bytesToBase64Url(null)).toBe('');
	});
});
