import { describe, expect, it } from 'vitest';
import {
	aggregateLearnerSignals,
	buildProfileContext,
	buildStudentContext,
	buildTailoredSummary,
	mergeFocusTopics,
	resolveDifficulty,
	resolveWarmUpDifficulty,
} from './profile';
import { createDefaultProfile } from '$lib/shared/userProfile';

function attemptRow({
	topic = 'Trigonometry',
	difficulty = 'intermediate',
	userAnswers = { '0': 'A', '1': 'B' },
	test = {
		questions: [
			{ question: 'q1', options: ['A', 'B', 'C', 'D'], answer: 'A' },
			{ question: 'q2', options: ['A', 'B', 'C', 'D'], answer: 'B' },
		],
	},
	submittedAt = new Date().toISOString(),
}) {
	return { topic, difficulty, user_answers: userAnswers, test, submitted_at: submittedAt };
}

function baseProfile(overrides = {}) {
	return { ...createDefaultProfile(), ...overrides };
}

describe('aggregateLearnerSignals', () => {
	it('returns empty signals with no attempts', () => {
		expect(aggregateLearnerSignals([])).toEqual({
			weakTopics: [],
			strongTopics: [],
			overallAccuracy: null,
			testsTaken: 0,
			lastDifficulty: null,
		});
	});

	it('computes overall accuracy from graded answers', () => {
		const signals = aggregateLearnerSignals([
			attemptRow({ userAnswers: { '0': 'A', '1': 'A' } }),
		]);
		expect(signals.testsTaken).toBe(1);
		expect(signals.overallAccuracy).toBe(0.5);
		expect(signals.lastDifficulty).toBe('intermediate');
	});

	it('marks weak topics only above the attempt threshold', () => {
		const oneAttempt = aggregateLearnerSignals([
			attemptRow({ userAnswers: { '0': 'B', '1': 'B' } }),
		]);
		expect(oneAttempt.weakTopics).toEqual([]);

		const twoAttempts = aggregateLearnerSignals([
			attemptRow({ userAnswers: { '0': 'B', '1': 'B' } }),
			attemptRow({ userAnswers: { '0': 'B', '1': 'B' } }),
		]);
		expect(twoAttempts.weakTopics).toHaveLength(1);
		expect(twoAttempts.weakTopics[0].topic).toBe('Trigonometry');
		expect(twoAttempts.weakTopics[0].attempts).toBe(2);
	});

	it('marks strong topics at high accuracy', () => {
		const signals = aggregateLearnerSignals([
			attemptRow({ userAnswers: { '0': 'A', '1': 'B' } }),
			attemptRow({ userAnswers: { '0': 'A', '1': 'B' } }),
		]);
		expect(signals.strongTopics).toHaveLength(1);
		expect(signals.weakTopics).toHaveLength(0);
	});

	it('skips attempts without answers', () => {
		const signals = aggregateLearnerSignals([
			attemptRow({ userAnswers: {} }),
			attemptRow({ userAnswers: { '0': 'A', '1': 'B' } }),
		]);
		expect(signals.testsTaken).toBe(1);
		expect(signals.overallAccuracy).toBe(1);
	});

	it('weights recent attempts higher than old ones', () => {
		const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
		const recent = aggregateLearnerSignals([
			attemptRow({ userAnswers: { '0': 'A', '1': 'B' } }),
			attemptRow({ userAnswers: { '0': 'B', '1': 'B' }, submittedAt: oldDate }),
		]);
		// The recent 100% attempt dominates the old 50% attempt.
		expect(recent.overallAccuracy).toBeGreaterThan(0.9);
	});
});

