import { describe, expect, it } from 'vitest';
import {
	MAX_NOTIFICATION_CANDIDATES,
	buildNudgeQuestions,
	deriveNotificationRanking,
	deriveNudge,
	eligibleNudgeKinds,
	isNudgeHoldout,
	sanitizeNudgeState
} from './nudges.js';

// Failure list for the pure nudge engine (written before the module):
// ineligible kinds leaking into questions, derivation acting without
// confidence or guardrails, hallucinated notification ids, state that is not
// clamped, and a holdout that is not deterministic.

function baseState(overrides = {}) {
	return {
		page: 'results',
		testsTotal: 3,
		distinctTestDays: 3,
		testsThisWeek: 2,
		currentStreak: 4,
		daysSinceLastTest: 0,
		lastScore: { pct: 80, total: 10 },
		bestBeaten: true,
		shareUsed: false,
		shareSheetOpenedThisResult: false,
		reminderState: 'off',
		nudgeHistory: { lastShareDaysAgo: null, lastPushDaysAgo: null, dismissals: 0 },
		session: { secondsOnPage: 12, interactionCount: 3, hourLocal: 19, isDataSaver: false },
		locale: 'en',
		candidates: [],
		...overrides
	};
}

function choice(selected, probabilities, confidence = 0.9) {
	return { type: 'choice', choice: selected, probabilities, confidence };
}

function score(value, confidence = 0.9) {
	return { type: 'score', score: value, confidence, probabilities: {} };
}

function noul(value) {
	return { type: 'noul', noul: value };
}

function candidate(overrides = {}) {
	return {
		id: '101',
		org: 'UPSC',
		title: 'Civil Services Examination 2026',
		category: 'civil-services',
		state: null,
		status: 'open',
		daysLeft: 21,
		match: 'bookmarked',
		...overrides
	};
}

describe('eligibleNudgeKinds', () => {
	it('offers share kinds on results and never a push ask to new learners', () => {
		const kinds = eligibleNudgeKinds(baseState({ distinctTestDays: 1 }));
		expect(kinds).toContain('share_result');
		expect(kinds).toContain('challenge_friend');
		expect(kinds).not.toContain('enable_reminders');
	});

	it('drops share kinds once the sheet was opened for this result', () => {
		expect(eligibleNudgeKinds(baseState({ shareSheetOpenedThisResult: true }))).toEqual([]);
	});

	it('offers only the plain share when the result is not challenge-worthy', () => {
		const kinds = eligibleNudgeKinds(
			baseState({ lastScore: { pct: 40, total: 10 }, bestBeaten: false })
		);
		expect(kinds).toEqual(['share_result']);
	});

	it('offers no share kinds without a completed test', () => {
		expect(eligibleNudgeKinds(baseState({ testsTotal: 0 }))).toEqual([]);
	});

	it('offers streak sharing only from a three-day streak on home', () => {
		const kinds = eligibleNudgeKinds(baseState({ page: 'home', currentStreak: 2 }));
		expect(kinds).not.toContain('share_streak');
		expect(kinds).toContain('enable_reminders');
	});

	it('offers the push ask only to repeat learners with reminders off', () => {
		const repeat = eligibleNudgeKinds(baseState({ page: 'home' }));
		expect(repeat).toContain('enable_reminders');
		expect(eligibleNudgeKinds(baseState({ page: 'home', distinctTestDays: 1 }))).not.toContain(
			'enable_reminders'
		);
		expect(eligibleNudgeKinds(baseState({ page: 'home', reminderState: 'on' }))).not.toContain(
			'enable_reminders'
		);
		expect(eligibleNudgeKinds(baseState({ page: 'home', reminderState: 'denied' }))).not.toContain(
			'enable_reminders'
		);
	});

	it('returns no kinds for the notifications page or unknown pages', () => {
		expect(eligibleNudgeKinds(baseState({ page: 'notifications' }))).toEqual([]);
		expect(eligibleNudgeKinds(baseState({ page: 'history' }))).toEqual([]);
		expect(eligibleNudgeKinds(null)).toEqual([]);
	});
});

