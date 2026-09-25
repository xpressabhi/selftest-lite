import { describe, expect, it } from 'vitest';
import {
	MAX_EXAM_NAME_LENGTH,
	MAX_FOCUS_TOPIC_LENGTH,
	PROFILE_VERSION,
	createDefaultProfile,
	isPersonalized,
	normalizeProfile,
	parseProfileStateValue,
} from './userProfile';

// Complements userProfile.test.js: normalization rules that are not covered
// there (profession coupling, opt-out handling, list trimming, exam target and
// timestamp normalization) plus the pure isPersonalized predicate.

describe('isPersonalized', () => {
	it('is false for missing profiles and explicitly opted-out ones', () => {
		expect(isPersonalized(null)).toBe(false);
		expect(isPersonalized(undefined)).toBe(false);
		expect(isPersonalized('profile')).toBe(false);
		expect(isPersonalized({ preferences: { personalized: false } })).toBe(false);
	});

	it('defaults to true when the flag is missing', () => {
		expect(isPersonalized(createDefaultProfile())).toBe(true);
		expect(isPersonalized({ preferences: {} })).toBe(true);
	});
});

describe('normalizeProfile class and profession rules', () => {
	it('keeps profession only for working professionals', () => {
		const professional = normalizeProfile({
			class: 'working-professional',
			profession: 'software-engineering',
			preferences: {},
		});
		expect(professional.profession).toBe('software-engineering');

		const student = normalizeProfile({
			class: 'class-12',
			profession: 'software-engineering',
			preferences: {},
		});
		expect(student.profession).toBe(null);
	});

	it('drops an invalid profession even for working professionals', () => {
		const profile = normalizeProfile({
			class: 'working-professional',
			profession: 'astronaut',
			preferences: {},
		});
		expect(profile.profession).toBe(null);
	});

	it('treats only an explicit personalized: false as opt-out', () => {
		const defaults = normalizeProfile({ class: 'class-10', preferences: {} });
		expect(defaults.preferences.personalized).toBe(true);

		const optedOut = normalizeProfile({
			class: 'class-10',
			preferences: { personalized: false, language: 'hindi' },
		});
		expect(optedOut.preferences.personalized).toBe(false);
		expect(isPersonalized(optedOut)).toBe(false);
	});

	it('drops opted-out profiles with no language or difficulty', () => {
		expect(
			normalizeProfile({
				preferences: { personalized: false, language: '', difficultyComfort: null },
			})
		).toBe(null);
		// The emptiness guard only inspects preferences: class, subjects and
		// examTarget do not rescue an opted-out profile. Pinned current
		// contract; flagged in review as possibly over-aggressive.
		expect(
			normalizeProfile({
				class: 'class-10',
				subjects: ['Physics'],
				examTarget: { examId: 'cbse-10' },
				preferences: { personalized: false },
			})
		).toBe(null);
		expect(
			normalizeProfile({ preferences: { personalized: 'nope', language: 'french' } }).preferences
				.personalized
		).toBe(true);
	});

	it('marks setupComplete only on a strict true', () => {
		expect(normalizeProfile({ preferences: {}, setupComplete: 'yes' }).setupComplete).toBe(false);
		expect(normalizeProfile({ preferences: {}, setupComplete: true }).setupComplete).toBe(true);
	});
});

describe('list normalization via subjects and declaredFocus', () => {
	it('trims, dedupes case-insensitively and drops non-strings', () => {
		const profile = normalizeProfile({
			subjects: ['  Physics ', 'physics', '', '   ', 42, null, 'Maths'],
			preferences: {},
		});
		expect(profile.subjects).toEqual(['Physics', 'Maths']);
	});

	it('caps each item at the focus-topic length', () => {
		const longItem = 'x'.repeat(MAX_FOCUS_TOPIC_LENGTH + 20);
		const profile = normalizeProfile({ declaredFocus: [longItem], preferences: {} });
		expect(profile.declaredFocus[0]).toHaveLength(MAX_FOCUS_TOPIC_LENGTH);
	});

	it('returns empty lists for non-array inputs', () => {
		const profile = normalizeProfile({
			subjects: 'Physics',
			declaredFocus: { 0: 'Trigonometry' },
			preferences: {},
		});
		expect(profile.subjects).toEqual([]);
		expect(profile.declaredFocus).toEqual([]);
	});
});

describe('examTarget normalization', () => {
	it('trims the exam target and caps the id and name lengths', () => {
		const profile = normalizeProfile({
			examTarget: { examId: `  ${'i'.repeat(120)}  `, name: `  ${'n'.repeat(150)}  ` },
			preferences: {},
		});
		expect(profile.examTarget.examId).toHaveLength(100);
		expect(profile.examTarget.name).toHaveLength(MAX_EXAM_NAME_LENGTH);
		expect(profile.examTarget.examId.startsWith('i')).toBe(true);
	});

	it('drops malformed exam targets', () => {
		for (const examTarget of [
			null,
			'jee-main',
			[],
			{ name: 'JEE Main' },
			{ examId: '   ' },
			{ examId: 42 },
		]) {
			expect(normalizeProfile({ examTarget, preferences: {} }).examTarget).toBe(null);
		}
	});

	it('keeps an exam id even when the name is not a string', () => {
		const profile = normalizeProfile({
			examTarget: { examId: 'jee-main', name: 42 },
			preferences: {},
		});
		expect(profile.examTarget).toEqual({ examId: 'jee-main', name: null });
	});
});

describe('updatedAt normalization', () => {
	it('normalizes a valid timestamp and rejects everything else', () => {
		expect(normalizeProfile({ preferences: {}, updatedAt: '2026-01-15' }).updatedAt).toBe(
			'2026-01-15T00:00:00.000Z'
		);
		expect(normalizeProfile({ preferences: {}, updatedAt: 'not-a-date' }).updatedAt).toBe(null);
		expect(normalizeProfile({ preferences: {}, updatedAt: 1767225600000 }).updatedAt).toBe(null);
		expect(normalizeProfile({ preferences: {} }).updatedAt).toBe(null);
	});
});

describe('parseProfileStateValue edge cases', () => {
	it('returns null for JSON primitives, whitespace and undefined', () => {
		expect(parseProfileStateValue('null')).toBe(null);
		expect(parseProfileStateValue('"profile"')).toBe(null);
		expect(parseProfileStateValue('   ')).toBe(null);
		expect(parseProfileStateValue(undefined)).toBe(null);
	});

	it('drops payloads that normalize to nothing and resets the version', () => {
		expect(parseProfileStateValue(JSON.stringify({ preferences: { personalized: false } }))).toBe(
			null
		);
		const parsed = parseProfileStateValue(
			JSON.stringify({ preferences: {}, class: 'class-99', version: 99 })
		);
		expect(parsed.class).toBe(null);
		expect(parsed.version).toBe(PROFILE_VERSION);
	});
});
