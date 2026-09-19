import { describe, expect, it } from 'vitest';
import {
	MAX_MODEL_MESSAGES,
	applyTurnFailure,
	applyTurnResult,
	beginClarifyAnswer,
	beginTurn,
	buildTurnRequest,
	createPlannerDraft,
	hasDraftContent,
	markPlanEdited,
	recentMessagesForModel,
	sanitizePlannerDraft,
	skipClarify,
} from './plannerState.js';

const PLAN = {
	topic: 'physics',
	testType: 'multiple-choice',
	difficulty: 'intermediate',
	numQuestions: 10,
	examId: null,
	isFullExam: false,
	language: 'english',
};

const CLARIFY = {
	id: 'examId',
	promptKey: 'plannerClarifyExam',
	params: {},
	options: [
		{ value: 'jee-main', label: 'JEE Main' },
		{ value: 'none', labelKey: 'plannerGeneralQuiz' },
	],
	allowSkip: true,
};

describe('createPlannerDraft', () => {
	it('starts empty', () => {
		const draft = createPlannerDraft();
		expect(draft).toMatchObject({
			messages: [],
			plan: null,
			explicit: {},
			answers: {},
			askedFields: [],
			skippedFields: [],
			round: 0,
			pendingClarify: null,
		});
		expect(hasDraftContent(draft)).toBe(false);
	});
});

describe('sanitizePlannerDraft', () => {
	it('recovers from garbage', () => {
		expect(sanitizePlannerDraft('nonsense').messages).toEqual([]);
		expect(sanitizePlannerDraft(null).plan).toBeNull();
	});

	it('drops invalid messages and keeps valid ones', () => {
		const draft = sanitizePlannerDraft({
			messages: [
				{ role: 'user', text: 'hi' },
				{ role: 'robot', text: 'bad' },
				null,
				{ role: 'assistant', messageKey: 'plannerPlanReady' },
			],
		});
		expect(draft.messages).toHaveLength(2);
		expect(draft.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
	});

	it('caps stored messages', () => {
		const messages = Array.from({ length: 100 }, (_, index) => ({
			role: 'user',
			text: `message ${index}`,
		}));
		expect(sanitizePlannerDraft({ messages }).messages).toHaveLength(40);
	});
});

describe('turn lifecycle', () => {
	it('adds the user message and clears a pending question', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'physics test'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		expect(draft.pendingClarify?.id).toBe('examId');

		draft = beginTurn(draft, 'never mind');
		expect(draft.pendingClarify).toBeNull();
		expect(draft.messages.at(-1)).toMatchObject({ role: 'user', text: 'never mind' });
	});

	it('stores the plan and appends a plan-ready message', () => {
		const draft = applyTurnResult(beginTurn(createPlannerDraft(), 'physics'), {
			plan: PLAN,
			clarify: null,
			messageKey: 'plannerPlanReady',
			messageParams: { topic: 'physics', numQuestions: 10 },
		});
		expect(draft.plan).toEqual(PLAN);
		expect(draft.pendingClarify).toBeNull();
		expect(draft.messages).toHaveLength(2);
		expect(draft.messages[1].messageKey).toBe('plannerPlanReady');
	});

	it('records asked fields and rounds for a clarification', () => {
		const draft = applyTurnResult(beginTurn(createPlannerDraft(), 'mock test'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		expect(draft.askedFields).toEqual(['examId']);
		expect(draft.round).toBe(1);
		expect(draft.pendingClarify?.id).toBe('examId');
		// The pending question is rendered from pendingClarify, not duplicated
		// into the message history.
		expect(draft.messages).toHaveLength(1);
	});

	it('does not duplicate an asked field', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'mock test'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		draft = applyTurnResult(beginTurn(draft, 'again'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		expect(draft.askedFields).toEqual(['examId']);
		expect(draft.round).toBe(2);
	});

	it('records a failed turn', () => {
		const draft = applyTurnFailure(beginTurn(createPlannerDraft(), 'physics'));
		expect(draft.messages.at(-1).messageKey).toBe('plannerParseFailed');
	});

	it('records a custom failure message key', () => {
		const draft = applyTurnFailure(
			beginTurn(createPlannerDraft(), 'physics'),
			'rateLimitExceededRetry'
		);
		expect(draft.messages.at(-1).messageKey).toBe('rateLimitExceededRetry');
	});
});

describe('clarification answers', () => {
	it('stores the answer and adds a readable user message', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'mock test'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		draft = beginClarifyAnswer(draft, { value: 'jee-main', label: 'JEE Main' });
		expect(draft.answers).toEqual({ examId: 'jee-main' });
		expect(draft.pendingClarify).toBeNull();
		expect(draft.messages.at(-1)).toMatchObject({ role: 'user', text: 'JEE Main' });
	});

	it('builds the next request including answers and recent messages', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'mock test'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		draft = beginClarifyAnswer(draft, { value: 'jee-main', label: 'JEE Main' });
		const request = buildTurnRequest(draft, 'JEE Main');
		expect(request).toMatchObject({
			intent: 'JEE Main',
			plan: PLAN,
			answers: { examId: 'jee-main' },
			askedFields: ['examId'],
			round: 1,
		});
		expect(request.recentMessages.length).toBeGreaterThan(0);
		expect(request.recentMessages.at(-1).role).toBe('user');
		expect(request.recentMessages.at(-1).text).toMatch(/JEE Main/);
	});

	it('skips a question and remembers the skipped field', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'mock test'), {
			plan: PLAN,
			clarify: CLARIFY,
			messageKey: 'plannerNeedOneThing',
		});
		draft = skipClarify(draft);
		expect(draft.skippedFields).toEqual(['examId']);
		expect(draft.pendingClarify).toBeNull();
		expect(draft.messages.at(-1).messageKey).toBe('plannerSkipAck');
	});
});