describe('buildNudgeQuestions', () => {
	it('filters results criteria to the eligible kinds only', () => {
		const questions = buildNudgeQuestions(baseState());
		const criteria = questions.nudge_moment.criteria;
		expect(Object.keys(criteria)).toEqual([
			'share_result',
			'challenge_friend',
			'wait',
			'nothing'
		]);
		expect(questions.nudge_share_pride.type).toBe('score');
		expect(questions.nudge_reminder_fit).toBeUndefined();
		expect(questions.nudge_receptivity.type).toBe('noul');
	});

	it('builds home questions with both guardrail scores', () => {
		const questions = buildNudgeQuestions(baseState({ page: 'home' }));
		expect(Object.keys(questions.nudge_moment.criteria)).toEqual([
			'share_streak',
			'enable_reminders',
			'wait',
			'nothing'
		]);
		expect(questions.nudge_share_pride.type).toBe('score');
		expect(questions.nudge_reminder_fit.type).toBe('score');
	});

	it('builds nothing when no kind is eligible or the state is missing', () => {
		expect(buildNudgeQuestions(baseState({ shareSheetOpenedThisResult: true }))).toEqual({});
		expect(buildNudgeQuestions(null)).toEqual({});
	});

	it('ranks notifications with candidate criteria and soft-only relevance', () => {
		const state = baseState({
			page: 'notifications',
			candidates: [
				candidate(),
				candidate({ id: '102', org: 'SSC', title: 'CGL 2026', match: 'category', category: 'ssc-central' })
			]
		});
		const questions = buildNudgeQuestions(state);
		expect(questions.nudge_moment).toBeUndefined();
		expect(Object.keys(questions.nudge_notify_item.criteria)).toEqual(['101', '102', 'none']);
		expect(questions.nudge_relevance_101).toBeUndefined();
		expect(questions.nudge_relevance_102.type).toBe('score');
		expect(questions.nudge_receptivity.type).toBe('noul');
	});

	it('caps notification candidates at the documented maximum', () => {
		const candidates = Array.from({ length: 9 }, (_, index) =>
			candidate({ id: String(200 + index), match: 'category' })
		);
		const questions = buildNudgeQuestions(baseState({ page: 'notifications', candidates }));
		expect(Object.keys(questions.nudge_notify_item.criteria)).toHaveLength(
			MAX_NOTIFICATION_CANDIDATES + 1
		);
		expect(Object.keys(questions).filter((id) => id.startsWith('nudge_relevance_'))).toHaveLength(
			MAX_NOTIFICATION_CANDIDATES
		);
	});

	it('puts learner topics into the soft-relevance instructions', () => {
		const questions = buildNudgeQuestions(
			baseState({
				page: 'notifications',
				topics: ['SSC CGL quantitative aptitude'],
				candidates: [candidate({ id: '102', match: 'category' })]
			})
		);
		expect(questions.nudge_relevance_102.instructions).toContain('SSC CGL quantitative aptitude');
	});
});

