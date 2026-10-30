import { describe, expect, it } from 'vitest';
import { buildAdminSearch, parseAdminState } from './adminState.js';

// These cases are the ways a hand-edited or stale admin URL could open the
// wrong view, crash the page, or smuggle an oversized filter into SQL.
describe('admin URL state', () => {
	it('falls back safely when the tab is unknown', () => {
		expect(parseAdminState('?tab=not-real').tab).toBe('overview');
		expect(parseAdminState('').tab).toBe('overview');
	});

	it('accepts only the supported duration presets', () => {
		expect(parseAdminState('').days).toBe(1);
		expect(parseAdminState('?days=7').days).toBe(7);
		expect(parseAdminState('?days=0').days).toBe(0);
		expect(parseAdminState('?days=13').days).toBe(1);
		expect(parseAdminState('?days=nope').days).toBe(1);
	});

	it('treats compare as on unless explicitly disabled', () => {
		expect(parseAdminState('').compare).toBe(true);
		expect(parseAdminState('?compare=0').compare).toBe(false);
		expect(parseAdminState('?compare=false').compare).toBe(true);
	});

	it('caps free-text search and rejects unknown status classes', () => {
		const state = parseAdminState(
			`?q=${'x'.repeat(200)}&status=9xx&country=${'c'.repeat(200)}`
		);
		expect(state.q).toHaveLength(80);
		expect(state.country).toHaveLength(100);
		expect(state.status).toBe('');
	});

	it('keeps log filters only on the logs tab', () => {
		const query = buildAdminSearch({
			tab: 'logs',
			days: 30,
			route: '/api/generate',
			status: '5xx',
			q: 'timeout',
		});
		const params = new URLSearchParams(query);
		expect(params.get('tab')).toBe('logs');
		expect(params.get('days')).toBe('30');
		expect(params.get('route')).toBe('/api/generate');
		expect(params.get('status')).toBe('5xx');
		expect(params.get('q')).toBe('timeout');

		const other = new URLSearchParams(buildAdminSearch({ tab: 'traffic', route: '/x' }));
		expect(other.get('route')).toBeNull();
	});

	it('round-trips a valid state without changing it', () => {
		const state = parseAdminState('?tab=health&days=0&compare=0&window=900');
		expect(state).toMatchObject({
			tab: 'health',
			days: 0,
			compare: false,
			window: 900,
		});
		const roundTrip = parseAdminState(buildAdminSearch(state));
		expect(roundTrip).toEqual(state);
	});
});