describe('plan editing', () => {
	it('locks the field and keeps the plan snapshot', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'physics'), {
			plan: PLAN,
			clarify: null,
			messageKey: 'plannerPlanReady',
		});
		const edited = { ...PLAN, numQuestions: 30 };
		draft = markPlanEdited(draft, edited, 'numQuestions');
		expect(draft.explicit).toEqual({ numQuestions: true });
		expect(draft.plan.numQuestions).toBe(30);
		expect(draft.messages.at(-1).messageKey).toBe('plannerPlanEdited');
	});

	it('collapses consecutive edits into one system line', () => {
		let draft = applyTurnResult(beginTurn(createPlannerDraft(), 'physics'), {
			plan: PLAN,
			clarify: null,
			messageKey: 'plannerPlanReady',
		});
		draft = markPlanEdited(draft, { ...PLAN, numQuestions: 30 }, 'numQuestions');
		const afterFirst = draft.messages.length;
		draft = markPlanEdited(
			draft,
			{ ...PLAN, numQuestions: 30, difficulty: 'advanced' },
			'difficulty'
		);
		expect(draft.messages.length).toBe(afterFirst);
		expect(draft.explicit).toEqual({ numQuestions: true, difficulty: true });
	});
});

describe('recentMessagesForModel', () => {
	it('caps and drops empty and system messages', () => {
		const messages = [
			{ role: 'system', text: 'system note' },
			...Array.from({ length: 12 }, (_, index) => ({
				role: index % 2 === 0 ? 'user' : 'assistant',
				modelText: `turn ${index}`,
			})),
		];
		const recent = recentMessagesForModel(sanitizePlannerDraft({ messages }));
		expect(recent).toHaveLength(MAX_MODEL_MESSAGES);
		expect(recent.every((message) => message.role !== 'system')).toBe(true);
		expect(recent.every((message) => message.text.length > 0)).toBe(true);
	});
});