describe('deriveNudge', () => {
	it('returns the confident share kind', () => {
		const result = deriveNudge(
			baseState(),
			{
				nudge_moment: choice('challenge_friend', { challenge_friend: 0.8, wait: 0.2 }, 0.8),
				nudge_share_pride: score(2),
				nudge_receptivity: noul(0.8)
			}
		);
		expect(result).toMatchObject({ kind: 'challenge_friend', suppressed: null });
		expect(result.confidence).toBe('high');
	});

	it('suppresses wait and nothing without a guardrail charge', () => {
		expect(
			deriveNudge(baseState(), {
				nudge_moment: choice('wait', { wait: 0.9, nothing: 0.1 })
			}).suppressed
		).toBe('wait');
		expect(
			deriveNudge(baseState(), {
				nudge_moment: choice('nothing', { nothing: 0.9, wait: 0.1 })
			}).suppressed
		).toBe('nothing');
	});

	it('suppresses low confidence, missing answers and unknown kinds', () => {
		expect(
			deriveNudge(baseState(), {
				nudge_moment: choice('share_result', { share_result: 0.5 }, 0.3),
				nudge_share_pride: score(2)
			}).suppressed
		).toBe('low-confidence');
		expect(deriveNudge(baseState(), {}).suppressed).toBe('low-confidence');
		expect(
			deriveNudge(baseState(), {
				nudge_moment: choice('enable_reminders', { enable_reminders: 0.9 }, 0.9),
				nudge_reminder_fit: score(2),
				nudge_receptivity: noul(0.9)
			}).suppressed
		).toBe('unknown-kind');
	});

	it('holds share asks below the pride floor', () => {
		const result = deriveNudge(baseState(), {
			nudge_moment: choice('share_result', { share_result: 0.9 }, 0.9),
			nudge_share_pride: score(0.5)
		});
		expect(result.kind).toBeNull();
		expect(result.suppressed).toBe('guardrail');
	});

	it('holds push asks below fit or receptivity', () => {
		const moment = choice('enable_reminders', { enable_reminders: 0.9 }, 0.9);
		expect(
			deriveNudge(baseState({ page: 'home' }), {
				nudge_moment: moment,
				nudge_reminder_fit: score(1),
				nudge_receptivity: noul(0.9)
			}).suppressed
		).toBe('guardrail');
		expect(
			deriveNudge(baseState({ page: 'home' }), {
				nudge_moment: moment,
				nudge_reminder_fit: score(2),
				nudge_receptivity: noul(0.4)
			}).suppressed
		).toBe('guardrail');
	});

	it('returns the confident push kind', () => {
		const result = deriveNudge(baseState({ page: 'home' }), {
			nudge_moment: choice('enable_reminders', { enable_reminders: 0.9 }, 0.9),
			nudge_reminder_fit: score(2),
			nudge_receptivity: noul(0.8)
		});
		expect(result.kind).toBe('enable_reminders');
	});

	it('never returns a kind for ineligible state', () => {
		expect(
			deriveNudge(baseState({ shareSheetOpenedThisResult: true }), {
				nudge_moment: choice('share_result', { share_result: 0.99 }, 0.99),
				nudge_share_pride: score(2)
			})
		).toMatchObject({ kind: null, suppressed: 'not-eligible' });
	});
});

describe('deriveNotificationRanking', () => {
	const candidates = [
		candidate(),
		candidate({ id: '102', match: 'category' })
	];

	it('picks a real candidate id and reads soft relevance', () => {
		const result = deriveNotificationRanking(
			{
				nudge_notify_item: choice('102', { 102: 0.7, none: 0.3 }, 0.7),
				nudge_receptivity: noul(0.7),
				nudge_relevance_102: score(2)
			},
			candidates
		);
		expect(result.pickedId).toBe('102');
		expect(result.relevance).toEqual({ 102: 2 });
		expect(result.suppressed).toBeNull();
	});

	it('ignores hallucinated ids and low confidence', () => {
		const hallucinated = deriveNotificationRanking(
			{
				nudge_notify_item: choice('999', { 999: 0.9, none: 0.1 }, 0.9),
				nudge_receptivity: noul(0.9)
			},
			candidates
		);
		expect(hallucinated.pickedId).toBeNull();
		expect(hallucinated.suppressed).toBe('unknown-kind');

		const unsure = deriveNotificationRanking(
			{
				nudge_notify_item: choice('101', { 101: 0.6, none: 0.4 }, 0.3),
				nudge_receptivity: noul(0.9)
			},
			candidates
		);
		expect(unsure.pickedId).toBeNull();
		expect(unsure.suppressed).toBe('low-confidence');
	});

	it('holds interrupts below the receptivity floor', () => {
		const result = deriveNotificationRanking(
			{
				nudge_notify_item: choice('101', { 101: 0.9, none: 0.1 }, 0.9),
				nudge_receptivity: noul(0.3)
			},
			candidates
		);
		expect(result.pickedId).toBeNull();
		expect(result.suppressed).toBe('guardrail');
	});

	it('suppresses nothing-picked and empty candidates', () => {
		expect(
			deriveNotificationRanking(
				{ nudge_notify_item: choice('none', { none: 0.9, 101: 0.1 }, 0.9), nudge_receptivity: noul(0.9) },
				candidates
			).suppressed
		).toBe('nothing');
		expect(deriveNotificationRanking({}, []).suppressed).toBe('no-candidates');
	});

	it('omits missing or malformed relevance instead of guessing', () => {
		const result = deriveNotificationRanking(
			{
				nudge_notify_item: choice('none', { none: 0.8, 101: 0.2 }, 0.8),
				nudge_receptivity: noul(0.9),
				nudge_relevance_102: { type: 'score', score: 'junk' }
			},
			candidates
		);
		expect(result.relevance).toEqual({});
	});
});

