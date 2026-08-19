import { describe, expect, it } from 'vitest';
import { mergeStateSnapshots, validateStateValue, isSyncedStateKey } from '../shared/userState';
import { mergeRemoteAttemptsIntoHistory } from './sync.js';
import { normalizeClientId } from '../server/auth.js';
import { normalizeUserIdValue } from '../server/storage.js';

describe('storage (normalizeUserIdValue)', () => {
	it('rejects null/undefined/empty (must not become 0)', () => {
		expect(normalizeUserIdValue(null)).toBeNull();
		expect(normalizeUserIdValue(undefined)).toBeNull();
		expect(normalizeUserIdValue('')).toBeNull();
		expect(normalizeUserIdValue(0)).toBeNull();
		expect(normalizeUserIdValue(-5)).toBeNull();
		expect(normalizeUserIdValue(NaN)).toBeNull();
	});

	it('accepts positive integers and numeric strings', () => {
		expect(normalizeUserIdValue(42)).toBe(42);
		expect(normalizeUserIdValue('42')).toBe(42);
		expect(normalizeUserIdValue('42.0')).toBe(42);
	});

	it('rejects non-numeric values', () => {
		expect(normalizeUserIdValue('abc')).toBeNull();
		expect(normalizeUserIdValue({})).toBeNull();
		expect(normalizeUserIdValue([])).toBeNull();
		expect(normalizeUserIdValue(42.5)).toBeNull();
	});
});

describe('sync (mergeRemoteAttemptsIntoHistory)', () => {
	it('returns history unchanged when there are no remote attempts', () => {
		const history = [{ id: 1, topic: 'Physics' }];
		expect(mergeRemoteAttemptsIntoHistory(history, [])).toEqual(history);
	});

	it('merges a remote attempt into history keyed by test id', () => {
		const merged = mergeRemoteAttemptsIntoHistory(
			[],
			[
				{
					testId: 42,
					test: { topic: 'Chemistry' },
					userAnswers: { 0: 'A' },
					score: 8,
					totalQuestions: 10,
					timeTaken: 300,
					submittedAt: '2026-08-01T10:00:00.000Z',
				},
			]
		);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({
			id: 42,
			topic: 'Chemistry',
			userAnswers: { 0: 'A' },
			score: 8,
			totalQuestions: 10,
			timeTaken: 300,
		});
		expect(merged[0].timestamp).toBe(new Date('2026-08-01T10:00:00.000Z').getTime());
	});

	it('prefers the newer submitted attempt for the same test id', () => {
		const history = [
			{
				id: 42,
				topic: 'Old',
				userAnswers: { 0: 'B' },
				score: 5,
				timestamp: new Date('2026-07-01T10:00:00.000Z').getTime(),
			},
		];
		const merged = mergeRemoteAttemptsIntoHistory(history, [
			{
				testId: 42,
				test: { topic: 'New' },
				userAnswers: { 0: 'A' },
				score: 9,
				totalQuestions: 10,
				timeTaken: 120,
				submittedAt: '2026-08-01T10:00:00.000Z',
			},
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0].topic).toBe('New');
		expect(merged[0].score).toBe(9);
	});

	it('keeps the local entry when it is newer than the remote attempt', () => {
		const history = [
			{
				id: 42,
				topic: 'Local Newer',
				userAnswers: { 0: 'B' },
				score: 7,
				timestamp: new Date('2026-09-01T10:00:00.000Z').getTime(),
			},
		];
		const merged = mergeRemoteAttemptsIntoHistory(history, [
			{
				testId: 42,
				test: { topic: 'Remote Older' },
				userAnswers: { 0: 'A' },
				score: 9,
				totalQuestions: 10,
				timeTaken: 120,
				submittedAt: '2026-08-01T10:00:00.000Z',
			},
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0].topic).toBe('Local Newer');
	});

	it('skips remote attempts without a valid test payload', () => {
		const merged = mergeRemoteAttemptsIntoHistory(
			[],
			[
				{ testId: 0, test: null },
				{ testId: 'abc', test: {} },
				{ testId: 7, test: null },
			]
		);
		expect(merged).toHaveLength(0);
	});
});

