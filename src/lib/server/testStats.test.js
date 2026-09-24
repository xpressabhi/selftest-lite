import { describe, expect, it } from 'vitest';
import {
	buildPublicScores,
	buildVisitIdentityKey,
	resolveDisplayName,
	sanitizeDisplayName,
} from './testStats';

describe('buildVisitIdentityKey', () => {
	it('prefers a signed-in user over the device id', () => {
		expect(buildVisitIdentityKey({ userId: 7, clientId: 'c-abcdefgh' })).toBe('u:7');
	});

	it('falls back to a device id when signed out', () => {
		expect(buildVisitIdentityKey({ clientId: 'c-abcdefgh' })).toBe('c:c-abcdefgh');
	});

	it('returns null without a usable identity', () => {
		expect(buildVisitIdentityKey({})).toBeNull();
		expect(buildVisitIdentityKey({ userId: 0, clientId: '' })).toBeNull();
		expect(buildVisitIdentityKey({ userId: 'nope' })).toBeNull();
		// Device ids shorter than the app's minimum are rejected, not credited.
		expect(buildVisitIdentityKey({ clientId: 'short' })).toBeNull();
	});

	it('caps device ids at 64 characters', () => {
		expect(buildVisitIdentityKey({ clientId: 'c'.repeat(90) })).toBe(`c:${'c'.repeat(64)}`);
	});
});

describe('sanitizeDisplayName', () => {
	it('trims and caps at 40 characters', () => {
		expect(sanitizeDisplayName('  Ravi  ')).toBe('Ravi');
		expect(sanitizeDisplayName('x'.repeat(80))).toHaveLength(40);
	});

	it('strips control characters and rejects blanks', () => {
		expect(sanitizeDisplayName('Ra\u0000vi\u001f')).toBe('Ravi');
		expect(sanitizeDisplayName('   ')).toBeNull();
		expect(sanitizeDisplayName(null)).toBeNull();
		expect(sanitizeDisplayName(42)).toBeNull();
	});
});

describe('resolveDisplayName', () => {
	it('prefers the profile name, then the challenge name', () => {
		expect(resolveDisplayName({ userName: 'Asha', challengeName: 'Ravi' })).toBe('Asha');
		expect(resolveDisplayName({ userName: '  ', challengeName: ' Ravi ' })).toBe('Ravi');
		expect(resolveDisplayName({})).toBeNull();
	});

	it('sanitizes both sources', () => {
		expect(resolveDisplayName({ userName: 'y'.repeat(60) })).toHaveLength(40);
		expect(resolveDisplayName({ challengeName: 'Ra\u0000vi' })).toBe('Ravi');
	});
});

function row(overrides = {}) {
	return {
		identity_key: 'c:a',
		user_name: null,
		display_name: null,
		score: 5,
		total_questions: 10,
		created_at: '2026-09-20T10:00:00.000Z',
		...overrides,
	};
}

describe('buildPublicScores', () => {
	it('keeps only the latest attempt per identity', () => {
		const scores = buildPublicScores({
			rows: [
				row({ score: 3, created_at: '2026-09-20T10:00:00.000Z' }),
				row({ score: 7, created_at: '2026-09-21T10:00:00.000Z' }),
			],
		});
		expect(scores).toHaveLength(1);
		expect(scores[0]).toMatchObject({ score: 7, total: 10 });
	});

	it('clamps scores into 0..total and drops unusable or anonymous rows', () => {
		const scores = buildPublicScores({
			rows: [
				row({ identity_key: 'c:a', score: 99 }),
				row({ identity_key: 'c:b', score: -3 }),
				row({ identity_key: 'c:c', score: 4, total_questions: 0 }),
				row({ identity_key: null, score: 5 }),
				row({ identity_key: 'c:d', score: Number.NaN }),
			],
		});
		expect(scores.map((entry) => entry.score)).toEqual([10, 0]);
	});

	it('sorts by score, breaks ties by earliest, and caps the list', () => {
		const rows = Array.from({ length: 60 }, (_, index) =>
			row({
				identity_key: `c:user-${index}`,
				score: index,
				total_questions: 60,
				created_at: `2026-09-${String((index % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
			})
		);
		const scores = buildPublicScores({ rows, limit: 50 });
		expect(scores).toHaveLength(50);
		expect(scores[0].score).toBe(59);
		expect(scores[49].score).toBe(10);
	});

	it('marks the viewer and resolves names with a null anonymous fallback', () => {
		const scores = buildPublicScores({
			rows: [
				row({ identity_key: 'u:7', user_name: 'Asha', score: 9 }),
				row({ identity_key: 'c:device-1', display_name: 'Ravi', score: 8 }),
				row({ identity_key: 'c:device-2', score: 7 }),
			],
			viewerKey: 'u:7',
		});
		expect(scores.map((entry) => entry.name)).toEqual(['Asha', 'Ravi', null]);
		expect(scores.map((entry) => entry.isMine)).toEqual([true, false, false]);
		expect(scores.map((entry) => entry.score)).toEqual([9, 8, 7]);
	});

	it('returns an empty list for missing rows', () => {
		expect(buildPublicScores({})).toEqual([]);
		expect(buildPublicScores({ rows: null })).toEqual([]);
	});
});
