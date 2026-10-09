import { describe, expect, it } from 'vitest';
import { getClientIp, getClientKey, rememberClientAddress } from './clientKey';

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

	// Handlers pass the raw Request to getClientKey, but getClientAddress()
	// lives on the SvelteKit event. The hook records the adapter-resolved
	// address for the request so raw requests resolve to the real peer.
	it('uses the address recorded for the request lifecycle on a raw request', () => {
		const rawRequest = { headers: new Headers() };
		rememberClientAddress(rawRequest, '203.0.113.9');
		expect(getClientIp(rawRequest)).toBe('203.0.113.9');
	});

	it('prefers the adapter address when one is available', () => {
		const eventLike = requestWith({ address: '198.51.100.7' });
		rememberClientAddress(eventLike, '203.0.113.9');
		expect(getClientIp(eventLike)).toBe('198.51.100.7');
	});

	it('keeps only the rightmost entry of an appended address list', () => {
		expect(getClientIp(requestWith({ address: '9.9.9.9, 203.0.113.9' }))).toBe('203.0.113.9');
	});

	it('ignores blank recorded addresses', () => {
		const rawRequest = { headers: new Headers() };
		rememberClientAddress(rawRequest, '   ');
		expect(getClientIp(rawRequest)).toBe('unknown');
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

	// Regression: every anonymous caller used to collapse into the shared
	// 'ip:unknown' bucket because the raw Request has no getClientAddress.
	it('buckets a raw request by the address the lifecycle recorded', () => {
		const rawRequest = { headers: new Headers() };
		rememberClientAddress(rawRequest, '203.0.113.9');
		expect(getClientKey(rawRequest)).toBe(getClientKey(requestWith({ address: '203.0.113.9' })));
	});

	it('a spoofed prefix in an appended list does not mint a new bucket', () => {
		const a = getClientKey(requestWith({ address: '9.9.9.9, 203.0.113.9' }));
		const b = getClientKey(requestWith({ address: '8.8.8.8, 203.0.113.9' }));
		expect(a).toBe(b);
	});

	it('leaves a raw request with no recorded address in the shared bucket', () => {
		const unrecorded = { headers: new Headers() };
		expect(getClientKey(unrecorded)).toBe(getClientKey({ headers: new Headers() }));
		expect(getClientKey(unrecorded)).not.toBe(
			getClientKey(requestWith({ address: '203.0.113.9' }))
		);
	});
});