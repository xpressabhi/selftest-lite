import { describe, expect, it } from 'vitest';
import { buildStreakWeek, getStats, STREAK_MILESTONES } from './learning';

// Thursday 2026-09-24; the rolling strip covers Fri 18 .. Thu 24.
const WEEK_TODAY = new Date(2026, 8, 24);

describe('buildStreakWeek', () => {
	it('returns seven cells ending today, oldest first', () => {
		const week = buildStreakWeek([], { today: WEEK_TODAY, locale: 'en' });
		expect(week).toHaveLength(7);
		expect(week.map((cell) => cell.date)).toEqual([
			'2026-09-18',
			'2026-09-19',
			'2026-09-20',
			'2026-09-21',
			'2026-09-22',
			'2026-09-23',
			'2026-09-24',
		]);
		expect(week[6].isToday).toBe(true);
		expect(week.filter((cell) => cell.isToday)).toHaveLength(1);
	});

	it('maps quiz counts to levels 0-3', () => {
		const week = buildStreakWeek(
			[
				{ date: '2026-09-20', quizCount: 1 },
				{ date: '2026-09-21', quizCount: 2 },
				{ date: '2026-09-22', quizCount: 3 },
				{ date: '2026-09-23', quizCount: 7 },
			],
			{ today: WEEK_TODAY, locale: 'en' }
		);
		const byDate = new Map(week.map((cell) => [cell.date, cell]));
		expect(byDate.get('2026-09-20')).toMatchObject({ quizCount: 1, level: 1, active: true });
		expect(byDate.get('2026-09-21')).toMatchObject({ quizCount: 2, level: 2, active: true });
		expect(byDate.get('2026-09-22')).toMatchObject({ quizCount: 3, level: 3, active: true });
		expect(byDate.get('2026-09-23')).toMatchObject({ quizCount: 7, level: 3, active: true });
		expect(byDate.get('2026-09-24')).toMatchObject({ quizCount: 0, level: 0, active: false });
	});

	it('ignores malformed, out-of-window and non-positive entries', () => {
		const week = buildStreakWeek(
			[
				{ date: '2026-09-17', quizCount: 5 },
				{ date: '2026-09-25', quizCount: 5 },
				{ date: 'not-a-date', quizCount: 4 },
				{ quizCount: 3 },
				null,
				{ date: '2026-09-20', quizCount: 0 },
				{ date: '2026-09-21', quizCount: -2 },
			],
			{ today: WEEK_TODAY, locale: 'en' }
		);
		expect(week.every((cell) => cell.level === 0 && !cell.active)).toBe(true);
	});

	it('labels weekdays per locale', () => {
		const en = buildStreakWeek([], { today: WEEK_TODAY, locale: 'en-IN' });
		expect(en[6].weekdayLabel).toBe('Thu');
		const hi = buildStreakWeek([], { today: WEEK_TODAY, locale: 'hi-IN' });
		expect(hi[6].weekdayLabel).not.toBe('Thu');
		expect(hi[6].weekdayLabel.length).toBeGreaterThan(0);
	});

	it('never mutates the input history', () => {
		const history = [{ date: '2026-09-24', quizCount: 2 }];
		const snapshot = JSON.stringify(history);
		buildStreakWeek(history, { today: WEEK_TODAY, locale: 'en' });
		expect(JSON.stringify(history)).toBe(snapshot);
	});

	it('handles empty and non-array history', () => {
		expect(() => buildStreakWeek(null, { today: WEEK_TODAY })).not.toThrow();
		expect(buildStreakWeek(undefined, { today: WEEK_TODAY }).every((cell) => !cell.active)).toBe(
			true
		);
	});
});

describe('getStats bestScore', () => {
	const attempt = (id, score, totalQuestions) => ({
		id,
		score,
		totalQuestions,
		userAnswers: {},
		timestamp: 1,
	});

	it('reports the best single-test accuracy in percent', () => {
		const stats = getStats([
			attempt('a', 3, 10),
			attempt('b', 9, 10),
			attempt('c', 1, 2),
		]);
		expect(stats.bestScore).toBe(90);
	});

	it('is 0 without completed tests', () => {
		expect(getStats([]).bestScore).toBe(0);
		expect(getStats([{ id: 'x', timestamp: 1 }]).bestScore).toBe(0);
	});
});

describe('STREAK_MILESTONES', () => {
	it('lists the four badge milestones in order', () => {
		expect(STREAK_MILESTONES).toEqual([3, 7, 30, 100]);
	});
});
