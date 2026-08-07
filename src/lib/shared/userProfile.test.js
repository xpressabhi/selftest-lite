import { describe, expect, it } from 'vitest';
import {
	createDefaultProfile,
	normalizeProfile,
	parseProfileStateValue,
} from './userProfile';

describe('normalizeProfile', () => {
	it('normalizes a valid profile', () => {
		const profile = normalizeProfile({
			class: 'class-10',
			examTarget: { examId: 'jee-main', name: 'JEE Main' },
			subjects: ['Physics', 'physics', '', 'Maths'],
			preferences: {
				language: 'hindi',
				difficultyComfort: 'advanced',
				personalized: true,
			},
			declaredFocus: ['Trigonometry', 'trigonometry'],
		});
		expect(profile).toMatchObject({
			version: 1,
			setupComplete: false,
			class: 'class-10',
			examTarget: { examId: 'jee-main', name: 'JEE Main' },
			subjects: ['Physics', 'Maths'],
			declaredFocus: ['Trigonometry'],
		});
		expect(profile.preferences).toEqual({
			language: 'hindi',
			difficultyComfort: 'advanced',
			personalized: true,
		});
	});

	it('rejects invalid values and invalid classes', () => {
		const profile = normalizeProfile({
			class: 'class-99',
			examTarget: { name: 'no id' },
			preferences: { language: 'french' },
		});
		expect(profile.class).toBe(null);
		expect(profile.examTarget).toBe(null);
		expect(profile.preferences.language).toBe(null);
	});

	it('caps focus topics and subject lists', () => {
		const many = Array.from({ length: 30 }, (_, i) => `topic-${i}`);
		const profile = normalizeProfile({
			subjects: many,
			declaredFocus: many,
			preferences: {},
		});
		expect(profile.subjects).toHaveLength(12);
		expect(profile.declaredFocus).toHaveLength(10);
	});

	it('returns null for non-objects', () => {
		expect(normalizeProfile(null)).toBe(null);
		expect(normalizeProfile('nope')).toBe(null);
		expect(normalizeProfile([])).toBe(null);
	});
});

describe('parseProfileStateValue', () => {
	it('parses JSON strings (localStorage)', () => {
		const value = JSON.stringify({ class: 'class-12', preferences: {} });
		expect(parseProfileStateValue(value)?.class).toBe('class-12');
	});

	it('passes through JSONB objects (server rows)', () => {
		const value = { class: 'class-12', preferences: {} };
		expect(parseProfileStateValue(value)?.class).toBe('class-12');
	});

	it('returns null for malformed input', () => {
		expect(parseProfileStateValue('{not json')).toBe(null);
		expect(parseProfileStateValue(42)).toBe(null);
	});

	it('round-trips the default profile', () => {
		const defaultProfile = createDefaultProfile();
		const parsed = parseProfileStateValue(JSON.stringify(defaultProfile));
		expect(parsed).toMatchObject({
			version: 1,
			setupComplete: false,
			class: null,
			examTarget: null,
			subjects: [],
			declaredFocus: [],
		});
	});
});