describe('resolveDifficulty', () => {
	it('keeps the request difficulty when not personalized', () => {
		expect(
			resolveDifficulty({ profile: null, requestDifficulty: 'expert', difficultyExplicit: false }),
		).toBe('expert');
	});

	it('respects an explicit user choice', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'beginner', personalized: true } });
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: 0.9, testsTaken: 10, lastDifficulty: 'intermediate' };
		expect(
			resolveDifficulty({ profile, signals, requestDifficulty: 'advanced', difficultyExplicit: true }),
		).toBe('advanced');
	});

	it('escalates a level on high recent accuracy', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'intermediate', personalized: true } });
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: 0.9, testsTaken: 5, lastDifficulty: 'intermediate' };
		expect(
			resolveDifficulty({ profile, signals, requestDifficulty: 'intermediate', difficultyExplicit: false }),
		).toBe('advanced');
	});

	it('drops a level on low accuracy', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'intermediate', personalized: true } });
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: 0.4, testsTaken: 5, lastDifficulty: 'intermediate' };
		expect(
			resolveDifficulty({ profile, signals, requestDifficulty: 'intermediate', difficultyExplicit: false }),
		).toBe('beginner');
	});

	it('keeps the level at mid accuracy', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'intermediate', personalized: true } });
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: 0.7, testsTaken: 5, lastDifficulty: 'intermediate' };
		expect(
			resolveDifficulty({ profile, signals, requestDifficulty: 'intermediate', difficultyExplicit: false }),
		).toBe('intermediate');
	});

	it('stays at beginner without dropping below the floor', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'beginner', personalized: true } });
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: 0.1, testsTaken: 5, lastDifficulty: 'beginner' };
		expect(
			resolveDifficulty({ profile, signals, requestDifficulty: 'beginner', difficultyExplicit: false }),
		).toBe('beginner');
	});

	it('uses per-topic accuracy when the topic matches', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'beginner', personalized: true } });
		const signals = {
			weakTopics: [{ topic: 'Thermodynamics', accuracy: 0.3, attempts: 3 }],
			strongTopics: [],
			overallAccuracy: 0.9,
			testsTaken: 5,
			lastDifficulty: 'beginner',
		};
		expect(
			resolveDifficulty({
				profile,
				signals,
				requestDifficulty: 'intermediate',
				difficultyExplicit: false,
				topicKeywords: ['thermodynamics second law'],
			}),
		).toBe('beginner');
	});

	it('falls back to comfort when there is no attempt history', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'expert', personalized: true } });
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: null, testsTaken: 0, lastDifficulty: null };
		expect(
			resolveDifficulty({ profile, signals, requestDifficulty: 'beginner', difficultyExplicit: false }),
		).toBe('expert');
	});
});

describe('resolveWarmUpDifficulty', () => {
	it('returns one level below the target', () => {
		expect(resolveWarmUpDifficulty('advanced')).toBe('intermediate');
	});

	it('returns null at beginner (no floor below)', () => {
		expect(resolveWarmUpDifficulty('beginner')).toBe(null);
	});

	it('returns null for unknown levels', () => {
		expect(resolveWarmUpDifficulty('unknown')).toBe(null);
	});
});

describe('mergeFocusTopics', () => {
	it('keeps declared first, then weak, deduped and capped', () => {
		const merged = mergeFocusTopics({
			declared: ['Trigonometry', 'Kinematics'],
			weak: [
				{ topic: 'Kinematics', accuracy: 0.3, attempts: 3 },
				{ topic: 'Thermodynamics', accuracy: 0.2, attempts: 4 },
			],
			limit: 3,
		});
		expect(merged).toEqual(['Trigonometry', 'Kinematics', 'Thermodynamics']);
	});

	it('ignores invalid entries', () => {
		const merged = mergeFocusTopics({
			declared: ['', null, 42, 'Physics'],
			weak: [],
		});
		expect(merged).toEqual(['Physics']);
	});
});

