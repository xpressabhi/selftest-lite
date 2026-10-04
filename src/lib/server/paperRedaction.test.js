import { describe, expect, it } from 'vitest';
import { stripAnswerKey } from './paperRedaction';

describe('stripAnswerKey', () => {
	const paper = {
		topic: 'Physics',
		questions: [
			{ question: 'Q1?', options: ['A', 'B', 'C', 'D'], answer: 'A' },
			{ question: 'Q2?', options: ['W', 'X', 'Y', 'Z'], answer: 'Z' },
		],
	};

	it('removes answers from a bare paper', () => {
		const redacted = stripAnswerKey(paper);
		expect(redacted.topic).toBe('Physics');
		expect(redacted.questions).toHaveLength(2);
		expect(redacted.questions[0]).toEqual({
			question: 'Q1?',
			options: ['A', 'B', 'C', 'D'],
		});
		expect(redacted.questions[0].answer).toBeUndefined();
	});

	it('removes answers from a test record ({ test: paper })', () => {
		const redacted = stripAnswerKey({ id: 7, test: paper });
		expect(redacted.id).toBe(7);
		expect(redacted.test.questions[1].answer).toBeUndefined();
		expect(redacted.test.questions[1]).toEqual({
			question: 'Q2?',
			options: ['W', 'X', 'Y', 'Z'],
		});
	});

	it('keeps original answers untouched', () => {
		const redacted = stripAnswerKey(paper);
		expect(paper.questions[0].answer).toBe('A');
		expect(redacted.questions[0].answer).toBeUndefined();
	});

	it('returns non-object values as-is', () => {
		expect(stripAnswerKey(null)).toBeNull();
		expect(stripAnswerKey('x')).toBe('x');
	});

	it('returns records without questions as-is', () => {
		const record = { id: 1, test: { topic: 'Physics' } };
		expect(stripAnswerKey(record)).toBe(record);
	});

	// The anonymous device id is an authorization credential: /api/user/* treats a
	// bare `x-client-id` as sufficient to read that identity's rows. It is
	// persisted on the paper for server-side login attribution
	// (backfillUserIdentity), so the record must keep it while never handing it
	// to a browser. /api/test is unauthenticated, so leaking it here would let
	// anyone read and rewrite an arbitrary account's history and bookmarks.
	const withIdentity = {
		topic: 'Physics',
		requestParams: {
			topic: 'Physics',
			testMode: 'full-exam',
			difficulty: 'hard',
			language: 'english',
			testType: 'multiple-choice',
			numQuestions: 20,
			clientId: 'c-victim-9f2a-secret',
		},
		questions: [{ question: 'Q1?', options: ['A', 'B'], answer: 'A' }],
	};

	it('strips the clientId from requestParams on a bare paper', () => {
		const redacted = stripAnswerKey(withIdentity);
		expect(redacted.requestParams.clientId).toBeUndefined();
	});

	it('strips the clientId from requestParams on a test record', () => {
		const redacted = stripAnswerKey({ id: 7, test: withIdentity });
		expect(redacted.test.requestParams.clientId).toBeUndefined();
	});

	it('keeps the requestParams the client renders from', () => {
		const redacted = stripAnswerKey(withIdentity);
		// /test and /results read these to label the paper; dropping them would
		// break the test runner and the results "practice again" prefill.
		expect(redacted.requestParams).toMatchObject({
			testMode: 'full-exam',
			difficulty: 'hard',
			language: 'english',
			testType: 'multiple-choice',
			numQuestions: 20,
		});
	});

	it('does not mutate the stored paper while redacting it', () => {
		stripAnswerKey(withIdentity);
		stripAnswerKey({ id: 7, test: withIdentity });
		expect(withIdentity.requestParams.clientId).toBe('c-victim-9f2a-secret');
	});

	it('tolerates a paper with no requestParams, or a null one', () => {
		expect(stripAnswerKey({ topic: 'x', questions: [{ answer: 'A' }] }).questions[0].answer)
			.toBeUndefined();
		const nulled = stripAnswerKey({ ...withIdentity, requestParams: null });
		expect(nulled.requestParams).toBeNull();
		const empty = stripAnswerKey({ ...withIdentity, requestParams: {} });
		expect(empty.requestParams).toEqual({});
	});
});
