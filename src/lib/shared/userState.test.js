import { describe, expect, it } from 'vitest';
import { mergeStateSnapshots } from './userState';

describe('mergeStateSnapshots (streak)', () => {
	it('takes the newer side for the live streak and never shrinks the rest', () => {
		const remote = {
			lastActiveDate: '2026-09-24',
			currentStreak: 4,
			longestStreak: 6,
			freezesRemaining: 1,
			totalQuizDays: 12,
			streakHistory: [
				{ date: '2026-09-23', quizCount: 1 },
				{ date: '2026-09-24', quizCount: 2 },
			],
		};
		const local = {
			lastActiveDate: '2026-09-22',
			currentStreak: 2,
			longestStreak: 9,
			freezesRemaining: 2,
			totalQuizDays: 20,
			streakHistory: [
				{ date: '2026-09-21', quizCount: 1 },
				{ date: '2026-09-22', quizCount: 1 },
			],
		};
		const merged = mergeStateSnapshots(
			{ selftest_streak: remote },
			{ selftest_streak: local }
		);
		const streak = JSON.parse(merged.selftest_streak);
		expect(streak.lastActiveDate).toBe('2026-09-24');
		expect(streak.currentStreak).toBe(4);
		expect(streak.longestStreak).toBe(9);
		expect(streak.totalQuizDays).toBe(20);
		expect(streak.streakHistory.map((entry) => entry.date)).toEqual([
			'2026-09-21',
			'2026-09-22',
			'2026-09-23',
			'2026-09-24',
		]);
	});

	it('dedupes the same day across devices with the larger count', () => {
		const merged = mergeStateSnapshots(
			{
				selftest_streak: {
					lastActiveDate: '2026-09-24',
					currentStreak: 1,
					streakHistory: [{ date: '2026-09-24', quizCount: 1 }],
				},
			},
			{
				selftest_streak: {
					lastActiveDate: '2026-09-24',
					currentStreak: 3,
					streakHistory: [{ date: '2026-09-24', quizCount: 3 }],
				},
			}
		);
		const streak = JSON.parse(merged.selftest_streak);
		expect(streak.currentStreak).toBe(3);
		expect(streak.streakHistory).toEqual([{ date: '2026-09-24', quizCount: 3 }]);
	});

	it('keeps whichever side exists, and nothing when both are missing', () => {
		const onlyRemote = mergeStateSnapshots(
			{ selftest_streak: { currentStreak: 5 } },
			{}
		);
		expect(JSON.parse(onlyRemote.selftest_streak).currentStreak).toBe(5);

		const onlyLocal = mergeStateSnapshots(
			{},
			{ selftest_streak: { currentStreak: 2 } }
		);
		expect(JSON.parse(onlyLocal.selftest_streak).currentStreak).toBe(2);

		const empty = mergeStateSnapshots({}, {});
		expect(empty.selftest_streak).toBeUndefined();
	});

	it('drops malformed history entries and caps the window at 90 days', () => {
		const history = Array.from({ length: 120 }, (_, index) => ({
			date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
			quizCount: 1,
		}));
		const merged = mergeStateSnapshots(
			{ selftest_streak: { lastActiveDate: '2026-09-24', streakHistory: history } },
			{ selftest_streak: { streakHistory: [{ date: 'not-a-date' }, null] } }
		);
		const streak = JSON.parse(merged.selftest_streak);
		expect(streak.streakHistory.length).toBeLessThanOrEqual(90);
		expect(streak.streakHistory.every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date))).toBe(
			true
		);
	});
});
