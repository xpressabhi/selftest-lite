import { describe, expect, it } from 'vitest';
import { buildStreakGrid, buildStreakWeek, getStats, STREAK_MILESTONES } from './learning';

// Sunday 2026-09-20; the window ends on the week containing "today".
const TODAY = new Date(2026, 8, 20);

// Thursday 2026-09-24; the rolling strip covers Fri 18 .. Thu 24.
const WEEK_TODAY = new Date(2026, 8, 24);

describe('buildStreakGrid', () => {
	it('returns the requested number of Monday-aligned weeks', () => {
		const grid = buildStreakGrid([], { weeks: 2, today: TODAY, locale: 'en' });
		expect(grid.weeks).toHaveLength(2);
		expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
		expect(grid.weeks[0][0].date).toBe('2026-09-07');
		expect(grid.weeks[1][6].date).toBe('2026-09-20');
	});

	it('marks today and only the days after it as future', () => {
		// Thursday 2026-09-24: Mon..Sun column, today at index 3.
		const grid = buildStreakGrid([], { weeks: 1, today: new Date(2026, 8, 24), locale: 'en' });
		const column = grid.weeks[0];
		expect(column.map((cell) => cell.isFuture)).toEqual([
			false,
			false,
			false,
			false,
			true,
			true,
			true,
		]);
		expect(column.filter((cell) => cell.isToday)).toHaveLength(1);
		expect(column[3].isToday).toBe(true);
	});

	it('maps quiz counts and ignores malformed or out-of-window entries', () => {
		const grid = buildStreakGrid(
			[
				{ date: '2026-09-19', quizCount: 2 },
				{ date: '2026-09-20', quizCount: 1 },
				{ date: '2026-08-01', quizCount: 9 },
				{ date: 'not-a-date', quizCount: 4 },
				{ quizCount: 3 },
				null,
			],
			{ weeks: 2, today: TODAY, locale: 'en' }
		);
		const cells = grid.weeks.flat();
		expect(cells.find((cell) => cell.date === '2026-09-19')).toMatchObject({
			quizCount: 2,
			active: true,
			isToday: false,
		});
		expect(cells.find((cell) => cell.date === '2026-09-20')).toMatchObject({
			quizCount: 1,
			active: true,
			isToday: true,
		});
		expect(cells.filter((cell) => cell.active)).toHaveLength(2);
		expect(cells.some((cell) => cell.date === '2026-08-01')).toBe(false);
	});

	it('treats a zero count as inactive', () => {
		const grid = buildStreakGrid([{ date: '2026-09-20', quizCount: 0 }], {
			weeks: 1,
			today: TODAY,
			locale: 'en',
		});
		expect(grid.weeks[0][6]).toMatchObject({ quizCount: 0, active: false });
	});

	it('labels a month only where it changes', () => {
		const grid = buildStreakGrid([], { weeks: 8, today: TODAY, locale: 'en' });
		expect(grid.monthLabels).toEqual([
			{ index: 0, label: 'Jul' },
			{ index: 1, label: 'Aug' },
			{ index: 6, label: 'Sep' },
		]);
	});

	it('localizes month labels', () => {
		const grid = buildStreakGrid([], { weeks: 8, today: TODAY, locale: 'hi-IN' });
		expect(grid.monthLabels[0].label).not.toBe('Jul');
	});

	it('handles empty and non-array history', () => {
		expect(() => buildStreakGrid(null, { weeks: 2, today: TODAY })).not.toThrow();
		const grid = buildStreakGrid(undefined, { weeks: 2, today: TODAY, locale: 'en' });
		expect(grid.weeks.flat().every((cell) => !cell.active)).toBe(true);
	});
});

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
