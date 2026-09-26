import { describe, expect, it } from 'vitest';
import {
	DEFAULT_REMINDER_TIMEZONE,
	DUE_SUBSCRIPTION_PARAMS,
	DUE_SUBSCRIPTIONS_SQL,
	REMINDER_DEFAULT_HOUR,
	REMINDER_MIN_GAP_HOURS,
	REMINDER_QUIET_HOUR,
	parseReminderHour,
} from './reminders';

describe('parseReminderHour', () => {
	it('returns null (smart default) for absent or empty values', () => {
		for (const value of [null, undefined, '']) {
			expect(parseReminderHour(value)).toBe(null);
		}
	});

	it('accepts every integer hour in 0-23, including the 0/23 boundaries', () => {
		for (const value of [0, 7, 23]) {
			expect(parseReminderHour(value)).toBe(value);
		}
		expect(parseReminderHour('7')).toBe(7);
		expect(parseReminderHour('07')).toBe(7);
		expect(parseReminderHour('7.0')).toBe(7);
	});

	it('returns undefined for out-of-range, fractional and non-numeric values', () => {
		for (const value of [
			24,
			-1,
			1.5,
			'abc',
			'7.5',
			NaN,
			Infinity,
			-Infinity,
			true,
			false,
			{},
			[],
		]) {
			expect(parseReminderHour(value)).toBe(undefined);
		}
	});

	it('coerces whitespace strings the way Number() does (quirk)', () => {
		// Number(' 7 ') === 7 and Number(' ') === 0, so whitespace-only input
		// silently means midnight. Pinned so a fix has to be deliberate.
		expect(parseReminderHour(' 7 ')).toBe(7);
		expect(parseReminderHour(' ')).toBe(0);
	});
});

describe('scheduling constants', () => {
	it('keeps the catch-up window bounds and the minimum send gap', () => {
		expect(REMINDER_DEFAULT_HOUR).toBe(7);
		expect(REMINDER_QUIET_HOUR).toBe(22);
		expect(REMINDER_MIN_GAP_HOURS).toBe(20);
		expect(DEFAULT_REMINDER_TIMEZONE).toBe('Asia/Kolkata');
	});

	it('pairs the SQL placeholders with exactly the exported params', () => {
		expect(DUE_SUBSCRIPTION_PARAMS).toEqual([
			REMINDER_DEFAULT_HOUR,
			REMINDER_MIN_GAP_HOURS,
			DEFAULT_REMINDER_TIMEZONE,
			REMINDER_QUIET_HOUR,
		]);
		for (const placeholder of ['$1', '$2', '$3', '$4']) {
			expect(DUE_SUBSCRIPTIONS_SQL).toContain(placeholder);
		}
		expect(DUE_SUBSCRIPTIONS_SQL).not.toMatch(/\$5\b/);
		// The due-window contract the sender and the query must agree on: a
		// subscription is due from its slot (chosen hour, or the smart default)
		// until the quiet hour, subject to the minimum gap.
		expect(DUE_SUBSCRIPTIONS_SQL).toContain('enabled = TRUE');
		expect(DUE_SUBSCRIPTIONS_SQL).toContain('COALESCE(reminder_hour, $1::int)');
		expect(DUE_SUBSCRIPTIONS_SQL).toContain('last_sent_at');
		expect(DUE_SUBSCRIPTIONS_SQL).toContain('local_minute');
	});
});
