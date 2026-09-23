import { describe, expect, it } from 'vitest';
import {
	WINS_REQUIRED,
	SETTLE_TICK_MS,
	STRONG_CONFIDENCE,
	candidatesFromLocal,
	candidatesFromPlan,
	createSettleState,
	hasPendingChallenger,
	resetSettleState,
	settlePreview,
} from './previewSettler.js';

// Failure modes written before the module (AGENTS.md rule):
//
// 1. A single ambiguous result must never change a committed value.
// 2. A B A B must never commit B; two consecutive Bs must.
// 3. Explicit (user-edited) fields beat even strong evidence.
// 4. Absent, null or malformed candidates never throw and never clear.
// 5. Deleting text (backspace) commits a shrinking topic; typing forward does not.
// 6. Append growth of a committed topic commits immediately.
// 7. A repeated candidate (the local settle tick) resolves a pending challenger.
// 8. Reset clears challengers and committed values are only re-earned from scratch.
// 9. Question-count values pass through unchanged (clamping stays upstream).
// 10. Status is never "settling" when nothing is contested.
// 11. Cross-tier agreement (local then Jev) counts as a second win.

const TOPIC = 'topic';

function settle(state, candidates, { source = 'local', text = 'some message', explicit = {} } = {}) {
	return settlePreview(state, { source, text, candidates, explicit });
}

/** Two consecutive weak results commit the value (the first-commit path). */
function commitTwice(state, field, value, source = 'local') {
	const first = settle(state, { [field]: { value, strong: false } });
	return settle(first.state, { [field]: { value, strong: false } }, { source });
}

