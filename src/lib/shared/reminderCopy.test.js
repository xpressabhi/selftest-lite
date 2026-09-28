import { describe, expect, it } from 'vitest';
import { REMINDER_COPY, getReminderCopy, normalizeReminderLanguage } from './reminderCopy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2026, 0, 1);

describe('normalizeReminderLanguage', () => {
	it('maps hi/hindi to hi and everything else to en', () => {
		expect(normalizeReminderLanguage('hi')).toBe('hi');
		expect(normalizeReminderLanguage('hindi')).toBe('hi');
		expect(normalizeReminderLanguage('en')).toBe('en');
		expect(normalizeReminderLanguage('english')).toBe('en');
		expect(normalizeReminderLanguage(null)).toBe('en');
		expect(normalizeReminderLanguage('fr')).toBe('en');
	});
});

describe('getReminderCopy', () => {
	it('keeps one variant for the whole day and rotates the next day', () => {
		const morning = getReminderCopy('en', new Date(BASE));
		const evening = getReminderCopy('en', new Date(BASE + 20 * 60 * 60 * 1000));
		const nextDay = getReminderCopy('en', new Date(BASE + DAY_MS));
		expect(evening).toEqual(morning);
		expect(nextDay.title).not.toBe(morning.title);
	});

	it('cycles through every English variant across the rotation', () => {
		const seen = new Set();
		for (let index = 0; index < REMINDER_COPY.en.length; index += 1) {
			seen.add(getReminderCopy('en', new Date(BASE + index * DAY_MS)).title);
		}
		expect(seen.size).toBe(REMINDER_COPY.en.length);
	});

	it('serves the Hindi table to Hindi subscribers', () => {
		const copy = getReminderCopy('hindi', new Date(BASE));
		expect(REMINDER_COPY.hi).toContainEqual(copy);
	});

	it('falls back to English for unknown languages and unusable dates', () => {
		expect(REMINDER_COPY.en).toContainEqual(getReminderCopy('de', new Date(BASE)));
		expect(REMINDER_COPY.en).toContainEqual(getReminderCopy('en', new Date('not-a-date')));
	});

	it('keeps both languages complete and aligned', () => {
		for (const variants of Object.values(REMINDER_COPY)) {
			expect(variants.length).toBeGreaterThanOrEqual(6);
			for (const variant of variants) {
				expect(variant.title.trim().length).toBeGreaterThan(0);
				expect(variant.body.trim().length).toBeGreaterThan(0);
			}
		}
		expect(REMINDER_COPY.hi.length).toBe(REMINDER_COPY.en.length);
	});
});