describe('auth (normalizeClientId)', () => {
	it('accepts a well-formed client id', () => {
		expect(normalizeClientId('c-3f2a1b4c-9d8e-4f7a-8b2c-1d2e3f4a5b6c')).toBe(
			'c-3f2a1b4c-9d8e-4f7a-8b2c-1d2e3f4a5b6c'
		);
	});

	it('rejects values that are too short, too long, or contain invalid characters', () => {
		expect(normalizeClientId('short')).toBeNull();
		expect(normalizeClientId('x'.repeat(65))).toBeNull();
		expect(normalizeClientId('bad id with spaces')).toBeNull();
		expect(normalizeClientId('bad<script>')).toBeNull();
	});

	it('rejects non-strings and trims surrounding whitespace', () => {
		expect(normalizeClientId(null)).toBeNull();
		expect(normalizeClientId(42)).toBeNull();
		expect(normalizeClientId(undefined)).toBeNull();
		expect(normalizeClientId('  c-123456789012345678901234567890  ')).toBe(
			'c-123456789012345678901234567890'
		);
	});
});

describe('userState (mergeStateSnapshots)', () => {
	const EXAMS = 'selftest_bookmarked_exams';
	const PRESETS = 'selftest_bookmarked_quiz_presets';
	const BOOKMARKS = 'selftest_bookmarks';

	it('unions bookmarked exam ids without duplicates', () => {
		const remote = { [EXAMS]: JSON.stringify(['a', 'b']) };
		const local = { [EXAMS]: JSON.stringify(['b', 'c']) };
		const merged = mergeStateSnapshots(remote, local);
		expect(JSON.parse(merged[EXAMS])).toEqual(['b', 'c', 'a']);
	});

	it('caps bookmarked exam ids at 20', () => {
		const local = { [EXAMS]: JSON.stringify(Array.from({ length: 20 }, (_, i) => `e${i}`)) };
		const remote = { [EXAMS]: JSON.stringify(['extra']) };
		const merged = mergeStateSnapshots(remote, local);
		expect(JSON.parse(merged[EXAMS])).toHaveLength(20);
		expect(JSON.parse(merged[EXAMS])).not.toContain('extra');
	});

	it('merges quiz presets deduped by preset key', () => {
		const remote = {
			[PRESETS]: JSON.stringify([
				{ id: 'p1', key: 'k1', label: 'A' },
				{ id: 'p2', key: 'k2', label: 'B' },
			]),
		};
		const local = {
			[PRESETS]: JSON.stringify([
				{ id: 'p3', key: 'k2', label: 'B-updated' },
				{ id: 'p4', key: 'k3', label: 'C' },
			]),
		};
		const merged = mergeStateSnapshots(remote, local);
		const presets = JSON.parse(merged[PRESETS]);
		expect(presets).toHaveLength(3);
		// Local value wins for the duplicate key and keeps local order first.
		expect(presets[0]).toMatchObject({ id: 'p3', key: 'k2' });
	});

	it('merges question bookmarks deduped by question+answer', () => {
		const remote = {
			[BOOKMARKS]: JSON.stringify([{ question: 'Q1', answer: 'A1', bookmarkedAt: 1 }]),
		};
		const local = {
			[BOOKMARKS]: JSON.stringify([
				{ question: 'Q1', answer: 'A1', bookmarkedAt: 2 },
				{ question: 'Q2', answer: 'A2', bookmarkedAt: 3 },
			]),
		};
		const merged = mergeStateSnapshots(remote, local);
		const bookmarks = JSON.parse(merged[BOOKMARKS]);
		expect(bookmarks).toHaveLength(2);
		expect(bookmarks[0]).toMatchObject({ question: 'Q1', bookmarkedAt: 2 });
	});

	it('keeps local value when only local exists', () => {
		const local = { [EXAMS]: JSON.stringify(['a']) };
		const merged = mergeStateSnapshots({}, local);
		expect(JSON.parse(merged[EXAMS])).toEqual(['a']);
	});

	it('ignores malformed remote values', () => {
		const remote = { [EXAMS]: 'not-json', [PRESETS]: JSON.stringify({ nope: true }) };
		const local = { [EXAMS]: JSON.stringify(['a']) };
		const merged = mergeStateSnapshots(remote, local);
		expect(JSON.parse(merged[EXAMS])).toEqual(['a']);
	});

	it('merges remote values that arrive as parsed objects (server JSONB)', () => {
		const remote = { [EXAMS]: ['a', 'b'] };
		const local = { [EXAMS]: JSON.stringify(['b', 'c']) };
		const merged = mergeStateSnapshots(remote, local);
		expect(JSON.parse(merged[EXAMS])).toEqual(['b', 'c', 'a']);
	});

	it('keeps the profile with the newer updatedAt', () => {
		const PROFILE = 'selftest_user_profile';
		const remote = {
			[PROFILE]: {
				version: 1,
				setupComplete: true,
				class: 'class-10',
				preferences: { personalized: true },
				updatedAt: '2026-08-07T12:00:00.000Z',
			},
		};
		const local = {
			[PROFILE]: JSON.stringify({
				version: 1,
				setupComplete: true,
				class: 'class-12',
				preferences: { personalized: true },
				updatedAt: '2026-08-07T10:00:00.000Z',
			}),
		};
		const merged = mergeStateSnapshots(remote, local);
		expect(JSON.parse(merged[PROFILE]).class).toBe('class-10');
	});

	it('keeps the profile with the newer updatedAt (local wins)', () => {
		const PROFILE = 'selftest_user_profile';
		const remote = {
			[PROFILE]: {
				version: 1,
				setupComplete: true,
				class: 'class-10',
				preferences: { personalized: true },
				updatedAt: '2026-08-07T10:00:00.000Z',
			},
		};
		const local = {
			[PROFILE]: JSON.stringify({
				version: 1,
				setupComplete: true,
				class: 'class-12',
				preferences: { personalized: true },
				updatedAt: '2026-08-07T12:00:00.000Z',
			}),
		};
		const merged = mergeStateSnapshots(remote, local);
		expect(JSON.parse(merged[PROFILE]).class).toBe('class-12');
	});
});