describe('settlePreview', () => {
	it('commits a value only after two consecutive wins', () => {
		let result = settle(createSettleState(), { [TOPIC]: { value: 'physics', strong: false } });
		expect(result.committed).toEqual({});
		expect(result.changedFields).toEqual([]);
		expect(result.status).toBe('settling');
		expect(result.held).toEqual({ [TOPIC]: 'physics' });

		result = settle(result.state, { [TOPIC]: { value: 'physics', strong: false } });
		expect(result.committed).toEqual({ [TOPIC]: 'physics' });
		expect(result.changedFields).toEqual([TOPIC]);
		expect(result.status).toBe('ready');
		expect(hasPendingChallenger(result.state)).toBe(false);
	});

	it('holds the committed value against a single ambiguous challenger', () => {
		const base = commitTwice(createSettleState(), TOPIC, 'physics').state;
		const result = settle(base, { [TOPIC]: { value: 'chemistry', strong: false } });
		expect(result.committed).toEqual({});
		expect(result.held).toEqual({ [TOPIC]: 'chemistry' });
		expect(result.status).toBe('settling');
	});

	it('never commits alternating challengers', () => {
		let state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		for (const value of ['chemistry', 'biology', 'chemistry', 'biology']) {
			state = settle(state, { [TOPIC]: { value, strong: false } }).state;
		}
		const result = settle(state, {});
		expect(result.held).toEqual({});
		expect(hasPendingChallenger(result.state)).toBe(false);
		// The committed topic never moved.
		const check = settle(state, { [TOPIC]: { value: 'physics', strong: false } });
		expect(check.committed).toEqual({});
	});

	it('commits strong evidence immediately', () => {
		const state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		const result = settle(state, { [TOPIC]: { value: 'plant biology', strong: true } }, { source: 'jev' });
		expect(result.committed).toEqual({ [TOPIC]: 'plant biology' });
		expect(result.status).toBe('ready');
	});

	it('counts cross-tier agreement as two wins', () => {
		const state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		const first = settle(state, { [TOPIC]: { value: 'plant biology', strong: false } }, { source: 'local' });
		expect(first.committed).toEqual({});
		const second = settle(first.state, { [TOPIC]: { value: 'plant biology', strong: false } }, { source: 'jev' });
		expect(second.committed).toEqual({ [TOPIC]: 'plant biology' });
	});

	it('keeps explicit fields untouched even with strong evidence', () => {
		const state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		const result = settle(
			state,
			{ [TOPIC]: { value: 'chemistry', strong: true } },
			{ explicit: { [TOPIC]: true } }
		);
		expect(result.committed).toEqual({});
		expect(result.held).toEqual({});
	});

	it('ignores absent, null and malformed candidates without throwing', () => {
		const state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		const calls = [
			settle(state, {}),
			settle(state, { [TOPIC]: { value: null, strong: true } }),
			settle(state, { [TOPIC]: { value: '', strong: true } }),
			settle(state, { [TOPIC]: { value: 42, strong: true } }),
			settle(state, { [TOPIC]: null }),
			settle(state, { [TOPIC]: undefined }),
		];
		for (const call of calls) {
			expect(call.committed).toEqual({});
			expect(call.changedFields).toEqual([]);
		}
		// The committed value is still there, and a later same-value result is calm.
		const confirm = settle(calls.at(-1).state, { [TOPIC]: { value: 'physics', strong: false } });
		expect(confirm.committed).toEqual({});
		expect(confirm.status).toBe('ready');
	});

	it('commits topic append growth immediately', () => {
		const state = commitTwice(createSettleState(), TOPIC, 'physics', 'local').state;
		const result = settle(
			{ ...state },
			{ [TOPIC]: { value: 'physics momentum', strong: false } },
			{ text: 'physics momentum basics' }
		);
		expect(result.committed).toEqual({ [TOPIC]: 'physics momentum' });
	});

	it('commits a shrinking topic when the user is deleting text', () => {
		let state = settle(
			createSettleState(),
			{ [TOPIC]: { value: 'physics momentum', strong: false } },
			{ text: 'physics momentum' }
		).state;
		state = settle(
			state,
			{ [TOPIC]: { value: 'physics momentum', strong: false } },
			{ text: 'physics momentum' }
		).state;
		const result = settle(
			state,
			{ [TOPIC]: { value: 'physics', strong: false } },
			{ text: 'physics' }
		);
		expect(result.committed).toEqual({ [TOPIC]: 'physics' });
	});

	it('does not commit a shrinking topic while the text grows', () => {
		const state = settle(
			createSettleState(),
			{ [TOPIC]: { value: 'physics momentum', strong: false } },
			{ text: 'physics momentum' }
		).state;
		const committed = settle(
			state,
			{ [TOPIC]: { value: 'physics momentum', strong: false } },
			{ text: 'physics momentum' }
		).state;
		const result = settle(
			committed,
			{ [TOPIC]: { value: 'physics', strong: false } },
			{ text: 'physics momentumx' }
		);
		expect(result.committed).toEqual({});
		expect(result.held).toEqual({ [TOPIC]: 'physics' });
	});

	it('resolves a pending challenger on the repeated local result (settle tick)', () => {
		let result = settle(createSettleState(), { [TOPIC]: { value: 'photosynthesis', strong: false } });
		expect(result.committed).toEqual({});
		result = settle(result.state, { [TOPIC]: { value: 'photosynthesis', strong: false } });
		expect(result.committed).toEqual({ [TOPIC]: 'photosynthesis' });
		expect(WINS_REQUIRED).toBe(2);
		expect(SETTLE_TICK_MS).toBeGreaterThan(0);
	});

	it('reset clears challengers and does not resurrect old values', () => {
		let state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		state = settle(state, { [TOPIC]: { value: 'chemistry', strong: false } }).state;
		expect(hasPendingChallenger(state)).toBe(true);
		state = resetSettleState(state);
		expect(hasPendingChallenger(state)).toBe(false);
		const result = settle(state, {});
		expect(result.status).toBe('ready');
		expect(result.held).toEqual({});
	});

	it('passes question counts through unchanged and never reports settling when calm', () => {
		const candidates = { numQuestions: { value: 17, strong: true } };
		const result = settle(createSettleState(), candidates);
		expect(result.committed).toEqual({ numQuestions: 17 });
		const calm = settle(result.state, {});
		expect(calm.status).toBe('ready');
		expect(calm.held).toEqual({});
	});

	it('clears a Jev challenger only when Jev agrees, not when the local tier does', () => {
		const state = commitTwice(createSettleState(), TOPIC, 'physics').state;
		const challenged = settle(state, { [TOPIC]: { value: 'chemistry', strong: false } }, { source: 'jev' });
		expect(challenged.held).toEqual({ [TOPIC]: 'chemistry' });
		// The local tier still proposes the committed value: the Jev challenger survives.
		const localAgrees = settle(
			challenged.state,
			{ [TOPIC]: { value: 'physics', strong: false } },
			{ source: 'local' }
		);
		expect(localAgrees.held).toEqual({ [TOPIC]: 'chemistry' });
		// Jev itself agreeing clears it.
		const jevAgrees = settle(
			localAgrees.state,
			{ [TOPIC]: { value: 'physics', strong: false } },
			{ source: 'jev' }
		);
		expect(jevAgrees.held).toEqual({});
		expect(jevAgrees.status).toBe('ready');
	});
});

