import { describe, expect, it } from 'vitest';
import { getClientIp, getClientKey } from './clientKey';

// The rate-limit bucket and the telemetry client_key both derive from this. It
// must be a function of the server-observed peer address (plus the
// server-derived user id), never of a header the caller chooses, or every limit
// in the app is one `curl -H` away from being bypassed.

function requestWith({ address, headers = {} } = {}) {
	return {
		headers: new Headers(headers),
		getClientAddress: address === undefined ? () => undefined : () => address,
	};
}

describe('getClientIp', () => {
	it('uses the adapter-observed address', () => {
		expect(getClientIp(requestWith({ address: '203.0.113.9' }))).toBe('203.0.113.9');
	});

	it('ignores a spoofed x-forwarded-for', () => {
		const request = requestWith({
			address: '203.0.113.9',
			headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
		});
		expect(getClientIp(request)).toBe('203.0.113.9');
	});

	it('ignores a spoofed x-real-ip', () => {
		const request = requestWith({ address: '203.0.113.9', headers: { 'x-real-ip': '1.2.3.4' } });
		expect(getClientIp(request)).toBe('203.0.113.9');
	});

	it('degrades to "unknown" instead of throwing when the adapter has no address', () => {
		// SvelteKit throws from getClientAddress when the adapter does not supply
		// it. A rate limiter must never 500 because of that.
		const request = {
			headers: new Headers(),
			getClientAddress: () => {
				throw new Error('adapter does not specify getClientAddress');
			},
		};
		expect(getClientIp(request)).toBe('unknown');
	});

	it('degrades to "unknown" when the method is missing or empty', () => {
		expect(getClientIp({ headers: new Headers() })).toBe('unknown');
		expect(getClientIp(requestWith({ address: null }))).toBe('unknown');
		expect(getClientIp(requestWith({ address: '' }))).toBe('unknown');
	});
});

describe('getClientKey', () => {
	it('returns 40 hex chars', () => {
		expect(getClientKey(requestWith({ address: '203.0.113.9' }))).toMatch(/^[0-9a-f]{40}$/);
	});

	it('is stable for the same peer', () => {
		const a = getClientKey(requestWith({ address: '203.0.113.9' }));
		const b = getClientKey(requestWith({ address: '203.0.113.9' }));
		expect(a).toBe(b);
	});

	it('separates different peers', () => {
		expect(getClientKey(requestWith({ address: '203.0.113.9' }))).not.toBe(
			getClientKey(requestWith({ address: '203.0.113.10' }))
		);
	});

	// The bypass this replaces: rotating User-Agent minted a fresh bucket.
	it('does not let User-Agent rotation mint a new bucket', () => {
		const base = { address: '203.0.113.9' };
		const keys = new Set(
			['Mozilla/5.0 (A)', 'curl/8.0', 'Mozilla/5.0 (B)', ''].map((ua) =>
				getClientKey(requestWith({ ...base, headers: { 'user-agent': ua } }))
			)
		);
		expect(keys.size).toBe(1);
	});

	it('does not let forwarded-header rotation mint a new bucket', () => {
		const keys = new Set(
			['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((ip) =>
				getClientKey(
					requestWith({ address: '203.0.113.9', headers: { 'x-forwarded-for': ip } })
				)
			)
		);
		expect(keys.size).toBe(1);
	});

	it('gives a signed-in caller a per-account bucket', () => {
		// Everyone behind one office/carrier NAT shares an address; without this
		// they would share a bucket and rate-limit each other.
		const a = getClientKey(requestWith({ address: '203.0.113.9' }), 7);
		const b = getClientKey(requestWith({ address: '203.0.113.9' }), 8);
		expect(a).not.toBe(b);
	});

	it('keeps an account bucket stable regardless of where it connects', () => {
		expect(getClientKey(requestWith({ address: '203.0.113.9' }), 7)).toBe(
			getClientKey(requestWith({ address: '198.51.100.4' }), 7)
		);
	});

	it('treats userId 0 and null as anonymous', () => {
		const anon = getClientKey(requestWith({ address: '203.0.113.9' }));
		expect(getClientKey(requestWith({ address: '203.0.113.9' }), null)).toBe(anon);
		expect(getClientKey(requestWith({ address: '203.0.113.9' }), 0)).toBe(anon);
		expect(getClientKey(requestWith({ address: '203.0.113.9' }), undefined)).toBe(anon);
	});
});