describe('userState (validateStateValue)', () => {
	it('only accepts whitelisted keys', () => {
		expect(validateStateValue('[]', 'selftest_bookmarks')).toBe('[]');
		expect(validateStateValue('[]', 'selftest_secret_data')).toBeNull();
		expect(isSyncedStateKey('selftest_bookmarked_exams')).toBe(true);
		expect(isSyncedStateKey('selftest_history')).toBe(false);
	});

	it('accepts JSON strings and objects, rejects scalars and invalid JSON', () => {
		expect(validateStateValue('[]', 'selftest_bookmarks')).toBe('[]');
		expect(validateStateValue({ question: 'Q' }, 'selftest_bookmarks')).toBe(
			JSON.stringify({ question: 'Q' })
		);
		expect(validateStateValue('42', 'selftest_bookmarks')).toBeNull();
		expect(validateStateValue('"hello"', 'selftest_bookmarks')).toBeNull();
		expect(validateStateValue('{broken', 'selftest_bookmarks')).toBeNull();
	});

	it('rejects oversized values', () => {
		const huge = JSON.stringify(new Array(60000).fill('x'));
		expect(huge.length).toBeGreaterThan(96 * 1024);
		expect(validateStateValue(huge, 'selftest_bookmarks')).toBeNull();
	});
});