describe('candidatesFromLocal', () => {
	it('leaves topics weak and marks explicitly mentioned fields strong', () => {
		const candidates = candidatesFromLocal({
			topic: 'photosynthesis',
			numQuestions: 20,
			examId: null,
			difficulty: null,
			language: null,
			testType: null,
			mentions: { difficulty: false, language: false, testType: false, exam: false },
			difficultyContradiction: false,
		});
		expect(candidates).toEqual({
			topic: { value: 'photosynthesis', strong: false },
			numQuestions: { value: 20, strong: true },
		});
	});

	it('marks resolved mentioned fields strong and contradictions weak', () => {
		const candidates = candidatesFromLocal({
			topic: 'physics',
			numQuestions: null,
			examId: 'jee-main',
			difficulty: 'advanced',
			language: 'hindi',
			testType: 'coding',
			mentions: { difficulty: true, language: true, testType: true, exam: true },
			difficultyContradiction: false,
		});
		expect(candidates.difficulty).toEqual({ value: 'advanced', strong: true });
		expect(candidates.language).toEqual({ value: 'hindi', strong: true });
		expect(candidates.testType).toEqual({ value: 'coding', strong: true });
		expect(candidates.examId).toEqual({ value: 'jee-main', strong: true });

		const contradicted = candidatesFromLocal({
			topic: 'physics',
			numQuestions: null,
			examId: null,
			difficulty: 'beginner',
			language: null,
			testType: null,
			mentions: { difficulty: true, language: false, testType: false, exam: false },
			difficultyContradiction: true,
		});
		expect(contradicted.difficulty).toEqual({ value: 'beginner', strong: false });
	});

	it('handles null input', () => {
		expect(candidatesFromLocal(null)).toEqual({});
	});
});

describe('candidatesFromPlan', () => {
	it('marks only high-confidence fields strong', () => {
		const candidates = candidatesFromPlan(
			{
				topic: 'plant biology',
				testType: 'multiple-choice',
				difficulty: 'intermediate',
				numQuestions: 12,
				examId: null,
				language: 'english',
			},
			{ topic: STRONG_CONFIDENCE, difficulty: 0.5 }
		);
		expect(candidates.topic).toEqual({ value: 'plant biology', strong: true });
		expect(candidates.difficulty).toEqual({ value: 'intermediate', strong: false });
		expect(candidates.numQuestions).toEqual({ value: 12, strong: false });
		expect(candidates.testType).toEqual({ value: 'multiple-choice', strong: false });
		expect(candidates.language).toEqual({ value: 'english', strong: false });
		expect(candidates.examId).toBeUndefined();
	});

	it('handles null plans and missing confidence maps', () => {
		expect(candidatesFromPlan(null, null)).toEqual({});
		expect(candidatesFromPlan({ topic: 'physics' }, null).topic).toEqual({
			value: 'physics',
			strong: false,
		});
	});
});
