import { describe, expect, it } from 'vitest';
import { buildStreakGrid } from './learning';

// Sunday 2026-09-20; the window ends on the week containing "today".
const TODAY = new Date(2026, 8, 20);

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