describe('sanitizeNudgeState', () => {
	it('rejects unknown pages and non-objects', () => {
		expect(sanitizeNudgeState({ testsTotal: 1 }, 'history')).toBeNull();
		expect(sanitizeNudgeState(null, 'results')).toBeNull();
		expect(sanitizeNudgeState('nope', 'results')).toBeNull();
	});

	it('clamps hostile numbers and enums instead of trusting them', () => {
		const state = sanitizeNudgeState(
			{
				testsTotal: -5,
				distinctTestDays: 999999,
				currentStreak: 'NaN',
				reminderState: 'weird',
				session: { secondsOnPage: 10 ** 9, hourLocal: 99 },
				nudgeHistory: { dismissals: -3 }
			},
			'home'
		);
		expect(state.testsTotal).toBe(0);
		expect(state.distinctTestDays).toBeLessThanOrEqual(100000);
		expect(state.currentStreak).toBe(0);
		expect(state.reminderState).toBe('off');
		expect(state.session.secondsOnPage).toBeLessThanOrEqual(86400);
		expect(state.session.hourLocal).toBeLessThanOrEqual(23);
		expect(state.nudgeHistory.dismissals).toBe(0);
	});

	it('sanitizes candidates and caps the list', () => {
		const raw = {
			candidates: Array.from({ length: 9 }, (_, index) => ({
				id: 300 + index,
				org: 'X'.repeat(500),
				title: 'T'.repeat(500),
				status: 'open',
				match: 'category'
			}))
		};
		const state = sanitizeNudgeState(raw, 'notifications');
		expect(state.candidates).toHaveLength(MAX_NOTIFICATION_CANDIDATES);
		expect(state.candidates[0].org.length).toBeLessThanOrEqual(120);
		expect(state.candidates[0].title.length).toBeLessThanOrEqual(240);
		expect(state.candidates[0].id).toBe('300');
	});

	it('drops malformed candidate entries rather than failing the whole state', () => {
		const state = sanitizeNudgeState(
			{ candidates: [candidate(), { nope: true }, candidate({ id: '103', match: 'category' })] },
			'notifications'
		);
		expect(state.candidates.map((item) => item.id)).toEqual(['101', '103']);
	});

	it('clamps learner topics and survives junk', () => {
		const state = sanitizeNudgeState(
			{ topics: ['a'.repeat(200), 'b', 'c', 'd', 'e', 'f', 'g'] },
			'notifications'
		);
		expect(state.topics).toHaveLength(5);
		expect(state.topics[0].length).toBeLessThanOrEqual(80);
		expect(sanitizeNudgeState({ topics: 'junk' }, 'notifications').topics).toEqual([]);
	});
});

describe('isNudgeHoldout', () => {
	it('respects the 0 and 100 percent boundaries', () => {
		expect(isNudgeHoldout('client-1', 0)).toBe(false);
		expect(isNudgeHoldout('client-1', 100)).toBe(true);
	});

	it('is deterministic for a given client key', () => {
		const first = isNudgeHoldout('stable-client');
		expect(isNudgeHoldout('stable-client')).toBe(first);
	});

	it('holds out roughly a tenth of a fixed key population', () => {
		let held = 0;
		for (let index = 0; index < 1000; index += 1) {
			if (isNudgeHoldout(`client-${index}`)) {
				held += 1;
			}
		}
		expect(held).toBeGreaterThanOrEqual(80);
		expect(held).toBeLessThanOrEqual(120);
	});
});