describe('buildProfileContext', () => {
	it('returns null when not personalized', () => {
		expect(buildProfileContext({ profile: null })).toBe(null);
		expect(
			buildProfileContext({ profile: baseProfile({ preferences: { language: null, difficultyComfort: null, personalized: false } }) }),
		).toBe(null);
	});

	it('builds a PII-free context with focus and warm-up rules', () => {
		const profile = baseProfile({
			setupComplete: true,
			class: 'class-10',
			examTarget: { examId: 'jee-main', name: 'JEE Main' },
			subjects: ['Physics'],
			preferences: { language: null, difficultyComfort: 'intermediate', personalized: true },
			declaredFocus: ['Trigonometry'],
		});
		const signals = {
			weakTopics: [{ topic: 'Thermodynamics', accuracy: 0.4, attempts: 3 }],
			strongTopics: [],
			overallAccuracy: 0.7,
			testsTaken: 5,
			lastDifficulty: 'intermediate',
		};
		const context = buildProfileContext({
			profile,
			signals,
			resolvedDifficulty: 'advanced',
			warmUpDifficulty: 'intermediate',
			topicKeywords: ['thermodynamics'],
		});
		expect(context).toContain('Class 10');
		expect(context).toContain('JEE Main');
		expect(context).toContain('Resolved difficulty: advanced');
		expect(context).toContain('Trigonometry');
		expect(context).toContain('Thermodynamics (40% accuracy, 3 attempts)');
		expect(context).toContain('warm-up at intermediate');
		expect(context).not.toContain('email');
	});

	it('includes profession for working professionals', () => {
		const profile = baseProfile({
			class: 'working-professional',
			profession: 'banking-finance',
			preferences: { language: null, difficultyComfort: null, personalized: true },
		});
		const context = buildProfileContext({ profile, signals: null, resolvedDifficulty: null });
		expect(context).toContain('Working Professional');
		expect(context).toContain('Banking & Finance');
	});

	it('omits warm-up rules at beginner', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: 'beginner', personalized: true } });
		const context = buildProfileContext({
			profile,
			signals: { weakTopics: [], strongTopics: [], overallAccuracy: 0.5, testsTaken: 2, lastDifficulty: 'beginner' },
			resolvedDifficulty: 'beginner',
			warmUpDifficulty: null,
		});
		expect(context).not.toContain('warm-up');
	});

	it('does not inject weak topics unrelated to the requested topic', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: null, personalized: true } });
		const signals = {
			weakTopics: [{ topic: 'Python tuples', accuracy: 0.3333, attempts: 2 }],
			strongTopics: [],
			overallAccuracy: 0.375,
			testsTaken: 3,
			lastDifficulty: 'advanced',
		};
		const context = buildProfileContext({
			profile,
			signals,
			resolvedDifficulty: 'advanced',
			topicKeywords: ['javascript'],
		});
		expect(context).not.toContain('Python tuples');
		expect(context).not.toContain('Practice areas');
		expect(context).not.toContain('Weight questions');
		expect(context).toContain('Resolved difficulty: advanced');
	});

	it('keeps weak topics related to the requested topic', () => {
		const profile = baseProfile({ preferences: { language: null, difficultyComfort: null, personalized: true } });
		const signals = {
			weakTopics: [{ topic: 'Python tuples', accuracy: 0.3333, attempts: 2 }],
			strongTopics: [],
			overallAccuracy: 0.375,
			testsTaken: 3,
			lastDifficulty: 'advanced',
		};
		const context = buildProfileContext({
			profile,
			signals,
			resolvedDifficulty: 'advanced',
			topicKeywords: ['python'],
		});
		expect(context).toContain('Python tuples');
		expect(context).toContain('Practice areas to include');
	});
});

describe('buildStudentContext', () => {
	it('returns null without a personalized profile', () => {
		expect(buildStudentContext(null)).toBe(null);
	});

	it('lists class, exam target and language', () => {
		const profile = baseProfile({
			class: 'class-12',
			examTarget: { examId: 'neet', name: 'NEET' },
			preferences: { language: 'hindi', difficultyComfort: 'advanced', personalized: true },
		});
		const context = buildStudentContext(profile);
		expect(context).toContain('Class 12');
		expect(context).toContain('NEET');
		expect(context).toContain('hindi');
		expect(context).toContain('advanced');
	});

	it('lists profession for working professionals', () => {
		const profile = baseProfile({
			class: 'working-professional',
			profession: 'software-engineering',
			preferences: { language: null, difficultyComfort: null, personalized: true },
		});
		const context = buildStudentContext(profile);
		expect(context).toContain('Working Professional');
		expect(context).toContain('Software Engineer / IT');
	});
});

describe('buildTailoredSummary', () => {
	it('returns null when not personalized', () => {
		expect(buildTailoredSummary({ profile: null })).toBe(null);
	});

	it('summarizes exam, difficulty and focus', () => {
		const profile = baseProfile({
			examTarget: { examId: 'jee-main', name: 'JEE Main' },
			declaredFocus: ['Trigonometry', 'Kinematics'],
		});
		const signals = { weakTopics: [], strongTopics: [], overallAccuracy: 0.7, testsTaken: 5, lastDifficulty: 'intermediate' };
		expect(buildTailoredSummary({ profile, signals, resolvedDifficulty: 'intermediate' })).toBe(
			'JEE Main • intermediate • focus: Trigonometry, Kinematics',
		);
	});
});
