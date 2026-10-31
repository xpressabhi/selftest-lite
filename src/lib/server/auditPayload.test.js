// Failure modes A1-A5 were written before src/lib/server/auditPayload.js.

import { describe, expect, it } from 'vitest';
import { MAX_AUDIT_PAYLOAD_CHARS, serializeAuditPayload } from './auditPayload.js';

describe('serializeAuditPayload failure modes', () => {
	it('A1: returns null for missing payloads', () => {
		expect(serializeAuditPayload(null)).toBeNull();
		expect(serializeAuditPayload(undefined)).toBeNull();
	});

	it('A2: serializes a normal object as JSON', () => {
		expect(JSON.parse(serializeAuditPayload({ state: { message: 'hi' } }))).toEqual({
			state: { message: 'hi' },
		});
	});

	it('A3: caps an oversized payload with a marked preview', () => {
		const payload = { text: 'x'.repeat(MAX_AUDIT_PAYLOAD_CHARS + 500) };
		const parsed = JSON.parse(serializeAuditPayload(payload));
		expect(parsed.truncated).toBe(true);
		expect(parsed.chars).toBeGreaterThan(MAX_AUDIT_PAYLOAD_CHARS);
		expect(parsed.preview.length).toBe(MAX_AUDIT_PAYLOAD_CHARS);
	});

	it('A4: survives circular references', () => {
		const payload = { name: 'loop' };
		payload.self = payload;
		expect(JSON.parse(serializeAuditPayload(payload))).toEqual({
			error: 'serialization_failed',
		});
	});

	it('A5: keeps a payload exactly at the limit untruncated', () => {
		const exact = 'y'.repeat(MAX_AUDIT_PAYLOAD_CHARS - 2);
		const parsed = JSON.parse(serializeAuditPayload(exact));
		expect(typeof parsed).toBe('string');
		expect(parsed).toHaveLength(exact.length);
	});
});
