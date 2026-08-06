import { describe, expect, it } from 'vitest';
import { MAX_EVENTS_PER_REQUEST, TELEMETRY_EVENTS, validateTelemetryPayload } from './telemetry';

describe('validateTelemetryPayload', () => {
	it('rejects non-object payloads', () => {
		for (const body of [null, undefined, 'text', 42, [], [{}]]) {
			const result = validateTelemetryPayload(body);
			expect(result.status).toBe(400);
		}
	});

	it('rejects payloads without events', () => {
		expect(validateTelemetryPayload({}).status).toBe(400);
		expect(validateTelemetryPayload({ events: [] }).status).toBe(400);
		expect(validateTelemetryPayload({ events: 'nope' }).status).toBe(400);
	});

	it('rejects payloads with too many events', () => {
		const events = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => ({
			event: 'page:view',
		}));
		const result = validateTelemetryPayload({ events });
		expect(result.status).toBe(413);
	});

	it('accepts valid events and returns normalized shape', () => {
		const result = validateTelemetryPayload({
			sessionId: 'abc-123',
			events: [
				{ event: 'page:view', page: '/', props: { x: 1 } },
				{ event: 'test:answer', page: '/test?id=5', props: { q: 3 } },
			],
		});
		expect(result.events).toHaveLength(2);
		expect(result.events[0]).toMatchObject({
			event: 'page:view',
			page: '/',
			props: { x: 1 },
			sessionId: 'abc-123',
		});
	});

	it('drops unknown events but keeps valid ones', () => {
		const result = validateTelemetryPayload({
			events: [
				{ event: 'page:view' },
				{ event: 'not:a-real-event' },
				{ event: '' },
				{ event: 'a'.repeat(65) },
			],
		});
		expect(result.events).toHaveLength(1);
		expect(result.events[0].event).toBe('page:view');
	});

	it('rejects everything when all events are invalid', () => {
		const result = validateTelemetryPayload({ events: [{ event: 'bogus' }, { event: 42 }] });
		expect(result.status).toBe(400);
	});

	it('drops oversized props', () => {
		const result = validateTelemetryPayload({
			events: [{ event: 'page:view', props: { big: 'x'.repeat(3000) } }],
		});
		expect(result.events[0].props).toEqual({});
	});

	it('rejects invalid props types', () => {
		const result = validateTelemetryPayload({
			events: [
				{ event: 'page:view', props: 'not-an-object' },
				{ event: 'page:view', props: [1, 2] },
			],
		});
		expect(result.events).toHaveLength(2);
		expect(result.events[0].props).toEqual({});
		expect(result.events[1].props).toEqual({});
	});

	it('normalizes invalid page and session values to null', () => {
		const result = validateTelemetryPayload({
			sessionId: 'x'.repeat(100),
			events: [{ event: 'page:view', page: 42, props: null }],
		});
		expect(result.events[0]).toMatchObject({ page: null, props: {}, sessionId: null });
	});

	it('accepts valid created_at and drops invalid ones', () => {
		const result = validateTelemetryPayload({
			events: [
				{ event: 'page:view', created_at: '2026-08-06T10:00:00.000Z' },
				{ event: 'page:view', created_at: 'not-a-date' },
			],
		});
		expect(result.events[0].created_at).toBe('2026-08-06T10:00:00.000Z');
		expect(result.events[1].created_at).toBeUndefined();
	});

	it('allowlist covers all documented event families', () => {
		const expected = [
			'page:view',
			'setup:mode',
			'generate:start',
			'search:keystroke',
			'test:answer',
			'results:explain',
			'bookmark:add-exam',
			'history:view',
			'settings:theme-toggle',
			'pwa:install-accepted',
			'scroll:depth',
		];
		for (const event of expected) {
			expect(TELEMETRY_EVENTS.has(event)).toBe(true);
		}
	});
});
